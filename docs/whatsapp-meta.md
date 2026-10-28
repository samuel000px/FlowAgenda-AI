# WhatsApp Business oficial — FlowAgenda-AI / Santa Cor

Integração direta com a Cloud API da Meta. O painel Santa Cor fica em `/painel`; a página pública continua em `/`. O aplicativo WhatsApp Business instalado no celular não libera a API automaticamente.

## Preparação quando estiver com o celular

1. Tenha acesso ao WhatsApp Business e à conta Meta que administra a empresa, com autorização da responsável.
2. Conecte o número à Cloud API pelo fluxo oficial disponível para essa empresa. Para manter aplicativo e API no mesmo número, confira a elegibilidade para **coexistência** e o cadastro oficial correspondente. Este projeto não implementa Embedded Signup; recebe credenciais após esse cadastro. Não exclua a conta do celular como tentativa de resolver uma restrição.
3. Resolva pendências reais da empresa na Meta. O erro `131031 / Business Account locked` bloqueia mensagens; preencher credenciais aqui não remove essa restrição.
4. Obtenha **Phone Number ID**, versão da API, token de acesso e **App Secret**. Phone Number ID não é o telefone, App ID nem WABA ID. Confira acesso ao número e a permissão `whatsapp_business_messaging`. Use um token adequado à operação contínua e acompanhe sua validade.
5. Em **Integrações → WhatsApp Business · Meta**, selecione **Número da esmalteria**. Comece com a lista restrita ao telefone de uma pessoa da equipe. Mantenha automação e modelos fora da janela desligados até o teste.
6. Salvar consulta somente a identidade do número, sem enviar mensagens. Não comprova liberação da conta nem aprovação de modelos. Token e App Secret ficam criptografados e não são retornados ao navegador; campos vazios ao editar mantêm os segredos existentes.

## Preparar o servidor

No PowerShell do VS Code, dentro de `encaixa-online`, use `npm.cmd` se `npm.ps1` estiver bloqueado:

```powershell
npm.cmd run build
npm.cmd run db:init
npm.cmd run dev
```

Configure `APP_SENHA` e `CALENDAR_ENCRYPTION_KEY` no servidor. A chave tem 64 caracteres hexadecimais; não troque uma chave que já protege conexões. `.dev.vars` e bancos ficam fora do Git. A migração `0002_whatsapp.sql` é aplicada sem apagar a agenda.

A Meta precisa de **HTTPS público**. Para publicar, use o fluxo Cloudflare do README (`npm.cmd run deploy`), ou um túnel HTTPS de desenvolvimento com o computador ligado. O script de publicação inclui a tabela WhatsApp e a rotina `* * * * *`; ela só fica ativa depois de uma publicação bem-sucedida. Editar estes arquivos não publica o sistema.

Cadastre os segredos também na hospedagem. Dados e credenciais locais não são copiados automaticamente para o servidor publicado.

## Configurar o recebimento

1. Depois de salvar a conexão, informe o endereço público do sistema no painel.
2. Copie **URL de retorno** e **Token de verificação** para o webhook no aplicativo Meta.
3. Assine o campo **messages** e confirme a assinatura do aplicativo na conta WhatsApp, conforme o cadastro utilizado.
4. Confira “Webhook verificado” e teste uma mensagem recebida. O desafio validado não comprova que a assinatura de eventos está correta.

O endereço é `/api/whatsapp/webhook?room=<identificador>`. GET valida o desafio; POST verifica HMAC-SHA256 do corpo original e aceita apenas o Phone Number ID configurado. Eventos são persistidos antes do processamento; repetições não duplicam respostas. Informar o endereço público no painel não hospeda o site nem cria um túnel.

## Primeiro teste com o número real

1. Cadastre o telefone de teste como uma cliente, incluindo país e DDD, em apenas um cadastro; registre autorização de contato.
2. Dessa conta pessoal, envie “Olá” ao número da esmalteria.
3. Confira a mensagem em **Atendimento** e responda manualmente pelo painel. “Aceita pela Meta” não significa “Entregue”; acompanhe os estados.
4. Ative a automação, crie uma proposta nova válida e teste aceite e recusa. Aceites aguardam aprovação da gerente; recusas podem oferecer a vaga à próxima candidata elegível.
5. Teste um lembrete próximo ao horário. Recusa explícita de presença cancela apenas o atendimento relacionado. Silêncio não cancela reservas.
6. Depois de publicar, feche o painel e confirme a execução automática na hospedagem. Integrações mostra a última execução; confira também os registros do Worker.

