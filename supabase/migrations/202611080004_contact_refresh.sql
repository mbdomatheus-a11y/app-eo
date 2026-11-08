begin;

-- Contato declarado pelo titular. Não altera dados importados nem verifica SMS.
alter table public.eo_profiles add column contact_phone text;
-- Prioridade: declaração do titular, diretório ativo, regional ativa.
-- Descarta candidatos inválidos antes de procurar a próxima fonte.
create function eo_private.effective_contact_phone(p_id uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare v_raw text; v_phone text;
begin
  for v_raw in
    select c.phone from public.eo_profiles p cross join lateral (
      select p.contact_phone phone,0 priority,'' tie
      union all select d.phone,1,'' from public.eo_directory_people d where d.chapa=p.login_chapa and d.active
      union all select g.phone,2,g.ggl from public.eo_regional_groups g where g.chapa=p.login_chapa and g.active
    ) c where p.id=p_id order by c.priority,c.tie
  loop
    if v_raw is null or length(v_raw)>40 or v_raw !~ '^[+0-9() .-]+$' then continue; end if;
    v_phone:=regexp_replace(v_raw,'[^0-9]','','g');
    if length(v_phone) in (12,13) and left(v_phone,2)='55' then v_phone:=substr(v_phone,3); end if;
    if v_phone ~ '^[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' then return '+55'||v_phone; end if;
  end loop;
  return null;
end; $$;
revoke all on function eo_private.effective_contact_phone(uuid) from public,anon,authenticated,service_role;
create table public.eo_contact_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.eo_profiles(id),
  requested_by uuid not null references public.eo_profiles(id),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  alert_id uuid references public.eo_alerts(id)
);
create unique index eo_contact_requests_pending on public.eo_contact_requests(user_id) where resolved_at is null;
alter table public.eo_contact_requests enable row level security;
revoke all on public.eo_contact_requests from public,anon,authenticated;

create function public.eo_admin_request_contact_update(p_only_missing boolean default true)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_users uuid[]; v_total integer; v_alert uuid;
begin
  perform pg_advisory_xact_lock(hashtext('eo-admin-access-mutations'));
  perform pg_advisory_xact_lock(hashtext('eo-contact-requests'));
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Acesso administrativo necessário' using errcode='42501'; end if;
  if p_only_missing is null then raise exception 'Selecione o público'; end if;
  select count(*) into v_total from public.eo_profiles p where p.active
    and (not p_only_missing or eo_private.effective_contact_phone(p.id) is null);
  with inserted as (
    insert into public.eo_contact_requests(user_id,requested_by)
    select p.id,auth.uid() from public.eo_profiles p where p.active
      and (not p_only_missing or eo_private.effective_contact_phone(p.id) is null)
    on conflict(user_id) where resolved_at is null do nothing returning user_id
  ) select coalesce(array_agg(user_id),'{}'::uuid[]) into v_users from inserted;
  if cardinality(v_users)>0 then
    insert into public.eo_alerts(created_by,title,body,data) values(auth.uid(),'Atualize seu telefone',
      'Confirme seu telefone no aplicativo para manter seu contato atualizado. Não há verificação por SMS.',
      jsonb_build_object('type','contact_update')) returning id into v_alert;
    update public.eo_contact_requests set alert_id=v_alert where user_id=any(v_users) and resolved_at is null;
    insert into public.eo_alert_recipients(alert_id,user_id) select v_alert,u from unnest(v_users) u;
  end if;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'contact.update_requested',coalesce(v_alert::text,'none'),
    jsonb_build_object('only_missing',p_only_missing,'requested',cardinality(v_users),'total',v_total));
  return jsonb_build_object('requested',cardinality(v_users),'total',v_total);
end; $$;

create function public.eo_my_contact_request() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_phone text; v_requested timestamptz;
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não liberado' using errcode='42501'; end if;
  v_phone:=eo_private.effective_contact_phone(auth.uid());
  select requested_at into v_requested from public.eo_contact_requests where user_id=auth.uid() and resolved_at is null;
  return jsonb_build_object('required',v_requested is not null,'phone',v_phone,'requested_at',v_requested);
end; $$;

create function public.eo_save_my_phone(p_phone text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_phone text; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('eo-admin-access-mutations'));
  perform pg_advisory_xact_lock(hashtext('eo-contact-requests'));
  if eo_private.role_of_actor() is null then raise exception 'Acesso não liberado' using errcode='42501'; end if;
  if p_phone is null or length(p_phone)>40 or p_phone !~ '^[+0-9() .-]+$' then raise exception 'Informe um telefone brasileiro com DDD'; end if;
  v_phone:=regexp_replace(p_phone,'[^0-9]','','g');
  if length(v_phone) in (12,13) and left(v_phone,2)='55' then v_phone:=substr(v_phone,3); end if;
  if v_phone !~ '^[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' then raise exception 'Informe um telefone brasileiro válido com DDD e 10 ou 11 dígitos'; end if;
  update public.eo_profiles set contact_phone='+55'||v_phone where id=auth.uid() and active;
  update public.eo_contact_requests set resolved_at=now() where user_id=auth.uid() and resolved_at is null;
  get diagnostics v_count=row_count;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'contact.phone_updated',auth.uid()::text,
    jsonb_build_object('resolved_requests',v_count,'verification','self_declared'));
  return jsonb_build_object('saved',true);
end; $$;

revoke all on function public.eo_admin_request_contact_update(boolean),public.eo_my_contact_request(),public.eo_save_my_phone(text) from public,anon;
grant execute on function public.eo_admin_request_contact_update(boolean),public.eo_my_contact_request(),public.eo_save_my_phone(text) to authenticated;
insert into eo_private.schema_migrations(version) values('202611080004_contact_refresh');
commit;
