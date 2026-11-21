# PFINS — Especificação técnica completa para replicação por outra IA

Documento gerado em 2026-11-21 com o objetivo de permitir que outra IA (ou outra sessão sem o histórico desta) entenda e reconstrua o projeto PFINS do zero: mesma função, mesmas telas, mesmas regras de negócio, mesmo modelo de dados. Serve como complemento a `PFINS_PROJETO.md` (que é o diário cronológico de 24 rodadas de ajustes) — aqui o foco é a fotografia atual do sistema, organizada por assunto, não por ordem de pedidos.

Fonte: leitura direta de `admin.html` (12.248 linhas), `diretor.html` (4.635 linhas), `PFINS_PROJETO.md` (601 linhas) na pasta do projeto, mais o histórico de decisões desta conversa. Partes marcadas como "não confirmado por SQL direto nesta rodada" devem ser conferidas no Supabase Studio antes de uma reconstrução formal, porque a consulta direta ao banco (`execute_sql`) não respondeu nesta sessão (projeto estava em `COMING_UP`, ou seja, saindo de pausa por inatividade do plano gratuito).

## 1. O que o sistema faz (visão de negócio)

PFINS distribui metas mensais de produtos financeiros (cartões, seguros, empréstimo, assistências como Conecta Carreira/Educa Mais/Viva Mulher etc.) entre as lojas do Grupo Pernambucanas, agrupadas em 13 regionais, cada uma sob um diretor regional identificado por GGL (1 a 13).

Fluxo de negócio, em ordem:
1. O admin (Matheus) lê, todo mês, as bases em Excel exportadas de outros sistemas (histórico de vendas por loja/produto, cadastro de lojas, curva diária de vendas, taxas de aprovação etc.).
2. O sistema calcula a participação histórica de cada loja em cada produto, usando uma janela de 12 meses + 6 meses (média ponderada, dando mais peso a dados recentes — ver seção 5).
3. A meta mensal de cada produto (definida fora do sistema, por regional/total) é distribuída loja a loja proporcionalmente a essa participação histórica, respeitando regras (mínimo por loja, teto, zerar ou não lojas sem histórico etc.).
4. O resultado é publicado no Supabase. Cada diretor regional loga e só vê/edita as metas das lojas da própria regional (campo `justificativa` obrigatório para alterar).
5. O admin consolida as alterações de todos os diretores ("retornos"), com um painel de conferência "Original × alterado" (comparação lado a lado, com filtro por regional).
6. A meta mensal final (original ou alterada pelo diretor, a que valer) é "diarizada": distribuída dia a dia dentro do mês, usando uma curva diária de vendas histórica como peso, com uma regra especial para produtos de meta baixa (ver seção 5).
7. O resultado diarizado é exportado (CSV, Excel, Parquet) para consumo no Power BI.
8. Toda ação relevante do sistema é registrada em auditoria no Supabase.

## 2. Arquitetura

- **admin.html** — aplicação single-file (HTML+CSS+JS embutidos, mais a biblioteca SheetJS para ler/escrever Excel e um escritor próprio de Parquet, sem dependência externa). Ferramenta do administrador: lê bases, calcula, distribui, publica, consolida retornos, diariza, exporta.
- **diretor.html** — aplicação single-file separada, bem mais simples. Login próprio de cada diretor regional, edição restrita à própria regional.
- **index.html** — landing page.
- **privacidade.html** — página de política de privacidade.
- **Backend**: Supabase (Postgres + Auth + Row Level Security + Storage + Edge Functions). Projeto `yvgtkitzyxrzbaydwlcj`, região `sa-east-1`.
- **Deploy**: Vercel, a partir de um repositório git (o usuário faz `git add`/`commit`/`push` manualmente a partir da pasta local; esta sessão nunca empurra para o remoto, só edita os arquivos e orienta o push).
- **Princípio de arquitetura (deliberado, não aceitar sugestão de mudar sem confirmar)**: o cálculo pesado (distribuição, diarização, leitura de Excel) roda inteiramente no navegador do admin. O Supabase serve só para colaboração (diretores editando em paralelo), persistência entre sessões e auditoria — nunca para processar a base inteira no servidor.
- **Sessão compartilhada entre os dois HTMLs**: `admin.html` e `diretor.html` usam a mesma chave de sessão no `localStorage` (`CHAVE_SESSAO = "pfins:sessao"`), compartilhada entre abas da mesma origem — login num reaproveita no outro, se a pessoa tiver permissão.
- **Modo "impersonação" do admin como diretor**: `diretor.html` lê parâmetros de URL (`?comoAdmin=1&ggl=...&regional=...&nome=...`) uma vez no carregamento. Só tem efeito real se o perfil autenticado tiver `papel = "admin"` (a RLS de admin não filtra por GGL sozinha, ele vê tudo; o modo impersonação filtra explicitamente por GGL no cliente para simular a visão do diretor).

