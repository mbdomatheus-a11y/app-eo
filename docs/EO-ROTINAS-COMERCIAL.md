# Rotinas e comercial EO, 08/11/2026

## Correções
O erro role_of_actor estava na política RLS de fotos de checklist sobre storage.objects, não nas RPCs dos relatórios. Wrappers SECURITY DEFINER preservam helpers privados. Testado com SET LOCAL ROLE authenticated e JWT por pessoa, incluindo leitura de relatórios e evidências. Todos os testes usam fixtures revertidas.

Push iOS exige assinatura com aps-environment e perfil Apple com capability Push Notifications. app.json e workflow agora configuram e verificam ambos antes de upload. Ícone nativo EO incluído. Permissão do sistema e registro no servidor são estados diferentes; o teste servidor tenta registrar o token atual antes de enviar. Teste local de som/banner não demonstra push remoto. Android FCM adiado por Matheus.

## Atualização de telefone
Admin escolhe todos ativos ou só quem não possui contato válido. Prioridade do contato: declaração do titular, diretório importado por chapa, regional importada por chapa. Não altera a importação. Solicitação individual obrigatória ao retornar/abrir app, com opção Sair; sem SMS/OTP. Alertas internos permitem alcançar apps abertos; fallback em foreground a cada 5 minutos. Dados e autor das solicitações auditados sem telefone no payload de auditoria.

## Checklist
Administração > Criar checklist: modelo Excel com Instrucoes e Checklist, colunas ORDEM, PERGUNTA, TIPO, OBRIGATORIO. Até 100 perguntas, aceite/foto/texto/sim_nao. Modelo com larguras, congelamento, filtro e instruções. Linhas vazias ignoradas; erros indicam aba/linha. Revisão e confirmação antes do envio. Distribuição pessoa/loja por vínculo direto, COD ou GGL, admins incluídos; deduplicação pessoa/loja e aviso único por pessoa. Push é tentado sem desfazer atribuições se indisponível. Feed novo com paginação servidor de 30, busca e status; feed legado preservado. Respostas individualizadas com histórico/auditoria, fotos privadas e salvamento por item. Web e app têm criação Excel e resposta.

## Pedir produto
Relato por texto e áudio até 60s, loja obrigatória. Anthropic sugere categoria, produto, cor, público, tamanho e procura apenas do texto informado. Usuário revisa/edita e envia explicitamente. Não cria compra/reposição nem consulta estoque de sistemas externos. Regional vê sua abrangência; admins veem toda a operação; demais veem próprios registros. Resumo por regional e 20 agrupamentos mais frequentes de produto/cor/tamanho contabilizam relatos, não unidades.

## Sortimento
Câmera nativa expo-camera ou digitação/leitor conectado no site. Código fica salvo como leitura pendente antes das quantidades. Após bipar, formulário de quantidades inteiras 0..100000 por tamanho PP,P,M,G,GG,XG,EXG e todos os números 34..54. Lista suspensa no app. Zero significa falta contada; tamanho omitido não foi informado. Contagem salva e auditada. Leituras pendentes podem ser retomadas pelo autor. Não é integração de estoque/SKU ainda.

## Transcrição revisada
Requisito alterado por Matheus: sempre mostrar texto editável e pedir revisão antes de salvar/enviar áudio. Diário e pedido de produto aplicam isso no cliente; RPCs também recusam áudio sem transcrição. A função transcribe-audio só envia ao provedor se TRANSCRIPTION_PROVIDER=openai e TRANSCRIPTION_API_KEY válida/configurada; padrão TRANSCRIPTION_MODEL=gpt-transcribe, configurável. Anthropic não recebe áudio. Provedor/chave separados dependem da resposta/configuração do usuário. Enquanto ausentes, áudio não é enviado como transcrito; registro por texto continua disponível. Não afirmar transcrição operacional sem teste real com credencial. Originais de áudio são privados, sem URL pública; só o caminho do próprio usuário é aceito na Edge. Um áudio por minuto, até 10MB e 20 transcrições/h por pessoa.

## Distribuição
Mudanças nativas de ícone, APNs e câmera foram agrupadas para nova versão via GitHub, sem EAS Build. Futuras atualizações JS precisam do runtime desta versão. Não mandar OTA de nova câmera para runtimes antigos. Build sem configuração FCM não habilita push Android por si só.
