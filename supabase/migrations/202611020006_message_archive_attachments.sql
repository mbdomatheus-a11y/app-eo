-- Arquivamento reversível, push opcional para comunicados e anexos privados.
begin;

alter table public.eo_notices add column archived_at timestamptz;
alter table public.eo_notices add column archived_by uuid references public.eo_profiles(id);
alter table public.eo_alerts add column archived_at timestamptz;
alter table public.eo_alerts add column archived_by uuid references public.eo_profiles(id);
alter table public.eo_alerts add column notice_id uuid references public.eo_notices(id);
alter table public.eo_scheduled_messages add column send_push boolean not null default false;

create table public.eo_message_attachments (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.eo_profiles(id),
  notice_id uuid references public.eo_notices(id),
  notice_version integer,
  alert_id uuid references public.eo_alerts(id),
  scheduled_message_id uuid references public.eo_scheduled_messages(id),
  object_path text not null unique,
  file_name text not null check(length(file_name) between 1 and 255),
  mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
  byte_size bigint not null check(byte_size between 1 and 10485760),
  created_at timestamptz not null default now(),
  check ((case when notice_id is not null and notice_version is not null then 1 else 0 end)
       + (case when alert_id is not null then 1 else 0 end)
       + (case when scheduled_message_id is not null then 1 else 0 end) = 1),
  foreign key(notice_id,notice_version) references public.eo_notice_versions(notice_id,version)
);
create index eo_message_attachments_notice on public.eo_message_attachments(notice_id,notice_version);
create index eo_message_attachments_alert on public.eo_message_attachments(alert_id);
alter table public.eo_message_attachments enable row level security;
revoke all on public.eo_message_attachments from public,anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('eo-message-attachments','eo-message-attachments',false,10485760,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=10485760,
  allowed_mime_types=excluded.allowed_mime_types;

create function public.eo_message_upload_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select eo_private.role_of_actor() in ('admin','diretor','gerente');
$$;
create function public.eo_message_object_readable(p_object_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.eo_message_attachments a where a.object_path=p_object_path and a.created_by=auth.uid())
    or (eo_private.role_of_actor()='admin' and exists(select 1 from public.eo_message_attachments a where a.object_path=p_object_path))
    or exists(select 1 from public.eo_message_attachments a join public.eo_notice_recipients r
      on r.notice_id=a.notice_id and r.version=a.notice_version where a.object_path=p_object_path and r.user_id=auth.uid())
    or exists(select 1 from public.eo_message_attachments a join public.eo_alert_recipients r
      on r.alert_id=a.alert_id where a.object_path=p_object_path and r.user_id=auth.uid());
$$;
revoke all on function public.eo_message_upload_allowed(),public.eo_message_object_readable(text) from public,anon;
grant execute on function public.eo_message_upload_allowed(),public.eo_message_object_readable(text) to authenticated;

create policy eo_message_files_upload on storage.objects for insert to authenticated
with check (bucket_id='eo-message-attachments'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and public.eo_message_upload_allowed());

create policy eo_message_files_read on storage.objects for select to authenticated
using (bucket_id='eo-message-attachments' and public.eo_message_object_readable(name));

create function eo_private.attach_message_files(
  p_files jsonb,p_actor uuid,p_notice uuid default null,p_version integer default null,
  p_alert uuid default null,p_scheduled uuid default null
) returns void language plpgsql security definer set search_path='' as $$
declare v_file jsonb; v_path text; v_name text; v_type text; v_size bigint;
begin
  if jsonb_typeof(coalesce(p_files,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_files,'[]'::jsonb))>10 then
    raise exception 'Envie no máximo 10 anexos por mensagem';
  end if;
  for v_file in select value from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
    v_path:=v_file->>'object_path'; v_name:=v_file->>'file_name'; v_type:=v_file->>'mime_type';
    begin v_size:=(v_file->>'byte_size')::bigint; exception when others then raise exception 'Tamanho de anexo inválido'; end;
    if v_path is null or split_part(v_path,'/',1)<>p_actor::text or length(v_path)>500
      or v_name is null or length(v_name) not between 1 and 255
      or v_type not in ('application/pdf','image/jpeg','image/png','image/webp')
      or v_size not between 1 and 10485760 then raise exception 'Anexo inválido'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='eo-message-attachments' and o.name=v_path) then
      raise exception 'Arquivo não localizado no armazenamento privado';
    end if;
    insert into public.eo_message_attachments(created_by,notice_id,notice_version,alert_id,scheduled_message_id,object_path,file_name,mime_type,byte_size)
    values(p_actor,p_notice,p_version,p_alert,p_scheduled,v_path,v_name,v_type,v_size)
    on conflict(object_path) do nothing;
  end loop;