## 3. Modelo de dados Supabase (schema `public`)

Tabelas confirmadas por referência direta no código (chamadas `consultar`/`gravar`/`atualizar`/`remover`/`inserirRetornando` do módulo `Nuvem`, em `admin.html` e/ou `diretor.html`):

| Tabela | Usada por | Papel |
|---|---|---|
| `perfis` | admin + diretor | Cadastro de usuários (admin e diretor). Colunas conhecidas: `id` (uuid, = auth.users.id), `papel` (`admin`/`diretor`), `nome`, `chapa`, `email`, `ggl`, `regional`, `ativo` (bool), `admin_master` (bool, hierarquia entre admins), `mfa_dispensado` (bool, adicionada numa rodada — permite pular 2FA obrigatório por conta). RLS: um diretor só vê a própria linha; um admin vê todas (necessário para gerenciar contas) — isso já causou um bug (ver `PFINS_PROJETO.md` rodada 11, "Esta conta não tem permissão de administrador": buscar perfil sem `?id=eq.<uid>` podia trazer a linha de outra pessoa). **Lição**: toda consulta a `perfis` do próprio usuário logado deve filtrar explicitamente por id, nunca confiar em "primeira linha retornada".
| `competencias` | admin + diretor | Uma linha por mês/competência de distribuição. Colunas conhecidas: `id`, `ano`, `mes`, `situacao` (`rascunho`/`aberta`/`fechada` — exibidos na UI como "Rascunho"/"Em andamento"/"Trabalho concluído"), `etapa_maxima` (int, existe na tabela mas não é usada ativamente hoje), `processo_concluido` (bool), `concluida_em` (timestamp), `prazo` (data limite para diretores). Upsert via `on_conflict=ano,mes` com `Prefer: resolution=merge-duplicates,return=representation`. RLS: diretor precisa ver a linha mesmo com `situacao = "fechada"` (para o polling dele detectar a mudança de status) — a política inclui `OR EXISTS (SELECT 1 FROM lojas l WHERE l.competencia_id = competencias.id AND l.ggl = minha_ggl())`.
| `competencias_backups` | admin | Backups da competência (criados por `criar_backup_competencia`, restaurados por `restaurar_backup`), para desfazer publicações problemáticas.
| `produtos` | admin + diretor | Cadastro de produtos financeiros (cartões, seguros, assistências etc.), incluindo DF code. Novo produto (novo DF) herda automaticamente as regras padrão (12M+6M, arredondamento, edição por diretor, diarização por curva) — isso já é dinâmico, confirmado, não precisa de cadastro manual prévio.
| `lojas` | admin + diretor | Cadastro de lojas, com `ggl`/`regional` para RLS filtrar por diretor.
| `metas_loja` | admin + diretor | O coração do sistema: meta por loja × produto × competência. Colunas conhecidas: `meta_calculada` (valor original do cálculo 12M+6M), `meta_alterada` (valor editado pelo diretor, nulo se não alterado), `justificativa` (obrigatória quando `meta_alterada` é preenchida). RLS/trigger: diretor só pode alterar linhas da própria regional e só pode tocar nas colunas `meta_alterada`/`justificativa` (trigger `restringir_colunas_diretor()`, `BEFORE UPDATE`, `SECURITY DEFINER`, levanta exceção se outra coluna mudar — é a solução durável, porque `REVOKE UPDATE` em coluna isolada é revertido silenciosamente pelo Supabase quando o schema muda).
| `metas_diarias` | admin | Meta diarizada (resultado do passo de diarização), por loja × produto × dia. Colunas conhecidas: `cod`, `df`, `data`, `meta_dia`, `meta_mensal_alterada`, `percentual_dia`. Gravada automaticamente ao diarizar (ver seção 5) e relida ao reabrir uma competência (`carregarDiarizacaoSalva()`) para reconstruir a tela sem precisar refazer o cálculo do zero.
| `curva_diaria` | admin + diretor | Curva de distribuição diária histórica (peso de cada dia do mês), usada como base para diarizar. Colunas conhecidas: `data`, `meta`, `selecionado` (bool, indica se aquele dia está marcado para receber meta), `competencia_id`. RLS: diretor só lê a curva da competência que estiver `aberta` (corrigido numa rodada de segurança — antes qualquer diretor lia a curva de qualquer competência, inclusive rascunho/fechada).
| `config_seguranca` | admin + diretor | Linha única (`id boolean primary key default true check (id)`, padrão de "tabela singleton" usado no projeto). Coluna `timeout_inatividade_minutos` (10/20/60, com CHECK). Leitura liberada para qualquer autenticado; escrita só admin (via `sou_admin()`).
| `config_visual` | admin | Linha única (`id = 1`), guarda preferências globais como `modo_offline_ativo` (bool) e o logo da empresa.
| `auditoria` | admin + diretor | Log de eventos (`registrar()`/`registrarAuditoria()`), toda ação relevante grava aqui: login, leitura de bases, publicação, alteração de meta, mudança de 2FA, limpeza de backups etc.
| `tentativas_login` | admin | Histórico de tentativas de login (para bloqueio por força bruta, função `bloqueado_por_tentativas(p_email)`).
| `sessoes_admin` | admin | Sessões de trabalho do admin (inseridas via `inserirRetornando`), não confundir com a pasta local "sessoes" (ver seção 6) nem com a sessão de autenticação do Supabase.
| `entregas` | admin + diretor | Registro de que um diretor "entregou"/confirmou as alterações da própria regional (RPC `entregar_regional`).

