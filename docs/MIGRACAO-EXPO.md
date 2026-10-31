# Migração do app EO para Expo

## Decisão

O portal web continua na raiz do repositório. O app iOS e Android passa de Capacitor/WebView para um cliente Expo/React Native em `mobile/`, com navegação e componentes nativos. O projeto atual do portal e os recursos de backend Supabase são preservados.

Reaproveitar no EO princípios de hierarquia visual, navegação inferior e acabamento do Control ALL. Não compartilhar código de negócio, banco, credenciais, identificadores ou publicação do Control ALL.

Os identificadores de loja continuam `com.appeo.mobile`, com build iOS começando em 12 após o TestFlight 11. Confirmar o vínculo de assinatura Android antes do primeiro AAB. Não publicar um pacote Expo sobre os registros existentes até validar assinatura, login e navegação nos aparelhos.

## Fluxos transferidos

- Login por chapa e senha, com sessão persistida em armazenamento seguro do sistema.
- Troca obrigatória de senha temporária.
- Home por perfil e lojas autorizadas.
- Lista, leitura, confirmação de ciência e paginação de comunicados.
- Publicação de comunicado por loja e prioridade.
- Catálogo de módulos, perfil, privacidade e suporte.
- Administração de lojas, pessoas, perfis, acessos e auditoria.
- Senha temporária de administrador master, com cópia pelo clipboard.

As permissões continuam verificadas pelo Supabase e suas funções/RPCs, não apenas pela interface do app.

## Desenvolvimento e distribuição

1. Na primeira configuração, instalar dependências dentro de `mobile/`, criar `mobile/.env` a partir de `.env.example` e informar somente a chave pública do Supabase.
2. Usar Expo Go para desenvolver telas localmente, com recarga rápida, sem consumir build EAS. Recursos nativos precisam estar incluídos no Expo Go usado.
3. Vincular `mobile/` a um projeto Expo próprio do EO, sem reutilizar o project ID do Control ALL. `eas update:configure` preencherá URL e project ID necessários para atualizações remotas.
4. Gerar um primeiro binário Expo para iOS e Android somente quando a migração e a configuração de assinatura estiverem prontas. O app Expo substitui o binário Capacitor e passa a incluir `expo-updates`.
5. Depois, alterações somente de JavaScript, telas e assets compatíveis podem ser enviadas por EAS Update, sem novo build. Dependências nativas, permissões, plugins e configuração do sistema exigem novo binário e versão de runtime compatível.

O identificador de runtime usa fingerprint. Os canais previstos são `preview` e `production`. A compilação do binário usa os runners do GitHub e não consome a quota de EAS Build. A publicação OTA continua usando EAS Update e precisa de uma conta/projeto Expo configurado.

### Compilação no GitHub Actions

- O workflow `.github/workflows/eo-mobile-build.yml` usa ferramentas nativas diretamente no runner padrão do GitHub. Android: Expo prebuild e Gradle geram um APK de prévia. iOS: Expo prebuild e Xcode geram um app para simulador, sem assinatura.
- A compilação não usa EAS Build, Codemagic ou `EXPO_TOKEN`. Acesse GitHub > Actions > **EO | Compilar app no GitHub** > **Run workflow** e escolha Android ou iOS. O artefato fica disponível por um dia.
- O Android gera APK de depuração assinado com a chave debug, instalável diretamente para avaliação, mas não aceito na Play. O iOS gera um app de simulador, que não instala em iPhone nem é um IPA. Para TestFlight e faixa interna do Play, ainda faltam certificados/perfis e credenciais de distribuição guardados nos segredos do GitHub. O workflow injeta URL e chave publicável do Supabase por variáveis de repositório.
- O workflow de OTA é separado e continua usando EAS Update e `EXPO_TOKEN`. Isso não participa da compilação, mas depende do projeto Expo e de um serviço de atualização. O projeto EO ainda não foi vinculado para OTA.
- O workflow de prévia compila Android e iOS Simulator automaticamente quando arquivos em `mobile/` mudam na `main`; também pode ser iniciado manualmente. A concorrência cancela uma prévia anterior da mesma plataforma para evitar trabalho duplicado. A OTA segue manual e depende do EAS Update.
## Pendências antes do primeiro binário

