-- App EO: relatórios HTML privados, diário de vendas e acompanhamento de humor.
-- Migração aditiva. Push registra submissão à Expo, nunca confirmação de entrega.
begin;

create table public.eo_sales_publications (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 3 and 120),
  period text not null check(period in ('week','month','year')),
  object_path text not null unique,
  store_ids uuid[] not null check(cardinality(store_ids)>0),
  created_by uuid not null references public.eo_profiles(id),
  published_at timestamptz not null default now(), archived_at timestamptz
);
create index eo_sales_publications_period on public.eo_sales_publications(period,published_at desc);

create table public.eo_day_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.eo_stores(id),
  person_id uuid not null references public.eo_profiles(id), entry_date date not null,
  request_id uuid not null default gen_random_uuid(), unique(person_id,request_id),
  store_code text not null, store_name text not null, region text not null,
  scope_snapshot jsonb not null, person_name text not null,
  outcome text not null check(outcome in ('sold','no_sale')),
  reasons text[] not null default '{}', note text not null default '',
  audio_path text unique, audio_seconds numeric check(audio_seconds>0 and audio_seconds<=60),
  transcript text, transcription_status text not null default 'not_requested'
    check(transcription_status in ('not_requested','provided')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check((audio_path is null)=(audio_seconds is null))
);
create index eo_day_records_scope_date on public.eo_day_records(store_id,entry_date desc);
create index eo_day_records_person_date on public.eo_day_records(person_id,entry_date desc);

