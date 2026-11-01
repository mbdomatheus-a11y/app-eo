# Integrações nativas do aparelho

## Integradas no código Expo

- **Câmera:** o checklist chama a câmera quando a pessoa toca em “Tirar e salvar foto”. A evidência vai para o bucket privado do Supabase, com registro de auditoria.
- **Push:** solicitação contextual de permissão, registro/renovação de Expo Push Token no Supabase, Edge Functions `send-alert-push` e `send-test-push`. O teste é exclusivo de admin e alcança somente os aparelhos dele. O som segue a preferência individual sem remover banner/push.
- **Agenda:** tela nativa de criação de evento com título, data/hora e observações. O EO solicita permissão apenas para adicionar eventos e abre o formulário do calendário do iOS/Android para a pessoa confirmar.
- **Telefone:** abre o discador do sistema com o número preenchido (`tel:`); a pessoa confirma a chamada. O app não disca automaticamente nem registra histórico de ligações.

## Entrega

Os quatro recursos usam módulos nativos do Expo. O `package.json`, lockfile e `app.json` incluem Notifications, Image Picker e Calendar. Alterações de dependências/permissões nativas precisam estar no binário instalado. O workflow de build foi deixado manual, sem gatilho por push; nenhum build deve ser iniciado nesta etapa.

## Para ativar push

1. O projeto EAS do EO já está vinculado; APNs `RSGS8585QG` está atribuído ao identificador `com.appeo.mobile`.
2. Configurar credenciais FCM v1 para Android no projeto Expo, sem compartilhar a chave privada no Git ou no chat.
3. Aplicar `supabase/migrations/202610310001_alerts_checklists.sql` e publicar `send-alert-push` e `send-test-push` no projeto Supabase `mfsnzrrqlyixqwsrcqyo`.
4. Para receber push, câmera e agenda no aparelho, será necessário atualizar o binário instalado, pois foram adicionados módulos nativos. O envio ao GitHub não inicia build automaticamente.

O EAS fornece project ID e gestão de credenciais; o compilador permanece no GitHub. Referência: https://docs.expo.dev/push-notifications/push-notifications-setup/.
