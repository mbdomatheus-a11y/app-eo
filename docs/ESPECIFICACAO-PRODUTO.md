# EO Excelência Operacional: Especificação do Produto

Documento de especificação para desenvolvimento. Consolida tudo o que foi definido com o responsável pelo produto. Ao final há um checklist de conferência. Regra geral: nada deve ser implementado de forma diferente do que está descrito aqui sem validação prévia.

## 1. Visão geral

O EO (Excelência Operacional) é um aplicativo que centraliza a comunicação e as ferramentas entre o escritório central e as lojas. Contexto inicial: Grupo Pernambucanas, cerca de 10 mil colaboradores em 467 lojas, cada uma com um gerente. Áreas do escritório que falam com as lojas: jurídico, TI, RH, Desenvolvimento de Vendas (a área que faz a ponte entre loja e escritório), engenharia, facilities, marketing e comercial.

Objetivo: ser um canal direto e um hub de funcionalidades, onde o gerente abre o app e resolve a vida dele em um único lugar, sem comunicações difusas em vários canais.

Siglas da empresa: CDA é o Centro de Distribuição de Araçariguama. IEC é o escritório central.

## 2. Princípios de produto

- Simplicidade primeiro: o gerente de loja não tem tempo para descobrir coisas. Menu simples e fácil de navegar.
- Escalável a dezenas de funcionalidades, de 3 ou 4 hoje a possivelmente 50.
- Barra de busca fixa no topo: digitar o nome de um módulo abre o módulo. Módulos ainda não liberados não aparecem.
- Barra de navegação inferior com cinco itens. O botão central é sempre a ação principal do contexto (por exemplo, criar checklist para quem gere, responder para quem responde). Só os cinco atalhos mais usados ficam na barra; o resto vem pela busca e por um menu completo.
- Benchmark de UX com os melhores apps de mercado: uma ação principal por tela, com o botão de destaque sempre no mesmo lugar; controle certo para cada tipo de dado (seletor para poucas opções excludentes, mostrando só a escolha atual; interruptor para liga e desliga; caixas de marcação para múltipla escolha; campos com máscara para chapa, data e telefone); informação resumida, com detalhes recolhidos até o usuário pedir; alvos de toque grandes; feedback imediato ao salvar, sem telas extras. Exemplo de problema atual a corrigir: a preferência de contato exibe quatro campos abertos, quando deve ser um seletor.
- Acessibilidade desde a fase 1: fonte ajustável, bom contraste, botões grandes e modo de baixo consumo de dados.
- Todo módulo é ativável ou desativável por empresa. Módulo desativado não aparece no menu nem na busca.
- O admin pode editar e sobrepor qualquer resposta ou dado, em qualquer módulo, como se fosse o próprio usuário. A resposta fica marcada como alterada pelo admin, e tudo vai para o log.
- Salvamento automático e discreto em todo preenchimento, sem pop-up de salvando, apenas um indicador sutil.

## 3. Plataformas

- Acesso por navegador web, aplicativo Android e aplicativo iOS, para todos os perfis.
- Algumas funções podem ficar restritas à web, definidas durante a construção, por performance (por exemplo, exportar tabelas em Excel). Funções que dependem de geolocalização usam o aplicativo.
- A administração é feita em um portal web separado, em endereço próprio, com relatórios, dashboards, configurações e personalizações. O admin também acessa o app para resolver o essencial pelo celular.

## 4. Arquitetura e multiempresa

- Código base único, com banco de dados separado por empresa e configurações de marca e módulos por cliente.
- Escala prevista: até 100 mil usuários por empresa, com possibilidade de crescer a um milhão no total entre clientes.
- O produto será comercializado para outras empresas no futuro. Tudo que é particular da Pernambucanas deve ser configurável ou ativável por módulo.
- Armazenamento de imagens e arquivos: na fase 1 no ambiente atual, mas com o banco guardando apenas a referência de cada arquivo, para permitir migração futura para armazenamento de objetos (object storage) na fase 2. Fotos comprimidas e redimensionadas no celular antes do envio. Política de retenção em camadas: recente em acesso rápido, depois armazenamento frio, depois exportação e exclusão, com prazo definido pela empresa e pelo jurídico, e a exclusão sempre registrada no log permanente.
- Integração futura com Microsoft OneDrive e Active Directory (AD), automatizando a gestão de acessos, inclusive suspensão automática por afastamento ou desligamento via RH.