end; $$;
revoke all on function eo_private.attach_message_files(jsonb,uuid,uuid,integer,uuid,uuid) from public,anon,authenticated;

create or replace function public.eo_feed(p_before timestamptz default null,p_before_id uuid default null,p_limit int default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb;
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_before is not null and p_before_id is null then raise exception 'Cursor inválido'; end if;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.published_at desc,q.notice_id desc),'[]') into v_items from (
    select v.*,exists(select 1 from public.eo_notice_receipts r where r.notice_id=v.notice_id and r.version=v.version and r.user_id=auth.uid()) acknowledged,
      (select count(*) from public.eo_notice_recipients r where r.notice_id=v.notice_id and r.version=v.version) eligible_count,
      (select count(*) from public.eo_notice_receipts r where r.notice_id=v.notice_id and r.version=v.version) receipt_count,
      (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'byte_size',a.byte_size,'object_path',a.object_path) order by a.created_at),'[]'::jsonb)
        from public.eo_message_attachments a where a.notice_id=v.notice_id and a.notice_version=v.version) attachments
    from public.eo_notice_versions v join public.eo_notices n on n.id=v.notice_id
    where n.archived_at is null and eo_private.can_read_notice(v.notice_id,v.version)
      and (p_before is null or (v.published_at,v.notice_id)<(p_before,p_before_id))
    order by v.published_at desc,v.notice_id desc limit greatest(1,least(coalesce(p_limit,20),100))
  ) q;
  return v_items;
end; $$;

drop function public.eo_publish_notice(text,text,uuid[],boolean,uuid);
create function public.eo_publish_notice(
  p_title text,p_body text,p_stores uuid[],p_urgent boolean default false,p_request_id uuid default gen_random_uuid(),
  p_attachments jsonb default '[]'::jsonb,p_send_push boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_actor uuid:=auth.uid(); v_stores uuid[];
begin
  if eo_private.role_of_actor() not in ('admin','diretor') or eo_private.role_of_actor() is null then raise exception 'Publicação não autorizada' using errcode='42501'; end if;
  if coalesce(cardinality(p_stores),0)=0 or cardinality(p_stores)>2000 then raise exception 'Selecione as lojas destinatárias'; end if;
  select array_agg(distinct x order by x) into v_stores from unnest(p_stores) as u(x);
  if exists(select 1 from unnest(v_stores) as u(x) where x is null or not eo_private.has_store(x)) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  if length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and 5000 then raise exception 'Título ou mensagem inválidos'; end if;
  insert into public.eo_notices(id,created_by) values(p_request_id,v_actor) on conflict do nothing returning id into v_id;
  if v_id is null then
    if exists(select 1 from public.eo_notices where id=p_request_id and created_by=v_actor) then return p_request_id; end if;
    raise exception 'Solicitação inválida';
  end if;
  insert into public.eo_notice_versions(notice_id,version,title,body,urgent) values(v_id,1,trim(p_title),trim(p_body),coalesce(p_urgent,false));
  insert into public.eo_notice_stores select v_id,1,x from unnest(v_stores) as u(x);
  insert into public.eo_notice_recipients(notice_id,version,user_id)
    select v_id,1,p.id from public.eo_profiles p where p.active and (p.role='admin'
      or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(v_stores))
      or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and (
        (a.scope_type='LOJA' and a.scope_code in (select s.code from public.eo_stores s where s.id=any(v_stores)))
        or (a.scope_type='GGL' and a.scope_code in (select s.ggl from public.eo_stores s where s.id=any(v_stores))))));
  perform eo_private.attach_message_files(p_attachments,v_actor,p_notice=>v_id,p_version=>1);
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(v_actor,'notice.published',v_id::text,jsonb_build_object('version',1,'store_count',cardinality(v_stores),'attachment_count',jsonb_array_length(coalesce(p_attachments,'[]'::jsonb)),'push_requested',coalesce(p_send_push,false)));
  if coalesce(p_send_push,false) then
    insert into public.eo_alerts(id,created_by,title,body,urgent,notice_id)
      values(v_id,v_actor,trim(p_title),left(trim(p_body),3000),coalesce(p_urgent,false),v_id);
    insert into public.eo_alert_stores select v_id,x from unnest(v_stores) as u(x);
    insert into public.eo_alert_recipients(alert_id,user_id) select v_id,user_id from public.eo_notice_recipients where notice_id=v_id and version=1;
  end if;
  return v_id;
