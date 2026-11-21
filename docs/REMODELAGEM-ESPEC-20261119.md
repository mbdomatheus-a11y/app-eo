# Remodelagem do EO pela especificação do produto

Fonte: `docs/ESPECIFICACAO-PRODUTO.md` (enviada por Matheus em 19/11/2026). Nada é implementado de forma diferente da especificação sem validação dele.

## Decisões de Matheus em 19/11/2026

1. Começar pela Fundação.
2. Multiempresa: preparar por configuração agora; banco único SUP_EO1 só para a Pernambucanas até entrar o segundo cliente.
3. Acesso: construir chapa + PIN + data de nascimento e migrar as contas gerNNN aos poucos, desativando depois.
4. Diário de vendas passa a Ocorrências do Dia e Pedir produto a Voz do Cliente. Sortimento, Agenda e Relatórios continuam, ativáveis por empresa.
5. Conciliação: a especificação pede o botão central como ação principal do contexto; Matheus pediu em 18/11 manter o menu do botão central. O menu continua, com a ação principal do contexto em primeiro lugar e destacada.

## Situação atual frente à especificação

Legenda: Existe, Parcial, Falta. "A conferir" quando o código ainda não foi revisado item a item.

| Tema | Situação | Observação |
| --- | --- | --- |
| Busca fixa no topo | Existe | App (bloco 1) e site (bloco 2), sem testes; app aguarda OTA |
| Barra com cinco itens e botão central | Existe | Ação contextual no app desde o bloco 1 |
| Padrões de UX e acessibilidade | Parcial | Canal preferido de contato já é seletor no app e no site (conferido em 19/11). O app respeita o tamanho de fonte do sistema (nenhum texto bloqueia a ampliação). Faltam ajuste de fonte dentro do app, modo de baixo consumo e indicador de salvamento padronizado |
| Portal admin em endereço próprio | Falta | Hoje a administração está no mesmo site |
| Módulo ativável por empresa | Existe | `settings.disabled_modules` e `modulos_acesso` |
| Multiempresa por configuração | Falta | Marca e módulos por cliente em configuração |
| Salvamento automático discreto | Parcial | Escala e respostas de texto do checklist no app (19/11, `SaveStatus`); demais módulos ao migrar cada um |
| Admin sobrepõe qualquer dado com marcação | Falta | |
| Acesso chapa + PIN 2 h + nascimento, vínculos | Falta | gerNNN e senha temporária por chapa existem |
| Bloqueio escalonado e desbloqueio pelo superior | Parcial | Hoje bloqueia no 3º erro com liberação só pelo admin |
| Log de auditoria | Parcial | Tabela `auditoria` existe; valor anterior e novo a conferir |
| Termos de uso com versão e aceite | Falta | Existe só a página de privacidade |
| Bloqueio de captura e marca d'água | Falta | |
| Palavras bloqueadas | Falta | |
| Checklist | Parcial | Existe com Excel, local e relatório; etapas e tópicos, tipos, ciclos e acompanhamento a conferir |
| Comunicado Obrigatório | Parcial | Ciência existe; níveis crítico, importante e informativo faltam |
| Ocorrências do Dia | Parcial | Áudio e IA existem; transcrição e categorias com aprovação a concluir |
| Voz do Cliente | Parcial | Classificação por IA existe; status, referência por código e agrupamento faltam |
| Domingos e Feriados | Falta | |
| Como Está o Seu Dia | Parcial | Banner e registro existem; regra mínima e visões a conferir |
| Metas | Falta | Aguarda documentação de Matheus |
| Escala | Parcial | HTML publicado em ambiente isolado; validações nativas e corte faltam |
| Assistente EO | Falta | |
| Vendas | Parcial | Importação HTML e telas existem; configuração de indicadores falta |

## Blocos de trabalho

