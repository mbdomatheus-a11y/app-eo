-- Políticas de storage são combinadas pelo PostgreSQL para todos os buckets.
-- A política de checklist chamava helpers privados como authenticated, causando
-- permission denied em downloads de relatórios, apesar de suas RPCs funcionarem.
begin;

create function public.eo_checklist_object_readable(p_bucket text,p_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_run text:=split_part(p_path,'/',2);
begin
  if p_bucket is distinct from 'eo-checklist-photos' or auth.uid() is null or p_path is null then return false; end if;
  if split_part(p_path,'/',1)=auth.uid()::text then return true; end if;
  if v_run !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return coalesce(eo_private.role_of_actor() in ('admin','diretor','gerente') and exists(
    select 1 from public.eo_checklist_runs r where r.id=v_run::uuid and eo_private.has_store(r.store_id)),false);
end; $$;

create function public.eo_checklist_object_upload_allowed(p_bucket text,p_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare v_run text:=split_part(p_path,'/',2);
begin
  if p_bucket is distinct from 'eo-checklist-photos' or auth.uid() is null or p_path is null
    or split_part(p_path,'/',1)<>auth.uid()::text then return false; end if;
  if v_run !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return exists(select 1 from public.eo_checklist_runs r where r.id=v_run::uuid and r.assigned_to=auth.uid());
end; $$;

revoke all on function public.eo_checklist_object_readable(text,text),
  public.eo_checklist_object_upload_allowed(text,text) from public,anon,authenticated;
grant execute on function public.eo_checklist_object_readable(text,text),
  public.eo_checklist_object_upload_allowed(text,text) to authenticated;

alter policy "EO user and authorized leaders read checklist photos" on storage.objects
  using(public.eo_checklist_object_readable(bucket_id,name));
alter policy "EO user uploads own checklist photos" on storage.objects
  with check(public.eo_checklist_object_upload_allowed(bucket_id,name));

-- Expo aceita ambos os prefixos oficiais; nenhum token nativo arbitrário.
create or replace function public.eo_register_push_device(p_token text,p_platform text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if eo_private.role_of_actor() is null or p_platform is null or p_platform not in ('ios','android')
    or p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    or length(p_token) not between 20 and 200 then
    raise exception 'Dispositivo ou sessão inválidos' using errcode='42501';
  end if;
  insert into public.eo_push_devices(user_id,expo_push_token,platform) values(auth.uid(),p_token,p_platform)
    on conflict(expo_push_token) do update set user_id=excluded.user_id,platform=excluded.platform,updated_at=now();
  insert into public.eo_audit_events(actor,action,entity_id,detail)
    values(auth.uid(),'notification.device.registered',auth.uid()::text,jsonb_build_object('platform',p_platform));
end; $$;

-- Não conceder role_of_actor/has_store aos clientes: só wrappers autorizados.
commit;
