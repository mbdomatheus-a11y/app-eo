# Continuidade do App EO para outra IA

Atualizado em 10/11/2026. Documento de passagem, sem senhas, chaves ou tokens.


## Atualização 15/11/2026 (prevalece nos itens alterados)

Cinco correções implementadas: logo ampliado, ícones globais editáveis por admin, ditado com estado/timeout, push isolado do bloqueio global e entrada com menos chamadas. Site9aca1b7 e seis funções publicadas; migrations202611150001/002 aditivas aplicadas após dry run/plpgsql_check.87 testes passaram, um opcional ignorado. Não houve validação física nem envio OTA.

Matheus deve executar no próprio PowerShell scripts/publicar-correcoes-20261115.ps1 para iOS; -Plataforma android usa configuração do AAB4401. Tag local OTA compatível: ota-20261115-cinco-correcoes, baseada em ota-20261112-navegacao. Não publicar uma OTA de main no iPhone antigo nem afirmar atualização instalada. Código atual não alterou app.json, dependências ou configuração nativa. Detalhes e limites em docs/EO-CORRECOES-20261115.md. Toda entrega deve terminar com checklist de cada pedido, indicando feito/não feito e pendências de publicação/teste físico.

## Atualização 12/11/2026 (prevalece sobre o restante)

Memória completa e pendências: Obsidian `01 - PROJETOS/app-operacional-lojas.md`, seção "Passagem atual para outra IA, 12/11/2026". Regras do banco: `docs/BANCO-CONVENCOES.md`. Publicação Android: `docs/ANDROID-PLAY.md`. Imagens da Play: `docs/play/`.

1. Banco: migrations 202611110001 a 0009 aplicadas (nomes comuns sem prefixo, Escala, contas de loja gerNNN, visibilidade de módulos, telefone 60 dias, eo_app_inicio, app_erros, teste de push para todos).
2. Edge Function nova `acesso-loja` (verify_jwt falso; segredos ACESSO_LOJA_PEPPER e ACESSO_LOJA_SENHA_MODELO, nunca no repositório). Rotina pg_cron `acesso-loja-provisionar`.
3. App: barra JavaScript em `mobile/src/app/(tabs)/_layout.tsx` (sem NativeTabs); gestão só no site. OTA pela tag `ota-20261112-navegacao`; mudança no app.json exige build nova.
4. Workflows: `eo-mobile-build.yml` com `android-play` (AAB assinado; segredos ANDROID_UPLOAD_* já cadastrados) e `ios-testflight`; `eo-mobile-update.yml` (EXPO_TOKEN no ambiente eo-production).
5. Comandos rodam no PowerShell do Matheus (push, gh). O shell do Cowork não tem credencial do GitHub e deixa .lock em .git (renomear para stale-*).

## Instrução pronta para a próxima IA

Você continuará o projeto Excelência Operacional (EO), de Matheus. Trabalhe em português brasileiro, sem travessão, com comunicação curta. Execute o trabalho autorizado e peça ajuda apenas quando faltar uma informação ou ação que não consiga realizar. Nunca anuncie publicação, push ou teste físico como concluído com base apenas em código ou testes simulados.

1. Leia o AGENTS.md atual em `C:/Users/Usúario/Documents/ChatGPT/App_EO`. As instruções novas substituem as antigas.
2. Leia primeiro `C:/Users/Usúario/Documents/OBSIDIAN/SEGUNDO CÉREBRO/00 - ÍNDICES/Índice Mestre.md`, apenas para localizar o EO. Abra a nota `01 - PROJETOS/app-operacional-lojas.md`, começando por **Passagem atual para outra IA, 10/11/2026** e pelo protocolo de economia. Não carregue todo o histórico por padrão.
3. Antes de agir, registre pedido, escopo, decisão reutilizada, próximo passo e estado em andamento no checkpoint do EO. Ao terminar, registre resultado verificável e pendências. Não grave credenciais no cofre. Se não puder escrever, use MEMORIA.md temporariamente e informe a falta de sincronização.
4. Leia `docs/BANCO-CONVENCOES.md` antes de qualquer alteração no Supabase. O banco é compartilhado com os projetos derivados. Não reaplique migrations antigas nem use nomes antigos em código novo.
5. Confira `git status`, commits recentes e a tarefa solicitada. Há arquivos não versionados de outras frentes autorizadas: não apagar, sobrescrever ou incluir indiscriminadamente num commit.
6. Preserve o isolamento do EO. Não consultar nem alterar Control ALL ou outros projetos sem pedido explícito. A referência visual não autoriza copiar credenciais ou dados.
7. Continue pela prioridade abaixo. Não refaça decisões nem dispare builds para descobrir um erro que já está documentado.