end; $$;
revoke all on function public.eo_publish_notice(text,text,uuid[],boolean,uuid,jsonb,boolean) from public,anon;
grant execute on function public.eo_publish_notice(text,text,uuid[],boolean,uuid,jsonb,boolean) to authenticated;

drop function public.eo_publish_alert(text,text,uuid[],boolean);
create function public.eo_publish_alert(p_title text,p_body text,p_stores uuid[],p_urgent boolean default false,p_attachments jsonb default '[]'::jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid:=gen_random_uuid(); v_role text:=eo_private.role_of_actor(); v_store_codes jsonb; v_actor uuid:=auth.uid(); v_stores uuid[];
begin
  if v_role not in ('admin','diretor','gerente') or v_role is null then raise exception 'Publicação não autorizada' using errcode='42501'; end if;
  if coalesce(cardinality(p_stores),0)=0 or cardinality(p_stores)>2000 or length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and 3000 then raise exception 'Revise título, mensagem e lojas'; end if;
  select array_agg(distinct x order by x) into v_stores from unnest(p_stores) as u(x);
  if exists(select 1 from unnest(v_stores) as u(x) where x is null or not eo_private.has_store(x)) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into v_store_codes from public.eo_stores where id=any(v_stores);
  insert into public.eo_alerts(id,created_by,title,body,urgent) values(v_id,v_actor,trim(p_title),trim(p_body),coalesce(p_urgent,false));
  insert into public.eo_alert_stores select v_id,x from unnest(v_stores) as u(x);
  insert into public.eo_alert_recipients(alert_id,user_id)
    select v_id,p.id from public.eo_profiles p where p.active and (p.role='admin'
      or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(v_stores))
      or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and (
        (a.scope_type='LOJA' and a.scope_code in (select code from public.eo_stores where id=any(v_stores)))
        or (a.scope_type='GGL' and a.scope_code in (select ggl from public.eo_stores where id=any(v_stores))))));
  perform eo_private.attach_message_files(p_attachments,v_actor,p_alert=>v_id);
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(v_actor,'alert.published',v_id::text,
    jsonb_build_object('title',trim(p_title),'body',trim(p_body),'urgent',coalesce(p_urgent,false),'store_codes',v_store_codes,'recipient_count',(select count(*) from public.eo_alert_recipients where alert_id=v_id),'attachment_count',jsonb_array_length(coalesce(p_attachments,'[]'::jsonb))));
  return v_id;
end; $$;
revoke all on function public.eo_publish_alert(text,text,uuid[],boolean,jsonb) from public,anon;
grant execute on function public.eo_publish_alert(text,text,uuid[],boolean,jsonb) to authenticated;

create or replace function public.eo_alert_feed() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) from (
    select a.id,a.title,a.body,a.urgent,a.created_at,a.hidden_from_users,r.seen_at,r.dismissed_at,
      (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'file_name',m.file_name,'mime_type',m.mime_type,'byte_size',m.byte_size,'object_path',m.object_path) order by m.created_at),'[]'::jsonb)
        from public.eo_message_attachments m where m.alert_id=a.id or (a.notice_id is not null and m.notice_id=a.notice_id)) attachments
    from public.eo_alert_recipients r join public.eo_alerts a on a.id=r.alert_id
    where r.user_id=auth.uid() and a.archived_at is null and (not a.hidden_from_users or eo_private.role_of_actor()='admin')
    order by a.created_at desc limit 100
  ) q);
end; $$;

