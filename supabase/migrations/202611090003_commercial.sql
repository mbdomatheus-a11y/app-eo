begin;
alter table public.eo_product_requests add column status text not null default 'Enviado' check(status in ('Enviado','Em análise','Aguardando informação','Atendido','Não atendido')), add column response text not null default '', add column archived boolean not null default false;
create table public.eo_assortment_sessions (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.eo_stores(id), person_id uuid not null references public.eo_profiles(id), title text not null,
 mode text not null check(mode in ('free','demand')), allowed_codes text[] not null default '{}', status text not null default 'draft' check(status in ('draft','submitted','validated')),
 created_at timestamptz not null default now(), submitted_at timestamptz, validated_at timestamptz, validated_by uuid references public.eo_profiles(id), check(mode='free' or cardinality(allowed_codes)>0));
alter table public.eo_assortment_sessions enable row level security;
revoke all on public.eo_assortment_sessions from public,anon,authenticated;
alter table public.eo_assortment_scans add column session_id uuid references public.eo_assortment_sessions(id);
create function public.eo_product_update(p_id uuid,p_status text default null,p_response text default null,p_archived boolean default null) returns void
language plpgsql security definer set search_path='' as $$
declare r public.eo_product_requests%rowtype;
begin
 select * into r from public.eo_product_requests where id=p_id for update;
 if not found or eo_private.role_of_actor() is null or not coalesce(eo_private.has_store(r.store_id),false) then raise exception 'Pedido não autorizado' using errcode='42501'; end if;
 if p_status is not null then
  if eo_private.role_of_actor()<>'admin' then raise exception 'Somente administração pode tratar pedidos' using errcode='42501'; end if;
  if p_status not in ('Enviado','Em análise','Aguardando informação','Atendido','Não atendido') then raise exception 'Status inválido'; end if;
  if p_status in ('Atendido','Não atendido') and coalesce(length(trim(p_response)),0)<2 then raise exception 'Informe a justificativa da conclusão'; end if;
 end if;
 if p_response is not null and (p_status is null or length(p_response)>4000) then raise exception 'Resposta inválida'; end if;
 update public.eo_product_requests set status=coalesce(p_status,status),response=coalesce(p_response,response),archived=coalesce(p_archived,archived) where id=p_id;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'product.updated',p_id::text,jsonb_build_object('status',p_status,'archived',p_archived));
end; $$;
create function public.eo_assortment_session(p_store uuid,p_mode text default 'free',p_title text default 'Contagem livre',p_codes text[] default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if eo_private.role_of_actor() is null or not coalesce(eo_private.has_store(p_store),false) then raise exception 'Loja não autorizada' using errcode='42501'; end if;
 if p_mode not in ('free','demand') or length(trim(p_title)) not between 2 and 200 or cardinality(p_codes)>10000 then raise exception 'Sessão inválida'; end if;
 if p_mode='demand' and eo_private.role_of_actor()<>'admin' then raise exception 'Somente administração pode autorizar a lista' using errcode='42501'; end if;
 insert into public.eo_assortment_sessions(store_id,person_id,mode,title,allowed_codes) values(p_store,auth.uid(),p_mode,trim(p_title),p_codes) returning id into result;
 return result;
end; $$;
create function public.eo_assortment_sessions(p_store uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc),'[]') from public.eo_assortment_sessions s where eo_private.role_of_actor() is not null and eo_private.has_store(s.store_id) and (p_store is null or s.store_id=p_store);
$$;
create function public.eo_assortment_session_update(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.eo_assortment_sessions%rowtype;
begin
 select * into r from public.eo_assortment_sessions where id=p_id for update;
 if not found or eo_private.role_of_actor() is null or not coalesce(eo_private.has_store(r.store_id),false) then raise exception 'Sessão não autorizada' using errcode='42501'; end if;
 if p_status='submitted' and r.status='draft' then
  if not exists(select 1 from public.eo_assortment_scans where session_id=p_id) or exists(select 1 from public.eo_assortment_scans where session_id=p_id and status='draft') then raise exception 'Conclua todas as contagens antes do envio'; end if;
  update public.eo_assortment_sessions set status='submitted',submitted_at=now() where id=p_id;
 elsif p_status='validated' and r.status='submitted' and eo_private.role_of_actor()='admin' then
  update public.eo_assortment_sessions set status='validated',validated_at=now(),validated_by=auth.uid() where id=p_id;
 else raise exception 'Transição de sessão não permitida'; end if;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'assortment.session_updated',p_id::text,jsonb_build_object('status',p_status));
