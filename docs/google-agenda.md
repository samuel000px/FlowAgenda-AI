# Google Agenda no FlowAgenda-AI

## Para quem administra a esmalteria

1. Entre no painel e abra **Configurações → Integrações**.
2. Clique em **Conectar conta Google**, escolha a conta que vai acompanhar a agenda e autorize.
3. Ao voltar, confira o progresso. Use **Abrir Google Agenda** para ver a agenda da esmalteria. No aplicativo do celular, use a mesma conta e deixe essa agenda marcada para exibição.
4. Cadastre e altere horários pelo FlowAgenda-AI. Cada serviço confirmado aparece com a cliente, a profissional e a duração do agendamento. A agenda reúne todos os dias; no Google, escolha a visualização Dia ou Semana.
5. Para aniversários, abra **Clientes → Editar** e preencha dia/mês. Também é possível informar a data ao cadastrar uma cliente no novo agendamento. O ano de nascimento não é necessário.

As cores identificam profissionais; aniversários ficam em rosa, como eventos anuais de dia inteiro, sem bloquear horários. Pedidos ainda aguardando aceite e propostas ainda não aprovadas não viram novos horários no Google. Não são enviados convites nem mensagens às clientes.

Se aparecer um erro, a agenda do sistema continua salva. Use **Atualizar agora** para tentar novamente ou **Reconectar ou trocar conta** quando a autorização tiver expirado. Para 29/02, o lembrete ocorre no último dia de fevereiro. Faça correções no cadastro da cliente para atualizar a série inteira.

## Preparação única da instalação

O administrador só escolhe a conta, mas o responsável pelo sistema precisa configurar o aplicativo Google uma vez por instalação.

1. No Google Cloud, habilite **Google Calendar API** no projeto.
2. Configure a tela de consentimento OAuth/Google Auth Platform com os dados reais do aplicativo. Em modo de testes, inclua a conta do administrador entre os usuários de teste.
3. Crie um cliente OAuth do tipo **Aplicativo da Web** e cadastre o endereço de retorno exato:
   - Local: `http://localhost:5173/api/google/callback`.
   - Hospedado: `https://SEU-DOMINIO/api/google/callback`.
4. Na pasta da plataforma, rode `npm.cmd run calendar:setup`. Preencha em `.dev.vars` os valores de `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI`. O script preserva a chave de proteção existente. Reinicie o servidor após alterar configurações.
5. Na hospedagem, cadastre esses três valores como segredos do Worker. Preserve `CALENDAR_ENCRYPTION_KEY`, que também protege as sessões e outras conexões. Nunca envie `.dev.vars` ao GitHub. O endereço de retorno deve usar o domínio em que o administrador abre o painel.
6. Publique com o fluxo existente `npm.cmd run deploy`. Ele configura a rotina Cloudflare de um minuto. A rotina de calendário é independente da conexão WhatsApp; no desenvolvimento local, as atualizações ocorrem ao salvar ou enquanto o painel está aberto, pois o cron publicado não roda automaticamente no servidor local.

O escopo usado é `https://www.googleapis.com/auth/calendar.app.created`, que permite criar e gerenciar calendários secundários da aplicação. Não solicita acesso geral às agendas pessoais. Veja os [escopos oficiais do Google Calendar](https://developers.google.com/workspace/calendar/api/auth).

Em aplicativos externos com publicação **Testing**, o Google normalmente expira a autorização de renovação após sete dias. Para uso contínuo, finalize a configuração de produção e atenda aos requisitos de verificação aplicáveis exibidos pelo Google. A reconexão já está disponível no painel. Consulte [OAuth e expiração de tokens](https://developers.google.com/identity/protocols/oauth2/) e o [fluxo OAuth para aplicações web](https://developers.google.com/identity/protocols/oauth2/web-server).

## Conferência com uma conta real

- Conecte pelo botão do painel e confirme que a agenda da esmalteria apareceu na mesma conta Google.
- Agende um serviço: confira data, início, fim, duração, cliente e profissional.
- Reagende e confirme que o mesmo evento mudou, sem duplicar. Cancele e confira a remoção.
- Preencha um aniversário, corrija a data e apague o campo: a série deve ser criada, atualizada e removida.
- Em uma instalação publicada, feche o painel e confirme que novas alterações e tentativas pendentes continuam sendo processadas.

Os testes automatizados usam uma API Google simulada e banco isolado. Eles não autorizam contas nem comprovam a configuração do projeto Google ou dos segredos da hospedagem.

## Dados e manutenção

- `client.birthday`: vazio ou `MM-DD`. `lib/client-birthday.mjs` valida a data, aceita `DD/MM` na entrada e não exige migração para clientes existentes.
- IDs estáveis permitem atualizar o mesmo evento. A assinatura de sincronização acompanha alterações em clientes, serviços, profissionais e horários. A rotina também recolhe mudanças futuras gravadas no banco por outros canais.
- Lotes de 20 alterações por execução evitam grandes cargas iniciais. Repetir a execução continua de onde parou, inclusive após falha parcial. O painel só informa sincronização completa quando todas as alterações do lote de dados foram enviadas.
- Aniversários usam eventos comuns com recorrência anual no calendário dedicado, sem integração com Google Contatos e sem depender do tipo especial de evento de aniversário. Referência: [eventos e recorrência](https://developers.google.com/workspace/calendar/api/concepts/events-calendars).
- Mudanças feitas diretamente no Google não voltam ao painel. Desconectar preserva eventos anteriores; uma conexão posterior sem o vínculo salvo pode criar uma nova agenda.
