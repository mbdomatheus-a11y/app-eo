-- Segmentação por abrangência e envio de comunicados/alertas programados.
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table public.eo_scheduled_messages (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.eo_profiles(id),
  request_id uuid not null,
  message_type text not null check (message_type in ('notice','alert')),
  title text not null check (length(title) between 3 and 120),
  body text not null check (length(body) between 1 and 5000),
  store_ids uuid[] not null check (cardinality(store_ids) between 1 and 2000),
  urgent boolean not null default false,
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','published','failed','cancelled')),
  published_id uuid,
  failure text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (created_by,request_id)
);
create index eo_scheduled_messages_due on public.eo_scheduled_messages(scheduled_for,id) where status='scheduled';
alter table public.eo_scheduled_messages enable row level security;
revoke all on public.eo_scheduled_messages from public,anon,authenticated;

-- A publicação imediata de comunicado também inclui pessoas carregadas pela
-- planilha, que podem estar associadas diretamente à loja ou ao GGL regional.
create or replace function public.eo_publish_notice(
  p_title text,p_body text,p_stores uuid[],p_urgent boolean default false,p_request_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_actor uuid := auth.uid(); v_stores uuid[];
begin
  if eo_private.role_of_actor() not in ('admin','diretor') or eo_private.role_of_actor() is null then
    raise exception 'Publicação não autorizada' using errcode='42501';
  end if;
  if coalesce(cardinality(p_stores),0)=0 or cardinality(p_stores)>2000 then
    raise exception 'Selecione as lojas destinatárias';
  end if;
  select array_agg(distinct x order by x) into v_stores from unnest(p_stores) as u(x);
  if exists(select 1 from unnest(v_stores) as u(x) where x is null or not eo_private.has_store(x)) then
    raise exception 'Loja fora da abrangência' using errcode='42501';
  end if;
  if length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and 5000 then
    raise exception 'Título ou mensagem inválidos';
  end if;
  insert into public.eo_notices(id,created_by) values(p_request_id,v_actor) on conflict do nothing returning id into v_id;
  if v_id is null then
    if exists(select 1 from public.eo_notices where id=p_request_id and created_by=v_actor) then return p_request_id; end if;
    raise exception 'Solicitação inválida';
  end if;
  insert into public.eo_notice_versions(notice_id,version,title,body,urgent)
    values(v_id,1,trim(p_title),trim(p_body),coalesce(p_urgent,false));
  insert into public.eo_notice_stores select v_id,1,x from unnest(v_stores) as u(x);
  insert into public.eo_notice_recipients(notice_id,version,user_id)
    select v_id,1,p.id from public.eo_profiles p where p.active and (
      p.role='admin'
      or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(v_stores))
      or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and (
        (a.scope_type='LOJA' and a.scope_code in (select s.code from public.eo_stores s where s.id=any(v_stores)))
        or (a.scope_type='GGL' and a.scope_code in (select s.ggl from public.eo_stores s where s.id=any(v_stores)))
      ))
    );
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(v_actor,'notice.published',v_id::text,jsonb_build_object('version',1,'store_count',cardinality(v_stores)));
  return v_id;
end;
$$;