end; $$;
create function public.eo_begin_assortment_session(p_session uuid,p_code text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.eo_assortment_sessions%rowtype; result uuid;
begin
 select * into r from public.eo_assortment_sessions where id=p_session for update;
 if not found or eo_private.role_of_actor() is null or not coalesce(eo_private.has_store(r.store_id),false) then raise exception 'Sessão não autorizada' using errcode='42501'; end if;
 if r.status<>'draft' then raise exception 'Sessão já enviada'; end if;
 if r.mode='demand' and not(trim(p_code)=any(r.allowed_codes)) then raise exception 'Produto não autorizado nesta lista'; end if;
 result:=public.eo_begin_assortment(r.store_id,p_code,p_request);
 if exists(select 1 from public.eo_assortment_scans where id=result and session_id is not null and session_id<>p_session) then raise exception 'Leitura já vinculada a outra sessão'; end if;
 update public.eo_assortment_scans set session_id=p_session where id=result;
 return result;
end; $$;
revoke all on function public.eo_product_update(uuid,text,text,boolean),public.eo_assortment_session(uuid,text,text,text[]),public.eo_assortment_sessions(uuid),public.eo_assortment_session_update(uuid,text),public.eo_begin_assortment_session(uuid,text,uuid) from public,anon;
grant execute on function public.eo_product_update(uuid,text,text,boolean),public.eo_assortment_session(uuid,text,text,text[]),public.eo_assortment_sessions(uuid),public.eo_assortment_session_update(uuid,text),public.eo_begin_assortment_session(uuid,text,uuid) to authenticated;

create or replace function public.eo_save_product_request(p_store uuid,p_note text,p_details jsonb,p_request uuid,p_audio text default null,p_seconds integer default null,p_transcript text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_details jsonb:='{}'; k text; v_old public.eo_product_requests%rowtype;
begin
 if eo_private.role_of_actor() is null or not coalesce(eo_private.has_store(p_store),false)
 or not exists(select 1 from public.eo_stores where id=p_store and active) then raise exception 'Loja não autorizada' using errcode='42501'; end if;
 if p_request is null or p_note is null or length(trim(p_note)) not between 2 and 4000 or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Revise a descrição do produto'; end if;
 foreach k in array array['category','product','color','gender','size','fabric','demand'] loop
  if p_details ? k and jsonb_typeof(p_details->k) not in ('string','null') then raise exception 'Categoria inválida'; end if;
  v_details:=v_details||jsonb_build_object(k,left(coalesce(p_details->>k,''),120));
 end loop;
 if p_audio is not null then
  if not coalesce(public.eo_product_audio_access('eo-product-audio',p_audio,true),false) or p_seconds is null or p_seconds not between 1 and 60
   or coalesce(length(trim(p_transcript)),0) not between 1 and 4000 then raise exception 'Transcreva e revise o áudio antes de enviar'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='eo-product-audio' and o.name=p_audio
    and case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$' then (o.metadata->>'size')::numeric between 1 and 10485760 else false end
    and split_part(o.metadata->>'mimetype',';',1)=any(array['audio/mp4','audio/webm','audio/mpeg','audio/ogg','audio/wav','audio/x-m4a'])) then raise exception 'Áudio não encontrado'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('product:'||auth.uid()::text||p_request::text,0));
 select * into v_old from public.eo_product_requests where person_id=auth.uid() and request_id=p_request;
 if found then
  if v_old.note<>trim(p_note) or v_old.store_id<>p_store or v_old.details<>v_details or v_old.audio_path is distinct from p_audio then raise exception 'Esta solicitação já foi usada com outro conteúdo'; end if;
  return v_old.id;
 end if;
 insert into public.eo_product_requests(person_id,store_id,request_id,note,details,audio_path,audio_seconds,transcript)
 values(auth.uid(),p_store,p_request,trim(p_note),v_details,p_audio,p_seconds,p_transcript) returning id into v_id;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'product.requested',v_id::text,jsonb_build_object('store_id',p_store,'audio',p_audio is not null));
 return v_id;