## 5. Perfis, acesso e autenticação

### 5.1 Perfis

Colaborador, gerente de loja, gerente apoio, diretor regional, áreas do escritório, centro de distribuição, administrador (admin) e administrador master. Cada perfil tem uma visão diferente do app.

### 5.2 Cadastro

Nesta fase, por planilha Excel com: chapa (código único da empresa), nome, cargo, unidade de alocação, e e-mail opcional. O colaborador de loja não tem e-mail, só chapa, nome e cargo. Campos de data de nascimento e data de admissão previstos (a admissão virá da base do RH quando disponível).

### 5.3 Perfil único com vínculos alternáveis

A pessoa é um cadastro único, identificado pela chapa, com vários vínculos. Cada vínculo define o papel, a unidade ou loja e sobre quais pessoas ou lojas há gestão. Exemplo: o gestor de uma loja compartilhada que também gere o gestor dessa loja. No Excel, uma linha por vínculo, repetindo a chapa. Na tela, uma única senha e um seletor no topo para alternar entre vínculos, sempre mostrando de forma bem visível em qual vínculo a pessoa está. Não há visão consolidada de todos os vínculos nesta fase. O log registra sempre o vínculo usado. Dentro de um papel, a gestão de equipe é em massa (ver 5.5).

### 5.4 Primeiro acesso e senhas

- Cascata de ativação: o admin ativa qualquer conta e libera os diretores regionais; o diretor regional ativa os gerentes da região; o gerente ativa os colaboradores da loja. Ninguém é habilitado em massa de uma só vez sem essa cascata.
- PIN padrão inicial (valor padrão definido pelo admin) ativado por pessoa. Depois de ativado, o PIN vale por 2 horas. Se não for usado nesse prazo, expira e precisa ser liberado de novo.
- No primeiro acesso: chapa mais PIN, depois validação por data de nascimento, depois cadastro de nova senha, forçada. Também aceitar o termo de uso (ver seção 7).
- Complexidade da senha: colaborador pode ter senha numérica; gerente, diretor e demais perfis exigem letras, números e caractere especial; admin exige no mínimo 12 caracteres com letras, números e caracteres especiais.
- Campo de e-mail digitado duas vezes e guardado, sem envio nesta fase, para uso futuro em autenticação de dois fatores. Autenticação de dois fatores fica prevista no desenho (primeiro por e-mail, no futuro por celular), mas não é ativada agora.
- Bloqueio por tentativas erradas, escalonado: três erros bloqueiam por 5 minutos, o quarto por 15 minutos, o quinto por 1 hora, e no sexto a conta é bloqueada em definitivo até desbloqueio manual.
- Desbloqueio: o usuário bloqueado toca em solicitar desbloqueio. O superior direto ou o admin vê o pedido no portal e libera com um botão. A liberação reabre o PIN padrão por 2 horas e força a troca de senha. A data de nascimento continua como segunda barreira.
- O admin é soberano sobre acessos: ativa o PIN padrão, define senha temporária (com troca forçada) ou senha definitiva, e desbloqueia qualquer conta a qualquer momento.

### 5.5 Gestão em massa

O diretor regional vê seus gerentes em lista com busca e filtros por região ou loja, seleciona um, vários ou todos, e aplica a ação de uma vez (ativar PIN, resetar senha, desbloquear). O gerente faz o mesmo com a equipe da loja. Travas: pop-up de confirmação mostrando quantas pessoas serão afetadas; confirmação reforçada na seleção total (digitar a palavra confirmar); um único registro de auditoria da ação em massa listando todas as contas afetadas.

### 5.6 Admin master

Nível acima do admin comum. Só o admin master acessa a identificação individual das respostas do módulo de sentimento e do histórico de perguntas ao Assistente EO, decide para quais perfis isso é liberado, e pode alterar ciclos fechados de Metas. Exige confirmação extra de senha ao abrir essas áreas.

## 6. Log de auditoria

- Toda ação de qualquer perfil, de colaborador a admin, gera registro: quem fez, quando, de onde e o que mudou, com valor anterior e novo, e o vínculo usado.
- Log somente leitura. Ninguém edita nem apaga, nem o admin master. Só perfis específicos de auditoria consultam.
- Ações em massa geram um registro único listando todas as contas afetadas.
- Consulta a dados individuais sensíveis também é registrada.
- Política de retenção do log a definir com a empresa e o jurídico (LGPD).