## Primeira prioridade de continuidade

Matheus informou que a versão chegou a **1.0.0 (4001)**. A declaração confirma o número informado, mas esta conversa ainda não recebeu confirmação de que:

- o ícone EO mudou no iPhone;
- a ativação mostra aparelho registrado no servidor;
- o push remoto chega com app em segundo plano, som e banner;
- a assinatura e o perfil da compilação 4001 foram conferidos diretamente pela IA.

Não tratar a 4001 como a antiga 3101. Validar a versão instalada, os passos do workflow e o resultado no dispositivo antes de iniciar outra compilação. O teste local de som/banner não comprova push remoto. A permissão do iOS não comprova que o token foi registrado no Supabase.

## Estado conhecido e evidência

| Frente | Estado e limite da evidência |
| --- | --- |
| Código | HEAD observado `e24312a`, enviado à main. Confirmar novamente na retomada. |
| Site | Última publicação conferida nesta conversa: `99e4252`, HTTP 200 em app-eo.vercel.app. Commits posteriores focaram iOS e scripts; não assumir que o número exibido no site é o HEAD. |
| Banco EO | Migrations 202611090001..016 aplicadas e verificadas nesta conversa. Antes da padronização comum, foram conferidas 474 unidades e zero perfis ativos sem unidade. |
| Banco compartilhado | AGENTS e docs atuais registram padronização e Escala em migrations 202611110001/002. Essa informação veio da documentação atual, não de nova consulta ao banco nesta entrega de documentação. Não desfazer nem reaplicar sem verificar os marcadores e o catálogo. |
| Funções servidor | admin-identity, organize-product, send-alert-push, send-test-push publicadas nesta conversa antes da padronização de nomes. Atualização delas para tabelas comuns novas é pendência registrada na frente do banco. |
| iOS | Usuário informou 4001. Confirmação física final de ícone/push pendente. |
| Android | Código atualizado; FCM explicitamente adiado por Matheus. Não declarar push Android pronto. |
| Testes | Última suíte JavaScript: 59 aprovados e um opcional ignorado. Mais seis testes Python da configuração de assinatura aprovados. Não são validação Xcode local nem teste no telefone. |
| Recursos físicos | Câmera, agenda, localização, voz e Face ID precisam ser validados no aparelho e na versão efetivamente instalada. |

## Sites usados, finalidade e como operar

| Serviço | Endereço | Procedimento |
| --- | --- | --- |
| Portal EO | https://app-eo.vercel.app/ | Entrar com chapa e senha, testar Aplicativos, Administração e módulos. Versão no topo identifica commit publicado. Não solicitar senha no chat. |
| Repositório | https://github.com/mbdomatheus-a11y/app-eo | Repositório público. Ler alterações, preservar trabalho local, testar, revisar e enviar somente os arquivos da tarefa. Não incluir bases reais ou segredos. |
| Compilação GitHub | https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-build.yml | Run workflow, branch main, plataforma ios-testflight para iPhone; android para APK de teste; ios gera somente simulador. Acompanhar a etapa efetiva e o resultado, não apenas o início. |
| Atualização compatível | https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-update.yml | Selecionar canal/plataforma/mensagem. Confirmar EXPO_TOKEN e variáveis públicas, runtime/fingerprint compatível. A existência de login local não prova que o segredo está cadastrado no GitHub. |
| Expo ativo | https://expo.dev/accounts/controlalls-team/projects/eo | Projeto da equipe, diretório do app `/mobile`, credenciais e atualizações. Expo é usado para OTA e integração de push; compilação escolhida é GitHub, sem consumir EAS Build. |
| Credenciais Expo | https://expo.dev/accounts/controlalls-team/projects/eo/credentials | Reutilizar a chave APNs já autorizada. Não gerar/revogar chaves sem necessidade nem alterar outros apps da equipe. |
| Supabase | https://supabase.com/dashboard/project/mfsnzrrqlyixqwsrcqyo | SQL Editor para consultas/migrations, Functions para publicação/logs, Secrets para credenciais do servidor, Auth para usuários. Antes de alterar, ler convenções do banco comum. |
| Vercel | https://vercel.com/matheus-3874/app-eo | Deployments, logs, variáveis e domínio. Projeto vinculado localmente em .vercel/project.json. Não presumir publicação automática só porque houve push. |
| TestFlight EO | https://appstoreconnect.apple.com/apps/6829045329/testflight/ios | Conferir upload/processamento, conformidade, grupo interno e instalação disponível. Usuário faz login/2FA diretamente. Upload não equivale a liberação aos testers. |
| TestFlight, URL da equipe | https://appstoreconnect.apple.com/teams/6065c88a-4e28-4359-8610-0f73397ef345/apps/6829045329/testflight/ios | Mesmo app, endereço observado com contexto da equipe. Usar se a rota curta redirecionar. |
| Apple Developer | https://developer.apple.com/account/resources/identifiers/list | Identifier com.appeo.mobile, capacidade Push Notifications e perfis. Chave APNs é diferente da chave App Store Connect usada para assinar/publicar. |
| Google Play EO | https://play.google.com/console/u/0/developers/8960154356839047529/app/4972840947538514394/app-dashboard | App já criado. Revisar faixa interna/compartilhamento e artefato correto. Não declarar distribuição Android concluída. |
| Codemagic, legado | https://codemagic.io/app/6ae4684861ca8c6c35a1576e/settings | Fluxo antigo. Não voltar a ele nem disparar build por engano; a escolha atual é GitHub. |

