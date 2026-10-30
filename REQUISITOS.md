# App operacional de lojas: definição inicial

Data: 28/10/2026. Nome de trabalho: App EO, ainda não confirmado como nome do produto.
Status: requisitos e proposta de arquitetura. Nenhum aplicativo implementado ou publicado nesta etapa.

## Requisitos confirmados por Matheus

- Super app operacional para cerca de 2.000 usuários, com perspectiva de 10.000.
- Home moderna, adaptada ao perfil, com identidade corporativa.
- Paleta: grafite #4A4E58, amarelo pastel #FBF2A3, cinza areia #DDDAD5 e branco #FEFEFE.
- Logo configurável posteriormente pela administração.
- Perfis iniciais: usuário comum, gerente, diretor e administrador.
- Administração central, registros de atividades, comunicados para todos e confirmação individual de ciência.
- Solicitações de fotos e vídeos.
- Integração com IA; gerente grava áudio, transcreve e produz resumo do dia de vendas.
- Módulos futuros de cartazeamento, checklist e escala de colaboradores.
- Sistemas serão desenvolvidos e integrados progressivamente, com telas adaptadas ao app e portal web. Algumas funções poderão ser exclusivas da web.
- Acesso também fora da loja, com acesso corporativo protegido. Não limitar o produto à rede física da intranet.
- A empresa possui login e infraestrutura corporativos, mas não serão utilizados nesta fase. Preparar a integração futura, sem presumir fornecedor.
- Alto nível de segurança, prevenção e detecção de tentativas de retirada indevida de dados.
- Documentar o projeto continuamente no Obsidian.

## Proposta técnica, ainda sujeita à validação

Criar uma base corporativa independente e reaproveitar seletivamente componentes e aprendizados do Control ALL. Não clonar dados, segredos, banco de produção, identificadores dos apps ou destinos de publicação. O reaproveitamento efetivo depende de inspeção do código.

Organizar um núcleo comum com identidade, estrutura de lojas/regionais, permissões, comunicação, arquivos, auditoria e catálogo de módulos. Iniciar com uma aplicação organizada em módulos, sem exigir um serviço independente para cada função.

App e portal usam a mesma camada de serviços e regras de acesso. Cada módulo declara permissões, telas, rotas, integrações e disponibilidade por plataforma. Integrações usam contratos versionados, autenticação própria e operações que não se duplicam em caso de repetição. Incorporar uma página externa não concede a ela acesso livre à sessão ou aos dados.

### Identidade e permissões

- Na fase inicial, propor autenticação gerenciada independente, com contas individuais criadas ou convidadas pela administração e sem cadastro público livre.
- Definir provedor e hospedagem antes de implementar autenticação real. Não desenvolver armazenamento próprio de senhas.
- Manter um identificador interno estável por pessoa e vínculos separados com provedores de identidade. A migração para login corporativo deverá validar os vínculos, sem fusão automática de contas apenas pelo e-mail.
- Preparar integração futura por padrões de identidade, como OIDC ou SAML, conforme o provedor escolhido.
- Combinar perfil, ação e abrangência: pessoa, loja, conjunto de lojas, regional ou companhia. Permitir delegações explícitas, sem compartilhamento de senhas.
- Conferir permissões no servidor em cada operação, inclusive em arquivos, exportações e consultas feitas pela IA. Ocultar um botão não protege o dado.
- Administrador gerencia módulos, identidade visual e acessos; ações privilegiadas também ficam auditadas. Não permitir apagar a trilha de auditoria pela administração comum.
- Definir autenticação adicional e sessões conforme risco, principalmente para administradores, sem repetir desafios em toda tarefa da loja.

### Comunicação, evidências e IA

- Comunicados com público definido, prazo e versão. Registrar quem precisava confirmar, quem confirmou, quando e qual versão. Alteração relevante exige nova ciência.
- Separar mensagem disponibilizada, visualizada e confirmação explícita; abrir a home não equivale a dar OK. Não prometer que uma confirmação prova compreensão.
- Solicitações de evidência com responsável, loja, prazo, anexos, situação e histórico.
- Arquivos privados, acesso temporário autorizado, validação de tipo/tamanho, verificação de conteúdo malicioso e política de retenção.
- Áudio: gravar, enviar, processar em segundo plano, exibir transcrição/resumo, permitir revisão do gerente e só então enviar.
- IA acessa apenas dados permitidos ao solicitante, com limites de consumo e provedor autorizado para os dados tratados. Conteúdo recebido não pode mudar permissões ou executar ações privilegiadas.

### Home proposta

- Identificação da pessoa, loja ou abrangência selecionada e logo configurável.
- Prioridades do dia, comunicados aguardando ciência, tarefas com prazo e atalhos dos módulos liberados.
- Gerente: pendências da loja, equipe e envio do resumo diário.
- Diretor: visão consolidada da sua abrangência, adesão aos comunicados e exceções.
- Usuário comum: suas tarefas, comunicados e escala conforme autorização.
- Administração: gestão de pessoas, lojas, permissões, módulos, identidade e auditoria.
- Branco como base, grafite em textos e navegação, amarelo para destaques e areia em superfícies secundárias. Estados de erro e sucesso devem usar também texto/ícones.

### Capacidade e proteção

10.000 contas cadastradas não equivalem a 10.000 acessos simultâneos. Dimensionar por picos de leitura, confirmações, uploads, tamanho de vídeos e minutos de áudio. Não prometer capacidade sem testes.

Prever paginação, índices no banco, armazenamento de mídia separado, filas para processamento de IA/mídia e envios em lote, monitoramento, limites por usuário e testes de carga. Validar repetição de confirmações e isolamento entre lojas.

Propor criptografia em trânsito e em repouso, gestão de segredos, limitação de tentativas, revogação de sessões, controle de exportação, detecção de consultas massivas, backups e teste de restauração. Registrar eventos sem incluir senhas, tokens ou conteúdo sensível desnecessário.

Rede interna não substitui verificação de identidade e permissão. Nenhuma solução garante impedir todo vazamento, inclusive fotografia de tela; dispositivos corporativos gerenciados podem ampliar os controles.

## Sequência recomendada

1. Definir hospedagem provisória, identidade inicial, hierarquia de lojas e matriz de permissões; protótipo pode usar dados fictícios enquanto isso.
2. Construir núcleo, home por perfil, administração, auditoria e comunicados com ciência.
3. Fazer piloto controlado, validar operação em celulares e portal, permissões e carga antes de ampliar.
4. Acrescentar evidências e áudio com resumo revisável.
5. Integrar cartazeamento, checklist e escala progressivamente.

## Pontos em aberto

- Nome oficial, provedor de identidade inicial, hospedagem, orçamento e responsáveis pela operação.
- Uso de aparelhos pessoais ou corporativos, necessidade de uso sem conexão e forma de distribuição do app.
- Hierarquia organizacional e exceções de acesso, volume simultâneo e volume/retenção de mídia.
- Contratos e interfaces dos sistemas a integrar; requisitos da TI para futura conexão ao ambiente corporativo.

## Referências consultadas

- Notas do Obsidian: control-all-estado-2026-10-28, control-all-passagem-2026-10-25, indicadores-e-comunicacao-lojas, compartilhamento-de-senha-lojas e arquitetura-corporativa-ia.
- OWASP: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- NIST: https://www.nist.gov/publications/zero-trust-architecture