## 7. Termos de uso e privacidade

- No primeiro acesso, depois da ativação, o usuário precisa aceitar os termos para entrar. Guardar versão do texto, data e hora do aceite. Se os termos mudarem, exigir novo aceite.
- Conteúdo em linhas gerais: os dados são usados para melhorar processos e modelos internos; as respostas de sentimento não são usadas para identificar nem punir o colaborador; telefone, e-mail e demais dados pessoais são corporativos, ficam restritos à empresa e não são vendidos, repassados nem usados para marketing ou CRM; as perguntas ao Assistente EO são registradas; há rastreio de capturas de tela.
- O texto final deve ser revisado pelo jurídico e por alguém com conhecimento de LGPD, e cada empresa cliente terá o seu próprio termo.

## 8. Segurança do aplicativo

- Telas e campos marcados como sensíveis pelo admin (por exemplo, respostas individuais de sentimento, metas, indicadores financeiros): no Android, bloquear captura e gravação de tela (a tela sai preta). No iOS, detectar captura, esconder o conteúdo durante gravação de tela e espelhamento, avisar o usuário e registrar no log.
- Marca d'água visível discreta em todas as telas com dados: chapa, nome e unidade, em texto pequeno repetido na diagonal, com opacidade muito baixa (em torno de 5 a 8%), sem cobrir botões ou campos de digitação. Modo reforçado, mais visível, apenas em telas sensíveis ou quando o app detecta captura. Intensidade ajustável pelo admin por perfil e por módulo.
- Padrão invisível simples na fase 1: variações mínimas na tela codificando a chapa e a data, recuperáveis por ferramenta de leitura em prints e recortes. Versão avançada, resistente a foto da tela por outro celular e a compressão forte, fica para a fase 2. Não substitui a marca visível nem o log.
- Na web, usar marca d'água e registro de acessos, pois o navegador não bloqueia captura.
- Exportações em Excel levam a identificação de quem baixou. Sessão expira por inatividade, principalmente no portal do admin.
- Bloqueio de palavras sensíveis em todo o app: o admin mantém uma lista de termos bloqueados. O filtro roda em todo campo de texto livre (comentários, ocorrências, pedidos de clientes, perguntas ao assistente). Ao detectar, avisa o usuário para reescrever e registra a tentativa no log, sem gravar o texto ofensivo na base principal. Prever opção de denúncia por quem receber o conteúdo.

## 9. Módulo Checklist (fase 1)

O checklist é a forma de coletar informações das lojas por meio de perguntas. Será uma funcionalidade própria do EO, sem integração com a ferramenta terceirizada atual (Checklist Fácil), e deve ser melhor que ela em experiência e clareza das respostas. Usos: pesquisa de horário de funcionamento (checklist permanente que a loja mantém atualizado), satisfação com limpeza, quantidade de PDVs, dimensionamento de banners de campanha, quantidade de equipamentos, entre outros.

### 9.1 Construção pelo admin

- Estrutura em Etapas e Tópicos (nomes escolhidos para não copiar Área e Subárea do Checklist Fácil). Cada checklist é dividido em etapas, com subcategorias, e dentro delas ficam as perguntas.
- Tipos de resposta: texto, número, sim ou não (botão), escala de carinhas, escala de cores (verde ótimo, amarelo intermediário, vermelho péssimo), foto, arquivo e leitura de código de barras (por exemplo, código de produto ou de ativo fixo).
- Cada pergunta tem um único tipo de resposta, com validação obrigatória para evitar respostas ambíguas: limite de caracteres, quantidade de dígitos (por exemplo, a chapa tem 6 dígitos) e confirmação em duplicidade quando o dado for crítico.
- Alcance: o admin escolhe as unidades (lojas específicas, todas, só lojas, só escritório, escritório e CDA) e o público por cargo (só gerente, só um cargo da loja, todos).
- Duração: horas, dias, semanas, meses, anos ou permanente. No fim do prazo, as respostas parciais são concluídas e consolidadas automaticamente. Em checklist permanente, o admin pode agendar fechamentos periódicos (por exemplo, todo domingo às 23 horas): as respostas são consolidadas e enviadas e o checklist continua aberto.
- Em checklist permanente, o admin escolhe entre modo continuidade (respostas do ciclo anterior aparecem preenchidas e o usuário só atualiza o que mudou) e modo novo ciclo (formulário volta em branco). O histórico de cada ciclo é guardado.
- Geolocalização (fase posterior, mas prevista no desenho): cadastro de unidades com latitude, longitude e raio de tolerância. Por checklist, o admin marca se a resposta só vale dentro da localização da loja.