Não confirmado por SQL direto nesta rodada (confirmar tipos exatos e constraints no Supabase Studio antes de recriar): tipos de coluna exatos, índices, e se existem outras colunas além das listadas acima — a lista vem de referências no código JS, não de uma leitura direta do `information_schema`.

### Funções do banco (`SECURITY DEFINER`, schema `public`)

- `sou_admin()` — retorna se o usuário logado é admin. Seguro por design: só devolve dado do próprio usuário.
- `minha_ggl()` — retorna o GGL do usuário logado (diretor).
- `meu_perfil()` — retorna a linha de `perfis` do próprio usuário logado.
- `vincular_perfil(...)` — liga uma conta de autenticação a um perfil. **Histórico de segurança**: numa rodada anterior, essa função não conferia nenhuma permissão e tinha `EXECUTE` liberado por padrão para `anon`/`authenticated` via a role `PUBLIC` do Postgres (qualquer função nova ganha esse grant por padrão; revogar de `anon`/`authenticated` nominalmente NÃO basta, porque as duas roles herdam de `PUBLIC` — é preciso `REVOKE EXECUTE ... FROM PUBLIC` explicitamente). Isso permitia qualquer pessoa na internet se autopromover a admin chamando a função direto via REST, sabendo só um e-mail já cadastrado. Corrigido: `REVOKE EXECUTE FROM PUBLIC` + checagem `sou_admin()` interna. **Lição de arquitetura**: toda função `SECURITY DEFINER` nova precisa, na mesma migration, revogar `EXECUTE` de `PUBLIC` e checar explicitamente a permissão de quem chama.
- `entregar_regional(p_competencia bigint, p_justificativa text)` — diretor confirma a entrega das alterações da própria regional; valida prazo/situação da competência. Havia uma sobrecarga antiga de 1 argumento (sem `p_justificativa`) que pulava essa validação — removida.
- `criar_backup_competencia(p_competencia bigint, p_motivo text)` / `restaurar_backup(p_backup_id bigint)` — snapshot e restauração de uma competência.
- `validar_meta()` — trigger de validação em `metas_loja` (provavelmente `BEFORE INSERT/UPDATE`, não confirmado em detalhe).
- `carimbar_alteracao()` — trigger que marca quem/quando alterou uma linha.
- `restringir_colunas_diretor()` — trigger `BEFORE UPDATE` em `metas_loja` que impede o diretor de alterar qualquer coluna além de `meta_alterada`/`justificativa`.
- `travar_distribuicao_unica()` — trigger que garante só uma competência `aberta` por vez (regra de negócio: não iniciar nova distribuição com a anterior em andamento).
- `bloqueado_por_tentativas(p_email text)` — checa se um e-mail está temporariamente bloqueado por excesso de tentativas de login.

