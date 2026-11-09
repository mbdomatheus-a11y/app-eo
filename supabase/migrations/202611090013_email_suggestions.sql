begin;
alter table public.eo_profile_preferences add column preferred_email_domain text;
update public.eo_identity_preferences set email_domains=array['pernambucanas.com.br','pefisa.com.br'] where id and cardinality(email_domains)=0;
create function public.eo_my_email_domain(p_domain text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare domain text;
begin
 if eo_private.role_of_actor() is distinct from 'admin' then raise exception 'Preferência exclusiva de administradores' using errcode='42501';end if;
 if p_domain is not null then
  domain:=lower(ltrim(trim(p_domain),'@'));
  if domain<>'' and (length(domain)>253 or domain !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$' or domain like '%..%') then raise exception 'Domínio inválido';end if;
  insert into public.eo_profile_preferences(user_id,preferred_email_domain) values(auth.uid(),nullif(domain,''))
   on conflict(user_id) do update set preferred_email_domain=excluded.preferred_email_domain,updated_at=now();
  insert into public.eo_audit_events(actor,action,entity_id) values(auth.uid(),'identity.personal_domain_saved',auth.uid()::text);
 end if;
 return jsonb_build_object('domain',coalesce((select preferred_email_domain from public.eo_profile_preferences where user_id=auth.uid()),(select email_domains[1] from public.eo_identity_preferences where id),''));
end;$$;
revoke all on function public.eo_my_email_domain(text) from public,anon;
grant execute on function public.eo_my_email_domain(text) to authenticated;
insert into eo_private.schema_migrations(version) values('202611090013_email_suggestions') on conflict do nothing;
commit;
