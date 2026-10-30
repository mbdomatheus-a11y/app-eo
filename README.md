# App EO · Operação conectada

Portal operacional modular para times de lojas. Nome de trabalho, ainda sujeito à escolha do Matheus.

## Estado atual: MVP 0.3 em preparação

Supabase conectado ao projeto SUP_EO1 (mfsnzrrqlyixqwsrcqyo), com migração inicial aplicada e testes de banco executados. A entrada padrão exige login individual; perfil e lojas vêm do servidor. Repositório privado: https://github.com/mbdomatheus-a11y/app-eo .

O núcleo 0.2 e a migração 0.3 já estão no Supabase. A atualização local 0.3 prepara login por chapa, convite de pessoas, perfil, lojas, edição/desativação e senha temporária do administrador master com troca obrigatória. A Edge Function `admin-identity` também está publicada; o frontend ainda precisa ser enviado ao GitHub e não tem publicação Vercel.

Copie `.env.example` para `.env.local` e preencha SOMENTE a chave publicável do projeto. Nunca inclua service_role, sb_secret ou senha do banco em variáveis VITE_*. `.env.local` é ignorado pelo Git. A configuração do computador de desenvolvimento já foi feita.

Vercel: projeto e configuração prontos, sem publicação. O Hobby só permite uso pessoal não comercial. Para hospedar este app corporativo é necessário um plano compatível; não publicar o app no Hobby. Ver [preparação de publicação](docs/PUBLICACAO.md).

A demonstração antiga continua acessível apenas durante desenvolvimento em `http://127.0.0.1:5173/?demo=1`. Os tópicos sobre a versão 0.1 abaixo são históricos e descrevem exclusivamente essa demonstração.

## Histórico da prévia 0.1

## Como abrir

Pré-requisito: Node.js compatível com a versão do Vite registrada no package-lock.json.

Na pasta `C:\Users\Usúario\Documents\ChatGPT\App_EO`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Abra o endereço exibido pelo terminal, normalmente http://127.0.0.1:5173. O servidor escuta somente neste computador. Para encerrar, pressione Ctrl+C no terminal. O arquivo `iniciar-previa.cmd` facilita a abertura depois da instalação.

```powershell
npm.cmd test
npm.cmd run build
```

## O que funciona nesta versão

- Portal responsivo, com navegação para desktop e celular, paleta corporativa e dados fictícios.
- Seletor de experiência para colaborador, gerente, diretor e administrador.
- Comunicados filtrados por abrangência, busca e filtro por confirmação.
- Leitura e confirmação individual por versão, sem duplicar a confirmação.
- Criação de comunicados locais por diretor/admin, com seleção de público.
- Rotina demonstrativa com conclusão e reabertura de tarefas.
- Administração: upload local de logo, catálogo de módulos futuros, consulta dos perfis e histórico local.
- Persistência no navegador, com aviso em caso de falha de armazenamento.
- Cartazeamento, escala, evidências e diário por áudio apresentados como integrações futuras.

## Limites desta etapa

Esta é uma prévia de produto, não um ambiente para operação real. O seletor de perfis não é login. Os filtros no navegador não são uma barreira de segurança. Quem controla o navegador pode alterar seu armazenamento local. O histórico não é uma auditoria protegida.

Não inserir dados pessoais, documentos internos ou segredos. Não há banco remoto, autenticação real, notificações, upload para servidor, transcrição ou IA conectada. Nada foi publicado. Não há aplicativo nativo ou capacidade de 10.000 usuários validada.

As regras de domínio e seus testes expressam o comportamento esperado. O servidor futuro deverá implementar e testar a autorização em todas as operações antes da entrada de dados reais.

## Organização

```text
src/
  core/           Tipos, regras, contratos de integração e testes
  services/       Armazenamento exclusivo da demonstração
  App.tsx         Telas e interações da primeira prévia
  main.tsx        Entrada da aplicação
  styles.css     Identidade e layout responsivo
docs/
  ARQUITETURA.md  Limites, decisões e evolução
  ESTADO.md       Entregas, validações e próximos passos
REQUISITOS.md    Escopo confirmado e proposta inicial
```

## Próximos passos

Validar a experiência com Matheus. Definir hospedagem inicial e provedor de autenticação independente. Implementar identidade, hierarquia, permissões no servidor, banco e auditoria protegida. Fazer piloto com dados autorizados e testes de segurança/carga antes de ampliar. A integração corporativa será feita futuramente; app iOS/Android permanece no escopo, mas não foi criado nesta etapa.