create table public.eo_mood_configuration (
  id boolean primary key default true check(id), enabled boolean not null default false,
  send_time time not null default '16:00', timezone text not null default 'America/Sao_Paulo',
  prompt text not null default 'Como está seu dia?',
  updated_by uuid references public.eo_profiles(id), updated_at timestamptz not null default now()
);
insert into public.eo_mood_configuration(id) values(true);
create table public.eo_mood_records (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.eo_stores(id),
  person_id uuid not null references public.eo_profiles(id), entry_date date not null,
  request_id uuid not null default gen_random_uuid(), unique(person_id,request_id),
  store_code text not null, store_name text not null, region text not null,
  scope_snapshot jsonb not null, person_name text not null,
  mood text not null check(mood in ('happy','neutral','sad')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index eo_mood_records_scope_date on public.eo_mood_records(store_id,entry_date desc);
create index eo_mood_records_person_date on public.eo_mood_records(person_id,entry_date desc);
create table public.eo_mood_reminders (
  reminder_date date not null, user_id uuid not null references public.eo_profiles(id),
  alert_id uuid not null references public.eo_alerts(id),
  push_status text not null default 'pending' check(push_status in ('pending','submitted','unavailable','failed')),
  push_requested_at timestamptz, push_request_id bigint,
  primary key(reminder_date,user_id)
);
alter table public.eo_alerts add column data jsonb not null default '{}';

alter table public.eo_sales_publications enable row level security;
alter table public.eo_day_records enable row level security;
alter table public.eo_mood_configuration enable row level security;
alter table public.eo_mood_records enable row level security;
alter table public.eo_mood_reminders enable row level security;
revoke all on public.eo_sales_publications,public.eo_day_records,public.eo_mood_configuration,
  public.eo_mood_records,public.eo_mood_reminders from public,anon,authenticated;
-- A Edge transcribe-day consulta apenas contagem de solicitações recentes por pessoa.
-- A chave de serviço permanece restrita ao servidor; clientes continuam sem leitura direta.
grant select on table public.eo_audit_events to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('eo-sales-html','eo-sales-html',false,10485760,array['text/html']),
 ('eo-day-audio','eo-day-audio',false,10485760,
   array['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/x-wav','audio/x-m4a','audio/aac'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create function public.eo_operational_upload_allowed(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select eo_private.role_of_actor() is not null
    and split_part(p_path,'/',1)=auth.uid()::text
    and p_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,179}$'
    and position('..' in p_path)=0
    and ((p_bucket='eo-sales-html' and eo_private.role_of_actor()='admin' and lower(p_path) ~ '\.html?$')
      or (p_bucket='eo-day-audio' and lower(p_path) ~ '\.(webm|mp4|m4a|mp3|ogg|wav|aac)$'
        and exists(select 1 from public.eo_stores s where eo_private.has_store(s.id))));
$$;
create function eo_private.require_operational_object(p_bucket text,p_path text) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if not coalesce(public.eo_operational_upload_allowed(p_bucket,p_path),false) then
    raise exception 'Arquivo fora do caminho ou tipo autorizado' using errcode='42501';
  end if;
  if not exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path
    and case when coalesce(o.metadata->>'size','') ~ '^[0-9]+$'
      then (o.metadata->>'size')::numeric between 1 and 10485760 else false end
    and ((p_bucket='eo-sales-html' and split_part(lower(o.metadata->>'mimetype'),';',1)='text/html')
      or (p_bucket='eo-day-audio' and split_part(lower(o.metadata->>'mimetype'),';',1)=any(
        array['audio/webm','audio/mp4','audio/mpeg','audio/ogg','audio/wav','audio/x-wav','audio/x-m4a','audio/aac'])))) then
    raise exception 'Envie um arquivo válido de até 10 MB antes de salvar';
  end if;
end; $$;
revoke all on function eo_private.require_operational_object(text,text) from public,anon,authenticated;

create function public.eo_operational_object_readable(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select eo_private.role_of_actor() is not null and (
    (p_bucket='eo-sales-html' and exists(select 1 from public.eo_sales_publications r where r.object_path=p_path
      and (eo_private.role_of_actor()='admin' or (r.archived_at is null and exists(
        select 1 from unnest(r.store_ids) s where eo_private.has_store(s))))))
    or (p_bucket='eo-day-audio' and exists(select 1 from public.eo_day_records r where r.audio_path=p_path
      and (eo_private.role_of_actor()='admin' or eo_private.has_store(r.store_id))
      and (r.person_id=auth.uid() or eo_private.role_of_actor() in ('admin','diretor'))))
  );
$$;
create policy eo_operational_files_upload on storage.objects for insert to authenticated
with check(bucket_id in ('eo-sales-html','eo-day-audio') and public.eo_operational_upload_allowed(bucket_id,name));
create policy eo_operational_files_read on storage.objects for select to authenticated
using(bucket_id in ('eo-sales-html','eo-day-audio') and public.eo_operational_object_readable(bucket_id,name));
-- Sem UPDATE/DELETE de objetos: evita trocar o conteúdo de uma publicação já auditada.

create function public.eo_sales_reports(p_period text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_period is not null and p_period not in ('week','month','year') then raise exception 'Período inválido'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'period',r.period,
    'published_at',r.published_at,'object_path',r.object_path,'archived_at',r.archived_at,
    'store_ids',(select coalesce(jsonb_agg(s),'[]') from unnest(r.store_ids) s where eo_private.role_of_actor()='admin' or eo_private.has_store(s)))
    order by r.published_at desc,r.id) from public.eo_sales_publications r
    where (p_period is null or r.period=p_period) and (eo_private.role_of_actor()='admin' or
      (r.archived_at is null and exists(select 1 from unnest(r.store_ids) s where eo_private.has_store(s))))),'[]');
end; $$;
create function public.eo_publish_sales_report(p_title text,p_period text,p_object_path text,p_stores uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_stores uuid[];
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_title is null or length(trim(p_title)) not between 3 and 120 or p_period is null or p_period not in ('week','month','year') then
    raise exception 'Revise título e período'; end if;
  if coalesce(cardinality(p_stores),0)=0 then
    select array_agg(id order by code) into v_stores from public.eo_stores where active;
  else select array_agg(distinct x) into v_stores from unnest(p_stores) x;
    if array_position(p_stores,null) is not null then raise exception 'Loja inválida'; end if;
  end if;
  if coalesce(cardinality(v_stores),0)=0 or exists(select 1 from unnest(v_stores) s where not eo_private.has_store(s)) then
    raise exception 'Selecione lojas válidas' using errcode='42501'; end if;
  perform eo_private.require_operational_object('eo-sales-html',p_object_path);
  insert into public.eo_sales_publications(title,period,object_path,store_ids,created_by)
    values(trim(p_title),p_period,p_object_path,v_stores,auth.uid()) returning id into v_id;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'sales_report.published',v_id::text,
    jsonb_build_object('period',p_period,'store_count',cardinality(v_stores)));
  return v_id;
end; $$;
create function public.eo_archive_sales_report(p_id uuid,p_archived boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_archived is null then raise exception 'Informe o estado de arquivamento'; end if;
  update public.eo_sales_publications set archived_at=case when p_archived then now() else null end where id=p_id;
  if not found then raise exception 'Relatório não encontrado'; end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'sales_report.archive_changed',p_id::text,jsonb_build_object('archived',p_archived));
end; $$;

create function public.eo_save_day_entry(p_store uuid,p_date date,p_outcome text,p_reasons text[],p_note text,
  p_audio_path text default null,p_audio_seconds numeric default null,p_transcript text default null,p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_store public.eo_stores%rowtype; v_reasons text[]; v_name text; v_request uuid:=coalesce(p_request_id,gen_random_uuid());
begin
  if not eo_private.has_store(p_store) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  select id into v_id from public.eo_day_records where person_id=auth.uid() and request_id=v_request;
  if found then return v_id; end if;
  if p_date is null or p_outcome is null or p_outcome not in ('sold','no_sale') or length(coalesce(p_note,''))>5000
    or length(coalesce(p_transcript,''))>10000 or coalesce(cardinality(p_reasons),0)>20 then raise exception 'Revise os dados do dia'; end if;
  if exists(select 1 from unnest(p_reasons) r where r is null or length(trim(r)) not between 1 and 120) then raise exception 'Motivo inválido'; end if;
  select coalesce(array_agg(distinct trim(r)),'{}') into v_reasons from unnest(p_reasons) r;
  if p_outcome='no_sale' and cardinality(v_reasons)=0 then raise exception 'Informe pelo menos um motivo para não vender'; end if;
  if p_audio_path is not null then
    if p_audio_seconds is null or p_audio_seconds<=0 or p_audio_seconds>60 or p_audio_seconds::text='NaN' then raise exception 'O áudio deve ter até 60 segundos'; end if;
    perform eo_private.require_operational_object('eo-day-audio',p_audio_path);
  elsif p_audio_seconds is not null then raise exception 'Duração informada sem áudio'; end if;
  select * into strict v_store from public.eo_stores where id=p_store;
  select display_name into strict v_name from public.eo_profiles where id=auth.uid();
  insert into public.eo_day_records(store_id,person_id,entry_date,request_id,store_code,store_name,region,scope_snapshot,person_name,
    outcome,reasons,note,audio_path,audio_seconds,transcript,transcription_status)
  values(p_store,auth.uid(),p_date,v_request,v_store.code,v_store.name,v_store.region,
    jsonb_build_object('ggl',v_store.ggl,'role',eo_private.role_of_actor()),v_name,
    p_outcome,v_reasons,trim(coalesce(p_note,'')),p_audio_path,p_audio_seconds,nullif(trim(p_transcript),''),
    case when nullif(trim(p_transcript),'') is null then 'not_requested' else 'provided' end)
    on conflict(person_id,request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into strict v_id from public.eo_day_records where person_id=auth.uid() and request_id=v_request;
    return v_id;
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'day_entry.saved',v_id::text,
    jsonb_build_object('store_id',p_store,'entry_date',p_date,'outcome',p_outcome,'has_audio',p_audio_path is not null));
  return v_id;
end; $$;
create function public.eo_day_entries(p_from date,p_to date,p_store uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null or (p_store is not null and eo_private.role_of_actor()<>'admin' and not eo_private.has_store(p_store)) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Escolha um intervalo de até 367 dias'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.entry_date desc,q.store_code,q.person_name) from (
    select r.id,r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.person_name,r.entry_date,
      r.outcome,r.reasons,r.note,r.transcript,r.audio_path,r.audio_seconds,r.transcription_status,r.updated_at
    from public.eo_day_records r where r.entry_date between p_from and p_to and (p_store is null or r.store_id=p_store)
      and (eo_private.role_of_actor()='admin' or eo_private.has_store(r.store_id))
      and (r.person_id=auth.uid() or eo_private.role_of_actor() in ('admin','diretor'))
  ) q),'[]');
