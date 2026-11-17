# Diagnóstico e arquitetura mobile do EO

## Diagnóstico em 17/11/2026

1. O portal e o aplicativo mantêm catálogos diferentes. O portal mostra Escala, mas o catálogo do Expo não a registra e não possui rota nem tela para o módulo. O ícone já existe no mapa visual, o que não basta para criar a navegação.
2. A barra inferior do aplicativo já tem cinco destinos: Início, Avisos, ações rápidas, Aplicativos e Mais. O problema não pede outra aba. Escala é uma tarefa periódica, adequada ao catálogo Aplicativos.
3. O portal usa uma tela de loja e períodos em torno de um editor HTML publicado pelo administrador. Esse editor roda isolado e recebe apenas a equipe da loja escolhida. O aplicativo React Native não pode importar diretamente o componente web, que depende de `iframe`, DOM e `postMessage`.
4. A aparência do editor real no iPhone ainda não pode ser concluída pela fonte local: o HTML ativo vem do banco. No portal, o contêiner tem altura mínima de 640 px e exige rolagem extensa em telas pequenas.
5. O site tem `viewport-fit=cover` e cor de tema, mas não há manifesto nem service worker versionados em `public/`. Portanto, o site não deve ser descrito como PWA instalável ou offline. O aplicativo Expo é uma distribuição nativa separada.

## Arquitetura de navegação

| Destino | Conteúdo | Regra |
| --- | --- | --- |
| Início | Pendências e entrada para tarefas frequentes | Resumo curto, sem lista extensa |
| Avisos | Comunicados e alertas | Contagem e leitura |
| Ações rápidas | Registro do dia, produto, checklist e outras ações curtas | Somente módulos liberados |
| Aplicativos | Catálogo por atividade, incluindo Escala em Pessoas e rotina | Busca visual, sem nova aba inferior |
| Mais | Perfil, aparelho, lojas e configurações | Ações pessoais e administrativas conforme perfil |

### Fluxo da Escala no aplicativo

1. Mostrar Escala apenas quando `moduleVisible("escala")` permitir. A rota também precisa verificar a permissão ao abrir diretamente.
2. Se houver uma única loja autorizada, selecioná-la sem pedir outro toque. Com várias lojas, oferecer busca por código ou nome e resultados limitados.
3. Mostrar semanas em linhas compactas, com modelo 5x2 ou 6x1, situação e última gravação. Semana, mês e ano são filtros, não três telas longas.
4. Abrir o planejamento em tela própria, com indicação visível de gravação, erro e retorno à lista. Somente perfis autorizados editam. Publicar novo HTML continua sendo tarefa de administração no portal.
5. O editor recebe o HTML publicado e apenas os colaboradores da loja selecionada. A sessão e seus tokens ficam no aplicativo. Toda gravação volta ao aplicativo, que usa a RPC existente e a versão otimista da semana.

## Base visual e técnica

- Alvos de toque de pelo menos 44 pontos, títulos curtos, contraste preservado e estados de carregamento, vazio, sem acesso e falha próximos à ação.
- Evitar telas com todos os filtros abertos e listas enormes. A seleção da loja fica recolhida quando já existe escolha.
- A experiência deve indicar explicitamente quando está offline. A Escala não deve prometer edição offline até existir fila persistente por loja, semana e versão com resolução de conflitos.
- No futuro PWA do site, manifesto e service worker devem cachear apenas recursos estáticos por versão. Dados de pessoas, escalas e autenticação exigem estratégia própria de acesso e expiração. Push web não substitui o push nativo.

## Limite da entrega atual

O usuário pediu para não executar testes. A revisão desta etapa é estática. A abertura, edição e gravação no iPhone e Android precisam de conferência pelo Matheus no aparelho após uma OTA compatível ou nova compilação, conforme o runtime instalado.

## Implementação preparada

- O catálogo Expo mostra Escala em Pessoas e rotina e protege a rota pela permissão do módulo. A barra inferior permanece com cinco destinos.
- A tela Expo consulta lojas autorizadas e planejamentos pela mesma API do portal. Uma loja única é selecionada automaticamente; com várias, a busca mostra até dez resultados e recolhe após a escolha.
- Semana, mês e ano filtram a lista. O planejamento abre o HTML publicado pelo administrador dentro de uma WebView sem sessão, cookies, acesso a arquivos ou navegação externa. A ponte fornece só a equipe da loja escolhida.
- A gravação usa a versão otimista da semana, guarda o último estado pendente e permite repetir após falha. Antes de sair, bloqueia novos toques, solicita o envio imediato e espera a fila. Se não confirmar, pergunta se a pessoa quer continuar ou descartar.
- O contêiner web da Escala ganhou ajustes de altura, quebra de linha, toque e áreas seguras no celular. O HTML interno publicado não foi modificado.
- O site ainda tem fluxo anterior de saída do editor com espera fixa e sem confirmação explícita da ponte. Esta alteração de CSS não resolve esse risco de gravação no navegador.

## Publicação

O site precisa receber o commit em `main`. Para o iPhone que informou Runtime `ee6c10e120100f0eaa3b33f9a2ba9e7693e7e812`, a atualização Expo deve partir da tag compatível `ota-20261116-ux-ee6`, trazendo apenas JavaScript e CSS necessários. A `main` atual tem configuração e sons nativos diferentes e não deve ser usada diretamente como OTA desse iPhone. Confirmar no painel Expo o Runtime da atualização concluída antes de orientar o teste. Android também requer distribuição compatível com a instalação do usuário.

### Resultado da publicação

Em 17/11 a tag `ota-20261117-escala-ee6` foi publicada, mas o Expo calculou Runtime `3982f37...`. O iPhone informou `ee6c10e1...`, portanto não receberá essa atualização. A igualdade dos arquivos nativos entre tags não garantiu igualdade do fingerprint no runner. Seguir a decisão registrada do projeto: não forçar manualmente o Runtime. A Escala chegará ao iPhone por nova compilação TestFlight de `main`, que já contém o módulo. O script de OTA da Escala não deve ser executado novamente para tentar alcançar esse aparelho.
