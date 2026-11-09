begin;
alter table public.eo_settings add column push_sound text not null default 'default'
 check(push_sound in ('default','eo-soft.wav','eo-bell.wav','eo-alert.wav'));
create function public.eo_notification_sound(p_sound text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is null then raise exception 'Entre novamente' using errcode='42501';end if;
 if p_sound is not null then
  if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Somente administradores configuram o som' using errcode='42501';end if;
  if p_sound not in ('default','eo-soft.wav','eo-bell.wav','eo-alert.wav') then raise exception 'Som inválido';end if;
  update public.eo_settings set push_sound=p_sound where id;
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),'notification.sound_configured','organization',jsonb_build_object('sound',p_sound));
 end if;
 return (select jsonb_build_object('sound',push_sound) from public.eo_settings where id);
end;$$;
create or replace function public.eo_alert_push_metadata(p_alert uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() not in ('admin','diretor','gerente') or eo_private.role_of_actor() is null then raise exception 'Envio de alerta não autorizado' using errcode='42501'; end if;
 if not exists(select 1 from public.eo_alerts where id=p_alert and created_by=auth.uid()) then raise exception 'Alerta indisponível' using errcode='42501'; end if;
 return (select jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'urgent',a.urgent,'sound',(select push_sound from public.eo_settings where id)) from public.eo_alerts a where a.id=p_alert);
end; $$;
create or replace function public.eo_test_push_metadata() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Apenas administrador pode enviar teste' using errcode='42501'; end if;
 return jsonb_build_object('user_id',auth.uid(),'sound',(select push_sound from public.eo_settings where id));
end; $$;
revoke all on function public.eo_notification_sound(text) from public,anon;
grant execute on function public.eo_notification_sound(text) to authenticated;
-- Agendamentos SQL usam o mesmo som/canal e ignoram contas desativadas.
do $$ declare f record;definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','eo_private') and p.prosrc like '%exp.host/%' and p.prosrc like '%eo_push_devices%' loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition, 'case when q.sound_enabled then ''default'' else null end', 'case when q.sound_enabled then (select push_sound from public.eo_settings where id) else null end');
  definition:=replace(definition, '''sound'',case when q.sound_enabled', '''channelId'',case when not q.sound_enabled then ''eo-alerts-quiet'' when (select push_sound from public.eo_settings where id)=''default'' then ''eo-alerts'' else ''eo-alerts-''||replace(replace((select push_sound from public.eo_settings where id),''eo-'',''''),''.wav'','''') end,''sound'',case when q.sound_enabled');
  definition:=replace(definition, 'on d.user_id=r.user_id', 'on d.user_id=r.user_id and exists(select 1 from public.eo_profiles active_person where active_person.id=d.user_id and active_person.active)');
  execute definition;
 end loop;
end;$$;
insert into eo_private.schema_migrations(version) values('202611090009_notification_sounds') on conflict do nothing;
commit;
