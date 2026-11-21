# Movimento, toque e estados de carregamento (21/11/2026)

Pedido de Matheus: a experiência do site continuava ruim. Aplicadas as skills de design engineering de Emil Kowalski (github.com/emilkowalski/skills) e a regra de carregamento da Nielsen Norman Group. Sem testes locais, por instrução do Matheus.

## Regra de carregamento

| Espera | Indicador |
| --- | --- |
| Menos de 1 s | Nenhum (Spinner e esqueleto só aparecem depois de ~0,9 s e ~0,3 s) |
| 2 a 10 s num pedaço da tela | Spinner pequeno e rápido com texto |
| Página inteira abaixo de 10 s | Esqueleto com a forma do conteúdo (linhas com ícone, título e detalhe, ou cartões) |
| Mais de 10 s, upload ou importação | Barra de progresso com "Lote X de Y", percentual, tempo restante e Cancelar |

Componentes: `src/components/Loading.tsx` (site: Spinner, Skeleton, BarraProgresso) e `mobile/src/features/Loading.tsx` (app: Carregando, EsqueletoLista).

## Diagnóstico e correção

Tempos marcados como "a medir" foram estimados pelo tipo de operação; a confirmação é de Matheus.

| Tela ou ação | Tempo | Antes | Depois |
| --- | --- | --- | --- |
| Site, entrada no portal | a medir (estimado 1 a 3 s) | Cartão com texto "Carregando seu espaço" | Esqueleto de cartões |
| Site, importar relatório de vendas (43 MB, ~144 lotes de 500) | mais de 10 s | Texto "Importando dados: X de Y" | Barra com lote, %, tempo restante e Cancelar (cancelar arquiva o rascunho) |
| Site, publicar HTML da Escala (colaboradores em lotes por loja) | mais de 10 s | Texto "X gravados" | Barra com lote, % e tempo restante |
| Site, lista de relatórios de vendas | a medir | Texto | Esqueleto de lista |
| Site, abrir um relatório | a medir | Texto | Spinner |
| Site, Central de relatórios | a medir | Texto | Esqueleto de lista |
| Site, dados do relatório e ícones | a medir | Texto | Spinner |
| App, lojas e semanas da Escala | a medir | Texto | Esqueleto de lista |
| App, relatórios e vendas | a medir | Texto | Esqueleto de lista ou spinner |
| Site e app, envio do HTML de vendas ao Storage | a medir | Texto "Publicando…" | Pendente: o envio do Supabase não informa progresso; avaliar envio em partes |

O que ainda depende de deixar mais rápido: importação de vendas (lotes sequenciais; pode paralelizar 2 a 3 lotes) e entrada no portal (várias chamadas; pode virar uma só).

## Movimento e toque

| Antes | Depois | Por quê |
| --- | --- | --- |
| Botões sem resposta ao clique | `transform: scale(0.97)` em `:active`, 120 ms | O usuário sente que a interface ouviu o toque |
| Curvas padrão `ease-out` fracas | `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` | Resposta imediata, sem parecer lenta |
| Efeito de hover também no toque | Hover desligado em telas sem mouse | Toque não deve disparar hover |
| Sem respeito a "reduzir movimento" | `prefers-reduced-motion` remove entrada, pulso e escala | Acessibilidade |
| Números que mudam de largura | `tabular-nums` em indicadores, tabelas e progresso | Números não tremem |
| Títulos com espaçamento largo | `letter-spacing: -0.02em` | Títulos grandes mais firmes |
| Texto em linhas longas | `max-width: 75ch` em parágrafos | Leitura confortável |
| App: toque só escurecia | Toque escurece e reduz para 0,97 | Mesma resposta do site |