A rotina do servidor verifica lembretes e retoma filas a cada minuto, somente para conexões com automação ativada. No computador, mantenha o painel aberto. Conectar não dispara histórico antigo. Filas existentes ainda válidas podem ser liberadas ao reabrir a janela, ativar automação ou autorizar modelos.

Contatos desconhecidos ficam para atendimento manual, sem alterar reservas. “PARAR”, “SAIR” e “cancelar mensagens” removem autorização de contato sem cancelar agendamentos.

## Modelos de encaixe e presença

O uso de modelos fica **desligado por padrão**. Sem modelos, mensagens fora da janela de 24 horas aguardam uma resposta real da cliente. Não há conversão automática de texto livre em mensagem paga.

Cadastre na Meta os textos abaixo com **parâmetros numéricos**, idioma `pt_BR`, sem cabeçalho e exatamente dois botões de resposta rápida na ordem indicada. A classificação, aprovação e preço são determinados pela Meta.

Parâmetros: `{{1}}` nome; `{{2}}` serviço; `{{3}}` data e hora; `{{4}}` profissional. Exemplos: Ana, Manicure, 30/10/2026 às 14:00, Lia.

### `flowagenda_encaixe`

> Olá, {{1}}. Temos uma opção para antecipar seu atendimento de {{2}} para {{3}}, com {{4}}. Deseja aceitar? Seu horário atual permanece reservado até a confirmação da equipe.

Botões: **Aceitar horário**; **Manter meu horário**.

### `flowagenda_presenca`

> Olá, {{1}}. Você confirma seu atendimento de {{2}} em {{3}}, com {{4}}? Se não puder comparecer, toque em Não vou comparecer para cancelar esse atendimento.

Botões: **Confirmar presença**; **Não vou comparecer**.

Informe nomes aprovados e idioma no painel. Autorize o uso somente depois da aprovação e de conferir preços. Não há verificação automática de aprovação dos modelos. Eles devem ter o conteúdo acima, também disponível para copiar em Integrações.

Antes de cada envio, permissões e modelo são reavaliados. Dentro da janela, usa texto/botões; fora dela, somente esses modelos autorizados para solicitações atuais. Desativar modelos impede mensagens pendentes de utilizá-los. Respostas de botões identificam a mensagem original; botões antigos não confirmam um agendamento novo.

A confirmação final da remarcação após aprovação da gerente ainda é texto livre: se a janela já fechou, aguarda nova resposta da cliente.

## Número de teste da Meta

O modo de teste mantém até cinco destinatários verificados e permite `hello_world` por ação da equipe. Essa saudação não é usada no número real. A conta Meta precisa estar liberada mesmo para testes.

## Limites e recuperação

- Não há ativação do número, verificação empresarial ou envio real na instalação. É necessária uma conta Meta liberada.
- O escopo cobre texto e botões; anexos não são baixados nem interpretados.
- Gemini interpreta somente respostas ambíguas vinculadas a propostas. Indisponibilidade do modelo preserva a mensagem. A agenda mantém aprovação humana e validações.
- Timeout fica “sem confirmação”, sem reenvio automático. Falhas definitivas permitem tentativa manual após resolver a causa.
- Google Agenda exige sua própria conexão. A lista de espera continua com agendamento pela gerente; o motor antecipa clientes já agendadas.
- O sistema não importa nem dispara para os contatos do celular.
- API, IA e hospedagem têm regras e limites próprios; não há promessa de operação gratuita ilimitada.

## Organização e validação

- `lib/whatsapp-core.mjs`: regras de envio, janela, modelos e respostas.
- `lib/whatsapp.ts`: criptografia, persistência e fila.
- `lib/whatsapp-inbox.ts`: processamento dos eventos recebidos.
- `lib/whatsapp-scheduler.ts`: rotina no servidor.
- `lib/whatsapp-templates.mjs`: textos e parâmetros dos modelos.
- `app/api/whatsapp/`: configuração autenticada e webhook assinado.
- `worker/index.ts`: servidor Vinext e rotina agendada.
- `scripts/deploy.mjs`: publicação Santa Cor, migrações e configuração da rotina.

Execute `npm.cmd test`, `npm.cmd run typecheck` e `npm.cmd run build`. Os testes usam banco em memória e respostas simuladas, sem mensagens reais.

Referências: [política oficial](https://whatsappbusiness.com/policy/), [modelos com botões — Meta](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive), [cadastro do aplicativo Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users), [assinatura](https://github.com/fbsamples/whatsapp-api-examples/tree/main/signature-validation-with-webhooks-payloads), [rotinas Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