end; $$;

create function public.eo_mood_settings() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  return (select jsonb_build_object('enabled',enabled,'send_time',left(send_time::text,5),'timezone',timezone,'prompt',prompt)
    from public.eo_mood_configuration where id);
end; $$;
create function public.eo_admin_save_mood_settings(p_enabled boolean,p_send_time text,p_timezone text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_enabled is null or p_send_time is null or p_send_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_timezone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'Horário ou fuso inválidos'; end if;
  update public.eo_mood_configuration set enabled=p_enabled,send_time=p_send_time::time,timezone=p_timezone,updated_by=auth.uid(),updated_at=now() where id;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'mood.settings_saved','singleton',
    jsonb_build_object('enabled',p_enabled,'send_time',p_send_time,'timezone',p_timezone));
end; $$;
create function public.eo_save_mood(p_store uuid,p_date date,p_mood text,p_request_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_store public.eo_stores%rowtype; v_name text; v_request uuid:=coalesce(p_request_id,gen_random_uuid());
begin
  if not eo_private.has_store(p_store) then raise exception 'Loja fora da abrangência' using errcode='42501'; end if;
  select id into v_id from public.eo_mood_records where person_id=auth.uid() and request_id=v_request;
  if found then return v_id; end if;
  if not (select enabled from public.eo_mood_configuration where id) then raise exception 'Acompanhamento de humor desativado'; end if;
  if p_date is null or p_mood is null or p_mood not in ('happy','neutral','sad') then raise exception 'Selecione um sentimento válido'; end if;
  select * into strict v_store from public.eo_stores where id=p_store;
  select display_name into strict v_name from public.eo_profiles where id=auth.uid();
  insert into public.eo_mood_records(store_id,person_id,entry_date,request_id,store_code,store_name,region,scope_snapshot,person_name,mood)
    values(p_store,auth.uid(),p_date,v_request,v_store.code,v_store.name,v_store.region,
      jsonb_build_object('ggl',v_store.ggl,'role',eo_private.role_of_actor()),v_name,p_mood)
    on conflict(person_id,request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into strict v_id from public.eo_mood_records where person_id=auth.uid() and request_id=v_request;
    return v_id;
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'mood.saved',v_id::text,
    jsonb_build_object('store_id',p_store,'entry_date',p_date));
  return v_id;
end; $$;
create function public.eo_mood_entries(p_from date,p_to date,p_store uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null or (p_store is not null and eo_private.role_of_actor()<>'admin' and not eo_private.has_store(p_store)) then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Escolha um intervalo de até 367 dias'; end if;
  return coalesce((select jsonb_agg(to_jsonb(q) order by q.entry_date desc,q.store_code,q.person_name) from (
    select r.id,r.store_id,r.store_code,r.store_name,r.region,r.person_id,r.person_name,r.entry_date,r.mood,r.updated_at
    from public.eo_mood_records r where r.entry_date between p_from and p_to and (p_store is null or r.store_id=p_store)
      and (eo_private.role_of_actor()='admin' or eo_private.has_store(r.store_id))
      and (r.person_id=auth.uid() or eo_private.role_of_actor() in ('admin','diretor'))
  ) q),'[]');
end; $$;

create or replace function public.eo_alert_feed() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não autorizado' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) from (
    select a.id,a.title,a.body,a.urgent,a.created_at,a.hidden_from_users,a.data,r.seen_at,r.dismissed_at,
      (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'file_name',m.file_name,'mime_type',m.mime_type,'byte_size',m.byte_size,'object_path',m.object_path) order by m.created_at),'[]'::jsonb)
        from public.eo_message_attachments m where m.alert_id=a.id or (a.notice_id is not null and m.notice_id=a.notice_id)) attachments
    from public.eo_alert_recipients r join public.eo_alerts a on a.id=r.alert_id
    where r.user_id=auth.uid() and a.archived_at is null and (not a.hidden_from_users or eo_private.role_of_actor()='admin')
    order by a.created_at desc limit 100
  ) q);
