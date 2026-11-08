# Operação EO

Entrega de 7 de novembro de 2026.

## Navegação e administração

O menu Mais do app agrupa Vendas, Pessoas e rotina, Comunicação e Geral. Pessoas têm busca e filtros no servidor com páginas de 30. Lojas usam busca, situação, UF, regional e paginação. O seletor de lojas preserva a seleção entre filtros, com ações para selecionar todas, adicionar ou remover o filtro atual.

Todos os administradores ativos gerenciam lojas e usuários, inclusive perfil Administrador. Arquivar é reversível. Ações sobre o próprio acesso são bloqueadas para evitar perda da administração. A chapa de contas existentes identifica o login e permanece imutável. Alterações individuais de associação substituem os vínculos importados daquela pessoa.

## Venda semana, mês e ano

Administradores publicam HTML ou ZIP sem limite artificial de bytes no EO, mantendo até 100 entradas no ZIP. O bucket eo-sales-html herda o limite global do Supabase, que no Free pode chegar a 50 MB por arquivo. Memória e armazenamento continuam finitos. O ZIP deve ter index.html ou um único HTML principal. CSS, imagens e fontes locais são incorporados em um arquivo autocontido, guardado no bucket privado eo-sales-html. A publicação tem abrangência por loja e pode ser arquivada ou restaurada.

A amostra semanal recebida em 08/11 tem 43.773.370 bytes e 71.676 registros em JSON RAW, 467 lojas e quatro níveis de subtotais. O parser reconhecido extrai somente JSON, sem executar scripts, e importa lotes de 500 linhas com idempotência. Dados estruturados são consultados com escopo por loja no servidor, filtros, ordenação e paginação. O HTML original estruturado fica restrito aos admins; clientes com escopo recebem só suas linhas. Totais consideram um nível por vez para evitar duplicação.

HTMLs desconhecidos continuam em prévia estática isolada. JavaScript, navegação externa e navegação entre vários HTMLs ficam bloqueados. APIs meteorológicas externas do arquivo não são executadas. O período da amostra é contraditório: título Agosto/2026, D1 em setembro e rótulo semanal em outubro/novembro; a publicação exige confirmação do título e período. Mensal/anual usarão o mesmo parser se trouxerem RAW com o mesmo esquema, sem presumir que todo HTML é compatível.

## Diário e sentimento

Diário registra loja, pessoa, data, resultado, motivos e relato. A gravação para em até um minuto e ao sair do app. Cada envio intencional cria um registro, com identificador de solicitação para evitar duplicar retransmissões. Arquivos de áudio ficam no bucket privado eo-day-audio.

A pergunta Como está seu dia? oferece bem, mais ou menos e difícil. O administrador ativa ou desativa o envio e escolhe horário no fuso America/Sao_Paulo. O agendamento começa desativado. Um convite por pessoa e dia evita duplicação de disparos, mas a pessoa pode responder várias vezes.

Diretor acessa sua abrangência; admin acessa toda a operação; demais perfis veem seus próprios registros. O banco calcula consolidações por loja/regional. Listas são paginadas e a exportação CSV percorre páginas com um corte temporal fixo. Os totais representam registros e também informam lojas/pessoas distintas.

## Anthropic

Segredo de produção ANTHROPIC_API_KEY. Modelo configurável por ANTHROPIC_MODEL, inicialmente claude-haiku-5-5. A chave fica no Supabase.

summarize-operations consulta registros autorizados no servidor e envia totais completos e até 100 relatos recentes à API Messages da Anthropic. O resumo identifica a limitação de amostra e é gravado em eo_ai_summaries. O teste de conexão consulta apenas a disponibilidade do modelo.

A API Messages documenta texto/imagem, sem entrada de gravações de áudio. A transcrição está pendente de um motor compatível. Áudio continua podendo ser gravado e salvo; não é enviado à Anthropic como se fosse texto.

## Validação e distribuição

Migrações 202611070001 a 004. Testes SQL de permissões, escopo, regional/GGL, múltiplos registros, retransmissão, paginação e totais usam fixtures revertidas. Os testes do pacote HTML cobrem caminhos, dependências, limites e ZIPs inválidos.

expo-audio, react-native-webview e expo-sharing acrescentam componentes nativos. A primeira instalação desta versão requer nova build. Alterações futuras compatíveis podem ser agrupadas por atualização remota.

Para testar push físico, o usuário precisa instalar a versão compatível, entrar e ativar notificações em Meu aparelho. Um aceite do Expo não comprova exibição no celular. Antes desta entrega o banco não tinha dispositivos registrados.

Atualização de 08/11: migrações 202611080001 e 002 removem teto artificial do relatório e adicionam tabelas estruturadas auditáveis. Builds anteriores d5f1595 concluídas: iOS run 42440035123 e Android APK 42440051157. Estas alterações de JavaScript não adicionam bibliotecas nativas.

Validação da continuação: 16 testes passaram, incluindo o HTML local de 43.773.370 bytes. Teste SQL de vendas estruturadas passou em produção com fixtures revertidas e metadados de 44 MB. Checagens web, TypeScript mobile e bloqueio de visitantes passaram. A amostra é só referência de formato e não foi publicada como semana real.

Publicação: commit funcional 19f2e5f; correção de empacotamento web 18ec625 exclui testes locais da compilação do portal. Site pronto em app-eo.vercel.app. Atualizações OTA production publicadas pela sessão local autorizada, sem nova build: iOS grupo 265eaf9f-833d-44b8-92f6-047d4aad5c6d (runtime f7a7a320412d9f2b04426a916ff93313a388fc01); Android grupo 1341e5c3-6e03-44f6-94e0-df0ed0aab561 (runtime 90aba83bd6aef64c6b5eea2ee6ef59158d627833). Compatibilidade depende do runtime instalado. A entrega OTA pelo GitHub ainda requer EXPO_TOKEN no ambiente eo-production; runs 42470756036 e 42470799192 falharam por ausência desse segredo. Nenhum token foi criado ou armazenado automaticamente.