### 9.2 Resposta pelo usuário

- Salvamento automático e discreto, com indicador sutil de salvo e hora do último salvamento. O usuário pode sair e voltar de onde parou. Botão concluir disponível.
- Histórico: cada usuário consulta as pesquisas que já enviou, somente leitura.
- Só o admin pode devolver um checklist concluído para correção, informando o motivo. O usuário recebe aviso com a justificativa, e o histórico mantém a versão original e a corrigida lado a lado. Tudo no log.

### 9.3 Funções incluídas na fase 1

- Modo offline: o gerente responde sem internet e o app sincroniza depois.
- Lógica condicional: uma resposta abre ou esconde perguntas seguintes.
- Lembretes automáticos para quem não respondeu e painel de acompanhamento por loja e região.
- Modelos reutilizáveis e duplicação de checklists.
- Plano de ação: resposta ruim gera uma tarefa para a loja corrigir, com prazo.
- Pontuação e ranking opcionais, para checklists de avaliação.

### 9.4 Tela de Acompanhamento (diretor regional e gerente)

Por checklist ativo, mostra quantas lojas responderam no prazo, responderam fora do prazo e não responderam, com filtro por loja, região e situação e um resumo no topo com o percentual de adesão da região. Cada loja pendente tem um botão para cobrar com um toque, que dispara um lembrete ao gerente. O gerente tem a mesma visão para a equipe da loja. O admin vê o comparativo entre regiões.

## 10. Módulo Comunicado Obrigatório (fase 1)

- O admin cria o comunicado, escolhe o público por unidade, cargo ou perfil, e define se é só informativo ou se exige uma ação. A pessoa recebe push, e ao abrir o app aparece um aviso em tela cheia que bloqueia o resto até ela confirmar que leu e está ciente.
- Se houver ação, o aviso mostra o prazo e leva direto ao módulo correspondente (por exemplo, um checklist específico). O item só sai da lista de pendências quando a ação for cumprida.
- Níveis de criticidade, escolhidos pelo admin a cada comunicado, sem nível padrão: crítico bloqueia o app; importante aparece como aviso fixo no topo sem bloquear; informativo vai só para a central de avisos.
- Painel para admin e diretores mostra quem leu, quem confirmou e quem não, com cobrança automática por lembretes. Cada confirmação vai para o log, com data e hora, como prova de ciência.

## 11. Módulo Ocorrências do Dia (fase 1)

- Objetivo: capturar eventos qualitativos da loja (chuva forte, caminhão obstruindo a rua, queda de energia por 3 horas) que hoje se perdem em WhatsApp e chat, para explicar resultados de venda depois.
- O gerente toca em um botão, grava um áudio de 30 segundos a 1 minuto (limite configurável pelo admin) e vê a transcrição. Toca em interpretar por IA, e o texto volta estruturado com data, loja, tipo de evento, categoria, subcategoria, duração ou impacto e resumo curto. Ele revisa, ajusta e envia.
- A transcrição do áudio usa um serviço de voz para texto; a IA da Anthropic via API estrutura o texto. A API é usada só no momento do envio. O áudio original pode ser guardado como prova, seguindo a política de retenção.
- Categorias e subcategorias, no estilo de aplicativo financeiro, começam vazias e se constroem com o uso. A IA sugere uma categoria existente e, se nenhuma servir, propõe uma nova, que fica pendente de aprovação do admin para evitar duplicidade de nomes.
- Visão: o gerente vê o histórico da própria loja, o diretor regional vê as lojas da região, e o admin e as áreas de análise veem tudo, com filtros por data, loja e categoria e exportação para planilha.

## 12. Módulo Voz do Cliente (fase 1)