### Edge Function

- `gerenciar-mfa` (deployada, v9 na última rodada confirmada) — roda com privilégio de service role para ações administrativas de conta que o cliente não pode fazer com a chave pública: listar contas (`listar_contas`), resetar 2FA/senha de outra pessoa, ativar/inativar conta, e `definir_mfa_dispensado` (permite a um admin dispensar a obrigatoriedade de 2FA de uma conta). Regra de hierarquia: mexer na conta de OUTRO admin só o admin master pode; com diretores ou na própria conta, qualquer admin ativo pode.

### Storage

- Bucket `pfins-bases` (privado). Espelho de backup das bases Excel lidas pelo admin (não é a fonte de verdade — a fonte é a pasta local do admin e o próprio banco). Política `pfins_bases_admin_all`: `cmd ALL`, só para `perfis` com `papel = 'admin' AND ativo`.
- Upload: `enviarArquivoStorage()` — `POST /storage/v1/object/pfins-bases/<caminho>`, caminho = `<competência AAAAMM>/<chave>_<nome original>`.
- Listagem: `listarArquivosStorage(prefixo)` — `POST /storage/v1/object/list/pfins-bases`.
- Download: por link assinado de curta duração (`criarUrlAssinadaStorage()`, `POST /storage/v1/object/sign/pfins-bases/<caminho>`, `expiresIn` padrão 60s) — decisão deliberada de não usar o token de sessão (que ficaria válido o resto da sessão) para reduzir a janela de exposição de um link copiado/compartilhado por engano.
- Limpeza: `apagarArquivosStorage()` (`DELETE /storage/v1/object/pfins-bases`, recebe lista de caminhos) — só manual, com dupla confirmação na UI, localizando backups de competências (pastas nomeadas `AAAAMM`) mais antigas que um limite escolhido (6/12/24 meses).
- **Decisão histórica importante**: o sistema teve, por uma rodada, criptografia ponta a ponta client-side (AES-256-GCM + PBKDF2, Web Crypto API, senha só na memória do navegador) para esse backup. Foi revertida porque o risco de perda irreversível de dado (senha esquecida = backup permanentemente inacessível) não compensava, já que esse bucket nunca foi a fonte de verdade. **Não reintroduzir essa criptografia sem confirmar explicitamente com o usuário** — é uma decisão de produto, não só técnica.

## 4. Autenticação e segurança

- Login por e-mail/senha (substituiu um esquema antigo de chapa+senha). Domínio padrão sugerido no cadastro: `@pernambucanas.com.br` (campo continua editável).
- 2FA obrigatório (TOTP, QR code, qualquer app autenticador — Google Authenticator, Authy etc.) no primeiro login, **exceto** contas com `mfa_dispensado = true` (dispensa configurável por um admin, por conta).
- Hierarquia entre admins: existe o conceito de "admin master". Ações sensíveis sobre a conta de OUTRO admin (resetar 2FA/senha, inativar, dispensar 2FA) só o admin master pode fazer; sobre diretores ou a própria conta, qualquer admin ativo pode.
- Timeout de inatividade configurável (10/20/60 minutos, `config_seguranca`), aplicado tanto no admin quanto no diretor — desloga automaticamente, sem repetir o 2FA no mesmo dia (só se for outro dia ou saída manual).
- Bloqueio por tentativas de login (`bloqueado_por_tentativas`), histórico em `tentativas_login`.
- RLS ativada e revisada em todas as tabelas; cada diretor só enxerga a própria regional (perfis, lojas, metas, entregas).
- Pendência conhecida e deliberada: "Leaked Password Protection" (checagem contra senhas vazadas via HaveIBeenPwned, nativa do Supabase Auth) está **desligada** e **bloqueada por plano** (só disponível no plano Pro do Supabase; o projeto está no Free). Alternativa aplicada enquanto isso: aumentar o comprimento mínimo de senha e exigir "Lowercase, uppercase letters, digits and symbols" nas políticas de senha do Supabase Auth (ação manual no painel, fora do alcance das ferramentas de automação usadas aqui).
- Erro de sessão inválida do GoTrue ("Session from session_id claim in JWT does not exist") tratado de forma central: o token local é descartado automaticamente e aparece uma mensagem clara pedindo novo login, em vez do erro técnico cru.

## 5. Regras de cálculo (o "cérebro" do sistema)

