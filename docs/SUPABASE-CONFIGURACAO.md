# Supabase: configuração inicial e limites

Inspeção e ajustes realizados diretamente pelo painel web em 29/10/2026, a pedido de Matheus.

## Projeto confirmado

- Nome: SUP_EO1.
- Referência: mfsnzrrqlyixqwsrcqyo.
- Organização: mwathews, plano Free.
- Região: us-east-1, East US (North Virginia).
- PostgreSQL 17.11.0.003, indicado pelo painel como versão mais recente suportada.
- Esquema public sem tabelas; Data API sem tabelas ou funções disponíveis; Storage sem buckets.
- Portal App EO continua sendo uma prévia local, ainda não conectado a este backend.

## Alterações aplicadas e verificadas

| Controle | Antes | Depois | Motivo |
| --- | --- | --- | --- |
| Allow new users to sign up | Ligado | Desligado | Acesso por criação/convite administrativo, sem cadastro público livre |
| Secure password change | Desligado | Ligado | Reautenticar mudanças de senha quando a sessão não for recente |
| Minimum password length | Valor anterior não registrado | 12 caracteres | Fortalecer novas senhas e alterações |
| Email OTP expiration | 3.600 segundos | 900 segundos | Reduzir janela de uso de códigos e links de e-mail |
| Enforce SSL on incoming connections | Desligado | Ligado | Rejeitar conexões Postgres sem criptografia |
| Automatically expose new tables | Ligado | Desligado | Exigir concessões explícitas de acesso à API |
| Data API Max rows | 1.000 | 100 | Limitar resposta e exigir paginação |
| Realtime Allow public access to channels | Ligado | Desligado | Permitir apenas canais privados |

O SSL exigiu um breve reinício do banco, confirmado no painel. A mudança de Realtime avisa que desconecta clientes; o estado final salvo foi conferido com canais públicos desligados. Nenhum dado foi apagado. Não houve alteração de plano, compra, rotação de chaves ou redefinição de senha.

## Configurações corretas preservadas

- Confirmação de e-mail ligada e mudança de e-mail com confirmação no endereço antigo e no novo.
- Login anônimo e vinculação manual de identidades desligados.
- Login por e-mail ligado; provedores sociais/corporativos ainda desligados.
- TOTP disponível; limite de sessão AAL1 ligado. Disponibilidade de MFA não significa que o app já exige MFA dos administradores.
- Detecção/revogação de refresh tokens comprometidos ligada; intervalo de reutilização de 10 segundos.
- Token de acesso de 3.600 segundos, conforme recomendação exibida no painel. Não reduzido para evitar aumentar tráfego de renovação sem medição.
- Pool compartilhado de 15 conexões para o tamanho Nano; máximo de 200 clientes do pool. Data API com pool automático. Pools de Realtime em 2 conexões cada; limite de 200 clientes Realtime. Esses números não são a capacidade de usuários finais do app.
- Login/cadastro e verificação de tokens: 30 requisições por 5 minutos por IP; renovação: 150 por 5 minutos por IP. Não reduzidos arbitrariamente, pois lojas podem compartilhar IP.

## Dependências obrigatórias para o MVP

1. Criar tabelas com RLS e políticas de pessoa, perfil e abrangência. Novas tabelas não recebem mais exposição automática: conceder somente os privilégios necessários a cada operação.
2. Usar paginação explícita de até 100 registros. Painéis e totais devem usar agregações autorizadas, não presumir que uma consulta retorna todos os registros. O limite não impede coleta por múltiplas chamadas; não substitui RLS, auditoria e controle de abuso.
3. Criar políticas em realtime.messages e usar canais privados no cliente antes de habilitar mensagens em tempo real no app. O painel avisa que nenhuma mensagem é entregue aos usuários sem essas políticas. Não criar política genérica liberando todos os autenticados, pois existe isolamento entre lojas.
4. Configurar SMTP próprio para convites, recuperação, reautenticação e notificações de segurança. O painel ainda indica SMTP padrão. Não foram enviados e-mails durante esta revisão.
5. Definir domínio e rotas reais de retorno. Site URL permanece http://localhost:3000 e não há Redirect URLs cadastradas. É um padrão inicial, não a URL do portal atual; ajustar junto ao callback de autenticação, antes de testar login.
6. Integrar CAPTCHA no cliente e cadastrar as chaves antes de ativá-lo. Não habilitado isoladamente para não quebrar login.
7. Implementar fluxo de reautenticação para troca de senha e tratar expiração de códigos/links após 15 minutos.
8. Aplicar MFA aos administradores no app e nas permissões sensíveis do servidor; o suporte TOTP por si só não obriga o segundo fator.
9. Criar buckets privados com limites por tipo/tamanho e políticas de acesso. Nenhum bucket criado ou exposto nesta revisão.
10. Definir backups e testar restauração antes de dados operacionais. Esta revisão não criou backup nem validou restauração.

## Limites e decisões mantidas

- Proteção de senhas vazadas, controles de duração/inatividade de sessões e SMS MFA aparecem como dependentes do Pro. Não contratados.
- Restrição de IP do banco não aplicada porque não há IPs estáveis e origens de administração/servidor definidos. Não confundir com RLS ou restrição de usuários do app.
- Região Virgínia mantida. Avaliar latência real a partir das lojas e localização do servidor antes de decidir por região brasileira; nenhuma migração realizada.
- Não houve alteração de índices, recursos de CPU/memória ou parâmetros PostgreSQL sem evidência de carga. Ainda não existe carga do MVP para medir ganho de desempenho.
- Advisors Health, Security e Performance exibiram zero erros, zero alertas e zero sugestões na consulta. Isso não equivale a auditoria completa ou prontidão de produção, especialmente com banco sem tabelas do app.

## Evidências

- docs/previas/supabase-politica-senha.jpg
- docs/previas/supabase-api-protegida.jpg

As mudanças foram salvas e verificadas pelo painel. Não foram realizados testes de login ou integração ponta a ponta, pois o app ainda não possui backend conectado.

## Referências técnicas

- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/platform/ssl-enforcement
- https://supabase.com/docs/guides/database/connection-management