- Objetivo: o gerente registra que um cliente pediu um produto que a loja não tinha (exemplo: calça jeans branca feminina plus size) e recebe retorno das áreas comerciais. Nome sugerido: Voz do Cliente.
- Registro por formulário estruturado ou por áudio, com a mesma mecânica das ocorrências (transcrição, interpretação por IA, revisão, envio). Campos: departamento, categoria do produto, descrição, tamanho, cor, quantidade de pedidos no dia e observação. Departamentos configuráveis por empresa; na Pernambucanas: vestuário, lar têxtil, beleza (fragrâncias e perfumaria) e eletroportáteis.
- Campo opcional de produto de referência: o gerente bipa ou digita o código de barras de um item parecido com o que o cliente quer e descreve o que muda (modelagem, cor, tamanho). Aceita mais de uma referência. Se houver importação da base de produtos (planilha atualizada periodicamente), o app mostra nome e foto; sem ela, guarda o código como referência simples.
- Tratamento como chamado: status recebido, em análise, respondido e concluído, com campo de observação para o comercial devolver retorno. O gerente é notificado a cada mudança.
- Visão: cada área do escritório vê só os departamentos pelos quais responde, o regional vê a região, o admin vê tudo.
- Agrupamento por similaridade, sem IA via API: o sistema normaliza o texto (sem acentos, plural e palavras sem peso), compara dentro do mesmo departamento e categoria e calcula um percentual de similaridade. Acima de um limite ajustável pelo admin (por exemplo, 80%), os pedidos entram no mesmo grupo. O admin mantém uma lista de sinônimos e pode juntar ou separar grupos manualmente, e o sistema lembra as correções. Resultado: ranking de demanda por produto, loja e região. O comercial pode responder a um grupo inteiro de uma vez.

## 13. Módulo Domingos e Feriados (fase 1)

- Objetivo: saber quais lojas abrem em domingos e feriados, para direcionar ações de marketing e campanhas.
- O admin cadastra no calendário os domingos e feriados que exigem resposta. Antes de virar o mês, as datas ficam disponíveis. Para cada data e loja, a resposta é abre ou não abre, com horário de abertura e fechamento quando abrir. Ao virar o mês, as datas sem resposta entram numa lista de pendências. O módulo permite edição.
- Quem responde: o gerente da loja pela própria loja; o gerente apoio e o diretor regional pelas lojas da regional a que estão atribuídos; o admin por qualquer loja. A última resposta vale, com histórico de quem mudou. Cada resposta guarda quem respondeu e quando.
- Dupla validação: cada data pode ter duas rodadas, a de cerca de um mês antes (via checklist) e a de revalidação, cerca de uma semana antes, feita pelo gerente apoio. O sistema guarda as duas, mostra onde a resposta mudou e tem campo de motivo da mudança (por exemplo, autorização do sindicato).
- Lembrete ao gerente da loja ao responder: mostra o horário de funcionamento já informado no módulo de horários e pergunta se confirma ou se aquela data terá horário diferente. Vale só para o gerente da loja, não para apoio, regional ou admin.
- Acompanhamento: gerente apoio e regional veem quem não respondeu; o admin cobra por push ou pelo Comunicado Obrigatório em feriados críticos.
- Painel para o admin: resumo por regional, com quantidade e percentual de lojas que abrem e fecham por data, e histórico guardado para comparar um ano com outro.

## 14. Módulo Como Está o Seu Dia, sentimento (fase 1)

- Objetivo: testar a teoria de que gerentes e lojas motivados vendem mais, cruzando o sentimento com o resultado de vendas.
- Na primeira abertura do dia, aparece um banner discreto, sempre depois dos comunicados críticos e nunca sobre eles. Escala de cinco carinhas, de muito mal a ótimo, estilo NPS, com rótulos leves como Dia difícil, Mais ou menos e Dia ótimo. A resposta é opcional: o usuário pode responder, adiar ou ignorar, e o banner volta no dia seguinte. Quem perdeu o banner acha o módulo pelo menu ou pela busca.
- A primeira resposta do dia é a que vale para análise. Mudanças ao longo do dia ficam guardadas como registros adicionais, sem apagar a primeira.
- Depois de responder, a tela mostra apenas já respondido, sem exibir a carinha escolhida, nem para o gerente nem para o regional.
- Privacidade nesta fase: o gerente vê só o consolidado da loja, acumulado ao longo do tempo. O regional vê o consolidado da regional, incluindo gerentes e ele mesmo. O admin vê os totais. A identificação de quem respondeu o quê é exclusiva do admin master.
- Regra mínima para exibir o consolidado do dia: pelo menos 30% das pessoas da unidade responderam e no mínimo 3 respostas, valendo o que for maior. Abaixo disso, o gestor vê só quantas pessoas responderam.
- No futuro, com termo assinado e respaldo jurídico, o admin master pode liberar a visão hierárquica (regional vê gerente, gerente vê colaborador), e nunca um colaborador vê o outro.
- Cuidado com dado sensível: acesso individual restrito, consulta registrada no log, alinhamento com jurídico e RH sobre LGPD.

