-- 202611110001_padronizacao_tabelas_comuns
-- Objetivo: tabelas compartilhadas por todos os projetos do banco SUP_EO1 perdem o prefixo eo_.
-- Tabelas exclusivas de um módulo mantêm o prefixo do módulo (eo_, escala_ ...).
-- Segurança da troca:
--   1. RENAME preserva dados, índices, RLS, políticas, gatilhos, grants e publicações (ligados por OID).
--   2. Corpos de funções plpgsql e sql (texto) são reescritos para os nomes novos.
--   3. Views de compatibilidade com os nomes antigos (somente service_role) mantêm Edge Functions e
--      scripts antigos funcionando até serem atualizados. Remover em migration futura (ver docs/BANCO-CONVENCOES.md).
-- Não altera nomes de colunas nem de RPCs: apps web e mobile publicados continuam iguais.

begin;

create temporary table _ren(antigo text primary key, novo text not null, ordem int not null) on commit drop;
insert into _ren values
 ('eo_org_import_batches','importacoes_organizacionais',1),
 ('eo_notification_settings','notificacoes_config',2),
 ('eo_identity_preferences','identidade_preferencias',3),
 ('eo_profile_preferences','perfis_preferencias',4),
 ('eo_directory_people','diretorio_pessoas',5),
 ('eo_org_assignments','diretorio_abrangencias',6),
 ('eo_regional_groups','regionais',7),
 ('eo_business_units','unidades',8),
 ('eo_store_details','lojas_atributos',9),
 ('eo_store_managers','lojas_gerentes',10),
 ('eo_store_members','lojas_membros',11),
 ('eo_store_hours','lojas_horarios',12),
 ('eo_access_windows','acesso_janelas',13),
 ('eo_module_access','modulos_acesso',14),
 ('eo_module_people','modulos_pessoas',15),
 ('eo_push_devices','dispositivos_push',16),
 ('eo_audit_events','auditoria',17),
 ('eo_profiles','perfis',18),
 ('eo_stores','lojas',19);

-- 1. Renomear tabelas
do $$
declare r record;
begin
  for r in select * from _ren order by ordem loop
    if to_regclass('public.'||r.antigo) is not null and to_regclass('public.'||r.novo) is null then
      execute format('alter table public.%I rename to %I', r.antigo, r.novo);
    end if;
  end loop;
end $$;

-- 2. Reescrever corpos de funções (somente o corpo; nomes e assinaturas não mudam)
do $$
declare f record; r record; v_src text; v_def text; v_pos int;
begin
  for f in
    select p.oid, p.prosrc
      from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'eo_private'::regnamespace)
       and p.prokind in ('f','p')
       and p.prosqlbody is null
       and p.prosrc ~ '\meo_(org_import_batches|notification_settings|identity_preferences|profile_preferences|directory_people|org_assignments|regional_groups|business_units|store_details|store_managers|store_members|store_hours|access_windows|module_access|module_people|push_devices|audit_events|profiles|stores)\M'
  loop
    v_src := f.prosrc;
    for r in select * from _ren order by length(antigo) desc loop
      v_src := regexp_replace(v_src, '\m'||r.antigo||'\M', r.novo, 'g');
    end loop;
    v_def := pg_get_functiondef(f.oid);
    v_pos := position(f.prosrc in v_def);
    if v_pos = 0 then raise exception 'Corpo não localizado na função %', f.oid::regprocedure; end if;
    execute left(v_def, v_pos - 1) || v_src || substr(v_def, v_pos + length(f.prosrc));
  end loop;
end $$;

-- 3. Views de compatibilidade (transição), invisíveis para anon e authenticated
do $$
declare r record;
begin
  for r in select * from _ren order by ordem loop
    execute format('create or replace view public.%I with (security_invoker = true) as select * from public.%I', r.antigo, r.novo);
    execute format('revoke all on public.%I from public, anon, authenticated', r.antigo);
    execute format('grant select, insert, update, delete on public.%I to service_role', r.antigo);
    execute format('comment on view public.%I is %L', r.antigo, 'COMPATIBILIDADE temporária. Use public.'||r.novo||'. Remover após atualizar Edge Functions e scripts.');
  end loop;
end $$;

-- 4. Comentários de catálogo: dono e escopo de cada tabela comum
do $$
declare r record;
begin
  for r in select * from _ren loop
    execute format('comment on table public.%I is %L', r.novo, 'COMUM (todos os projetos). Antigo: '||r.antigo||'. Não apagar nem alterar colunas sem checar docs/BANCO-CONVENCOES.md.');
  end loop;
end $$;

insert into eo_private.schema_migrations(version) values ('202611110001_padronizacao_tabelas_comuns')
on conflict do nothing;

commit;
