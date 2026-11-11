-- REVERSÃO MANUAL de 202611110001 (não é migration; executar só se precisar desfazer).
-- Remove views de compatibilidade, volta os nomes eo_ e reescreve os corpos das funções de volta.
-- Atenção: executar ANTES de qualquer migration posterior que dependa dos nomes novos (ex.: 202611110002).
begin;
create temporary table _ren(antigo text primary key, novo text not null) on commit drop;
insert into _ren values
 ('eo_org_import_batches','importacoes_organizacionais'),('eo_notification_settings','notificacoes_config'),
 ('eo_identity_preferences','identidade_preferencias'),('eo_profile_preferences','perfis_preferencias'),
 ('eo_directory_people','diretorio_pessoas'),('eo_org_assignments','diretorio_abrangencias'),
 ('eo_regional_groups','regionais'),('eo_business_units','unidades'),('eo_store_details','lojas_atributos'),
 ('eo_store_managers','lojas_gerentes'),('eo_store_members','lojas_membros'),('eo_store_hours','lojas_horarios'),
 ('eo_access_windows','acesso_janelas'),('eo_module_access','modulos_acesso'),('eo_module_people','modulos_pessoas'),
 ('eo_push_devices','dispositivos_push'),('eo_audit_events','auditoria'),('eo_profiles','perfis'),('eo_stores','lojas');
do $$ declare r record; begin
  for r in select * from _ren loop execute format('drop view if exists public.%I', r.antigo); end loop;
  for r in select * from _ren loop
    if to_regclass('public.'||r.novo) is not null then execute format('alter table public.%I rename to %I', r.novo, r.antigo); end if;
  end loop;
end $$;
do $$ declare f record; r record; v_src text; v_def text; v_pos int; v_re text;
begin
  select '\m(' || string_agg(novo, '|') || ')\M' into v_re from _ren;
  for f in select p.oid, p.prosrc from pg_proc p
            where p.pronamespace in ('public'::regnamespace,'eo_private'::regnamespace) and p.prokind in ('f','p')
              and p.prosqlbody is null and p.prosrc ~ v_re loop
    v_src := f.prosrc;
    for r in select * from _ren order by length(novo) desc loop
      v_src := regexp_replace(v_src, '\mpublic\.'||r.novo||'\M', 'public.'||r.antigo, 'g');
    end loop;
    v_def := pg_get_functiondef(f.oid); v_pos := position(f.prosrc in v_def);
    execute left(v_def, v_pos - 1) || v_src || substr(v_def, v_pos + length(f.prosrc));
  end loop;
end $$;
delete from eo_private.schema_migrations where version = '202611110001_padronizacao_tabelas_comuns';
commit;
