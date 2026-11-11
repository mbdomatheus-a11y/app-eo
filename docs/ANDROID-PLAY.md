# Publicar o EO no Android (Google Play) pelo GitHub Actions

Workflow `.github/workflows/eo-mobile-build.yml`, plataforma `android-play`. Gera o AAB assinado com a chave de upload, guarda como artefato e, se existir o segredo PLAY_SERVICE_ACCOUNT_JSON, envia ao teste interno da Play.

## Uma vez só (Matheus)

1. Chave de upload: no PowerShell, na pasta App_EO, rodar `powershell -ExecutionPolicy Bypass -File scripts\android-criar-chave-upload.ps1`. Cria a chave em Documentos\EO-chaves e cadastra 4 segredos no GitHub. Guardar senha e arquivo no gerenciador de senhas; perder a chave exige pedido de troca ao Google.
2. Firebase (mesmo projeto do Control ALL, decisão de 11/11/2026): no console do Firebase, adicionar app Android com pacote `com.appeo.mobile`, baixar `google-services.json` e cadastrar no GitHub o segredo GOOGLE_SERVICES_JSON_B64 com o conteúdo em base64 (`[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json")) | gh secret set GOOGLE_SERVICES_JSON_B64 --repo mbdomatheus-a11y/app-eo`).
3. Push Android: em expo.dev, projeto `@controlalls-team/eo`, Credentials, Android, enviar a chave de conta de serviço FCM V1 do mesmo projeto Firebase.
4. Primeira versão na Play precisa ser enviada à mão: rodar o workflow `android-play`, baixar o artefato `eo-android-aab-*` e enviar em Play Console, EO, Testes, Teste interno, Criar versão. Aceitar a Assinatura de apps do Google Play.
5. Envio automático das próximas versões: em Play Console, Usuários e permissões, convidar o e-mail da conta de serviço usada no Control ALL com permissão de lançar no app EO; cadastrar o JSON dessa conta no segredo PLAY_SERVICE_ACCOUNT_JSON.
6. Conteúdo do app na Play (obrigatório antes de liberar testers): política de privacidade `https://app-eo.vercel.app/privacidade.html`, segurança dos dados, classificação de conteúdo, público alvo, sem anúncios, ficha da loja (ícone 512, imagem de destaque 1024x500, prints).

## Rotina

Rodar o workflow com `android-play`. versionCode = 1000 + número da execução x 100 + tentativa (mesma regra do iOS). O app.json versionado é restaurado após o prebuild para não mudar o fingerprint das atualizações OTA.