As sessões podem expirar. Reabrir uma página não confirma login. Na conversa anterior a ferramenta de navegador foi bloqueada por cota de uso; respeitar bloqueios e não contornar por outro meio para acessar o mesmo resultado negado. Não fingir que observou um build quando o status veio apenas de um print do usuário.

## Identificadores e credenciais, somente metadados

- Pasta: `C:/Users/Usúario/Documents/ChatGPT/App_EO`.
- Web React/Vite/TypeScript em `src/`; mobile Expo SDK57/React Native/Expo Router em `mobile/`.
- Supabase Postgres, Auth, Storage privado, RPCs, RLS e Edge Functions.
- Bundle iOS e pacote Android: `com.appeo.mobile`; App Store Connect ID: `6829045329`.
- Expo ativo `@controlalls-team/eo`, projectId `1b9d38c0-be49-44cf-9783-a179dd812713`.
- Projeto Expo pessoal anterior `@controlall/excelencia-operacional-eo` é histórico, não substituir o vínculo atual por ele.
- Apple Team ID: `WG63N9W37M`. APNs reutilizada: Key ID `RSGS8585QG`, vinculada pelo usuário ao projeto da equipe. Não é a chave ASC.
- Segredos GitHub esperados pelo workflow: ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_KEY_P8. Variáveis: APPLE_TEAM_ID, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
- Servidor IA: ANTHROPIC_API_KEY e ANTHROPIC_MODEL no Supabase. Conferir modelo real configurado e disponível, não trocar automaticamente pelo nome de exemplo no código.
- Nunca registrar valores secretos. Publicar somente a chave pública apropriada no cliente. Arquivos .p8/.p12 e dados reais de lojas não pertencem ao repositório público.

## Publicação web e testes locais

Na raiz do projeto, comandos já usados:

```powershell
npm test
npm run build
npx tsc --noEmit -p mobile/tsconfig.json
python scripts/test-ios-signing-inputs.py
```

O arquivo `docs/BANCO-CONVENCOES.md` rege testes de banco adicionais. Testes SQL antigos podem usar nomes transitórios e precisam ser lidos antes da execução.

Publicação web pelo projeto já vinculado, após revisão e commit:

```powershell
npx vercel deploy --prod --yes --build-env VITE_VERCEL_GIT_COMMIT_SHA=$(git rev-parse HEAD)
```

Confirmar READY, endereço de produção e commit realmente presente no bundle. Preservar .vercelignore: não enviar .env, chaves, bases, mobile, pastas de saída e scripts privados para o deploy web. A Permissions-Policy autorizada permite camera=(self), microphone=(self), geolocation=(self); usuário ainda consente no navegador.

## iOS: fluxo e erros já resolvidos

