# App EO em celulares e computador Mac

## Alvos preparados

- A aplicação atual continua sendo React/Vite e o portal web segue publicado na Vercel.
- Android e iOS usam Capacitor para empacotar a interface existente. Os projetos nativos estão em `android/` e `ios/`.
- No Mac, a experiência é o portal web da Vercel, acessível pelo navegador. A instalação PWA e um instalador `.dmg` ainda não estão configurados; não há app nativo de macOS nesta etapa.
- Nome da aplicação confirmado: `Excelência Operacional (EO)`. Identificador definitivo confirmado para registro nas lojas: `com.appeo.mobile`. Ícones finais continuam pendentes.

## Desenvolvimento rápido

Para testar a página no navegador local, use `npm run dev`. Para conectar um dispositivo Android à máquina de desenvolvimento pela mesma rede, inicie `npm run dev:lan` e use o fluxo de live reload do Capacitor. O servidor de desenvolvimento não deve ser exposto à internet.

Depois de alterar dependências nativas, permissões, ícones, esquema de URL ou configuração do Capacitor, rode `npm run mobile:sync` e gere novos binários.

## Builds no Codemagic

O `codemagic.yaml` contém seis fluxos manuais: APK Android de depuração, app iOS para simulador, candidatos assinados para baixar e workflows separados que enviam ao teste interno do Google Play ou ao App Store Connect para teste interno via TestFlight. Nenhum workflow publica para todos os usuários.

Os workflows usam Node.js `22.12.0`, requisito mínimo do Vite 8 na linha 22.x. Os workflows Android fixam Java `21`, exigido pelo compilador Android atual. A primeira tentativa no Codemagic usou `22.11.0` e falhou antes do build, pois o binding nativo opcional do Rolldown para macOS não foi instalado. A versão foi corrigida em todos os workflows; `npm run build` foi confirmado localmente após a alteração.

O arquivo estático do Capacitor é `capacitor.config.json`. O Codemagic encontrou incompatibilidade entre o carregador de `capacitor.config.ts` e TypeScript 7. A configuração não tem lógica dinâmica, então foi convertida para JSON, formato oficialmente suportado pelo Capacitor. `npx cap sync android` confirmou a leitura da nova configuração localmente.

### Configuração para gerar candidatos de release

- Android: adicionar no Codemagic uma chave de upload em Code signing identities usando a referência `app_eo_android_upload`. A chave deve ser guardada também em backup próprio, fora do Git. O fluxo gera um `.aab` assinado.
- iOS: adicionar um certificado de distribuição e perfil App Store compatíveis com `com.appeo.mobile` em Code signing identities. O fluxo gera um `.ipa` assinado.
- Google Play interno: adicionar a variável secreta `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS` no grupo `app_eo_google_play` do Codemagic e conceder à service account acesso ao app EO no Play Console.
- TestFlight interno: adicionar `APP_STORE_CONNECT_PRIVATE_KEY`, `APP_STORE_CONNECT_KEY_IDENTIFIER` e `APP_STORE_CONNECT_ISSUER_ID` como variáveis secretas no grupo `app_eo_app_store`. A chave precisa de função App Manager. Para assinatura, configurar o certificado/perfil Apple no Codemagic.
- O identificador `com.appeo.mobile` foi confirmado por Matheus para uso definitivo e já foi registrado na Apple Developer e vinculado ao registro do app no App Store Connect.
- A conta Google Play selecionada precisa concluir o registro do app com o mesmo identificador antes de receber o AAB.
- Nenhuma chave, certificado, senha ou credencial de loja deve ser adicionada ao repositório. As etapas de envio continuam manuais e exigem decisão explícita após revisar os artefatos.

Ainda não há assinatura nem publicação nas lojas configuradas. Um APK de depuração não é um artefato de produção. Os workflows de teste interno só devem ser iniciados depois de criar os registros nas lojas e configurar as assinaturas e credenciais no Codemagic.

O workflow Play envia somente para a faixa `internal`. O workflow Apple envia o IPA para App Store Connect e usa exportação exclusiva para teste interno. A distribuição a testadores é concluída nas respectivas consoles depois que a loja processar o pacote.

### Situação anterior ao cadastro das lojas (30/10/2026)

- App Store Connect está conectado. Matheus aceitou o contrato atualizado.
- Google Play Console está conectado à conta `ControlAll`.
- Codemagic não tem variáveis de ambiente cadastradas para o app. Em Code signing identities, a seção de certificados iOS informa que nenhum certificado foi compartilhado. Nenhum build de release foi iniciado.
- Nome de loja confirmado por Matheus: `Excelência Operacional (EO)`. O identificador `com.appeo.mobile` foi posteriormente confirmado e registrado.
- O pedido de hoje se destina a faixas internas de teste. Não usar produção, envio para revisão pública ou rollout.

O Codemagic está conectado ao repositório GitHub e reconheceu os fluxos da branch `codemagic/mobile-foundation`. Nenhum build foi iniciado automaticamente. As máquinas de build e cotas disponíveis dependem do plano configurado na conta.

## Atualizações sem recompilar

