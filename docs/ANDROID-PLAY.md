# Publicar o EO no Android (Google Play) pelo GitHub Actions

## Escala no Android, 18/11/2026

Firebase, pendente em 18/11/2026: sem `GOOGLE_SERVICES_JSON_B64` o push Android falha com o aviso "precisa da configuração Firebase". Passos no item 2 e 3 da seção "Uma vez só". Guardar o `google-services.json` fora do repositório, que é público (ex.: `C:\Users\Usúario\Documents\EO-chaves`). No Play Console, ao criar versão nova, remover da versão o pacote anterior se aparecer o erro "APK completamente oculto"; o alerta `android.hardware.screen.portrait` some a partir da compilação com rotação liberada.


A última compilação `android-play` conhecida é a execução #34 (12/11, versionCode 4401), anterior à Escala (commit `8b62981`, 17/11). Uma OTA a partir da `main` não serve: o Runtime calculado pode diferir do binário instalado, como ocorreu no iPhone. A distribuição correta é um AAB novo da `main`.

Rotina preparada: `powershell -ExecutionPolicy Bypass -File scripts\publicar-android-escala-20261118.ps1`. O script faz commit só dos arquivos da entrega, envia a `main` (o portal também é publicado pelo Vercel), dispara `android-play`, acompanha a execução, baixa o AAB em `output\android\run-<id>` e informa se o envio automático ao teste interno ocorreu. Os testadores estão no teste fechado Alpha: com envio automático, promover a versão do teste interno para Alpha; sem ele, criar a versão direto em Alpha com o AAB baixado. A confirmação final é abrir a Escala no aparelho, alterar uma semana, voltar à lista e reabrir.

## Link de teste confirmado em 16/11/2026

O EO tem uma versão disponível na faixa de teste fechado Alpha. O Play Console mostra o convite web `https://play.google.com/apps/testing/com.appeo.mobile` e o endereço do aplicativo `https://play.google.com/store/apps/details?id=com.appeo.mobile`. O convite sozinho não libera a instalação. O administrador precisa incluir o e-mail da conta Google usada no Android em uma lista de testadores própria do EO na faixa Alpha, em `https://play.google.com/console/u/0/developers/8960154356839047529/app/4972840947538514394/tracks/4700203061802526697?tab=testers`. A lista atualmente selecionada também é usada pelo Control ALL; antes de adicionar novos testadores, criar uma lista exclusiva do EO para não ampliar acesso ao outro app. Depois a pessoa abre o convite com essa mesma conta, aceita participar e instala pelo Google Play. O teste aberto ainda está indisponível porque o Play Console exige acesso à produção, incluindo os critérios de teste fechado.

O site EO recebe nome, chapa e e-mail da conta Google para o admin organizar essa inclusão. O pedido não adiciona automaticamente a pessoa à lista da Play.

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