end; $$;
create or replace function public.eo_save_assortment(p_id uuid,p_sizes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_scan public.eo_assortment_scans%rowtype; k text; v jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 select * into v_scan from public.eo_assortment_scans where id=p_id for update;
 if not found or not eo_private.has_store(v_scan.store_id) then raise exception 'Leitura não autorizada' using errcode='42501'; end if;
 if v_scan.session_id is not null then
  perform 1 from public.eo_assortment_sessions where id=v_scan.session_id and status='draft' for update;
  if not found then raise exception 'Sessão já enviada'; end if;
 end if;
 if jsonb_typeof(p_sizes) is distinct from 'object' or p_sizes='{}'::jsonb then raise exception 'Informe os tamanhos contados'; end if;
 for k,v in select key,value from jsonb_each(p_sizes) loop
  if k not in ('PP','P','M','G','GG','XG','EXG') then
   if k !~ '^[0-9]{2}$' then raise exception 'Tamanho inválido'; end if;
   if k::int not between 34 and 54 then raise exception 'Tamanho inválido'; end if;
  end if;
  if jsonb_typeof(v)<>'number' or v::text !~ '^[0-9]+$' or v::numeric>100000 then raise exception 'Quantidade deve ser um inteiro de 0 a 100000'; end if;
 end loop;
 update public.eo_assortment_scans set sizes=p_sizes,status='completed',updated_at=now() where id=p_id;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'assortment.saved',p_id::text,jsonb_build_object('sizes',(select count(*) from jsonb_object_keys(p_sizes))));
end; $$;

create or replace function public.eo_commercial_page(p_kind text,p_from date,p_to date,p_store uuid default null,p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_kind not in ('product','assortment') or p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Período inválido'; end if;
 with all_rows as (
  select r.id,r.store_id,r.person_id,r.created_at,'product' kind,jsonb_build_object('note',r.note,'details',r.details,'audio_path',r.audio_path,'transcript',r.transcript,'status',r.status,'response',r.response,'archived',r.archived) payload from public.eo_product_requests r where p_kind='product'
  union all select r.id,r.store_id,r.person_id,r.created_at,'assortment',jsonb_build_object('barcode',r.barcode,'sizes',r.sizes,'status',r.status,'session_id',r.session_id) from public.eo_assortment_scans r where p_kind='assortment'
 ), scoped as materialized (
  select r.*,s.code store_code,s.name store_name,s.region,p.display_name person_name from all_rows r join public.eo_stores s on s.id=r.store_id join public.eo_profiles p on p.id=r.person_id
  where eo_private.has_store(s.id)
   and (p_store is null or r.store_id=p_store) and r.created_at>=p_from::timestamp at time zone 'America/Sao_Paulo' and r.created_at<(p_to+1)::timestamp at time zone 'America/Sao_Paulo'
 ), page as (select * from scoped order by created_at desc,id limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id),'[]') from page),'total',(select count(*) from scoped),
 'top_products',(select coalesce(jsonb_agg(to_jsonb(top) order by requests desc),'[]') from (select region,payload->'details'->>'category' category,payload->'details'->>'product' product,payload->'details'->>'color' color,payload->'details'->>'size' size,count(*) requests from scoped where kind='product' group by 1,2,3,4,5 order by count(*) desc,region limit 20) top),
 'groups',(select coalesce(jsonb_agg(to_jsonb(g) order by total desc),'[]') from (select region,count(*) total from scoped group by region) g)) into result;
 return result;
end; $$;


create function public.eo_assortment_export(p_session uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor()<>'admin' or eo_private.role_of_actor() is null then raise exception 'Exportação exclusiva da administração' using errcode='42501'; end if;
 if not exists(select 1 from public.eo_assortment_sessions where id=p_session and eo_private.has_store(store_id)) then raise exception 'Sessão não autorizada' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('session_id',r.session_id,'store_code',s.code,'barcode',r.barcode,'size',e.key,'quantity',e.value,'status',r.status) order by r.created_at,r.id,e.key),'[]') from public.eo_assortment_scans r join public.eo_stores s on s.id=r.store_id cross join lateral jsonb_each(r.sizes) e where r.session_id=p_session);
end; $$;
revoke all on function public.eo_assortment_export(uuid) from public,anon;
grant execute on function public.eo_assortment_export(uuid) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090003_commercial') on conflict do nothing;
commit;