- **Participação histórica (12M+6M)**: cada loja tem sua participação em cada produto calculada a partir de uma janela de 12 meses mais 6 meses de histórico (média ponderada dando mais peso a dados recentes — a lógica exata de peso entre as duas janelas está implementada em `admin.html`, não extraída linha a linha nesta rodada; conferir a função de cálculo de participação diretamente no código ao reimplementar).
- **Distribuição de meta**: a meta mensal do produto (definida fora do sistema) é distribuída loja a loja proporcionalmente à participação histórica, respeitando: total travado (soma exata, sem sobra/falta), percentual mínimo para lojas sem justificativa, teto por loja, opção de permitir zerar loja sem histórico.
- **Edição pelo diretor**: só `meta_alterada` + `justificativa` (nunca `meta_calculada`), via trigger no banco (`restringir_colunas_diretor`), não só por UI.
- **Diarização**: a meta mensal (a alterada pelo diretor, se existir; senão a calculada original — essa é a regra de prioridade, aplicada tanto no cálculo quanto na hora de reconstruir a tela ao reabrir uma competência) é distribuída dia a dia dentro do mês usando a curva diária (`curva_diaria`, peso percentual por dia, só dias com `selecionado = true` recebem meta) como peso.
- **Regra de diarização por produto de meta baixa**: produtos com meta mensal baixa relativa ao valor unitário (ex.: meta de R$ 64,95/mês num produto de R$ 12,99) gerariam fração de unidade em quase todo dia se seguissem a curva percentual pura. A tela avalia isso **depois** de aplicar a curva diária (ordem importante — já foi motivo de confusão numa rodada: a lógica de cálculo sempre esteve correta, o bug real era só a ordem VISUAL dos painéis na tela, "Curva diária" tinha que aparecer antes de "Regra de diarização por produto") e oferece ao admin opções de redistribuição concentrada (do dia de maior % para o menor, até fechar a meta do produto, ou do início do mês até fechar).
- **Exportação**: CSV, Excel (via SheetJS) e **Parquet** (escritor próprio em JS puro, um único row group, codificação PLAIN, sem compressão, colunas sempre `REQUIRED` — implementado do zero porque não há biblioteca de Parquet para navegador adequada; não implementa dicionário, múltiplos row groups, colunas opcionais/repetidas nem estatísticas). Destino: Power BI.

## 6. Fluxo de telas do `admin.html`

Assistente em etapas (`var ETAPAS`, variável de estado `estado.etapa`, cada etapa só libera a próxima depois de concluída — `estado.etapasLiberadas`):

| # | Etapa | Conteúdo |
|---|---|---|
| 0 | Configurações | Logo, pasta de trabalho, pastas das bases, preferências, auditoria (hoje vive num menu/modal fora do fluxo principal, não mais na etapa 0 crua) |
| 1 | Bases | Competência (mês/ano), bases da competência, o que foi lido |
| 2 | Produtos | Produtos/histórico/mínimos, input de CPF, taxa de aprovação, produtos especiais (PRIME, PP, GERF) |
| 3 | Distribuição | Resultado da distribuição |
| 4 | Análise | Análise dinâmica |
| 5 | Arquivos de alteração | Regras de alteração, acesso dos diretores (modo offline opcional), publicação online, backups, histórico, arquivos offline |
| 6 | Retornos | Retornos dos diretores, painel "Original × alterado" (com filtro por regional) |
| 7 | Diarização | Curva diária (primeiro) → Regra de diarização por produto (depois) |
| 8 | Exportação | Arquivos finais (Power BI, conferência/auditoria) |
| 10 | Meta diarizada | Meta diarizada por loja (reconstruída do Supabase ao reabrir, sem precisar refazer o cálculo) |
| 9 | Memória de cálculo | Passos do cálculo (ordem de exibição real na trilha é 0..8, 10, 9 — a etapa 9 aparece visualmente por último, mas numericamente antes da 10, isso é proposital no array `ETAPAS`) |

Dois fluxos de entrada distintos, com a trilha de etapas FILTRADA conforme a intenção (`estado.intencaoCarregamento`: `"nova"`, `"continuar"` ou `"consultar"`):

