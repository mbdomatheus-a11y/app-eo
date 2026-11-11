# Banco único SUP_EO1: convenções obrigatórias

Projeto Supabase `mfsnzrrqlyixqwsrcqyo` (SUP_EO1). O EO é o projeto mãe. Todos os projetos derivados (Escala e os próximos) usam este mesmo banco, para não duplicar lojas, pessoas e regionais.

LEIA ANTES DE ALTERAR O BANCO. Uma mudança aqui pode quebrar o site do EO, os apps no celular e qualquer outro projeto derivado.

## Regras de ouro

1. Nunca apagar tabela, coluna, função ou dado de tabela COMUM. Desativar (`ativo=false` / `active=false`) em vez de apagar.
2. Nunca renomear tabela, coluna ou RPC sem migration que reescreva as funções e crie compatibilidade (ver 202611110001).
3. Toda mudança é migration nova em `supabase/migrations/AAAAMMDDNNNN_descricao.sql`, aditiva, com `begin/commit`, registrada em `eo_private.schema_migrations`. Nunca editar migration já aplicada.
4. Antes de aplicar: dry run em transação que termina em erro proposital (rollback) e `plpgsql_check` sem erros novos. Antes de confiar em RLS, consultar `pg_policies` em produção (o repositório pode divergir).
5. Clientes (web e mobile) nunca leem tabela direto. Tabelas com RLS ligado e `revoke all` para `anon` e `authenticated`; acesso só por RPC `security definer` com `set search_path to ''`, nomes qualificados (`public.x`), validando `auth.uid()`, perfil ativo, módulo e loja.
6. Chave pública (`sb_publishable_...`) pode ir para o navegador; `service_role`, `sb_secret_...` e senha do banco nunca vão para código, repositório, chat ou Obsidian.
7. Consultas paginadas (máximo 100 linhas), agregação no servidor, uma chamada por tela quando possível.

## Nomes

COMUM (vários projetos): sem prefixo, em português. Ex.: lojas, regionais, unidades, perfis, colaboradores, auditoria.
Exclusiva de módulo: prefixo do módulo. Ex.: eo_notices, escala_semanas.
RPC de módulo: prefixo do módulo. Ex.: eo_context, escala_salvar_semana.
RPC comum: nome da tabela comum. Ex.: colaboradores_importar.
Auxiliar interno: schema eo_private, sem grant ao cliente. Ex.: eo_private.has_store.

Colunas antigas das tabelas comuns continuam em inglês (`code`, `name`, `active`, `store_id`) para não quebrar os apps. Colunas novas em português. Código de loja no banco é sem zeros à esquerda (`10`, `100`): comparar com `ltrim(code,'0')`.

## Tabelas comuns (renomeadas em 11/11/2026)

lojas (eo_stores), unidades (eo_business_units), lojas_atributos (eo_store_details), lojas_horarios (eo_store_hours), lojas_gerentes (eo_store_managers), lojas_membros (eo_store_members), regionais (eo_regional_groups), diretorio_pessoas (eo_directory_people), diretorio_abrangencias (eo_org_assignments), importacoes_organizacionais (eo_org_import_batches), perfis (eo_profiles), perfis_preferencias (eo_profile_preferences), identidade_preferencias (eo_identity_preferences), auditoria (eo_audit_events, coluna `modulo`), acesso_janelas (eo_access_windows), modulos_acesso (eo_module_access), modulos_pessoas (eo_module_people), dispositivos_push (eo_push_devices), notificacoes_config (eo_notification_settings), colaboradores (nova).

Views com o nome antigo existem só para transição, acessíveis apenas por `service_role` (Edge Functions e scripts). Não criar nada novo apontando para elas. Remover em migration futura depois de atualizar e publicar as Edge Functions (`admin-identity`, `send-alert-push`, `send-test-push`, `organize-product`, `summarize-operations`, `transcribe-audio`) e scripts.

Atenção: `diretorio_pessoas` é recarregada pela importação organizacional do EO (desativa todos e reativa o lote). Não usar como base de colaboradores; a base de colaboradores é `colaboradores`.

## Módulos registrados

Cada projeto derivado registra seu id em `modulos_acesso` (`eo_require_module('<id>')` nas RPCs). Ids: notices, sales, product, assortment, diary, mood, checklists, reports, agenda, escala.

## Escala (202611110002)

escala_lojas_config, escala_colaborador_ajustes, escala_semanas (uma linha por loja e semana, `dados` jsonb, `versao` com trava otimista: conflito devolve erro 40001), escala_semanas_versoes (30 últimas), escala_feedbacks. Logs vão para `auditoria` com `modulo='escala'`.

## Contas de loja (202611110003 e 0004)

acesso_contas_loja e acesso_reset_solicitacoes (COMUNS). Usuário gerNNN, exibido como gerNNN@pernambucanas.com.br; e-mail interno no Auth `loja-gerNNN@login.app-eo.invalid`. A senha gravada no Auth é derivada por HMAC na Edge Function `acesso-loja` com o segredo ACESSO_LOJA_PEPPER; o formato da senha padrão fica no segredo ACESSO_LOJA_SENHA_MODELO (nunca no repositório, que é público). Nunca trocar ACESSO_LOJA_PEPPER sem redefinir todas as contas de loja. Bloqueio no 3º erro; liberação só pelo admin (volta ao padrão e força troca). Contas nominais por chapa não usam esse fluxo.

Visibilidade de módulos: `modulos_acesso.audience` aceita all, admin e selected; alvos em `modulos_alvos` (perfil, loja, ggl, regional) além de `modulos_pessoas`. RPC `eo_admin_set_module_targets`; `eo_admin_set_module_access` antigo continua funcionando.

Tabelas novas não recebem grants automáticos: conceder explicitamente a service_role quando uma Edge Function precisar (ver 0004).

## Reversão

`supabase/operations/20261111-reverter-padronizacao-tabelas-comuns.sql` desfaz a padronização (somente antes de existir dependência dos nomes novos).