end; $$;

create function public.eo_process_mood_reminders() returns integer
language plpgsql security definer set search_path='' as $$
declare v_config public.eo_mood_configuration%rowtype; v_local timestamp; v_date date;
  v_alert uuid; v_users uuid[]; v_user uuid; v_batch record; v_request bigint; v_count integer:=0;
begin
  -- Um worker por execução e destinatário único por dia, inclusive com várias lojas/dispositivos.
  if not pg_try_advisory_xact_lock(hashtext('eo-mood-reminders')) then return 0; end if;
  select * into strict v_config from public.eo_mood_configuration where id;
  if not v_config.enabled or v_config.updated_by is null then return 0; end if;
  v_local:=now() at time zone v_config.timezone; v_date:=v_local::date;
  if v_local::time<v_config.send_time then return 0; end if;
  select array_agg(p.id) into v_users from public.eo_profiles p
  where p.active and not p.must_change_password and (
    (p.role='admin' and exists(select 1 from public.eo_stores s where s.active))
    or exists(select 1 from public.eo_store_members m join public.eo_stores s on s.id=m.store_id where s.active and m.user_id=p.id)
    or exists(select 1 from public.eo_org_assignments a join public.eo_stores s on s.active and
      ((a.scope_type='LOJA' and a.scope_code=s.code) or (a.scope_type='GGL' and a.scope_code=s.ggl))
      where a.active and a.chapa=p.login_chapa))
    and not exists(select 1 from public.eo_mood_reminders r where r.user_id=p.id and r.reminder_date=v_date);
  if coalesce(cardinality(v_users),0)>0 then
    insert into public.eo_alerts(created_by,title,body,data)
      values(v_config.updated_by,'Como está seu dia?',v_config.prompt,jsonb_build_object('type','mood','date',v_date)) returning id into v_alert;
    insert into public.eo_mood_reminders(reminder_date,user_id,alert_id) select v_date,u,v_alert from unnest(v_users) u;
    insert into public.eo_alert_recipients(alert_id,user_id) select v_alert,u from unnest(v_users) u;
    v_count:=cardinality(v_users);
    insert into public.eo_audit_events(actor,action,entity_id,detail) values(v_config.updated_by,'mood.reminder_created',v_alert::text,
      jsonb_build_object('entry_date',v_date,'recipient_count',v_count));
  end if;
  for v_user,v_alert in select r.user_id,r.alert_id from public.eo_mood_reminders r
    join public.eo_profiles p on p.id=r.user_id
    where r.reminder_date=v_date and r.push_status='pending' and p.active and not p.must_change_password
  loop
    -- Lotes de até 100 dispositivos, com preferência de som. Sem tokens no histórico.
    begin
      v_request:=null;
      for v_batch in
        select jsonb_agg(jsonb_build_object('to',q.expo_push_token,'title','Como está seu dia?','body',v_config.prompt,
          'sound',case when coalesce(n.sound_enabled,true) then 'default' else null end,
          'data',jsonb_build_object('type','mood','date',v_date,'alertId',v_alert))) messages
        from (select d.expo_push_token,row_number() over(order by d.id) rn from public.eo_push_devices d where d.user_id=v_user) q
        left join public.eo_notification_settings n on n.user_id=v_user group by ((q.rn-1)/100)
      loop
        select net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=v_batch.messages,
          headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
          timeout_milliseconds:=10000) into v_request;
      end loop;
      update public.eo_mood_reminders set push_status=case when v_request is null then 'unavailable' else 'submitted' end,
        push_requested_at=case when v_request is not null then now() end,push_request_id=v_request
        where reminder_date=v_date and user_id=v_user;
      if v_request is not null then
        insert into public.eo_audit_events(actor,action,entity_id,detail) values(v_config.updated_by,'mood.push.submitted',v_alert::text,
          jsonb_build_object('recipient',v_user,'provider','expo','request_id',v_request));
      end if;
    exception when others then
      update public.eo_mood_reminders set push_status='failed',push_requested_at=now() where reminder_date=v_date and user_id=v_user;
      insert into public.eo_audit_events(actor,action,entity_id,detail) values(v_config.updated_by,'mood.push.failed',v_alert::text,
        jsonb_build_object('recipient',v_user,'sqlstate',sqlstate));
    end;
  end loop;
  return v_count;
