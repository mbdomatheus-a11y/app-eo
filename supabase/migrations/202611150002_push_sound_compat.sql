begin;
alter table public.dispositivos_push add column sound_bundle text not null default 'legacy' check(sound_bundle in ('legacy','underscore'));
create function public.eo_register_push_device_v2(p_token text,p_platform text,p_sound_bundle text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_sound_bundle is null or p_sound_bundle not in ('legacy','underscore') then raise exception 'Recursos de som inválidos';end if;
 perform public.eo_register_push_device(p_token,p_platform);
 update public.dispositivos_push set sound_bundle=p_sound_bundle where user_id=auth.uid() and expo_push_token=p_token;
end;$$;
revoke all on function public.eo_register_push_device_v2(text,text,text) from public,anon;
grant execute on function public.eo_register_push_device_v2(text,text,text) to authenticated;
insert into eo_private.schema_migrations(version) values('202611150002_push_sound_compat') on conflict do nothing;
notify pgrst, 'reload schema';
commit;
