# Estrutura do código do EO

Atualizado em 19/11/2026. Objetivo: permitir que o app cresça de 10 para dezenas de módulos (especificação, seção 2) sem arquivos gigantes nem telas duplicadas.

## Situação

| Arquivo | Linhas | Problema |
| --- | --- | --- |
| `mobile/App.tsx` | ~3.450 | Telas de vários módulos (comunicados, checklists, perfil, cadastro) no mesmo arquivo |
| `src/ConnectedApp.tsx` | ~4.230 | Portal inteiro, inclusive administração, no mesmo componente |
| `mobile/src/providers/eo-provider.tsx` | ~1.950 | Estado e chamadas de todos os módulos no mesmo provedor |

## Regras a partir de agora

1. Todo módulo novo nasce em pasta própria: `mobile/src/modules/<id>/` e `src/modules/<id>/`, com tela, modelo (`model.ts`, funções puras testáveis) e chamadas ao banco.
2. Navegação, busca e botão central leem só o catálogo: `mobile/src/features/module-catalog.ts` (app) e `src/core/module-search.ts` (site). Incluir o módulo no catálogo é o único passo para ele aparecer.
3. Salvamento automático usa `SaveStatus` (`mobile/src/features/SaveStatus.tsx`) e não mostra pop-up.
4. Atualizações automáticas usam `intervaloAtualizacao()` (`mobile/src/features/data-saver.ts`), respeitando a economia de dados.
5. Nada de mudança de banco sem `docs/BANCO-CONVENCOES.md`.

## Ordem da separação

Mover sem mudar comportamento, um módulo por vez, cada um em commit próprio:

1. Checklists (resposta e acompanhamento) saem de `mobile/App.tsx`.
2. Comunicados saem de `mobile/App.tsx`.
3. Perfil e cadastro saem de `mobile/App.tsx`.
4. No site, Administração sai de `src/ConnectedApp.tsx` (prepara o portal admin separado, bloco 4).
5. O provedor é dividido por módulo, mantendo `useEO()` como fachada.

A CI passou a conferir os tipos do app mobile (`.github/workflows/ci.yml`), por enquanto sem bloquear. Cada separação só deve ser publicada com essa conferência sem erros novos.