create or replace function public.eo_schedule_message(
  p_message_type text,p_title text,p_body text,p_stores uuid[],p_urgent boolean,
  p_scheduled_for timestamptz,p_request_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_id uuid; v_actor uuid := auth.uid(); v_role text := eo_private.role_of_actor(); v_stores uuid[];
  v_max_body integer := case when p_message_type='alert' then 3000 else 5000 end;
begin
  if v_role is null or (p_message_type='notice' and v_role not in ('admin','diretor'))
    or (p_message_type='alert' and v_role not in ('admin','diretor','gerente'))
    or p_message_type not in ('notice','alert') then
    raise exception 'Programação não autorizada' using errcode='42501';
  end if;
  if p_request_id is null or p_scheduled_for is null or p_scheduled_for < now()+interval '2 minutes'
    or p_scheduled_for > now()+interval '90 days' then
    raise exception 'Escolha um horário entre 2 minutos e 90 dias a partir de agora';
  end if;
  if coalesce(cardinality(p_stores),0)=0 or cardinality(p_stores)>2000
    or length(trim(p_title)) not between 3 and 120 or length(trim(p_body)) not between 1 and v_max_body then
    raise exception 'Revise título, mensagem e lojas';
  end if;
  select array_agg(distinct x order by x) into v_stores from unnest(p_stores) as u(x);
  if exists(select 1 from unnest(v_stores) as u(x) where x is null or not eo_private.has_store(x)) then
    raise exception 'Loja fora da abrangência' using errcode='42501';
  end if;
  insert into public.eo_scheduled_messages(created_by,request_id,message_type,title,body,store_ids,urgent,scheduled_for)
    values(v_actor,p_request_id,p_message_type,trim(p_title),trim(p_body),v_stores,coalesce(p_urgent,false),p_scheduled_for)
    on conflict(created_by,request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.eo_scheduled_messages where created_by=v_actor and request_id=p_request_id;
    return v_id;
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(v_actor,'message.scheduled',v_id::text,jsonb_build_object(
      'message_type',p_message_type,'title',trim(p_title),'store_count',cardinality(v_stores),
      'scheduled_for',p_scheduled_for,'urgent',coalesce(p_urgent,false)
    ));
  return v_id;
end;
$$;

create function public.eo_process_scheduled_messages() returns integer
language plpgsql security definer set search_path='' as $$
declare
  v_job public.eo_scheduled_messages%rowtype; v_published uuid; v_store_codes jsonb;
  v_payload jsonb; v_push_batch record; v_count integer := 0;
begin
  for v_job in
    select * from public.eo_scheduled_messages
    where status='scheduled' and scheduled_for<=now()
    order by scheduled_for,id for update skip locked limit 50
  loop
    begin
      v_published := gen_random_uuid();
      if v_job.message_type='notice' then
        insert into public.eo_notices(id,created_by) values(v_published,v_job.created_by);
        insert into public.eo_notice_versions(notice_id,version,title,body,urgent,published_at)
          values(v_published,1,v_job.title,v_job.body,v_job.urgent,now());
        insert into public.eo_notice_stores select v_published,1,x from unnest(v_job.store_ids) as u(x);
        insert into public.eo_notice_recipients(notice_id,version,user_id)
          select v_published,1,p.id from public.eo_profiles p where p.active and (
            p.role='admin'
            or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(v_job.store_ids))
            or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and (
              (a.scope_type='LOJA' and a.scope_code in (select s.code from public.eo_stores s where s.id=any(v_job.store_ids)))
              or (a.scope_type='GGL' and a.scope_code in (select s.ggl from public.eo_stores s where s.id=any(v_job.store_ids)))
            ))
          );
        insert into public.eo_audit_events(actor,action,entity_id,detail)
          values(v_job.created_by,'notice.published',v_published::text,jsonb_build_object('version',1,'store_count',cardinality(v_job.store_ids),'scheduled_id',v_job.id));
      else
        select coalesce(jsonb_agg(s.code order by s.code),'[]'::jsonb) into v_store_codes
          from public.eo_stores s where s.id=any(v_job.store_ids);
        insert into public.eo_alerts(id,created_by,title,body,urgent)
          values(v_published,v_job.created_by,v_job.title,v_job.body,v_job.urgent);
        insert into public.eo_alert_stores select v_published,x from unnest(v_job.store_ids) as u(x);
        insert into public.eo_alert_recipients(alert_id,user_id)
          select v_published,p.id from public.eo_profiles p where p.active and (
            p.role='admin'
            or exists(select 1 from public.eo_store_members m where m.user_id=p.id and m.store_id=any(v_job.store_ids))
            or exists(select 1 from public.eo_org_assignments a where a.active and a.chapa=p.login_chapa and (
              (a.scope_type='LOJA' and a.scope_code in (select s.code from public.eo_stores s where s.id=any(v_job.store_ids)))
              or (a.scope_type='GGL' and a.scope_code in (select s.ggl from public.eo_stores s where s.id=any(v_job.store_ids)))
            ))
          );
        insert into public.eo_audit_events(actor,action,entity_id,detail)
          values(v_job.created_by,'alert.published',v_published::text,jsonb_build_object(
            'title',v_job.title,'body',v_job.body,'urgent',v_job.urgent,'store_codes',v_store_codes,
            'recipient_count',(select count(*) from public.eo_alert_recipients where alert_id=v_published),
            'scheduled_id',v_job.id
          ));

        -- Push agendado vai do Postgres à API pública Expo em lotes de 100.
        -- O texto passa pela Expo, conforme consentimento já registrado para notificações.
        for v_push_batch in
          select jsonb_agg(jsonb_build_object(
              'to',q.expo_push_token,'title',v_job.title,'body',v_job.body,
              'sound',case when q.sound_enabled then 'default' else null end,
              'priority',case when v_job.urgent then 'high' else 'default' end,
              'data',jsonb_build_object('alertId',v_published::text)
            ) order by q.rn) as messages
          from (
            select d.expo_push_token,coalesce(n.sound_enabled,true) as sound_enabled,
              row_number() over(order by d.id) as rn
            from public.eo_alert_recipients r
            join public.eo_push_devices d on d.user_id=r.user_id
            left join public.eo_notification_settings n on n.user_id=r.user_id
            where r.alert_id=v_published
          ) q
          group by ((q.rn-1)/100)
        loop
          perform net.http_post(
            url:='https://exp.host/--/api/v2/push/send',
            body:=v_push_batch.messages,
            headers:='{"Content-Type":"application/json","Accept":"application/json"}'::jsonb,
            timeout_milliseconds:=10000
          );
        end loop;
        insert into public.eo_audit_events(actor,action,entity_id,detail)
          values(v_job.created_by,'alert.push.submitted',v_published::text,jsonb_build_object('provider','expo','scheduled_id',v_job.id));
      end if;
      update public.eo_scheduled_messages set status='published',published_id=v_published,processed_at=now(),failure=null where id=v_job.id;
    exception when others then
      update public.eo_scheduled_messages set status='failed',processed_at=now(),failure=left(sqlerrm,500) where id=v_job.id;
      insert into public.eo_audit_events(actor,action,entity_id,detail)
        values(v_job.created_by,'message.schedule_failed',v_job.id::text,jsonb_build_object('message_type',v_job.message_type,'error',left(sqlerrm,500)));
    end;
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.eo_schedule_message(text,text,text,uuid[],boolean,timestamptz,uuid) from public,anon;
grant execute on function public.eo_schedule_message(text,text,text,uuid[],boolean,timestamptz,uuid) to authenticated;
revoke all on function public.eo_process_scheduled_messages() from public,anon,authenticated;

do $$
begin
  if not exists(select 1 from cron.job where jobname='eo-process-scheduled-messages') then
    perform cron.schedule('eo-process-scheduled-messages','* * * * *','select public.eo_process_scheduled_messages();');
  end if;
end;
$$;

commit;
