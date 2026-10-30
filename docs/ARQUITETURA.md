# Arquitetura inicial

## Evolução para MVP 0.2 em 29/10/2026

Supabase escolhido e núcleo instalado em projeto exclusivo. Acesso por RPCs com identidade de sessão, verificações por loja/cargo e perfil ativo; tabelas com RLS e sem privilégios diretos do cliente. Migrações SQL e testes de integração em supabase/. O histórico abaixo descreve o ponto de partida 0.1; a arquitetura implementada atual está detalhada em docs/PUBLICACAO.md.

GitHub privado com CI de instalação/testes/build. Projeto Vercel vinculado com configuração preparada, chave publicável e URL cadastradas, mas sem implantação. Publicação automática desligada por decisão do Matheus de adiar a contratação Pro. Configurações locais e credenciais da CLI são ignoradas no Git.

## Decisões de 29/10/2026

- Projeto independente na pasta App_EO existente. Nenhum código, banco, segredo ou configuração de publicação do Control ALL foi copiado.
- Iniciar pelo portal web responsivo para validar navegação e experiências no computador e celular. O app nativo será uma etapa posterior.
- React, TypeScript e Vite para a interface; Lucide para ícones. Versões exatas e árvore de dependências no package-lock.json.
- Separar regras de negócio, contratos e persistência da demonstração. A UI da primeira versão fica concentrada em App.tsx; extrair componentes e módulos à medida que as funcionalidades reais entrarem.
- Usar dados fictícios, sem credenciais, sem servidor de negócio e sem publicação externa.
- Identidade provisória: nome de trabalho EO e logo tipográfico neutro até upload pelo admin.
- Integração corporativa adiada por decisão de Matheus; não assumir Microsoft ou outro fornecedor.

## Evolução do núcleo

Portal e aplicativo devem usar serviços comuns. Perfil define ações possíveis e a abrangência define as lojas/pessoas sobre as quais essas ações são válidas. A identidade autenticada será obtida no servidor; o cliente não determina seu próprio perfil.

Entidades previstas: pessoas, vínculos de identidade, lojas, regionais, atribuições de acesso, módulos, comunicados, versões, destinatários, recibos de ciência, tarefas, anexos e eventos de auditoria.

No servidor, o destinatário de cada versão de comunicado deve ser registrado para possibilitar cobrança consistente mesmo após mudanças organizacionais. A prévia filtra por loja e não implementa esse histórico de destinatários. A chave de unicidade dos recibos será pessoa + comunicado + versão. Mudanças relevantes geram nova versão. Consultas de adesão deverão distinguir denominador elegível, visualização e confirmação.

Os contratos em src/core/contracts.ts antecipam as interfaces de identidade e comunicados. A escolha do provedor, banco e hospedagem continua aberta. Nenhuma implementação externa está conectada.

## Segurança antes de operar

- Autenticação gerenciada, contas nominais, convites controlados e revogação de sessões.
- Autorização no servidor com negação por padrão, verificação por ação e abrangência, inclusive para arquivos e integrações.
- Auditoria produzida pelo servidor e protegida contra alteração pelo usuário e pela administração comum.
- Armazenamento privado, verificação de arquivos, limites e retenção antes de habilitar fotos, vídeos e áudio.
- Criptografia, gestão de segredos, limitação de tentativas, monitoramento e detecção de exportações anormais.
- Testes de isolamento entre lojas, testes de restauração e carga com picos representativos.
- IA com dados autorizados, limite de custo e revisão do resumo pelo gerente antes de envio.

## O que não usar em produção

Não reutilizar o seletor de perfis, localStorage ou histórico local como controle de acesso, banco corporativo ou evidência de auditoria. O servidor de desenvolvimento é restrito ao loopback. A compilação estática não torna esta prévia segura para dados reais.

## Integrações futuras

Módulos deverão declarar identidade, permissões, abrangência e plataformas. Conectores devem usar serviços autenticados e contratos versionados. Credenciais de integração ficam no servidor. Evitar embutir sistemas arbitrários com acesso à sessão do portal.

Cartazeamento e escala poderão concentrar edição/impressão na web e consulta/execução no app, conforme requisitos atuais. Essa escolha é específica deste projeto e não altera a regra de paridade do Control ALL.
