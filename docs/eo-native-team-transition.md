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