- Workflow `.github/workflows/eo-mobile-build.yml`, plataforma ios-testflight. Tags `eo-ios-*` também iniciam uma compilação deliberada. Push normal não deve gerar builds TestFlight repetidas.
- Número nativo: 1000 + GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT. 3101 era da execução21; não confundir commit ou updateId com compilação nativa.
- Após prebuild, restaurar app.json versionado preserva o número nativo no projeto gerado e evita alterar fingerprint OTA. Não retirar esse passo nem fixar runtime artificialmente.
- API Apple recusou uma consulta de capabilities com PARAMETER_ERROR.ILLEGAL. Correção c01978b removeu limit opcional, segue paginação validando domínio e exibe detalhes da rejeição. Print posterior confirmou essa etapa aprovada. Não investigar novamente como se ainda falhasse.
- Amostra artificial EOProbe falhou por conflicting provisioning settings. Correção e24312a removeu o archive sintético; preflight valida entradas coerentes, não promete validar assinatura antes de existir o IPA real.
- O gate final permanece: aps-environment production no IPA assinado e no embedded.mobileprovision, correspondência e codesign --verify antes de altool. Não retirar esse bloqueio para conseguir execução verde.
- Scripts relevantes: ios-ensure-push.mjs, apple-push-capability.mjs, ios-signing-preflight.sh, ios-validate-signing-inputs.py e ios-preserve-entitlements.sh.
- Ícone é `mobile/assets/eo-icon.png`, RGB1024x1024, declarado em ios.icon e ícone geral. Novo ícone exige instalar novo binário.
- Se falhar, obter a primeira falha real e detalhes da etapa, corrigir e testar antes de nova tentativa. Não gerar novas chaves/certificados indiscriminadamente.
- Tags recentes: eo-ios-20261109-integrated, eo-ios-20261109-push-api-fix, eo-ios-20261109-real-archive-fix. O último resultado informado pelo usuário é4001; não atribuir sucesso diretamente a uma tag sem conferir a execução.

## OTA não é um novo binário

Agrupar mudanças compatíveis de JavaScript/interface no canal/runtime correspondente. Alterações nativas, permissões, dependências, projeto Expo, ícone ou assinatura exigem compilação. Não enviar uma OTA incompatível para tentar corrigir APS. No novo Meu aparelho há versão nativa, compilação e updateId; em versões antigas esses campos podem não aparecer.

O Metro empacota a partir de mobile. Helpers fora dessa raiz passaram em TypeScript, mas quebraram export nativo. Helpers de questionários, nomes de anexo e e-mails estão também em mobile/src/features; manter a equivalência ao editar.

## Banco compartilhado: regra mais recente prevalece

SUP_EO1 `mfsnzrrqlyixqwsrcqyo` pertence ao EO e derivados, incluindo Escala. As instruções recebidas registram padronização em11/11/2026, embora a data desta passagem seja10/11; preservar o registro e verificar o catálogo, sem corrigir datas ou reaplicar por suposição.

Tabelas comuns novas: lojas, unidades, perfis, colaboradores, regionais, auditoria, dispositivos_push e outras listadas em BANCO-CONVENCOES. eo_stores, eo_profiles e similares são views transitórias para service_role/Edge Functions. Código novo usa os nomes novos. Tabelas de módulo preservam prefixos eo_ ou escala_.

Nunca apagar ou renomear objetos/dados comuns sem migration de compatibilidade. Migrations são novas, aditivas, com transação e marcador; dry run revertido e plpgsql_check sem erros novos obrigatórios. Conferir pg_policies real. Clientes acessam RPCs com auth/perfil/módulo/unidade, não tabelas diretamente. Não usar diretorio_pessoas como cadastro permanente de colaboradores, pois a importação organizacional recarrega essa base.

Arquivos 202611110001/002 e operações de banco estão não versionados no checkout observado e pertencem a outra frente autorizada. Não incluir nem apagar automaticamente. Antes de publicar Edge Functions, atualizar as referências conforme a convenção nova e testar as chamadas existentes. Não executar versões antigas por hábito.

## Decisões funcionais consolidadas

