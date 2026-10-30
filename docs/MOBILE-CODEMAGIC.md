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

O `codemagic.yaml` contém dois fluxos manuais: APK Android de depuração e app iOS para simulador. Ainda não há assinatura nem publicação na Google Play ou App Store. Um APK de depuração não é um artefato de produção. Para distribuir no Android, será necessário configurar uma chave de assinatura. Para instalar em iPhone e enviar à App Store, será necessário configurar assinatura Apple, perfil e a conta correspondente.

O Codemagic ainda precisa conectar ao repositório GitHub para ler esses fluxos. Nenhum build foi iniciado automaticamente. As máquinas de build e cotas disponíveis dependem do plano configurado na conta.

## Atualizações sem recompilar

- Desenvolvimento local: live reload entrega alterações da interface sem reconstruir o pacote a cada edição, enquanto o dispositivo está conectado ao servidor local.
- Portal no Mac: publicação web pela Vercel atualiza a próxima abertura/recarga do site, sem pacote de desktop.
- Aplicativos Android/iOS instalados: um build inicial precisa incluir o runtime de atualização. Depois, mudanças compatíveis em JavaScript, CSS e imagens podem ser distribuídas por OTA. Mudanças de código nativo, plugins, permissões, SDK ou configuração exigem novo build e, conforme o caso, nova publicação na loja.
- A opção pesquisada para Capacitor é Codemagic Patch. A documentação atual pede servidor Patch próprio e o SDK Capacitor ainda está em 0.x. Não foi integrado ao app enquanto o servidor de atualização não estiver definido e protegido. O endpoint de atualizações deve usar HTTPS, chaves diferentes por plataforma/ambiente e assinatura dos pacotes.

## Próximos passos

1. Conectar `mbdomatheus-a11y/app-eo` no Codemagic após enviar a estrutura nativa e o `codemagic.yaml` ao GitHub.
2. Rodar os builds manuais de depuração e corrigir o que aparecer nos logs.
3. Configurar assinatura de distribuição somente quando houver contas e credenciais próprias.
4. Decidir onde hospedar o servidor Codemagic Patch. Se não for desejável manter outro serviço, manter o portal/PWA e aceitar builds nativos para mudanças que precisem chegar às lojas.
5. Caso seja necessário um instalador nativo `.dmg`, planejar alvo macOS próprio e respectiva assinatura; OTA de Capacitor não atualiza um app macOS independente.
