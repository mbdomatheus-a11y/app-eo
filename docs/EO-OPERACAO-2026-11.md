# Operação EO

Entrega de 7 de novembro de 2026.

## Navegação e administração

O menu Mais do app agrupa Vendas, Pessoas e rotina, Comunicação e Geral. Pessoas têm busca e filtros no servidor com páginas de 30. Lojas usam busca, situação, UF, regional e paginação. O seletor de lojas preserva a seleção entre filtros, com ações para selecionar todas, adicionar ou remover o filtro atual.

Todos os administradores ativos gerenciam lojas e usuários, inclusive perfil Administrador. Arquivar é reversível. Ações sobre o próprio acesso são bloqueadas para evitar perda da administração. A chapa de contas existentes identifica o login e permanece imutável. Alterações individuais de associação substituem os vínculos importados daquela pessoa.

## Venda semana, mês e ano

Administradores publicam HTML ou ZIP de até 10 MB e 100 entradas. O ZIP deve ter index.html ou um único HTML principal. CSS, imagens e fontes locais são incorporados em um arquivo autocontido, guardado no bucket privado eo-sales-html. A publicação tem abrangência por loja e pode ser arquivada ou restaurada.

O visualizador é estático e isolado. JavaScript, navegação externa e navegação entre vários HTMLs ficam bloqueados. Relatórios que montam dados por scripts, JSON ou serviços externos precisam da amostra real para adaptação. Nenhum relatório real foi fornecido nesta entrega.

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
