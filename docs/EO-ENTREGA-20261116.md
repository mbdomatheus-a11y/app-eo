# EO: acesso, diario e atualizacao do iPhone

Estado em 16/11/2026: codigo concluido localmente. Publicacao e verificacao no aparelho pendentes. Nenhum teste foi executado nesta entrega, por pedido expresso do Matheus.

## Alteracoes

1. Abertura da sessao local sem chamada duplicada ao SDK de autenticacao. Respostas atrasadas de uma conta anterior nao restauram a sessao encerrada. O carregamento do espaco nao espera a sincronizacao offline.
2. A fila offline espera a abertura do armazenamento por no maximo quatro segundos para envios. Leituras antigas sao bloqueadas se a abrangencia de lojas mudou. Erro de rede no portal tem prazo maximo para liberar os estados Salvando e Saindo.
3. Diario no app usa opcoes compactas, pergunta configuravel e loja unica automatica. Carregamento de dados e salvamento tem estados separados. Ditado fica disponivel durante o carregamento e nao espera o resumo.
4. Sentimento da loja unica pode ser enviado sem selecionar a unidade. Adiar trinta minutos oculta o lembrete e o alerta superior. Resposta do dia oculta os dois. O alerta desaparece imediatamente ao descartar ou visualizar.
5. Historico do colaborador mostra os registros do mes. Para pessoas comuns, sentimento permanece limitado ao proprio dia conforme a regra do banco. Administradores e diretores continuam com filtros e consolidacao. O servico de resumo aparece como EO.IA.
6. Preferencia de contato no app e no portal mostra o canal escolhido, com opcao Alterar. A unidade unica e selecionada automaticamente no horario da loja.

## Atualizacao interna iOS

O aparelho informou Runtime `ee6c10e120100f0eaa3b33f9a2ba9e7693e7e812`. O grupo Expo mais recente consultado tinha Runtime iniciado por `3982f37`. Esses runtimes nao sao intercambiaveis. A tag iOS desta entrega deve manter `mobile/app.json`, `mobile/package.json`, `mobile/package-lock.json` e os assets de som da tag `ota-20261112-navegacao`. Os tres sons com sublinhado acrescentados depois devem ficar fora dessa tag. Nao mudar o runtime manualmente.

Apos publicar, confirmar no painel Expo que o novo grupo iOS usa exatamente `ee6c10e120100f0eaa3b33f9a2ba9e7693e7e812` antes de orientar o usuario a buscar a atualizacao. Se divergir, interromper a OTA e preparar nova compilacao nativa. Nao atribuir a falha do push apenas a versao sem confirmar registro e entrega fisica.

Tag local preparada: `ota-20261116-ux-ee6`. A comparacao dos arquivos nativos e assets entre ela e `ota-20261112-navegacao` nao mostrou diferencas. Isso e uma verificacao estatica; a confirmacao final do Runtime vem do painel Expo apos publicar.

O aplicativo instalado pode usar os sons legados embutidos em sua compilacao. Novos sons ou assinatura APNs exigem build. Push remoto, som e desempenho do login ainda requerem observacao real no iPhone. Nao tratar o codigo como prova de que o encerramento nativo acabou.

Publicacao de main, tag e workflow GitHub deve ser executada no PowerShell do Matheus. Nao gravar credenciais. O script correspondente fica em `scripts/publicar-ux-ee6-20261116.ps1`.
