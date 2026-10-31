begin;

-- A chave secreta do Supabase é usada somente no servidor pela Edge Function.
-- Conceder apenas as operações necessárias às tabelas usadas por admin-identity.
grant usage on schema public to service_role;
grant select, insert, update on table public.eo_profiles to service_role;
grant select on table public.eo_stores to service_role;
grant select, insert, delete on table public.eo_store_members to service_role;
grant insert on table public.eo_audit_events to service_role;
grant usage, select on sequence public.eo_audit_events_id_seq to service_role;

insert into eo_private.schema_migrations(version)
values ('202610300001_service_role_identity_grants')
on conflict (version) do nothing;

commit;
