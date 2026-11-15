# EO: Face ID, sessão e sincronização offline

Estado em 15/11/2026: implementação e testes locais concluídos; RPC aplicada no Supabase. Publicação OTA e validação física pendentes. Não há evidência para afirmar que todo encerramento nativo do iOS está resolvido.

## Alterações verificadas

1. Biometria com máquina de estado, prazo de 15 segundos, uma tentativa automática por bloqueio e rejeição de respostas tardias ou de outra conta. A opção de senha continua disponível durante a espera. A proteção biométrica não é removida para contornar o erro.
2. O evento iOS inactive, comum em permissões, não equivale a sair do aplicativo. Background real bloqueia após tolerância; prompts conhecidos têm prazo limitado.
3. Sair da conta tem estado próprio, sem usar o mesmo indicador do teste push. A sessão é fechada localmente, com marcador persistente e cliente Auth renovado, sem esperar logout pela rede. Login tem prazo de 20 segundos; encerramento local, 4 segundos; RPC, 15 segundos.
4. A sessão existente permite abrir a última cópia autenticada do espaço sem aguardar a rede. Primeiro login e login após saída explícita continuam exigindo conexão. Cache por identidade e abrangência, validade de 24 horas, AES 256 GCM e chave no Keychain. Nenhuma senha ou token no cache de dados.
5. Fila persistente para texto de diário, sentimento, pedido de produto, abertura/ciência e resposta simples de checklist. Sem fotos, áudio, localização ou administração na fila. Até 100 pendências e 2 MiB. Ao sair, apaga leituras e preserva somente envios pendentes cifrados para a mesma identidade.
6. Revalida acesso no servidor antes de reenviar. UUID estável, registro e auditoria na mesma transação. Falha permanente fica visível e bloqueia a ordem da fila até revisão ou descarte explícito. Nunca altera a data original para contornar regras do servidor.
7. Faixa Dados locais e tela Sincronização mostram pendências e motivos, com tentativa manual ou descarte confirmado. Revalidação automática ao voltar ao app e a cada 45 segundos em primeiro plano quando há desconexão/pendências. Não há cron novo no servidor.
8. A atualização obrigatória de telefone é apresentada quando o acesso foi revalidado online; uma consulta de contato não bloqueia a leitura offline. Atualização de contato continua online.

## Evidência

112 testes aprovados, 1 ignorado preexistente, 25 arquivos. TypeScript mobile sem erros. Incluem regressões de timeout biométrico, cancelamento, troca de conta, sessão tardia, criptografia/tamper, fila antes da transmissão, resposta perdida, negação de acesso e expiração. Exportação iOS/Hermes validada. Configurações nativas e dependências não foram alteradas.

Migration `202611150003_offline_replay.sql`: dry run com plpgsql_check e testes funcionais terminando em `EO_OFFLINE_DRY_RUN_OK_ROLLBACK`, depois aplicada. Marcador e função confirmados; anon sem permissão de execução. Testes não deixaram pedidos fictícios gravados.

## Publicação pelo Matheus

Executar no PowerShell do projeto:

```powershell
.\scripts\publicar-faceid-offline-20261115.ps1
```

O script envia main e a tag `ota-20261115-faceid-offline`, derivada de `ota-20261112-navegacao` com os arquivos nativos preservados para o runtime do iPhone. Não publicar main diretamente no runtime antigo. Android opcional: mesmo script com `-Plataforma android`. Nenhuma build nativa iniciada. O pacote contém também as correções anteriores de logo, ícones e ditado.

## Teste físico após o workflow concluir

1. Abrir EO conectado e buscar a atualização. Se Face ID estiver preso, o botão senha anterior pode não responder até instalar a atualização; fechar o processo e reabrir conectado. Evitar desinstalar, pois remove pendências locais.
2. Confirmar entrada, saída e reentrada. Cancelar Face ID, verificar que o botão senha permanece acionável e que Confirmando não fica infinito.
3. Em Meu aparelho ativar notificações e testar envio pelo servidor. Confirmar registro em dispositivos_push e logs app_erros. Verificar som/banner em primeiro plano e segundo plano. Permissão de som no iOS, Foco e modo silencioso afetam reprodução. A aceitação do provedor não prova entrega física.
4. Abrir diário, pedidos, comunicado e checklist enquanto online para carregar dados. Em modo avião, reabrir sessão existente, registrar texto e consultar Sincronização. Não usar Sair para este teste.
5. Reconectar e sincronizar. Confirmar um único registro remoto, horário original e fila vazia. Revogar acesso em conta de teste e verificar que o servidor rejeita o reenvio e mostra motivo, sem mascarar como sucesso.
6. Validar logo, ícones configurados pelo admin e ditado por conta não admin. São implementações anteriores, ainda sem confirmação física nesta entrega.

Se o processo continuar encerrando sem mensagem, coletar o relatório de falha nativa no TestFlight/Xcode Organizer. app_erros não registra necessariamente uma falha antes de o JavaScript iniciar.
