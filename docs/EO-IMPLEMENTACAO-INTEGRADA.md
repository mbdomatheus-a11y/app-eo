# EO: entrega integrada de 09/11/2026

## Estado verificável

- Banco Supabase mfsnzrrqlyixqwsrcqyo: migrations 202611090001 a 202611090015 aplicadas juntas em transação. Conferência: 15 marcadores, 474 unidades, zero perfis ativos sem unidade.
- Funções publicadas: admin-identity, organize-product, send-alert-push e send-test-push. Credenciais continuam exclusivamente no servidor.
- Verificação: 52 testes unitários aprovados, um teste opcional de HTML real ignorado na rotina. TypeScript web e mobile aprovados. Bundle iOS Hermes exportado com sucesso. Seis suítes SQL de segurança aprovadas com dados fictícios revertidos.
- Site e novo binário: registrar o resultado da publicação abaixo. Testes automatizados não substituem conferência física de câmera, ditado, push, Face ID e agenda.

## O que foi integrado no site, Android e iOS

1. Aplicativos como entrada, navegação compacta, seletores em etapas com caixas de seleção, pesquisa, paginação e ações todas/nenhuma. Módulos restritos também são bloqueados no servidor.
2. Caixa de notificações com contagem, leitura e limpeza individual/coletiva. Abrir comunicado marca leitura; ciência continua ação separada. Feedback curto fica no relatório da gestão, sem prometer resposta individual.
3. Comunicados com anexos de nome normalizado, preservando nome original; público por segmentação, edição/cancelamento/reenvio de agendamento e exclusão da equipe preservando auditoria. Admins ativos incluídos nos destinatários.
4. Pedidos de produto organizados por departamento, tipo, medidas, cor, composição e motivo. Informação ausente fica Não informado. Histórico por unidade, arquivo compartilhado pela unidade, tratamento pela gestão e motivo obrigatório na conclusão.
5. Ditado até um minuto com texto editável antes de salvar. Aplicativo usa reconhecimento disponível no próprio aparelho; navegador depende de suporte e pode usar serviço do fornecedor do navegador, informado ao usuário. Sem suporte, digitação e ditado do teclado. Anthropic organiza texto, não recebe áudio para transcrição. OpenAI não foi configurado.
6. Sortimento livre ou sob demanda por lista autorizada, sessão com ID, contagens PP a EXG e 34 a 54, envio para validação e exportação. Horário registrado pelo servidor e aviso de possível divergência durante vendas. Sem horário da unidade, informa impossibilidade de verificar abertura.
7. Checklists criados na própria área, manualmente ou por Excel. Aceite, foto, sim/não, texto curto/longo, número, telefone e horário; limites validados no servidor e linguagem imprópria sinalizada para revisão. Relatório paginado com progresso, respostas e evidências privadas.
8. Pessoas e unidades: exclusão lógica, bloqueio/reativação, sugestões de domínio por organização e administrador, EC/CDA/Administração e lojas vinculadas. Chapa 330023 protegida contra exclusão por identificação persistente. Demais poderes iguais entre admins, inclusive histórico completo de sentimento.
9. Diário parametrizável e versionado, categorias e perguntas adicionais. Sentimento imutável, vários registros por dia, horário configurável. Usuário consulta próprio dia; regional consulta dia de suas unidades; admins consultam e exportam histórico.
10. Relatórios centralizados com origem e auditoria, paginação e exportação explícita da página. Registro de acesso autenticado por módulo/plataforma deduplicado por cinco minutos, informado pelo cliente.
11. Perfil com preferência de contato, telefone efetivo e horários das lojas editáveis pelo gerente sem aprovação. Localização optativa no checklist, sem bloquear distância nem coletar em segundo plano.
12. Agenda de ações reúne ciência pendente e checklists não concluídos. Eventos são adicionados mediante confirmação do usuário, com horário escolhido; não há sincronização bidirecional ou prazos inventados.
13. Sons padrão, Suave, Sino e Alerta; usuário pode silenciar. Sistema operacional tem a decisão final sobre permissão, som e apresentação.
14. Política de privacidade, termos e aviso de armazenamento necessário. Não foi adicionada publicidade ou rastreamento opcional.

## Vendas HTML e limites atuais

