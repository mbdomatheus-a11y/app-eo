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

O identificador de runtime usa fingerprint. Os canais previstos são `preview` e `production`. As quotas EAS são da conta Expo e não reiniciam por criar um projeto separado.

### Pipeline proposto no GitHub Actions

- `.github/workflows/eo-mobile-build.yml` cria manualmente um build local no runner GitHub, com macOS para iOS e Ubuntu para Android. O pacote fica como artefato por 1 dia; em repositório público, qualquer leitor do projeto pode baixá-lo.
- `.github/workflows/eo-mobile-update.yml` publica manualmente uma OTA em `preview` ou `production` via EAS Update. A OTA continua sendo servida pela Expo; o GitHub executa o comando, não hospeda os pacotes de atualização.
- Os dois workflows usam ambientes `eo-preview` e `eo-production`, segredo `EXPO_TOKEN`, permissões somente de leitura do repositório e não rodam em pull requests. Configurar aprovação manual no ambiente de produção antes de cadastrar os segredos.
- Não usar no GitHub um token pessoal Expo compartilhado com o Control ALL. Tokens pessoais podem alcançar outros projetos/organizações da conta; preferir um usuário de automação com permissão limitada ao projeto EO ou uma conta Expo separada.
- Definir as variáveis `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nos ambientes Expo `preview` e `production`. São valores públicos do cliente e devem continuar sujeitos às políticas RLS do Supabase.
- Os builds locais não consomem minutos de build do Codemagic nem build em nuvem do EAS; consomem minutos do runner GitHub. O workflow de atualização OTA usa runner Linux e continua sujeito às cotas de EAS Update.
- O workflow de build ainda não envia para App Store Connect ou Google Play. Primeiro precisa confirmar assinatura iOS/Android; a publicação automática pode ser adicionada depois de validar credenciais e o primeiro pacote.

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

Estrutura Expo e telas React Native transferidas para `mobile/`. A Edge Function `admin-identity` foi publicada no projeto Supabase `mfsnzrrqlyixqwsrcqyo` e confirmada como ativa, versão 3, com `verify_jwt=true`. O lockfile mobile foi gerado e o EAS CLI foi fixado como dependência. Nenhum build, teste ou update foi executado; o projeto EAS ainda não foi vinculado e as ações do GitHub ainda não foram publicadas. A pasta `android/` e `ios/` do Capacitor e os workflows Codemagic permanecem como referência até o primeiro ciclo GitHub/Expo ser validado.

## Preparação GitHub Actions e revisão para repositório público (31/10/2026)

- Criados localmente os workflows manuais `.github/workflows/eo-mobile-build.yml` (build local por plataforma, artefato por 1 dia) e `.github/workflows/eo-mobile-update.yml` (OTA via EAS Update). Nenhum workflow foi executado.
- O repositório segue privado enquanto a revisão de exposição está pendente. Nenhuma chave privada, token Supabase ou chave de serviço foi encontrada nos commits alcançáveis do histórico.
- O histórico contém o e-mail de contato, a chapa master e UUID do perfil administrativo; estes dados serão públicos se o repositório existente se tornar público. O usuário foi informado. Avaliar limpar o histórico, criar uma cópia pública sem histórico sensível ou confirmar que aceita expor esses identificadores antes de alterar a visibilidade.
- A conta GitHub do EO e o pipeline do Control ALL permanecem separados.
