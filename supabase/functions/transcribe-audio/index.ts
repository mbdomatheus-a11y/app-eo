import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Método inválido."},405);
 const token=req.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");if(!token)return json({error:"Entre novamente."},401);
 const url=Deno.env.get("SUPABASE_URL")!,caller=createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:`Bearer ${token}`}}});
 const {data:auth,error}=await caller.auth.getUser(token);if(error||!auth.user)return json({error:"Sessão inválida."},401);
 let body;try{body=await req.json();}catch{return json({error:"Dados inválidos."},400);}
 if(!["eo-day-audio","eo-product-audio"].includes(body?.bucket)||typeof body?.path!=="string"||body.path.split("/")[0]!==auth.user.id||!(/^[0-9a-f-]{36}\/[A-Za-z0-9-]+\.(m4a|mp4|mp3|webm|ogg|wav)$/.test(body.path))||!Number.isInteger(body.seconds)||body.seconds<1||body.seconds>60)return json({error:"Áudio não autorizado ou acima de um minuto."},400);
 const {data:context,error:scopeError}=await caller.rpc("eo_context");if(scopeError||!context?.stores?.some((s:{id:string})=>s.id===body.store))return json({error:"Loja não autorizada."},403);
 const key=Deno.env.get("TRANSCRIPTION_API_KEY");
 if(Deno.env.get("TRANSCRIPTION_PROVIDER")!=="openai"||!key||key.startsWith("sk-ant"))return json({error:"A transcrição ainda precisa ser configurada no servidor. A chave Anthropic não aceita áudio. Seu relato não foi enviado."},503);
 const admin=createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {count,error:countError}=await admin.from("eo_audit_events").select("id",{head:true,count:"exact"}).eq("actor",auth.user.id).eq("action","audio.transcription_requested").gte("created_at",new Date(Date.now()-3600000).toISOString());
 if(countError)return json({error:"Não foi possível validar o serviço."},503);if((count??0)>=20)return json({error:"Limite de 20 transcrições por hora atingido."},429);
 const {data:file,error:downloadError}=await admin.storage.from(body.bucket).download(body.path);
 if(downloadError||!file||file.size<1||file.size>10485760||!/^audio\//.test(file.type))return json({error:"Arquivo de áudio inválido."},400);
 const {error:auditError}=await admin.from("eo_audit_events").insert({actor:auth.user.id,action:"audio.transcription_requested",entity_id:auth.user.id,detail:{provider:"openai",seconds:body.seconds}});if(auditError)return json({error:"Falha na auditoria da transcrição."},503);
 try{
  const form=new FormData();form.append("file",file,body.path.split("/").pop());form.append("model",Deno.env.get("TRANSCRIPTION_MODEL")||"gpt-transcribe");
  const response=await fetch("https://api.openai.com/v1/audio/transcriptions",{method:"POST",headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(55000)});
  if(!response.ok)return json({error:"O serviço de transcrição não aceitou o áudio. Confira a configuração e tente novamente."},502);
  const result=await response.json();const text=String(result.text??"").trim();if(!text||text.length>4000)return json({error:"Não foi possível obter um texto de até 4000 caracteres. Regrave em até um minuto."},422);
  return json({text,review_required:true,provider:"openai"});
 }catch{return json({error:"A transcrição demorou mais que o esperado. Tente novamente."},504);}
});
