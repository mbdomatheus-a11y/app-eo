-- 202611110008_telefone_60_dias
-- Telefone com DDD confirmado no login e de novo a cada 60 dias (pedido do Matheus em 11/11/2026).
-- eo_my_contact_request passa a exigir confirmação quando não há telefone, nunca houve confirmação,
-- a última tem mais de 60 dias ou a administração pediu. Contrato antigo (required, phone, requested_at) mantido.
begin;

alter table public.perfis add column if not exists telefone_confirmado_em timestamptz;

create or replace function public.eo_my_contact_request()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare v_phone text; v_requested timestamptz; v_confirmado timestamptz; v_motivo text;
begin
  if eo_private.role_of_actor() is null then raise exception 'Acesso não liberado' using errcode='42501'; end if;
  v_phone := eo_private.effective_contact_phone(auth.uid());
  select requested_at into v_requested from public.eo_contact_requests where user_id = auth.uid() and resolved_at is null;
  select telefone_confirmado_em into v_confirmado from public.perfis where id = auth.uid();
  v_motivo := case
    when v_requested is not null then 'administracao'
    when v_phone is null then 'sem_telefone'
    when v_confirmado is null then 'primeira_confirmacao'
    when v_confirmado < now() - interval '60 days' then 'vencido'
  end;
  return jsonb_build_object('required', v_motivo is not null, 'motivo', v_motivo, 'phone', v_phone,
    'requested_at', v_requested, 'confirmado_em', v_confirmado,
    'proxima_confirmacao', case when v_confirmado is not null then v_confirmado + interval '60 days' end);
end $$;

create or replace function public.eo_save_my_phone(p_phone text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_phone text; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('eo-admin-access-mutations'));
  perform pg_advisory_xact_lock(hashtext('eo-contact-requests'));
  if eo_private.role_of_actor() is null then raise exception 'Acesso não liberado' using errcode='42501'; end if;
  if p_phone is null or length(p_phone)>40 or p_phone !~ '^[+0-9() .-]+$' then raise exception 'Informe um telefone brasileiro com DDD'; end if;
  v_phone:=regexp_replace(p_phone,'[^0-9]','','g');
  if length(v_phone) in (12,13) and left(v_phone,2)='55' then v_phone:=substr(v_phone,3); end if;
  if v_phone !~ '^[1-9][0-9]([2-5][0-9]{7}|9[0-9]{8})$' then raise exception 'Informe um telefone brasileiro válido com DDD e 10 ou 11 dígitos'; end if;
  update public.perfis set contact_phone='+55'||v_phone, telefone_confirmado_em = now() where id=auth.uid() and active;
  update public.eo_contact_requests set resolved_at=now() where user_id=auth.uid() and resolved_at is null;
  get diagnostics v_count=row_count;
  insert into public.auditoria(actor,action,entity_id,detail) values(auth.uid(),'contact.phone_updated',auth.uid()::text,
    jsonb_build_object('resolved_requests',v_count,'verification','self_declared'));
  return jsonb_build_object('saved',true);
end $$;

insert into eo_private.schema_migrations(version) values ('202611110008_telefone_60_dias') on conflict do nothing;
commit;
