# EO nativo: vínculo com a equipe e entrega agrupada

Atualizado em 02/11/2026.

O app React Native fica em `mobile/`. O portal Vercel continua em `src/`. O app não carrega o portal em WebView.

Projeto escolhido pelo usuário: `@controlalls-team/eo`, ID `1b9d38c0-be49-44cf-9783-a179dd812713`. A pasta base do GitHub na Expo foi corrigida de `/` para `/mobile`.

## Implementado nesta entrega

- Home de tarefas, acessos rápidos e comunicados recentes.
- Tab bar respeitando a área inferior segura do aparelho.
- Tela nativa `/device`: câmera com prévia descartável, calendário do sistema, discador, permissão e testes de notificações, ajustes do aparelho e busca de atualização.
- Toque na notificação abre Avisos; renovação do token busca novamente ExpoPushToken em vez de gravar o token APNs/FCM bruto.
- URL OTA vinculada ao projeto da equipe, runtime por fingerprint e canal production para compilação pelo GitHub.
- Workflow OTA preserva variáveis públicas de conexão com Supabase.

## Pendências verificadas na conta

A página Credentials do novo projeto não possui identificadores iOS/Android nem credenciais. Configurar APNs no projeto da equipe e FCM v1 Android, com os arquivos correspondentes. Não copiar segredos para o GitHub público nem para esta documentação.

O projeto pessoal anterior era `@controlall/excelencia-operacional-eo`, ID `31e7b5e5-f006-4617-8774-8718d875a9ea`. Instalações antigas não mudam de projeto/URL OTA remotamente. É necessária uma primeira compilação compatível com o novo vínculo e permissões. Depois, agrupar alterações JavaScript/assets compatíveis em EAS Update; mudanças nativas exigem nova compilação.

Verificação realizada: TypeScript mobile e git diff --check passaram. Recursos físicos ainda precisam ser validados em iPhone e Android. Nenhum push real, publicação OTA ou build foi executado nesta entrega.


## Entrega de 03/11/2026

- APNs RSGS8585QG associada pelo usuário ao projeto da equipe. FCM Android continua pendente.
- Separação de Alertas e Checklists em rotas próprias; Apps passa a ser um menu de ferramentas com grupos. Removida a sequência de formulários de câmera/agenda/telefone da tela de rotinas; permanecem na tela Meu aparelho.
- Login permite lembrar chapa no SecureStore e oferece metadados de preenchimento nativo username/password. A sessão já persiste criptografada; não se armazena uma segunda cópia da senha. A oferta de salvar senhas depende do gerenciador do sistema.
- Perfil permite ativar Face ID/Touch ID/biometria para desbloquear a sessão salva. SecureStore usa requireAuthentication para o segredo local, com chave por usuário e WHEN_UNLOCKED_THIS_DEVICE_ONLY. Cancelar mantém o bloqueio. Retorno do segundo plano bloqueia novamente; entrar com senha encerra a sessão antes de remover a preferência biométrica. Mudança de biometria exige novo login se a chave for invalidada. É uma proteção local adicional, sem substituir permissões Supabase.
- Plugin SecureStore recebe descrição Face ID em português, exigindo nova compilação para disponibilizar a integração.
- O build GitHub 18 falhou no upload por Redundant Binary Upload: número 13 repetido. Workflow passa a calcular número único usando número da execução e tentativa (1000 + execução * 100 + tentativa) antes do prebuild.
- TypeScript e exportação iOS/Hermes passaram localmente. Face ID, AutoFill, câmera e notificações precisam de validação física. Não afirmar disponibilidade no TestFlight até confirmar o envio Apple.


## Redesenho principal e atualização iOS publicada (03/11/2026)

- Referência visual examinada em Desktop/controlall/src/app/mais/index.tsx: menus organizados por área, cartões, ícones de cores por grupo e preferência por navegação de app. O projeto Control ALL foi somente lido.
- Nova camada mobile/src/design.tsx: títulos grandes, menus agrupados com separadores, ícones com fundos de cores, atalhos em cartões e painel de resumo.
- Home reescrita com painel de pendências reais, progresso dos itens carregados, atalhos e lista de avisos recentes. Avisos recebeu seletor segmentado; Explorar, Gestão e Perfil foram reorganizados. Minhas lojas ganhou tela própria com busca.
- Barra inferior usa NativeTabs do Expo Router, com SF Symbols no iOS e Material Symbols no Android. Nenhuma dependência nativa foi adicionada; foram usados os módulos presentes no build 19.
- TypeScript, diff check e exportações iOS/Android passaram. Validação visual no aparelho ainda depende do teste do usuário; não afirmar equivalência completa ao GM Finanças ou teste físico concluído.
- GitHub run 41571095755 confirmou sucesso no envio iOS; número Apple esperado 2901. O estado de processamento/atribuição ao grupo no App Store Connect ainda não foi consultado.
- OTA iOS publicada no canal production: grupo 9c7c4da7-940c-40e6-bf8e-67cf85161b39, runtime 0cc877b16863a197c7138ba44cf1a5e782f5436d, código 301e356. Painel: https://expo.dev/accounts/controlalls-team/projects/eo/updates/9c7c4da7-940c-40e6-bf8e-67cf85161b39.
- Primeira tentativa com platform all tentou exportar web e falhou por react-native-web ausente. Não instalar dependência web só para OTA mobile. Publicação repetida explicitamente para ios passou. Workflow agora escolhe ios/android para evitar essa falha em futuras atualizações.
- A configuração pública Supabase foi fornecida por variáveis de ambiente herdadas da configuração local do portal, sem transmitir a chave OIDC. EAS production ainda não tem variáveis próprias cadastradas; persistir configuração para automação futura.
- Para instalar: atualizar EO no TestFlight para a versão com vínculo controlalls-team/eo, abrir com internet e reabrir para aplicar o OTA, ou Meu aparelho > Buscar atualização. Instalações ligadas ao projeto Expo antigo não recebem a URL nova por OTA.