- **Nova distribuição**: só mostra as etapas 1 a 4. Ao final da etapa 4 existe um botão "Salvar e continuar depois" que grava tudo (situação "rascunho") e volta à tela inicial. As etapas 5 em diante não aparecem nesse fluxo — regra de disciplina deliberada, para não deixar o admin avançar demais numa distribuição ainda incompleta.
- **Continuar em andamento / Consultar**: só mostra a partir da etapa 5, mas **renumerada visualmente como 1, 2, 3...** (a numeração real por baixo não muda, só a exibição). Só é permitido entrar nesse modo se as etapas 1-4 já tiverem sido salvas antes; senão, o clique é bloqueado com mensagem explicando o que falta.

Telas de nível mais alto (ids principais): `telaAcesso` (login), `telaMfa` (código 2FA no login), `telaMfaObrigatorio` (forçar ativação de 2FA), `telaTrocarSenha`, `telaEscolha` (escolher nova distribuição / continuar / consultar), `telaFase2` (lista de competências), `telaApp` (o assistente de etapas em si).

Exibição de situação da competência (valor no banco nunca muda, só o rótulo): `aberta` → "Em andamento"; `fechada` → "Trabalho concluído"; `rascunho` → "Rascunho".

## 7. Fluxo de telas do `diretor.html`

Muito mais simples: login (e-mail/senha + 2FA, mesmas regras do admin), tela única de edição das metas das próprias lojas (filtradas por GGL via RLS), campo de justificativa obrigatório ao alterar uma meta, botão de "entregar" (RPC `entregar_regional`) que valida prazo/situação da competência.

## 8. Convenções de produto e estilo (para manter ao replicar)

- Português do Brasil em toda a interface.
- HTML single-file (tudo embutido: CSS, JS, bibliotecas) — decisão deliberada para rodar offline/sem build.
- Nomenclatura de funções e variáveis em português no código-fonte (ex.: `desenharTrilha`, `salvarEContinuarDepois`, `espelharBasesNoSupabase`).
- Qualquer ação relevante chama `registrar(evento, detalhe)` para log de auditoria.
- Qualquer tabela "singleton" (uma linha só, config global) usa o padrão `id boolean primary key default true check (id)` ou `id = 1` fixo.
- Qualquer trigger que precise restringir colunas usa `BEFORE UPDATE ... SECURITY DEFINER` levantando exceção — nunca `REVOKE` de coluna isolada (é revertido silenciosamente pelo Supabase).
- Qualquer função `SECURITY DEFINER` nova precisa, na mesma migration, `REVOKE EXECUTE ... FROM PUBLIC` + checagem explícita de permissão (`sou_admin()` ou equivalente) — não confiar em revogar só de `anon`/`authenticated`.

## 9. Pendências conhecidas (ao fechar este documento)

- Schema exato (tipos de coluna, constraints, índices) não confirmado por consulta SQL direta nesta rodada — o projeto Supabase estava saindo de pausa (`COMING_UP`) no momento da geração deste documento. Reconfirmar com `select * from information_schema.columns where table_schema = 'public'` antes de uma reconstrução formal.
- "Leaked Password Protection" continua desligada (bloqueada pelo plano Free do Supabase).
- Item de criptografia ponta a ponta no backup foi implementado e depois revertido — não reintroduzir sem alinhar de novo com o usuário.
- A lógica exata da janela de ponderação 12M+6M (quanto peso cada um dos dois períodos recebe) está no código de `admin.html`, não foi extraída função por função nesta rodada — ler diretamente o código-fonte ao reimplementar essa parte.

## 10. Como outra IA deveria abordar uma reconstrução do zero

1. Ler este documento inteiro primeiro para entender o propósito e as decisões de arquitetura já tomadas (não as questionar sem motivo novo).
2. Ler `PFINS_PROJETO.md` para o histórico cronológico completo de decisões, bugs corrigidos e por quê (evita reintroduzir bugs já resolvidos, como o de RLS em `perfis` ou o de `vincular_perfil`).
3. Recriar o schema Supabase a partir da seção 3 acima, confirmando tipos exatos no projeto vivo (se tiver acesso) antes de gerar migrations.
4. Recriar as funções/triggers da seção 3, respeitando as convenções da seção 8 (principalmente o `REVOKE EXECUTE FROM PUBLIC`).
5. Recriar `admin.html` e `diretor.html` como arquivos únicos, seguindo o fluxo de etapas da seção 6/7 e as regras de cálculo da seção 5.
6. Nunca mover o cálculo pesado para o servidor — é uma decisão de arquitetura deliberada, não um detalhe de implementação.
