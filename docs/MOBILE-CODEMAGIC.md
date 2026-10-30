# App EO em celulares e computador Mac

## Alvos preparados

- A aplicação atual continua sendo React/Vite e o portal web segue publicado na Vercel.
- Android e iOS usam Capacitor para empacotar a interface existente. Os projetos nativos estão em `android/` e `ios/`.
- No Mac, a experiência é o portal web da Vercel, acessível pelo navegador. A instalação PWA e um instalador `.dmg` ainda não estão configurados; não há app nativo de macOS nesta etapa.
- Identificador mobile inicial: `com.appeo.mobile`. Nome e ícones finais podem ser ajustados antes da publicação nas lojas.

## Desenvolvimento rápido

Para testar a página no navegador local, use `npm run dev`. Para conectar um dispositivo Android à máquina de desenvolvimento pela mesma rede, inicie `npm run dev:lan` e use o fluxo de live reload do Capacitor. O servidor de desenvolvimento não deve ser exposto à internet.

Depois de alterar dependências nativas, permissões, ícones, esquema de URL ou configuração do Capacitor, rode `npm run mobile:sync` e gere novos binários.

## Builds no Codemagic

O `codemagic.yaml` contém quatro fluxos manuais: APK Android de depuração, app iOS para simulador e candidatos de release assinados para Android e iOS. Os fluxos de release só geram arquivos para baixar; não possuem etapa de envio à Google Play ou App Store.

### Configuração para gerar candidatos de release

- Android: adicionar no Codemagic uma chave de upload em Code signing identities usando a referência `app_eo_android_upload`. A chave deve ser guardada também em backup próprio, fora do Git. O fluxo gera um `.aab` assinado.
- iOS: adicionar um certificado de distribuição e perfil App Store compatíveis com `com.appeo.mobile` em Code signing identities. O fluxo gera um `.ipa` assinado.
- O identificador `com.appeo.mobile` é o que o projeto usa hoje. Confirmar que está disponível e será o definitivo antes de criar os registros de loja, pois trocar o identificador depois exige novo cadastro de app.
- Criar o registro do app no App Store Connect e confirmar a equipe Apple antes de distribuir. A conta Play selecionada precisa ter o app registrado com o mesmo identificador.
- Nenhuma chave, certificado, senha ou credencial de loja deve ser adicionada ao repositório. As etapas de envio continuam manuais e exigem decisão explícita após revisar os artefatos.

Ainda não há assinatura nem publicação nas lojas configuradas. Um APK de depuração não é um artefato de produção. Não iniciar os fluxos de release antes de configurar as assinaturas no Codemagic.

O Codemagic está conectado ao repositório GitHub e reconheceu os fluxos da branch `codemagic/mobile-foundation`. Nenhum build foi iniciado automaticamente. As máquinas de build e cotas disponíveis dependem do plano configurado na conta.

## Atualizações sem recompilar

- Desenvolvimento local: live reload entrega alterações da interface sem reconstruir o pacote a cada edição, enquanto o dispositivo está conectado ao servidor local.
- Portal no Mac: publicação web pela Vercel atualiza a próxima abertura/recarga do site, sem pacote de desktop.
- Aplicativos Android/iOS instalados: um build inicial precisa incluir o runtime de atualização. Depois, mudanças compatíveis em JavaScript, CSS e imagens podem ser distribuídas por OTA. Mudanças de código nativo, plugins, permissões, SDK ou configuração exigem novo build e, conforme o caso, nova publicação na loja.
- A opção pesquisada para Capacitor é Codemagic Patch. A documentação atual pede servidor Patch próprio e o SDK Capacitor ainda está em 0.x. Não foi integrado ao app enquanto o servidor de atualização não estiver definido e protegido. O endpoint de atualizações deve usar HTTPS, chaves diferentes por plataforma/ambiente e assinatura dos pacotes.

## Próximos passos

1. Configurar as assinaturas Android e Apple no Codemagic sem colocar segredos no Git.
2. Confirmar o identificador `com.appeo.mobile` antes de registrar os apps nas lojas.
3. Gerar e revisar os candidatos de release manualmente; decidir depois se serão enviados à faixa de teste interno.
4. Decidir onde hospedar o servidor Codemagic Patch. Se não for desejável manter outro serviço, manter o portal/PWA e aceitar builds nativos para mudanças que precisem chegar às lojas.
5. Caso seja necessário um instalador nativo `.dmg`, planejar alvo macOS próprio e respectiva assinatura; OTA de Capacitor não atualiza um app macOS independente.