- Desenvolvimento local: live reload entrega alterações da interface sem reconstruir o pacote a cada edição, enquanto o dispositivo está conectado ao servidor local.
- Portal no Mac: publicação web pela Vercel atualiza a próxima abertura/recarga do site, sem pacote de desktop.
- Aplicativos Android/iOS instalados: um build inicial precisa incluir o runtime de atualização. Depois, mudanças compatíveis em JavaScript, CSS e imagens podem ser distribuídas por OTA. Mudanças de código nativo, plugins, permissões, SDK ou configuração exigem novo build e, conforme o caso, nova publicação na loja.
- A opção pesquisada para Capacitor é Codemagic Patch. A documentação atual pede servidor Patch próprio e o SDK Capacitor ainda está em 0.x. Não foi integrado ao app enquanto o servidor de atualização não estiver definido e protegido. O endpoint de atualizações deve usar HTTPS, chaves diferentes por plataforma/ambiente e assinatura dos pacotes.

## Próximos passos

1. Contrato Apple confirmado como aceito na conta de desenvolvedor; após atualizar o App Store Connect, o aviso não aparece mais.
2. Apple Developer App ID registrado: `com.appeo.mobile`. Registro iOS criado no App Store Connect com nome `Excelência Operacional (EO)`, idioma Português (Brasil), SKU `EO-IOS-001` e acesso total. O status observado é `iOS 1.0 Preparar para envio`, sem build ou upload.
3. Google Play: Matheus confirmou que criou o app. O painel abre em `app/4972840947538514394/app-dashboard`; o registro está disponível para iniciar o teste interno. Ainda não há AAB enviado.
4. Configurar no Codemagic as assinaturas Android/Apple e credenciais secretas, sem colocar segredos no Git. Nenhuma chave ou certificado foi compartilhado ainda.
5. Depois de configurar assinaturas e credenciais, gerar os pacotes e enviar apenas às faixas internas Play e TestFlight. Nenhum release público, envio para revisão ou rollout foi iniciado.
6. Decidir onde hospedar o servidor Codemagic Patch. Se não for desejável manter outro serviço, manter o portal/PWA e aceitar builds nativos para mudanças que precisem chegar às lojas.
7. Caso seja necessário um instalador nativo `.dmg`, planejar alvo macOS próprio e respectiva assinatura; OTA de Capacitor não atualiza um app macOS independente.

### Builds Android de depuração no Codemagic (30/10/2026)

- Build `6ae50f10efa74786046f45c5` foi iniciado no workflow `android-debug`, branch `codemagic/mobile-foundation`, mas falhou na etapa `Build web app` antes de sincronizar ou empacotar Android.
- Diagnóstico: Codemagic usava Node `22.11.0`, abaixo do mínimo `22.12+` exigido pelo Vite 8. Isso impediu carregar o binding nativo do Rolldown para macOS.
- Commit `d71e129` atualizou todos os workflows para Node `22.12.0`. A segunda tentativa, build `6ae50fd2efa74786046f45fe`, passou pelo build web mas falhou em `npx cap sync android`: TypeScript 7 removeu o compilador JavaScript usado pelo carregador antigo do arquivo de configuração `.ts`.
- Commit `b8b50aa` migrou para `capacitor.config.json`, mantendo os valores `appId`, `appName` e `webDir`. `npm run build` e `npx cap sync android` passaram localmente. A terceira tentativa, build `6ae51063efa74786046f462b`, passou pelo build web e sincronização Android, mas falhou porque `android/gradlew` estava registrado sem permissão de execução (`100644`).
- Commit `c4ca73c` marcou `android/gradlew` como executável (`100755`). A quarta tentativa, build `6ae510efefa74786046f465b`, passou pelo build web e sync, executou o Gradle, mas falhou em `android/app/build.gradle` linha 10 com `Value is null` ao definir `versionCode`.
- Commit `890e336` passou a validar `PROJECT_BUILD_NUMBER` antes de converter para `versionCode`, usando 1 como fallback. A quinta tentativa, build `6ae51189efa74786046f4685`, passou pelo Gradle até avaliar a assinatura e falhou porque `CI` estava definido, mas a keystore não existia; o workflow debug não necessita dela.
- Commit `8bcabb9` passou a configurar assinatura release somente quando `CM_KEYSTORE_PATH` estiver disponível. A sexta tentativa, build `6ae51256efa74786046f46c5`, passou pela configuração e chegou à compilação Java, mas falhou com `invalid source release: 21` porque a máquina usou o Java 17 padrão.
- Commit `727ea45` fixou Java 21 nos três workflows Android. A sétima tentativa, build `6ae51306efa74786046f46f7`, concluiu com sucesso no workflow `App EO Android (debug)`, branch `codemagic/mobile-foundation`.
- Artefato gerado: `app-debug.apk`, 4,67 MB. Link direto temporário do Codemagic: https://api.codemagic.io/artifacts/aaa5166d-3216-45e9-8a28-85f32b380f32/7c50ed7d-af78-4142-8d39-a5e8f19b71a1/app-debug.apk. É um APK de depuração para instalação manual em Android, não é o AAB assinado para Google Play.
- O registro do app já foi criado por Matheus no Google Play Console. Para instalar pela faixa de teste interno, ainda faltam keystore Android e credenciais da service account configuradas como segredos no Codemagic, então gerar o AAB assinado e enviá-lo à faixa `internal`.
- O build iOS/TestFlight também ainda depende de certificado e perfil Apple, além das credenciais App Store Connect no Codemagic. Nenhum pacote foi enviado às lojas.
- As tentativas documentam uma sequência útil para diagnosticar builds Capacitor no Codemagic: compatibilidade de Node/Vite e config Capacitor, permissão de execução do Gradle wrapper, versionCode, assinatura condicional e seleção explícita do Java. Não guardar segredos no repositório.
