# Site pelo Expo web e novo layout (21/11/2026)

## Decisão

Matheus pediu que o layout e a publicação do site passem a vir do mesmo projeto Expo do app (`mobile/`), igual ao Control ALL.
Isso substitui, de forma gradual, a decisão registrada em `docs/MIGRACAO-EXPO.md` ("O portal web continua na raiz").
O portal Vite da raiz continua em produção na Vercel até o site Expo cobrir as telas usadas. Não houve troca de deploy.

Cores mantidas: as atuais do EO em `mobile/src/ui.tsx` (`C.dark #4A4E58`, `C.ink #282B31`, `C.yellow #FBF2A3`). Fonte mantida.

## O que mudou

- `mobile/package.json`: `react-native-web` e `react-dom` passaram a dependências (Expo web). Nenhum script novo, porque scripts entram no fingerprint.
- `mobile/metro.config.js`: no web troca `expo-secure-store` por `mobile/src/web/secure-store.web.ts` (localStorage do domínio; biometria desligada no navegador).
- `mobile/src/ui.tsx`: no web a página fica em coluna centralizada de até 960 px.
- `mobile/App.tsx`: logo do login com tamanho fixo no web; lista de checklists trocada por `ChecklistFeedList`.
- `mobile/src/features/ChecklistFeedList.tsx`: checklists agrupados por rotina, uma linha por loja com barra de progresso, situação, abrir e agenda compacta.

## Verificação

- Fingerprint Android `a36da32fa6c3a2bb6fddffc4aaf134c977de85d2` igual antes e depois das mudanças: vai por OTA, sem build nova.
- Teste: `campo app.json "web"` muda o fingerprint. Não adicionar sem planejar build nova.
- `tsc` sem erros novos (só os testes que dependem do vitest da raiz, já existentes).
- `expo export --platform web` concluído; login e lista de checklists renderizados em navegador headless, no desktop e no celular.

## Pendências

- Login real no site Expo não testado (precisa de credencial).
- Módulos sem suporte web: biometria, câmera de código de barras, agenda nativa, WebView da Escala e Vendas, cache offline criptografado. Tratar tela a tela antes de trocar o deploy.
- Menu lateral para tela larga no site e demais telas no novo layout.
- Trocar a Vercel para `mobile` (`npx expo export --platform web`, saída `dist`, reescrita para `index.html`) só depois da paridade.

## Etapa 2: visual estilo Apple e fotos (21/11/2026)

Decisões do Matheus: claro com destaque EO (sem modo escuro agora, que exigiria build), fotos no login, banner do Início, capa de cada módulo e telas vazias, banco e tela de admin já criados, barra lateral estilo Mac no site.

- Tokens em `mobile/src/ui.tsx` e `mobile/src/design.tsx`: neutros do iOS (#F5F5F7, #1D1D1F, #6E6E73), cartões sem borda com sombra leve, campos preenchidos, botões e escolhas em pílula, títulos grandes.
- `mobile/src/features/aparencia.tsx`: fotos padrão em `mobile/assets/fotos` (Unsplash, créditos em `CREDITOS.md`), `FotoCapa`, `CapaModulo`, `EstadoVazio` e leitura das trocas do admin com cache local.
- `mobile/src/features/AparenciaAdmin.tsx` e rota `/appearance`: em Mais, Administração, Aparência e fotos (só admin). Trocar foto, posição (topo, centro, base) e voltar ao padrão.
- `mobile/src/navigation/Sidebar.tsx`: no site com 900 px ou mais, barra lateral com Visão geral, Comunicados, Aplicativos, módulos por grupo e conta. Barra inferior some nessa largura.
- Login novo (foto ao lado no site, foto no topo no celular), Início com banner e saudação, capa com foto na tela principal de cada módulo, componente `Empty` usando a foto de tela vazia.
- Banco: migration `202611210001_aparencia_fotos` aplicada em 21/11/2026 após dry run (plpgsql_check sem avisos). Conferido: tabela sem acesso direto, leitura anônima só pela RPC, escrita bloqueada para anon, 4 políticas no storage.
- Fingerprint igual ao anterior (Android `a36da32f…`, iOS `ede61a46…`): vai por OTA. Degradê das fotos feito com camadas, sem `expo-linear-gradient`, para não exigir build.
- Verificado: `tsc` sem erros novos, `expo export --platform web` ok, capturas do login, Início, lista de checklists, estado vazio, tela do admin e barra lateral em desktop e celular (dados de exemplo, sem login real).