- Percentuais e pontos percentuais tratados separadamente, inclusive LY de estoque. Filtros por unidade, UF, regional e clusters presentes no arquivo; comparação de lojas e indicadores derivados.
- Reimporte o HTML original para obter as novas dimensões extraídas do SEG_MAP. Arquivos antigos não ganham metadados retroativamente.
- O HTML enviado não é executado como script confiável. Ainda não há equivalência de todas as interações JavaScript do original, como consultas externas de clima e algumas hierarquias. Validar semanal/mensal/anual com arquivos reais.
- Upload não tem o antigo limite artificial de 10 MB no formulário; continuam existindo limites de infraestrutura, memória do dispositivo e armazenamento do serviço. Não é upload ilimitado em termos físicos.

## iOS: procedimento de teste

1. A versão com ditado nativo, localização, sons e ícone exige uma compilação nova. Atualização OTA não instala recursos nativos ausentes.
2. No GitHub, workflow EO | Compilar app no GitHub, opção ios-testflight. Também pode ser iniciado pela tag eo-ios-*, reservada para versões nativas deliberadas. Push comum não gera TestFlight.
3. A automação usa os segredos Apple já cadastrados, valida a assinatura e exige aps-environment production no IPA e no perfil antes de enviar. Não remover essa verificação para contornar erro de assinatura.
4. Após processamento da Apple, associar o build ao grupo de teste e preencher eventual conformidade. Só declarar disponível depois de conferir essa etapa.
5. No iPhone, TestFlight > EO > Atualizar. Abra, entre, aceite a explicação e a permissão de avisos. Em Ajustes > Notificações > EO, confira Permitir notificações, Sons e Banners. Negação anterior pode exigir ajuste manual; o app não pode forçar o sistema.
6. Em recursos do aparelho, teste som/banner local e depois envio pelo servidor, também com app em segundo plano. O teste local não comprova push remoto.
7. Teste ditado e revisão; checklist com foto/localização consentida; evento na agenda; anexo PDF acentuado; leitura e ciência; produto e contagem por sessão.
8. Depois deste binário, agrupar alterações compatíveis em OTA no canal e fingerprint correspondentes. Mudanças de dependência nativa, permissões ou ícone exigem novo binário.

## Pendências que não devem ser confundidas com entrega

- Android FCM foi adiado expressamente por Matheus. Push remoto Android não está validado.
- Status de agendamento indica publicação/submissão ou falha dessa etapa, não comprova entrega, leitura ou som de cada aparelho. Relatório individual de tickets/receipts do provedor ainda precisa ser ampliado.
- Compartilhamento nativo de algumas exportações usa texto CSV; relatório de checklist gera arquivo CSV. Exportações são da página e avisam esse alcance.
- Recursos físicos, aparência final e link externo TestFlight precisam de validação no dispositivo e na Apple. Não se afirma que o novo build já foi aceito.
- Funções recriadas em migrations futuras precisam manter a exigência de módulo e os filtros por unidade.
- Helpers puros usados no bundle mobile são locais em mobile/src/features; manter equivalência com os helpers web e testes ao alterar questionário, anexos e sugestão de e-mail. Evita dependência fora da raiz do Metro.

## Publicação

- Código integrado: commit d696109, enviado à main do repositório mbdomatheus-a11y/app-eo.
- Site publicado em https://app-eo.vercel.app/, deployment dpl_9rT4wkDJRrMWLnzSykAY8z7j4hYR, estado READY. HTTP 200, termos e privacidade acessíveis, bundle com agenda e relatório de checklist conferido.
- Política do navegador permite somente ao próprio site solicitar câmera, microfone e localização, mediante autorização explícita de Matheus e consentimento do usuário.
- Tag eo-ios-20261109-integrated enviada para acionar uma compilação iOS/TestFlight. Conclusão e disponibilidade na Apple ainda não confirmadas. A ferramenta de navegador permanece limitada por cota de uso; não foi contornada para observar a execução anterior bloqueada.
- Abrir https://github.com/mbdomatheus-a11y/app-eo/actions/workflows/eo-mobile-build.yml para acompanhar a execução da tag. Aguardar sucesso do envio e processamento Apple antes de procurar a nova versão no TestFlight.
- Android não foi compilado nesta rodada; fonte atualizada, compilação manual disponível, FCM adiado.