end; $$;
revoke all on function public.eo_process_mood_reminders() from public,anon,authenticated;

revoke all on function public.eo_operational_upload_allowed(text,text),public.eo_operational_object_readable(text,text),
  public.eo_sales_reports(text),public.eo_publish_sales_report(text,text,text,uuid[]),public.eo_archive_sales_report(uuid,boolean),
  public.eo_save_day_entry(uuid,date,text,text[],text,text,numeric,text,uuid),public.eo_day_entries(date,date,uuid),
  public.eo_mood_settings(),public.eo_admin_save_mood_settings(boolean,text,text),public.eo_save_mood(uuid,date,text,uuid),
  public.eo_mood_entries(date,date,uuid),public.eo_alert_feed() from public,anon;
grant execute on function public.eo_operational_upload_allowed(text,text),public.eo_operational_object_readable(text,text),
  public.eo_sales_reports(text),public.eo_publish_sales_report(text,text,text,uuid[]),public.eo_archive_sales_report(uuid,boolean),
  public.eo_save_day_entry(uuid,date,text,text[],text,text,numeric,text,uuid),public.eo_day_entries(date,date,uuid),
  public.eo_mood_settings(),public.eo_admin_save_mood_settings(boolean,text,text),public.eo_save_mood(uuid,date,text,uuid),
  public.eo_mood_entries(date,date,uuid),public.eo_alert_feed() to authenticated;

do $$ begin
  if not exists(select 1 from cron.job where jobname='eo-mood-reminders') then
    perform cron.schedule('eo-mood-reminders','* * * * *','select public.eo_process_mood_reminders();');
  end if;
end; $$;
insert into eo_private.schema_migrations(version) values('202611070001_operational_modules');
commit;