## 15. Módulo Metas, produtos financeiros (fase 1, ativável por empresa)

É uma migração nativa de um processo que hoje roda em Excel e em um site já existente. O módulo é muito particular da Pernambucanas e fica desativado para outras empresas. As regras detalhadas, fórmulas, insumos e telas virão em documentação complementar do responsável; este documento fixa o esqueleto.

- Contexto: produtos financeiros são seguros, assistências, ativações de cartão e similares, vendidos nas lojas. A área de Desenvolvimento de Vendas distribui as metas por loja. São mais de 20 produtos.
- Fase de geração: a colaboradora do escritório carrega as bases e os parâmetros do mês (meta total, histórico, taxa de aprovação de cartão, entre outros) e o motor matemático calcula a meta por loja e por produto, com cruzamento de histórico e perfil da loja. Painéis de contravalidação conferem, por exemplo, se a soma das lojas bate com a meta total carregada.
- Tela de configuração do motor matemático para o admin e para a pessoa responsável pelo processo: escolher períodos das médias, janela de histórico por produto e demais parâmetros. Toda alteração de parâmetro vai para o log. O regional não enxerga o modelo, só as metas para devolver.
- Fase Altera: as metas são publicadas agrupadas por regional, com prazo definido (data e hora limite). O diretor regional edita as metas das lojas dele, produto a produto, pelo portal web ou pelo app, com salvamento automático, e confirma cada produto. Regras de edição variam por produto: o admin marca produtos como travados (não editáveis) e pode definir limites por produto. Painel para a colaboradora e o admin mostra quem devolveu, quem está em andamento e quem não começou, com cobrança por push ou Comunicado Obrigatório.
- Fechamento: no prazo, o ciclo fecha e trava. O regional continua vendo como ficou, mas não edita. As metas de ciclos fechados ficam gravadas de forma permanente no banco e ninguém as apaga. Só o admin master pode alterar um ciclo encerrado, manualmente ou em massa por upload de planilha (o modelo de arquivo será desenhado), com motivo obrigatório, log com valor anterior e novo, e sinalização no relatório do ciclo. A versão original do fechamento fica preservada e a alteração do master cria uma nova versão.
- Saída para o Power BI: exportação em arquivo Parquet como caminho inicial e, como objetivo, API com chave de segurança para o Power BI consultar cada mês do Altera. Desenhar os dados desde o início já pensando na API, com cada ciclo mensal identificado.
- Construção nativa desde o início, em vez de embutir o site atual. Depende da documentação detalhada a ser enviada.

## 16. Módulo Escala (fase 1)

O HTML atual da escala será enviado pelo responsável para consolidar as regras. Deve ganhar a identidade visual e o login do EO.

- O gerente monta a escala da loja a partir dos colaboradores da base de usuários. Para cada pessoa define o modelo (6 por 1 ou 5 por 2, configurável pelo admin para outras empresas), dias de folga, horários de entrada e saída, aniversário e início das férias.
- Planejamento semanal, com possibilidade de estender para o mês. O admin define uma data de corte (por exemplo, sábado às 18 horas). Até lá o gerente edita. Passando do corte sem finalizar, a escala é concluída automaticamente e enviada aos colaboradores.
- Ao finalizar, os colaboradores são notificados e os painéis do regional e do admin mostram quantas escalas foram feitas e quais lojas estão pendentes, com cobrança por push.
- Validações na hora: descanso mínimo entre jornadas, folgas obrigatórias, domingos e feriados (pode puxar o módulo Domingos e Feriados) e cobertura mínima por faixa de horário e departamento, definida pelo admin ou regional.
- Visão de cobertura por horário. No celular, o gerente vê quantos colaboradores estão ativos naquele momento, por departamento. Alerta ao gerente quando houver buraco de cobertura, na montagem e durante a semana.
- Salvamento automático, com status rascunho, enviada e fechada. Depois de fechada, só o admin altera, com log.
- Avisos humanizados ao colaborador um dia antes, em horário definido pelo admin: folga e início de férias. O gerente vê na escala quem está de folga ou de férias no dia seguinte.
- Aniversários: mensagem de feliz aniversário ao colaborador e aviso aos gestores. O colaborador vê o dele e os da equipe da loja; o gerente vê os da loja e os gerentes da regional; o regional vê as lojas e os colaboradores da regional e os outros regionais; o admin master vê tudo. Cada pessoa pode ocultar o próprio aniversário no perfil (padrão visível); ao ocultar, ela não aparece nas listas dos gestores e só ela recebe a mensagem.
- Tempo de casa: quando a data de admissão chegar pela base do RH, mostrar o tempo de casa no perfil e parabenizar a cada ano completo, com a mesma regra de visibilidade. Até lá o campo fica previsto e vazio.
- Integração futura com o Lugar de Gente (ERP de RH) por API, trazendo os horários realizados. O sistema cruza planejado contra realizado e gera alertas de desvio, considerando as convenções coletivas de trabalho (CCTs). Fora do escopo agora, mas o desenho deve ter campos para receber o realizado.
- Dados disponíveis por API para o Power BI.