create function public.eo_admin_archive_message(p_kind text,p_id uuid,p_archived boolean default true) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_at timestamptz:=case when coalesce(p_archived,true) then now() else null end;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_kind='notice' then
    update public.eo_notices set archived_at=v_at,archived_by=case when v_at is null then null else v_actor end where id=p_id;
    if not found then raise exception 'Comunicado não encontrado'; end if;
    update public.eo_alerts set archived_at=v_at,archived_by=case when v_at is null then null else v_actor end where notice_id=p_id;
  elsif p_kind='alert' then
    update public.eo_alerts set archived_at=v_at,archived_by=case when v_at is null then null else v_actor end where id=p_id;
    if not found then raise exception 'Alerta não encontrado'; end if;
  else raise exception 'Tipo de mensagem inválido'; end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(v_actor,case when v_at is null then 'message.restored' else 'message.archived' end,p_id::text,jsonb_build_object('kind',p_kind,'archived_at',v_at));
end; $$;

create function public.eo_admin_archived_messages() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.archived_at desc),'[]'::jsonb) from (
    select 'notice'::text kind,n.id,v.title,v.body,n.archived_at,n.archived_by,n.created_by,n.created_at,
      (select p.display_name from public.eo_profiles p where p.id=n.archived_by) archived_by_name,
      (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'file_name',a.file_name,'mime_type',a.mime_type,'byte_size',a.byte_size,'object_path',a.object_path) order by a.created_at),'[]'::jsonb) from public.eo_message_attachments a where a.notice_id=n.id) attachments
    from public.eo_notices n join lateral (select x.title,x.body from public.eo_notice_versions x where x.notice_id=n.id order by x.version desc limit 1) v on true where n.archived_at is not null
    union all
    select 'alert',a.id,a.title,a.body,a.archived_at,a.archived_by,a.created_by,a.created_at,
      (select p.display_name from public.eo_profiles p where p.id=a.archived_by) archived_by_name,
      (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'file_name',m.file_name,'mime_type',m.mime_type,'byte_size',m.byte_size,'object_path',m.object_path) order by m.created_at),'[]'::jsonb) from public.eo_message_attachments m where m.alert_id=a.id) attachments
    from public.eo_alerts a where a.archived_at is not null and a.notice_id is null
    order by archived_at desc limit 200
  ) q);
end; $$;
revoke all on function public.eo_admin_archive_message(text,uuid,boolean),public.eo_admin_archived_messages() from public,anon;
grant execute on function public.eo_admin_archive_message(text,uuid,boolean),public.eo_admin_archived_messages() to authenticated;

create function public.eo_admin_report_messages() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.published_at desc),'[]'::jsonb) from (
    select n.id notice_id,v.version,v.title,v.published_at,n.archived_at,
      (select count(distinct s.store_id) from public.eo_notice_stores s where s.notice_id=n.id and s.version=v.version) total_stores,
      (select count(*) from public.eo_notice_recipients r where r.notice_id=n.id and r.version=v.version) eligible_people,
      (select count(*) from public.eo_notice_receipts r where r.notice_id=n.id and r.version=v.version) confirmed_people
    from public.eo_notices n join lateral (select x.* from public.eo_notice_versions x where x.notice_id=n.id order by x.version desc limit 1) v on true
    order by v.published_at desc limit 200
  ) q);
end; $$;