1. Fundação no app: catálogo único de módulos, busca no topo, ação principal no botão central e novos nomes. Feito localmente em 19/11, sem testes nem publicação.
2. Fundação no site: busca fixa no topo com os mesmos termos do app (`src/core/module-search.ts`) e mesmos nomes. Feito localmente em 19/11, sem testes. Publicação: `scripts/publicar-fundacao-20261119.ps1` envia a main; o app recebe por OTA só depois de conferir o Runtime instalado.
3. Fundação de UX: feito localmente em 19/11 o indicador `SaveStatus` com salvamento automático das respostas de texto do checklist (sem botão Salvar), economia de dados (atualizações a cada 5 min) e orientação de tamanho de texto pelo aparelho. Preferência de contato já era seletor. Pendente de decisão: ajuste de letra dentro do app além do ajuste do aparelho.
4. Portal admin em endereço próprio.
5. Acesso e segurança: chapa + PIN, data de nascimento, senhas por perfil, bloqueio escalonado, cascata e gestão em massa, termos de uso e log com valor anterior e novo. Exige migrations aditivas no SUP_EO1 conforme `docs/BANCO-CONVENCOES.md`.
6. Comunicado Obrigatório com níveis e Checklist completo com acompanhamento.
7. Ocorrências do Dia, Voz do Cliente, Domingos e Feriados e Como Está o Seu Dia.
8. Vendas, Escala com validações, Assistente EO e Metas (após a documentação).
9. Segurança de tela, marca d'água e palavras bloqueadas.

Cada bloco termina com checklist do que foi feito e do que falta, e com atualização desta tabela.

## Controle de versão no aparelho (19/11/2026)

Pedido de Matheus: ver no app a versão atual e a anterior, com data e hora, para ter certeza de que uma compilação ou OTA chegou. Em Mais, Notificações e aparelho, o cartão "Versão do app" mostra para a atual e a anterior: versão e compilação, origem (instalação ou OTA), data de geração ou publicação, desde quando está em uso, código (commit), atualização e Runtime. O rodapé de Mais mostra o resumo da atual. Compilação e commit entram pelos workflows (`EXPO_PUBLIC_EO_BUILD`, `EXPO_PUBLIC_EO_COMMIT`); a anterior é guardada no armazenamento seguro do aparelho. Publicação por `scripts/publicar-ota-20261119.ps1`, que confere no log se o Runtime da OTA é igual ao do aparelho.

## Navegação em blocos (19/11/2026)

Pedido de Matheus: menus, navegação e botões mudaram pouco. Feito localmente, sem testes:
- Início: nome, papel e loja no topo; cartões "Para fazer agora" com número grande (comunicados, checklists, alertas; amarelo quando há pendência, ✓ quando em dia); "Seus atalhos" em grade de blocos; botão "Ver todos os aplicativos".
- Aplicativos: grade de blocos de três colunas por grupo, com cor por grupo (verde Pessoas e rotina, azul Vendas e comercial, laranja Execução).
- Barra inferior: aba ativa com fundo destacado e texto em negrito; botão central com rótulo "Ações" ("Fechar" quando aberto).
- Menu do botão central: ação principal como botão escuro grande no topo; demais módulos em grade de blocos.
- Mais: só menu, em Conta, Lojas, Este aparelho e Ajuda. Contato, canal e horário da loja foram para a tela própria "Contato e horário" (`mobile/src/app/contact.tsx`).
- Componentes: `mobile/src/features/Launcher.tsx` (GradeBlocos, CartoesPendencia, cores por grupo).

## Materiais recebidos em 21/11/2026

- Metas: `docs/referencias/PFINS_SPEC_REPLICACAO.md`, especificação do PFINS (processo atual de metas de produtos financeiros), enviada por Matheus para o módulo Metas da seção 15. Uso autorizado por ele neste projeto. Pendência da seção 20 parcialmente atendida: regras de ponderação 12M+6M e telas detalhadas continuam no código do PFINS.
- Escala: HTML v9.18.0 reenviado por Matheus; é a mesma base já publicada em ambiente isolado.
- UX: skills de Emil Kowalski e regra de carregamento aplicadas; ver `docs/UX-MOVIMENTO-CARREGAMENTO-20261121.md`.