## 17. Módulo Assistente EO, IA (fase 1)

- Botão sempre visível. O usuário pergunta em linguagem natural, por texto ou áudio. O assistente responde só com base nos dados que aquele perfil já tem permissão de ver, hoje e no histórico: o colaborador vê o dele e da equipe da loja, o gerente a equipe da loja, o regional as lojas e colaboradores da regional, o admin a empresa, o admin master tudo. O sistema busca os dados do usuário primeiro e envia à IA só o necessário.
- Controle de custo: limite de perguntas por usuário por dia, limite de tamanho de pergunta e resposta, e painel de consumo para o admin. O módulo é ativável por empresa e pode ser cobrado à parte. O assistente responde só sobre dados e processos do EO e recusa outros assuntos.
- Histórico de perguntas guardado para auditoria e melhoria. O acesso individual é restrito ao admin master, com consulta registrada no log. Gerentes e regionais, se quiserem, veem só estatísticas agregadas dos temas, sem identificar quem perguntou. Deve constar nos termos de uso.

## 18. Módulo Vendas, braço de consulta (fase 1)

- Hoje são gerados toda manhã quatro HTMLs (dia anterior, semana, mês e ano), por loja, e carregados no portal do EO. O app deve receber os dados já estruturados (planilha ou arquivo com indicadores por loja e período) e montar telas próprias para o celular. Extrair números do HTML só como solução provisória.
- Navegação de cima para baixo: resumo com três ou quatro indicadores principais (por exemplo, venda contra meta, atingimento, variação contra o ano anterior) com semáforo de cor, detalhes ao tocar, e seletor simples entre dia anterior, semana, mês e ano.
- Visão: o colaborador e o gerente veem só a loja em que estão alocados; o regional vê todas as lojas da regional, com ranking; o admin vê a empresa toda. O EO é apenas um braço de consulta rápida; o detalhamento fica nas ferramentas de análise.
- Tela de configuração para o admin escolher quais indicadores aparecem, em qual ordem e para qual perfil, indicador por indicador, caso algum número deva ficar só com gerente e acima.
- O Assistente EO pode explicar o número em linguagem simples.

## 19. Fase 2 (fora da fase 1, mas com desenho previsto)

- Armazenamento de imagens e arquivos em object storage, com política de retenção em camadas.
- Módulo de chamados e manutenção: já existe plataforma própria na empresa. Discutir pouco por enquanto.
- Treinamento e onboarding: a Unidigi (universidade digital) cobre por enquanto. Depois, onboarding por passos no app.
- Rotinas operacionais: abertura de loja, fechamento de tesouraria e a Ronda 10 do VM (dez passos de visual merchandising), em formato de checklist rápido, sem prazo de resposta. Desenhar junto com o onboarding.
- Mural de comunicados e central de documentos, manuais e políticas: desenhar, mas entra na fase 2, pois já existe ferramenta para isso.
- Marca d'água invisível avançada, resistente a foto da tela por outro celular e compressão forte.
- Geolocalização por checklist.
- Integrações: Active Directory e OneDrive, Lugar de Gente (realizado da escala), autenticação em dois fatores.

## 20. Pendências e informações que ainda virão

