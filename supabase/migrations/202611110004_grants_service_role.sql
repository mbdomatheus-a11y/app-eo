-- 202611110004_grants_service_role
-- Novas tabelas não recebem grants automáticos (exposição automática desligada).
-- Edge Functions usam service_role; anon e authenticated continuam sem acesso direto.
begin;
grant select, insert, update, delete on public.acesso_contas_loja, public.acesso_reset_solicitacoes, public.colaboradores,
  public.escala_lojas_config, public.escala_colaborador_ajustes, public.escala_semanas, public.escala_semanas_versoes,
  public.escala_feedbacks, public.modulos_alvos to service_role;
grant usage, select on all sequences in schema public to service_role;
insert into eo_private.schema_migrations(version) values ('202611110004_grants_service_role') on conflict do nothing;
commit;
