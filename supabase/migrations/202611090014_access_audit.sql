begin;
create table public.eo_access_windows (
 user_id uuid not null references public.eo_profiles(id),module_id text not null,platform text not null,
 last_logged_at timestamptz not null default now(),primary key(user_id,module_id,platform)
);
alter table public.eo_access_windows enable row level security;
revoke all on public.eo_access_windows from public,anon,authenticated;
create function public.eo_record_access(p_platform text,p_module text default 'modules') returns void
language plpgsql security definer set search_path='' as $$
declare allowed boolean;recorded uuid;
begin
 if eo_private.role_of_actor() is null then raise exception 'Entre novamente' using errcode='42501';end if;
 if p_platform is null or p_platform not in ('web','ios','android') or p_module is null or (p_module not in ('home','modules','admin','profile','device','units','people','contacts','privacy','settings') and not exists(select 1 from public.eo_module_access where module_id=p_module)) then raise exception 'Acesso informado inválido';end if;
 allowed:=public.eo_module_allowed(p_module) and (p_module not in ('admin','people','units') or eo_private.role_of_actor()='admin');
 insert into public.eo_access_windows(user_id,module_id,platform) values(auth.uid(),p_module,p_platform)
 on conflict(user_id,module_id,platform) do update set last_logged_at=now() where public.eo_access_windows.last_logged_at<now()-interval '5 minutes'
 returning user_id into recorded;
 if recorded is not null then
  insert into public.eo_audit_events(actor,action,entity_id,detail) values(auth.uid(),case when allowed then 'app.module_opened' else 'app.module_denied' end,p_module,jsonb_build_object('platform',p_platform,'source','authenticated_client','dedup_minutes',5));
 end if;
end;$$;
revoke all on function public.eo_record_access(text,text) from public,anon;
grant execute on function public.eo_record_access(text,text) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090014_access_audit') on conflict do nothing;
commit;