- Documentação detalhada do módulo Metas (regras, fórmulas, insumos, telas, regras de edição por produto).
- HTML atual da escala, com as regras de planejamento.
- Política de retenção de arquivos e de logs, definida com o jurídico e a empresa.
- Texto final dos termos de uso, revisado pelo jurídico, com LGPD.
- Modelo de arquivo para alteração em massa de metas após o fechamento, a desenhar.
- Base de produtos para o campo de produto de referência da Voz do Cliente, se houver importação.

## 21. Checklist de conferência

Marque cada item quando estiver implementado e testado.

### Fundação

- [ ] Barra de busca no topo; módulos não liberados não aparecem
- [ ] Barra inferior com cinco itens e botão central de ação principal
- [ ] Padrões de UX aplicados (seletor, interruptor, máscara, informação resumida, alvos grandes)
- [ ] Acessibilidade: fonte ajustável, contraste, botões grandes e modo de baixo consumo de dados
- [ ] Acesso por web, Android e iOS, e portal admin web separado
- [ ] Todo módulo ativável e desativável por empresa
- [ ] Código único, banco separado por empresa e marca e módulos configuráveis por cliente
- [ ] Arquivos referenciados no banco, preparados para object storage
- [ ] Salvamento automático e discreto em todo preenchimento
- [ ] Admin pode editar e sobrepor qualquer dado, com marcação e log

### Acesso e segurança

- [ ] Cadastro por planilha, com e-mail opcional e uma linha por vínculo
- [ ] Perfil único com vínculos alternáveis e seletor sempre visível
- [ ] Cascata de ativação (admin, regional, gerente, colaborador)
- [ ] PIN com validade de 2 horas e troca de senha forçada
- [ ] Validação por data de nascimento no primeiro acesso
- [ ] Regras de senha por perfil (numérica, complexa, admin com 12 caracteres)
- [ ] E-mail digitado duas vezes e guardado; dois fatores previsto no desenho
- [ ] Bloqueio escalonado por tentativas e solicitação de desbloqueio
- [ ] Admin soberano: PIN, senha temporária, senha definitiva e desbloqueio
- [ ] Ações em massa com as três travas
- [ ] Admin master com confirmação extra de senha
- [ ] Log de auditoria completo, somente leitura, com valor anterior e novo
- [ ] Termos de uso no primeiro acesso, com versão, data e novo aceite quando mudar
- [ ] Bloqueio de captura no Android e detecção no iOS em telas sensíveis
- [ ] Marca d'água visível discreta e modo reforçado
- [ ] Padrão invisível simples
- [ ] Lista de palavras bloqueadas em todo texto livre, com log e denúncia
- [ ] Sessão expira por inatividade; exportações identificam quem baixou

### Módulos

- [ ] Checklist: etapas e tópicos, todos os tipos de resposta, validações, alcance, duração, ciclos e modos continuidade e novo ciclo
- [ ] Checklist: histórico, devolução pelo admin, offline, lógica condicional, lembretes, modelos, plano de ação, pontuação
- [ ] Tela de Acompanhamento para regional e gerente, com cobrança em um toque
- [ ] Comunicado Obrigatório com três níveis escolhidos a cada comunicado e painel de ciência
- [ ] Ocorrências do Dia: áudio, transcrição, interpretação por IA, categorias com aprovação do admin, visões por perfil
- [ ] Voz do Cliente: formulário e áudio, produto de referência por código de barras, status, agrupamento por similaridade e resposta em grupo
- [ ] Domingos e Feriados: calendário, dupla validação, lembrete de horário, pendências, painel e histórico anual
- [ ] Como Está o Seu Dia: banner, primeira resposta vale, já respondido, consolidado com regra mínima, identificação só pelo master
- [ ] Metas: geração, configuração do motor, Altera com prazo, regras por produto, fechamento permanente, alteração só pelo master, Parquet e API
- [ ] Escala: planejamento semanal e mensal, data de corte, validações, cobertura, avisos de folga e férias, aniversários e tempo de casa, API
- [ ] Assistente EO: respostas por permissão, limites de custo, histórico restrito ao master e estatísticas agregadas
- [ ] Vendas: dados estruturados, resumo com semáforo, visões por perfil e configuração de indicadores

### Fase 2 e pendências

- [ ] Itens da fase 2 desenhados e registrados
- [ ] Pendências da seção 20 recebidas e incorporadas