- O lockfile foi gerado e o `eas-cli` foi adicionado como dependência travada em `mobile/`; a instalação foi executada, sem build ou teste.
- Associar o projeto Expo do EO à conta correta e configurar EAS Update. Ainda não há project ID, URL de update ou credenciais EAS nesse repositório.
- Configurar `EXPO_TOKEN` nos ambientes GitHub `eo-preview` e `eo-production`, configurar variáveis públicas `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nos ambientes Expo EAS correspondentes e aprovar produção manualmente.
- Confirmar a assinatura Android existente no Play Console. Não substituir chave de upload sem verificar o registro.
- Confirmar certificado/perfil Apple do app EO e testar o upload no mesmo registro App Store Connect.
- A função `admin-identity` foi atualizada no Supabase do EO em 31/10/2026. Ela aceita chamadas nativas sem `Origin`; chamadas web continuam restritas à origem exata em `APP_URL`. A verificação JWT permanece habilitada e as verificações de perfil/permissões continuam ativas.
- Tratar o fluxo de convite por e-mail para retornar ao app Expo ou manter aceite pelo portal web.
- Validar visual e fluxos nos aparelhos antes do build inicial.

## Estado nesta etapa

Estrutura Expo e telas React Native transferidas para `mobile/`. A Edge Function `admin-identity` foi publicada no projeto Supabase `mfsnzrrqlyixqwsrcqyo` e confirmada como ativa, versão 3, com `verify_jwt=true`. O lockfile mobile foi gerado e o EAS CLI foi fixado como dependência. Os workflows estão no branch `codemagic/mobile-foundation`, commit `8a669f4`, mas não foram executados. Nenhum build, teste ou update foi publicado; o projeto EAS ainda não foi vinculado. A pasta `android/` e `ios/` do Capacitor e os workflows Codemagic permanecem como referência até o primeiro ciclo GitHub/Expo ser validado.

## Preparação GitHub Actions e revisão para repositório público (31/10/2026)

- Os workflows manuais `.github/workflows/eo-mobile-build.yml` (build local por plataforma, artefato por 1 dia) e `.github/workflows/eo-mobile-update.yml` (OTA via EAS Update) foram enviados ao branch `codemagic/mobile-foundation`, commit `8a669f4`. Nenhum workflow foi executado.
- O repositório segue privado enquanto a revisão de exposição está pendente. Nenhuma chave privada, token Supabase ou chave de serviço foi encontrada nos commits alcançáveis do histórico.
- O histórico contém o e-mail de contato, a chapa master e UUID do perfil administrativo; estes dados serão públicos se o repositório existente se tornar público. O usuário foi informado. Avaliar limpar o histórico, criar uma cópia pública sem histórico sensível ou confirmar que aceita expor esses identificadores antes de alterar a visibilidade.
- A conta GitHub do EO e o pipeline do Control ALL permanecem separados.


## Atualizacao das telas e compilacao pelo GitHub (31/10/2026)

Matheus confirmou que quer usar o GitHub Actions como ambiente de compilacao, sem usar os servidores de build da Expo ou do Codemagic.

- Refeito o fluxo de compilacao manual em .github/workflows/eo-mobile-build.yml: o runner executa npm ci, expo prebuild e as ferramentas nativas Gradle/Xcode diretamente. A compilacao nao usa eas build nem EXPO_TOKEN.
- Android gera um APK de pre-visualizacao. iOS gera um app para simulador, sem assinatura. O iOS Simulator nao instala no iPhone. Enviar para TestFlight ou Play requer binario de producao assinado, certificados/perfis Apple e chave de upload Android configurados com segredos do ambiente GitHub, sem inserir credenciais no codigo.
- O workflow de atualizacao OTA continua separado e usa EAS Update/EXPO_TOKEN, pois isso distribui JavaScript sem reconstruir o binario. O projeto Expo do EO ainda precisa ser vinculado e configurado para OTA. Portanto, somente a compilacao fica no GitHub nesta etapa.
- Para executar: GitHub > repositorio app-eo > Actions > EO | Compilar app no GitHub > Run workflow > escolher Android ou iOS. Baixar o artefato na execucao, que expira em 1 dia.
- De acordo com a documentacao vigente consultada em 31/10/2026, runners hospedados padrao, incluindo macOS, sao gratuitos e ilimitados para repositorios publicos. O GitHub Free inclui 500 MB de armazenamento compartilhado por mes para artefatos e Packages. O artefato foi limitado a 1 dia; armazenamento acima da franquia pode gerar cobranca. Runners maiores nao sao gratuitos.
- Essa gratuidade cobre a compilacao nos runners padrao, nao a assinatura/publicacao nas lojas, nem quotas de terceiros. O codigo-fonte do EO permanece publico.
- Telas atualizadas em mobile/App.tsx e mobile/src/ui.tsx: navegação inferior com estado ativo e contador, botao de retorno visivel em Privacidade, home com resumo sem inventar indicadores, texto contextual por perfil, filtros Todos/Pendentes/Lidos e catalogo que diferencia recurso disponivel de modulo planejado sem abrir alertas.
- Nenhum build foi iniciado nesta entrega. O APK de preview usa assinatura debug e pode ser instalado manualmente, mas nao enviado ao Google Play. O app iOS para simulador tambem nao e um IPA de TestFlight.
- Referencias oficiais: GitHub [runners padrao e precos](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job), [faturamento e armazenamento](https://docs.github.com/en/billing/concepts/product-billing/github-actions); Expo [compilar projetos Expo com Gradle/Xcode](https://docs.expo.dev/guides/local-app-development/), [prebuild e release](https://docs.expo.dev/guides/local-app-production/).

## Navegação e identidade nativa (31/10/2026)

- A tela de teste ainda parecia uma página web para Matheus, embora os componentes fossem React Native. A causa visual era a navegação própria do MVP, baseada numa pilha manual e em caracteres usados como ícones.
- O app agora usa Expo Router, no mesmo padrão estrutural do app Expo do Control ALL: abas para Início, Avisos, Apps, Gestão e Perfil; pilha nativa para comunicados, administração e privacidade; retorno e transições do sistema.
- A paleta continua exclusiva do EO: grafite `#4A4E58`, amarelo `#FBF2A3`, areia `#DDDAD5` e branco `#FEFEFE`. Ícones usam Expo Symbols com nomes nativos e equivalentes Android. Início e catálogo foram ajustados para hierarquia e toque em tela pequena.
- Login, primeiro acesso, acesso não liberado, detalhes, comunicados, publicação, perfil e navegação administrativa foram conectados às rotas. A gestão continua visível somente para administrador; rotas administrativas também validam perfil no cliente, além das permissões já aplicadas no Supabase.
- Verificações locais: `npx tsc --noEmit` e `npx expo config --type public` passaram. `npx expo export --platform android` no Windows falhou na criação de workers do Metro (`Data cannot be cloned, out of memory` / `ERR_WORKER_INIT_FAILED`), então a validação final de bundling deve ser a compilação no runner Ubuntu do GitHub.
- O `main` do pacote aponta para `expo-router/entry`; plugin e dependências do SDK 57 foram adicionados. A assinatura e distribuição TestFlight não mudam: o GitHub ainda gera somente iOS Simulator até configurar certificado, perfil e credenciais Apple no workflow.
