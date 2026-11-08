# Revisão visual do portal EO

Entrega de 08/11/2026, aprovada por Matheus. Escopo: site web; nenhuma biblioteca ou build nativa alterada.

- Fonte do sistema por padrão: SF no ecossistema Apple, Segoe UI no Windows, com alternativas de plataforma. Tipografia relativa em rem e opção de texto ampliado.
- Filtros em grade com rótulos superiores e controles de pelo menos 44 px. Lojas e pessoas usam largura principal. Nova loja abre em dialog e confirma descarte quando há alterações.
- Menu no avatar com Minha conta, foto, aparência e saída. Foto JPG/PNG/WebP é reduzida a 256 px. Foto e preferências são salvas por usuário somente neste navegador; a interface informa essa limitação. Não há sincronização Supabase ou com o aplicativo nativo nesta entrega.
- Navegação lateral desktop; no celular, Início, Comunicados, Vendas e Mais com todos os módulos permitidos pelo perfil. Não há alteração de permissões de acesso.
- Tabelas com cabeçalho fixo, rolagem vertical/horizontal, controles horizontais adicionais quando há colunas fora da tela e paginação existente preservada.
- Ícone vetorial EO aplicado à marca e favicon; PNG para atalho Apple do site.

Verificação: compilação TypeScript/Vite passou. Testes existentes: 15 passaram e uma amostra opcional não executada. Portal conferido com perfil admin, 30 lojas por página, filtros sem sobreposição em desktop, 390 px sem transbordamento global, menus da conta e navegação Mais, formulário Nova loja sem gravar dados reais. Cor azul e texto ampliado funcionaram e foram restaurados ao padrão. Testes em largura de celular são em navegador, não substituem teste físico de teclado/safe area no aparelho.

Arquivos: src/visual-system.css, src/features/account/AccountMenu.tsx, src/components/TableViewport.tsx e integração em src/ConnectedApp.tsx.
