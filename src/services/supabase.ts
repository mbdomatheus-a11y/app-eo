import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const backendConfigured = !!url && !!key && key.startsWith('sb_publishable_');
export const supabase = backendConfigured ? createClient(url,key, {
  auth: { flowType:'pkce', persistSession:true, autoRefreshToken:true, detectSessionInUrl:true },
}) : null;

export interface Store { id:string; code:string; name:string; region:string }
export interface Workspace {
  person: {id:string; name:string; role:'admin'|'diretor'|'gerente'|'colaborador'};
  stores:Store[];
  settings:{workspace_name:string; disabled_modules:string[]};
}
export interface LiveNotice {notice_id:string; version:number; title:string; body:string; category:string; urgent:boolean; published_at:string; acknowledged:boolean; eligible_count:number; receipt_count:number}
export interface LivePerson {id:string;display_name:string;role:string;active:boolean;stores:string[]}
export interface AuditRow {id:number;actor_name:string;action:string;entity_id:string;created_at:string}
export async function rpc<T>(name:string,args?:Record<string,unknown>):Promise<T> {
  if(!supabase) throw new Error('Conexão ainda não configurada.');
  const {data,error}=await supabase.rpc(name,args);
  if(error) throw new Error(error.code==='42501' ? 'Seu acesso ainda não foi liberado para esta operação.' : error.message);
  return data as T;
}
