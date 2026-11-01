# Alertas e checklists do EO

## O que esta entrega implementa

- Migração `202610310001_alerts_checklists.sql` com alertas, destinatários, preferências de som, modelos de checklist, tarefas atribuídas, respostas, evidências privadas e políticas RLS.
- Publicação de alerta para todos os usuários ativos vinculados às lojas selecionadas. Cada destinatário tem ações independentes de visualizar e descartar.
- Banner no app enquanto o alerta está novo. A pessoa pode visualizar ou descartar; a preferência interna só altera o som. A permissão do sistema continua sob controle do iOS/Android.
- Checklist com etapas de aceite, foto, resposta aberta e sim/não. Respostas são salvas individualmente, com data, usuário e evento de auditoria. A tela mostra estado pendente, em andamento e concluído.
- Inscrição Realtime nos próprios recibos de alerta e checklists atribuídos. O payload de alertas é carregado por RPC e não expõe mensagens de outras pessoas.
- Bucket privado `eo-checklist-photos`, limitado a imagens PNG/JPEG/WebP de até 10 MB. O app pede acesso à câmera ao tocar em “Tirar e salvar foto”, sobe o arquivo em caminho próprio e registra a resposta/auditoria.
- `expo-notifications` pede a permissão do sistema após ação explícita da pessoa e registra/atualiza o token do aparelho no Supabase. A Edge Function `send-alert-push` encaminha alertas aos tokens registrados e respeita a preferência de som sem remover o push.

## Instalação no Supabase

Aplicar `202610310001_alerts_checklists.sql` depois de `202610300001_service_role_identity_grants.sql`. Ela é aditiva, mantém os dados existentes e registra as tabelas novas no Realtime. Publicar `send-alert-push` e `send-test-push` com `verify_jwt=true`. Antes da implantação, conferir se o projeto correto está selecionado: `mfsnzrrqlyixqwsrcqyo` (SUP_EO1).

## Push do sistema

O banner em tempo real funciona com o app aberto. `expo-notifications` registra tokens no Supabase depois da permissão. O projeto EAS do EO está vinculado em `mobile/app.json` (`31e7b5e5-f006-4617-8774-8718d875a9ea`) e a chave APNs `RSGS8585QG` foi atribuída ao EO. Android ainda depende de credenciais FCM v1 no EAS. A entrega fora do app exige um novo binário com os módulos nativos; não publicar OTA incompatível com o binário instalado. A solicitação de permissão acontece após ação explícita, não a cada atualização. O app não pode reativar permissão negada nas configurações do sistema.

Matheus autorizou que título e mensagem sejam enviados ao Expo Push para encaminhamento por APNs/FCM. O histórico e os dados funcionais continuam no Supabase. A entrega é de melhor esforço, e o retorno de aceite do Expo não prova que o aparelho exibiu a notificação.

## Escala e privacidade

Postgres Changes atende a validação inicial com acesso RLS próprio de cada usuário. A documentação do Supabase recomenda Broadcast para cenários de escala maior, por isso avaliar canais privados de Broadcast antes de crescer para milhares de conexões simultâneas no mesmo fluxo. [Supabase Realtime: alterações Postgres](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)

Fotos ficam em bucket privado. Nunca colocar URL pública ou chave `service_role` no aplicativo. Eventos de publicação, preferências, leitura, descarte e respostas são gravados em `eo_audit_events`.
