# EO: cinco correções de 15/11/2026

## Escopo e resultado do código

| Pedido | Implementação | Validação pendente |
| --- | --- | --- |
| Logo grande no login | Marca EO existente ampliada no app e portal, centralizada no app | Conferir visual após OTA |
| Ícones profissionais e globais | Catálogo validado e símbolos reais; fallback visual nunca imprime nome; administração do portal permite selecionar ícone por módulo para todos, inclusive admins | Conferir mudança em aparelhos/contas diferentes |
| Ditado para não admin | Não havia gate admin no componente; foram corrigidos permissão pendente, erro silencioso antes do start, cancelamento e indicador de atividade | Microfone e idioma local em usuário de loja |
| Push com som | Recursos compatíveis por instalação, nome legado ou sublinhado, sem trocar a preferência salva; rejeições do provedor não são tratadas como sucesso | Registro/token e som/banner reais no iPhone |
| Login lento e travamento | Abertura web passou de chamadas sequenciais a eo_app_inicio; mobile não reinicia toda tela em atualização de token/retorno; push tem estado próprio, espera limitada e não bloqueia navegação; removidas tentativas duplicadas no login | Tempo e fechamento nativo só podem ser confirmados no dispositivo |

## Banco e servidor

Migrations novas 202611150001_module_icons e 202611150002_push_sound_compat: nenhuma tabela comum removida/renomeada, contratos antigos preservados. Ícones em tabela exclusiva EO com leitura via RPC e escrita somente por admin, auditoria e whitelist. Campo sound_bundle aditivo em dispositivos_push; registro antigo continua válido e RPC v2 registra a capacidade do recurso de áudio. Dry run transacional com erro proposital e plpgsql_check sem erros novos antes da aplicação.

Funções usam agora nomes comuns: perfis, auditoria, dispositivos_push, notificacoes_config e identidade_preferencias. Views de compatibilidade permanecem. Não ativada transcrição OpenAI, nenhuma chave criada, nenhum disparo para equipes, nenhuma conta em lote ou rotina persistente criada.

Administração do portal, aba Pessoas: configuração de ícones. Aplicativos consultam a configuração ao abrir/retornar e a cada minuto enquanto ativos. Sem controle de ícone nativo da instalação por usuário: o pedido tratado é ícone dos módulos. Mudança de ícone da instalação continua exigindo binário.

## Publicação pelo PowerShell de Matheus

Conforme regra de 12/11, git push e gh devem ser executados por Matheus. Script pontual, sem segredos ou automações permanentes:

```powershell
cd C:\Users\Usúario\Documents\ChatGPT\App_EO
powershell -ExecutionPolicy Bypass -File scripts\publicar-correcoes-20261115.ps1
```

iOS usa tag ota-20261115-cinco-correcoes, cuja configuração nativa é preservada da tag ota-20261112-navegacao. Android usa main, mantendo a configuração atual do AAB4401. O código não modifica app.json, package.json ou dependências. Não confundir início do workflow com OTA disponível.

Para Android, depois de confirmar o AAB4401 instalado:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\publicar-correcoes-20261115.ps1 -Plataforma android
```

Após workflow verde, fechar/abrir o app ou Buscar atualização. Validar runtime correspondente, logo, todos os módulos, ícones trocados pelo admin, ditado com usuário não admin e o teste remoto com aparelho em segundo plano. Nenhuma OTA pode instalar módulo nativo ausente. Se surgir erro APS ou microfone indisponível, registrar compilação e erro antes de cogitar nova build.

Som depende da permissão, modo silencioso/Foco e ajustes do sistema. Aceitação Expo não comprova entrega; tickets são separados de receipts. Receipts completos por aparelho ainda não foram implementados nesta correção. Referência: https://docs.expo.dev/push-notifications/sending-notifications/ .

## Limites de diagnóstico

Print mostrou cliques desabilitados porque ação de push estava ligada a busy global; isso foi corrigido no código. Não afirmar que todo fechamento nativo foi resolvido sem relatório de crash e teste físico. Reportar erro JavaScript não captura necessariamente falha nativa. Tela com versão/compilação indisponível agora pede consulta no TestFlight em vez de afirmar desenvolvimento/local.

Checklist final ao usuário deve distinguir implementação, publicação e teste real. Nova preferência obrigatória: toda entrega termina com status feito/não feito de cada item solicitado.