create function public.eo_admin_notice_report(p_notice uuid,p_version integer,p_group_by text default 'regional') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_groups jsonb; v_total integer; v_read integer; v_full integer;
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_group_by not in ('regional','loja','ggl','uf','cidade','tipo','clima','perfil_preco','grupo_loja','safra') then raise exception 'Agrupamento inválido'; end if;
  if not exists(select 1 from public.eo_notice_versions where notice_id=p_notice and version=p_version) then raise exception 'Comunicado não encontrado'; end if;
  with targeted as (
    select distinct s.id,s.code,s.name,s.region,s.ggl,coalesce(d.attributes,'{}'::jsonb) attributes,
      coalesce(nullif(g.regional_name,''),nullif(s.region,''),'Sem regional') regional_name
    from public.eo_notice_stores ns join public.eo_stores s on s.id=ns.store_id
    left join public.eo_store_details d on d.store_id=s.id
    left join public.eo_regional_groups g on g.ggl=s.ggl
    where ns.notice_id=p_notice and ns.version=p_version
  ), store_read as (
    select t.*,coalesce(r.eligible,0) eligible,coalesce(r.confirmed,0) confirmed from targeted t
    left join lateral (select count(distinct nr.user_id) eligible,count(distinct rc.user_id) confirmed
      from public.eo_notice_recipients nr join public.eo_profiles p on p.id=nr.user_id and p.role<>'admin'
      left join public.eo_notice_receipts rc on rc.notice_id=nr.notice_id and rc.version=nr.version and rc.user_id=nr.user_id
      where nr.notice_id=p_notice and nr.version=p_version and
        (exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=t.id)
          or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and
            ((a.scope_type='LOJA' and a.scope_code=t.code) or (a.scope_type='GGL' and a.scope_code=t.ggl))))) r on true
  ), labeled as (
    select *,case p_group_by
      when 'regional' then regional_name
      when 'loja' then code||' · '||name
      when 'ggl' then coalesce(nullif(ggl,''),'Sem GGL')
      when 'uf' then coalesce(nullif(attributes->>'UF',''),'Sem UF')
      when 'cidade' then coalesce(nullif(attributes->>'CIDADE',''),'Sem cidade')
      when 'tipo' then coalesce(nullif(attributes->>'TIPO',''),'Sem tipo')
      when 'clima' then coalesce(nullif(attributes->>'CLIMA',''),'Sem clima')
      when 'perfil_preco' then coalesce(nullif(attributes->>'PERFIL_PRECO',''),'Sem perfil')
      when 'grupo_loja' then coalesce(nullif(attributes->>'GRUPO_LOJA',''),'Sem grupo')
      when 'safra' then coalesce(nullif(attributes->>'SAFRA',''),'Sem safra')
    end group_name from store_read
  )
  select count(*),count(*) filter(where confirmed>0),count(*) filter(where eligible>0 and confirmed=eligible)
    into v_total,v_read,v_full from labeled;
  with targeted as (
    select distinct s.id,s.code,s.name,s.region,s.ggl,coalesce(d.attributes,'{}'::jsonb) attributes,
      coalesce(nullif(g.regional_name,''),nullif(s.region,''),'Sem regional') regional_name
    from public.eo_notice_stores ns join public.eo_stores s on s.id=ns.store_id
    left join public.eo_store_details d on d.store_id=s.id left join public.eo_regional_groups g on g.ggl=s.ggl
    where ns.notice_id=p_notice and ns.version=p_version
  ), store_read as (
    select t.*,coalesce(r.eligible,0) eligible,coalesce(r.confirmed,0) confirmed from targeted t
    left join lateral (select count(distinct nr.user_id) eligible,count(distinct rc.user_id) confirmed
      from public.eo_notice_recipients nr join public.eo_profiles p on p.id=nr.user_id and p.role<>'admin'
      left join public.eo_notice_receipts rc on rc.notice_id=nr.notice_id and rc.version=nr.version and rc.user_id=nr.user_id
      where nr.notice_id=p_notice and nr.version=p_version and
        (exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=t.id)
          or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and
            ((a.scope_type='LOJA' and a.scope_code=t.code) or (a.scope_type='GGL' and a.scope_code=t.ggl))))) r on true
  ), labeled as (
    select *,case p_group_by when 'regional' then regional_name when 'loja' then code||' · '||name
      when 'ggl' then coalesce(nullif(ggl,''),'Sem GGL') when 'uf' then coalesce(nullif(attributes->>'UF',''),'Sem UF')
      when 'cidade' then coalesce(nullif(attributes->>'CIDADE',''),'Sem cidade') when 'tipo' then coalesce(nullif(attributes->>'TIPO',''),'Sem tipo')
      when 'clima' then coalesce(nullif(attributes->>'CLIMA',''),'Sem clima') when 'perfil_preco' then coalesce(nullif(attributes->>'PERFIL_PRECO',''),'Sem perfil')
      when 'grupo_loja' then coalesce(nullif(attributes->>'GRUPO_LOJA',''),'Sem grupo') when 'safra' then coalesce(nullif(attributes->>'SAFRA',''),'Sem safra') end group_name
    from store_read
  )
  select coalesce(jsonb_agg(jsonb_build_object('group',q.group_name,'total_stores',q.total_stores,
    'stores_with_read',q.stores_with_read,'stores_fully_read',q.stores_fully_read,
    'stores_pending',q.total_stores-q.stores_with_read) order by q.group_name),'[]'::jsonb)
    into v_groups from (select group_name,count(*) total_stores,count(*) filter(where confirmed>0) stores_with_read,
      count(*) filter(where eligible>0 and confirmed=eligible) stores_fully_read from labeled group by group_name) q;
  return jsonb_build_object('notice_id',p_notice,'version',p_version,'group_by',p_group_by,
    'total_stores',v_total,'stores_with_read',v_read,'stores_fully_read',v_full,
    'stores_pending',v_total-v_read,'read_rule','Ao menos uma pessoa destinatária confirmou a ciência.',
    'groups',v_groups);