- Site e app devem ter navegação profissional, compacta, filtros simples com caixas de seleção, todas/nenhuma e pesquisa. Não usar seleção com Ctrl nem listas gigantes abertas.
- Todos os ativos vinculados a unidade; Administração por padrão para admin, com possibilidade EC e CDA. EC é Escritório Central; CDA é Centro de Distribuição Araçariguama.
- Chapa330023 é master protegido por identificação persistente contra exclusão. Outros admins têm os mesmos poderes, inclusive histórico completo; a diferença especial é somente a proteção contra exclusão. Exclusão de usuários é lógica e auditável.
- Senhas temporárias por pessoa e compartilhamento direto para testes foram pedidos. Não reintroduzir trava de primeiro acesso para reset administrativo, nem convite por e-mail como obrigação sem nova decisão. Nunca guardar senha em documentação.
- Admins ativos recebem todos os avisos. Abrir marca leitura; ciência confirma entendimento separadamente; feedback aparece em relatório, sem promessa de retorno individual. Limpar caixa é pessoal, arquivar/excluir conteúdo da equipe preserva auditoria.
- Agendamentos preservam lojas escolhidas e resolvem membros ativos na hora do disparo. Editar/cancelar/retry sem duplicar sucesso. Status de publicação não comprova entrega no aparelho.
- Pedidos de produto: departamento, tipo, medidas, cor, composição e motivo; ausentes Não informado, nunca inventar. Histórico por unidade, mesmo após transferência do gerente. Arquivo afeta unidade toda. Gestor pode tratar com status e justificativa ao concluir.
- Voz até um minuto, sempre texto editável e revisado antes de salvar/enviar. Anthropic organiza texto; chave Anthropic não habilita transcrição de áudio. Usar reconhecimento do aparelho ou navegador com transparência e alternativa manual. Sem OpenAI autorizado.
- Sortimento livre ou sob demanda com itens permitidos; PP..EXG e34..54; sessão/ID, envio para validação, relatório e aviso de possível divergência durante vendas. Sem alterar estoque externo.
- Checklist: criação dentro da própria área, modelo Excel, aceite/foto/sim-não/texto curto-longo/número/telefone/horário, limites no servidor. Palavrão sinaliza revisão sem bloquear. Localização consentida preparada, sem bloqueio por distância nesta fase.
- Diário parametrizável e versionado; sentimento aceita várias respostas no dia, sem editar/apagar passado. Usuário vê próprio dia, regional dia de suas unidades, admins histórico e exportação.
- Gerente pode alterar horário da loja sem aprovação. Perfil com telefone e preferência de contato. Agenda usa confirmação do usuário, sem sincronização bidirecional prometida.
- Módulos novos nascem acessíveis, admin pode restringir; guard no servidor também é necessário. Administração deve consolidar relatórios, enquanto criação funcional fica em cada módulo.

## Pendências sem falsa conclusão

1. Confirmar push remoto, ícone e recursos físicos na4001 com Matheus.
2. Atualizar/testar Edge Functions frente aos nomes do banco compartilhado, preservando contratos.
3. FCM Android adiado; configurar somente quando Matheus retomar.
4. Tickets/receipts e falhas de push por aparelho ainda precisam ser ampliados; distinguir envio ao provedor, entrega e leitura.
5. Relatório HTML tem filtros, extração segura e percentuais corrigidos, mas ainda não replica todas as interações JS do original. Novas dimensões exigem reimportar arquivo. Validar semanal/mensal/anual com amostras reais.
6. Validar interface em telas e dados reais. Houve falhas CSS corrigidas em99e4252: ações de pessoas coladas e painel de notificações herdando largura do sino. Regression SQL corrigiu confirmed fora do escopo usando soma dos totais agrupados.
7. Documentos históricos podem contradizer este estado, especialmente voz, banco e credenciais. Preservar histórico, priorizar decisões atuais e buscar a evidência antes de agir.

## Arquivos de referência

- AGENTS.md e docs/BANCO-CONVENCOES.md: regras atuais.
- docs/EO-IMPLEMENTACAO-INTEGRADA.md: inventário da implementação e roteiro físico.
- docs/EO-ROTINAS-COMERCIAL.md: pedidos/sortimento e histórico de voz.
- docs/eo-native-team-transition.md: histórico de mudança para a equipe, não usar pendências antigas como estado atual.
- .github/workflows/eo-mobile-build.yml e eo-mobile-update.yml: procedimentos executáveis atuais.
- mobile/app.json e mobile/eas.json: identificadores, plugins, permissões e canais.
- Obsidian app-operacional-lojas: fonte durável de decisões e checkpoints, leitura dirigida.

Não incluir em commits em massa: AGENTS.md/MEMORIA.md não versionados do usuário, .identity*.sql, scripts/provision-apple-review-demo.sql, tmp/, output/, outputs/, caches e as migrations de outra frente sem revisão específica. Não ler arquivos de credenciais só para documentar.

## Atualização 15/11/2026: Face ID e offline

Consultar docs/EO-FACEID-OFFLINE-20261115.md. Máquina de estado biométrica com timeout e senha disponível; sessão local sem esperar rede; indicador Saindo separado de push. Cache cifrado por identidade e fila idempotente com RPC eo_apply_offline aplicada após dry run/plpgsql_check. Testes: 112 aprovados, 1 ignorado; TypeScript e export iOS aprovados. Sem alteração nativa nem build. Publicação pendente pelo próprio PowerShell do Matheus: scripts/publicar-faceid-offline-20261115.ps1. Não executar push/gh por automação. Tag compatível ota-20261115-faceid-offline deriva de ota-20261112-navegacao. Validação física de Face ID, som e entrega remota ainda pendente. Não afirmar crash nativo resolvido sem evidência.
