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
