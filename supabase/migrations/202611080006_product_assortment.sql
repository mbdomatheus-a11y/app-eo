begin;
create table public.eo_product_requests(
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.eo_profiles(id),
 store_id uuid not null references public.eo_stores(id), request_id uuid not null, note text not null,
 details jsonb not null, audio_path text, audio_seconds integer, transcript text,
 created_at timestamptz not null default now(), unique(person_id,request_id),
 check(length(note) between 2 and 4000), check((audio_path is null)=(audio_seconds is null)),
 check(audio_seconds between 1 and 60), check(audio_path is null or length(trim(transcript))>0)
);
create index eo_product_requests_scope on public.eo_product_requests(store_id,created_at desc);
create table public.eo_assortment_scans(
 id uuid primary key default gen_random_uuid(), person_id uuid not null references public.eo_profiles(id),
 store_id uuid not null references public.eo_stores(id), request_id uuid not null,
 barcode text not null check(length(barcode) between 2 and 128), sizes jsonb not null default '{}',
 status text not null default 'draft' check(status in ('draft','completed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(person_id,request_id)
);
create index eo_assortment_scope on public.eo_assortment_scans(store_id,created_at desc);
alter table public.eo_product_requests enable row level security;
alter table public.eo_assortment_scans enable row level security;
revoke all on public.eo_product_requests,public.eo_assortment_scans from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('eo-product-audio','eo-product-audio',false,10485760,array['audio/mp4','audio/webm','audio/mpeg','audio/ogg','audio/wav','audio/x-m4a'])
on conflict(id) do nothing;
create function public.eo_product_audio_access(p_bucket text,p_path text,p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if p_bucket is distinct from 'eo-product-audio' or eo_private.role_of_actor() is null or p_path is null then return false; end if;
 if p_write then return split_part(p_path,'/',1)=auth.uid()::text and p_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]+\.(m4a|mp4|mp3|webm|ogg|wav)$'
 and exists(select 1 from public.eo_stores s where s.active and eo_private.has_store(s.id)); end if;
 return split_part(p_path,'/',1)=auth.uid()::text or exists(select 1 from public.eo_product_requests r where r.audio_path=p_path
 and eo_private.role_of_actor() in ('admin','diretor') and eo_private.has_store(r.store_id));
end; $$;
revoke all on function public.eo_product_audio_access(text,text,boolean) from public,anon;
grant execute on function public.eo_product_audio_access(text,text,boolean) to authenticated;
create policy "EO product own audio upload" on storage.objects for insert to authenticated with check(public.eo_product_audio_access(bucket_id,name,true));
create policy "EO product authorized audio read" on storage.objects for select to authenticated using(public.eo_product_audio_access(bucket_id,name,false));
create function public.eo_save_product_request(p_store uuid,p_note text,p_details jsonb,p_request uuid,p_audio text default null,p_seconds integer default null,p_transcript text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_details jsonb:='{}'; k text; v_old public.eo_product_requests%rowtype;
begin
 if eo_private.role_of_actor() is null or not coalesce(eo_private.has_store(p_store),false)
 or not exists(select 1 from public.eo_stores where id=p_store and active) then raise exception 'Loja não autorizada' using errcode='42501'; end if;
 if p_request is null or p_note is null or length(trim(p_note)) not between 2 and 4000 or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Revise a descrição do produto'; end if;
 foreach k in array array['category','product','color','gender','size','demand'] loop
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
create function public.eo_begin_assortment(p_store uuid,p_code text,p_request uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_old public.eo_assortment_scans%rowtype;
begin
 if eo_private.role_of_actor() is null or not coalesce(eo_private.has_store(p_store),false)
 or not exists(select 1 from public.eo_stores where id=p_store and active) then raise exception 'Loja não autorizada' using errcode='42501'; end if;
 if p_request is null or p_code is null or length(trim(p_code)) not between 2 and 128 or p_code ~ '[[:cntrl:]]' then raise exception 'Código de barras inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('assortment:'||auth.uid()::text||p_request::text,0));
 select * into v_old from public.eo_assortment_scans where person_id=auth.uid() and request_id=p_request;
 if found then
  if v_old.store_id<>p_store or v_old.barcode<>trim(p_code) then raise exception 'Leitura já registrada com outro conteúdo'; end if;
  return v_old.id;
 end if;
 insert into public.eo_assortment_scans(person_id,store_id,request_id,barcode) values(auth.uid(),p_store,p_request,trim(p_code)) returning id into v_id;
 insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'assortment.scanned',v_id::text,jsonb_build_object('store_id',p_store));
 return v_id;
end; $$;
create function public.eo_save_assortment(p_id uuid,p_sizes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare v_scan public.eo_assortment_scans%rowtype; k text; v jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 select * into v_scan from public.eo_assortment_scans where id=p_id and person_id=auth.uid() for update;
 if not found or not eo_private.has_store(v_scan.store_id) then raise exception 'Leitura não autorizada' using errcode='42501'; end if;
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
create function public.eo_commercial_page(p_kind text,p_from date,p_to date,p_store uuid default null,p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
 if p_kind not in ('product','assortment') or p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Período inválido'; end if;
 with all_rows as (
  select r.id,r.store_id,r.person_id,r.created_at,'product' kind,jsonb_build_object('note',r.note,'details',r.details,'audio_path',r.audio_path,'transcript',r.transcript) payload from public.eo_product_requests r where p_kind='product'
  union all select r.id,r.store_id,r.person_id,r.created_at,'assortment',jsonb_build_object('barcode',r.barcode,'sizes',r.sizes,'status',r.status) from public.eo_assortment_scans r where p_kind='assortment'
 ), scoped as materialized (
  select r.*,s.code store_code,s.name store_name,s.region,p.display_name person_name from all_rows r join public.eo_stores s on s.id=r.store_id join public.eo_profiles p on p.id=r.person_id
  where (r.person_id=auth.uid() or (eo_private.role_of_actor() in ('admin','diretor') and eo_private.has_store(s.id)))
   and (p_store is null or r.store_id=p_store) and r.created_at>=p_from::timestamp at time zone 'America/Sao_Paulo' and r.created_at<(p_to+1)::timestamp at time zone 'America/Sao_Paulo'
 ), page as (select * from scoped order by created_at desc,id limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(0,coalesce(p_offset,0)))
 select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(page) order by created_at desc,id),'[]') from page),'total',(select count(*) from scoped),
 'groups',(select coalesce(jsonb_agg(to_jsonb(g) order by total desc),'[]') from (select region,count(*) total from scoped group by region) g)) into result;
 return result;
end; $$;
revoke all on function public.eo_save_product_request(uuid,text,jsonb,uuid,text,integer,text),public.eo_begin_assortment(uuid,text,uuid),public.eo_save_assortment(uuid,jsonb),public.eo_commercial_page(text,date,date,uuid,integer,integer) from public,anon;
grant execute on function public.eo_save_product_request(uuid,text,jsonb,uuid,text,integer,text),public.eo_begin_assortment(uuid,text,uuid),public.eo_save_assortment(uuid,jsonb),public.eo_commercial_page(text,date,date,uuid,integer,integer) to authenticated;
commit;