end; $$;
revoke all on function public.eo_admin_report_messages(),public.eo_admin_notice_report(uuid,integer,text) from public,anon;
grant execute on function public.eo_admin_report_messages(),public.eo_admin_notice_report(uuid,integer,text) to authenticated;

create function public.eo_schedule_message_with_options(
  p_message_type text,p_title text,p_body text,p_stores uuid[],p_urgent boolean,p_scheduled_for timestamptz,
  p_request_id uuid default gen_random_uuid(),p_send_push boolean default false,p_attachments jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  v_id:=public.eo_schedule_message(p_message_type,p_title,p_body,p_stores,p_urgent,p_scheduled_for,p_request_id);
  update public.eo_scheduled_messages set send_push=coalesce(p_send_push,false) where id=v_id and created_by=auth.uid();
  perform eo_private.attach_message_files(p_attachments,auth.uid(),p_scheduled=>v_id);
  return v_id;
end; $$;
revoke all on function public.eo_schedule_message_with_options(text,text,text,uuid[],boolean,timestamptz,uuid,boolean,jsonb) from public,anon;
grant execute on function public.eo_schedule_message_with_options(text,text,text,uuid[],boolean,timestamptz,uuid,boolean,jsonb) to authenticated;

create function eo_private.publish_scheduled_message_files() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_batch record;
begin
  if old.status<>'scheduled' or new.status<>'published' or new.published_id is null then return new; end if;
  update public.eo_message_attachments set scheduled_message_id=null,
    notice_id=case when new.message_type='notice' then new.published_id else null end,
    notice_version=case when new.message_type='notice' then 1 else null end,
    alert_id=case when new.message_type='alert' then new.published_id else null end
    where scheduled_message_id=new.id;
  if new.message_type='notice' and new.send_push then
    insert into public.eo_alerts(id,created_by,title,body,urgent,notice_id)
      select new.published_id,new.created_by,new.title,left(new.body,3000),new.urgent,new.published_id;
    insert into public.eo_alert_stores select new.published_id,x from unnest(new.store_ids) as u(x);
    insert into public.eo_alert_recipients(alert_id,user_id)
      select new.published_id,user_id from public.eo_notice_recipients where notice_id=new.published_id and version=1;
    for v_batch in
      select jsonb_agg(jsonb_build_object('to',q.expo_push_token,'title',new.title,'body',new.body,
        'sound',case when q.sound_enabled then 'default' else null end,
        'priority',case when new.urgent then 'high' else 'default' end,
        'data',jsonb_build_object('alertId',new.published_id::text)) order by q.rn) messages
      from (select d.expo_push_token,coalesce(ns.sound_enabled,true) sound_enabled,row_number() over(order by d.id) rn
        from public.eo_alert_recipients r join public.eo_push_devices d on d.user_id=r.user_id
        left join public.eo_notification_settings ns on ns.user_id=r.user_id where r.alert_id=new.published_id) q
      group by ((q.rn-1)/100)
    loop
      perform net.http_post(url:='https://exp.host/--/api/v2/push/send',
        body:=v_batch.messages,
        headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,timeout_milliseconds:=10000);
    end loop;
    insert into public.eo_audit_events(actor,action,entity_id,detail) values(new.created_by,'alert.push.submitted',new.published_id::text,jsonb_build_object('provider','expo','scheduled_id',new.id));
  end if;
  return new;
end; $$;
revoke all on function eo_private.publish_scheduled_message_files() from public,anon,authenticated;
create trigger eo_scheduled_message_attachments after update of status on public.eo_scheduled_messages
for each row execute function eo_private.publish_scheduled_message_files();

insert into eo_private.schema_migrations(version) values('202611020006_message_archive_attachments');
commit;
