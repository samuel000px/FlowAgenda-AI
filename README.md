# FlowAgenda-AI

Plataforma administrativa de esmalteria com agenda por data, cadastro de clientes, equipe, serviços, conversas, aprovação de remarcações e fechamento de atendimentos.

A interface web incorpora as regras do projeto Python [agente-remarcacao](agente-remarcacao/README.md), preservado neste repositório. A escolha da candidata é feita por regras e cálculos auditáveis; o Gemini interpreta respostas livres, sem autorização para modificar a agenda.

## Executar no computador

Requer Node.js 22.13 ou superior. Na primeira instalação:

```sh
npm run setup
npm run calendar:setup
```

Configure `APP_SENHA` em `.dev.vars` e mantenha `CALENDAR_ENCRYPTION_KEY` gerada pelo comando acima. Depois:

```sh
npm run dev
```

Abra o endereço mostrado no terminal (normalmente http://localhost:5173). O acesso administrativo usa a senha configurada, uma sessão HttpOnly de oito horas e limite de tentativas. O banco local persiste em `.wrangler/`; não apague essa pasta. As chaves e arquivos `.env`/`.dev.vars` não devem ir para o GitHub.

O Streamlit original continua independente: consulte o README dentro de `agente-remarcacao`.

O site tem estes endereços:

| Endereço | O que é |
|---|---|
| `/` | Página pública com seis botões: Agendar, Todos os serviços, WhatsApp, Instagram, Localização e Avaliações |
| `/agendar` | Carrinho: a cliente escolhe os serviços (com opção e adicionais), a profissional de cada área, o dia e o horário, e deixa nome e celular |
| `/servicos` | Preço e duração de cada serviço, com botão para agendar |
| `/a/<código>` | Página pessoal do agendamento; quem tem o link vê os detalhes e pode cancelar |
| `/painel` | Administração, com senha |

O único caminho da página para o painel é a linha "Acesso da equipe", no rodapé. Textos e links da página vêm de `agente-remarcacao/data/salao.json` (exemplo) com `agente-remarcacao/data/salao.local.json` por cima, quando esse arquivo existe no computador que publica; ele fica fora do Git. Para os botões de localização e avaliações, coloque nesse arquivo `"mapa"` e `"avaliacoes"` com os links do Google; sem eles, os dois levam à busca pelo endereço no Google Maps. Serviços, profissionais e horários do agendamento vêm do painel.

### Como funciona o agendamento pelo site

1. O catálogo fica em **Equipe e serviços**, separado por área (Unhas, Cabelo). Cada serviço pode ter **opções** com tempo e valor próprios (o comprimento da escova) e **adicionais** da mesma área, que somam só no preço (francesinha, babyliss). "Importar serviços das fichas" traz a lista das fichas do salão, com valores de exemplo.
2. O carrinho aceita até 3 serviços. Eles ficam **em sequência**, um começando quando o outro termina, com **uma profissional por área**: unhas com quem faz unhas, escova com quem faz escova.
3. **Ofertas "Pegue também"**: em Equipe e serviços, cada oferta diz quem escolher o gatilho (um serviço ou qualquer serviço de uma área) ganha desconto, em % ou R$, no alvo. A cliente vê a oferta de maior desconto. O desconto vale só no item que entrou depois no carrinho, então duas ofertas cruzadas não somam.
4. Os horários seguem uma grade de blocos (45 minutos por padrão) dentro do funcionamento de cada dia, definido em **Configurações** (padrão: terça a sexta 9h–18h, sábado 8h–17h). Só aparecem inícios em que o carrinho inteiro cabe, fora do intervalo das profissionais e sem bater em outro atendimento.
5. O pedido entra em **Aceitações** e já segura os horários. Aceitar ou recusar vale para o pedido inteiro. A gerência aceita ou recusa; o painel traz a mensagem pronta para avisar a cliente pelo WhatsApp. Pedido sem resposta até o horário é encerrado sozinho.
6. No fim do pedido, a cliente toca em "Confirmar pelo WhatsApp" e manda ao salão uma mensagem já escrita, com o link do agendamento. Como a conversa parte dela, a resposta do salão não é cobrada.
7. A cliente pode cancelar pelo link (o pedido inteiro). Um horário confirmado que é cancelado vira vaga, e o motor de remarcação procura quem antecipar.
8. Pedidos com mais de um atendimento ficam fora da antecipação automática, porque antecipar só um quebraria a sequência.
9. Quem marca "quero ser avisada se abrir um horário mais cedo" entra como autorizada a antecipar.

## Publicar no Cloudflare

Uma vez só: crie uma conta grátis em cloudflare.com e rode `npx wrangler login`. Depois, para publicar ou atualizar:

```sh
npm run deploy
```

Na primeira vez o comando cria o banco `santa-cor-db` e as tabelas, publica o app `santa-cor` e gera a chave que assina o login. No fim ele mostra o endereço (`https://santa-cor.<sua-conta>.workers.dev`) e quais segredos faltam. Cadastre a senha e a chave do Gemini, uma vez, com `npx wrangler secret put APP_SENHA --name santa-cor` e `npx wrangler secret put GEMINI_API_KEY --name santa-cor`. Nenhum dado publicado é apagado nas atualizações.

## Painel da gerência

- **Receita prevista** soma o valor de cada atendimento confirmado do dia escolhido na agenda (o valor gravado na hora de marcar, com desconto e adicionais) e tira as faltas registradas. Pedidos do site ainda não aceitos não entram.
- **Responder WhatsApp** conta as conversas cuja última mensagem é da cliente e que o atendimento automático não resolveu (por exemplo, quem pediu para falar com alguém). Com uma ou mais, o cartão fica em alerta e aparece um aviso que leva ao Atendimento; some quando alguém da equipe responde.
- **Lista de espera** fica numa faixa acima da agenda, que usa a largura toda. Quem demonstrou interesse numa data cheia aparece primeiro, marcado como prioridade, e cada entrada avisa quando abre uma vaga daquele serviço no dia.

## Organizar a operação

1. Em **Configurações**, informe o nome da esmalteria, a antecedência mínima, o tamanho do bloco e o funcionamento de cada dia.
2. Em **Equipe e serviços**, revise preços, durações, especialidades e expedientes. Use durações que sejam múltiplos do bloco (com bloco de 45 min: 45, 90, 135...).
3. Em **Clientes**, cadastre contato, profissional preferida e se ela gostaria de antecipar caso apareça um horário mais cedo (sim ou não).
4. Cadastre horários em **Agenda → Novo agendamento**.
5. Um cancelamento libera uma vaga e prepara uma proposta quando há candidata elegível e benefício esperado positivo.
6. Em **Atendimento**, acompanhe o WhatsApp conectado em Integrações ou registre retornos de outros canais. Na conexão Meta, propostas novas são enviadas aos participantes autorizados quando existe uma janela de conversa ativa. Uma resposta ambígua gera um pedido de esclarecimento; uma segunda ambiguidade encerra aquela proposta.
7. O aceite da cliente aguarda **Remarcações → Aprovar alteração**. Só então o horário muda; a vaga de origem pode gerar até dois desdobramentos. Recusas e encerramento sem resposta podem preparar a próxima proposta.
8. Em **Fechamento**, registre presenças e faltas após o atendimento. O histórico alimenta os cálculos e pode ser exportado em CSV.

Sem chave Gemini, respostas diretas e botões de aceite/recusa continuam funcionando. Para interpretação livre, configure `GEMINI_API_KEY` e opcionalmente `GEMINI_MODEL` no servidor e reinicie. O modelo recebe apenas a proposta e a resposta, nunca acesso direto à agenda. A interpretação tem limite diário e prazo de resposta.

## Regras incorporadas

- Compatibilidade de serviço e duração, antecedência mínima, autorização e disponibilidade.
- Preferência da profissional e se a cliente quer antecipar (sim ou não). Quem disse sim parte da mesma chance de aceitar; quem escolheu um horário posterior havendo opções anteriores parte de uma chance menor. Agendas antigas com a nota de 0 a 10 são convertidas: nota 0 vira "não".
- Probabilidade de aceite e faltas suavizadas pelo histórico.
- Benefício esperado = ganho do horário liberado − risco do horário de origem. Propostas sem benefício positivo são descartadas.
- Aceite separado da aprovação humana; verificação da reserva original e dos conflitos novamente ao aprovar.
- Histórico de propostas aceitas, recusadas, sem resposta, presenças e faltas.
- Estimativa de horas vagas nos horários envolvidos no fluxo, sem apresentar esse cálculo como economia realizada.

A versão web acrescenta verificação de conflitos de cliente/profissional e persistência com controle de versão para evitar que duas telas sobrescrevam a agenda.

## Google Agenda

Execute `npm run calendar:setup` e configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` em `.dev.vars`. Cadastre exatamente o mesmo endereço de retorno no cliente OAuth Google (no ambiente local, `http://localhost:5173/api/google/callback`). Reinicie o servidor e conecte em **Integrações**.

A autorização permite gerenciar o calendário dedicado criado pela aplicação. Tokens são criptografados no banco. Cada atendimento mantém um identificador estável, com data própria e fuso America/Fortaleza. Novos agendamentos criam eventos, alterações aprovadas atualizam eventos e cancelamentos os removem. Não são enviados convites a clientes.

A sincronização é do painel para o Google; edições diretamente no Google não são importadas. Se o Google falhar, a operação local fica salva e o painel mostra erro/pendência em Integrações, com nova tentativa. Isso difere do adaptador de teste Python, que desfaz o movimento quando o adaptador externo falha.

## WhatsApp oficial da Meta

Configure em **Integrações → WhatsApp Business · Meta**. O painel recebe o ID do telefone, a versão da API, o token de acesso, o App Secret e a lista de participantes. As credenciais ficam criptografadas no servidor. A configuração e o teste completo estão no [guia do WhatsApp](docs/whatsapp-meta.md).

O servidor recebe respostas por webhook assinado, processa propostas sem remover a aprovação do gerente e acompanha estados de entrega. Há modos para número de teste e número da esmalteria. O número real precisa ser conectado à Cloud API pela Meta antes de preencher as credenciais. Ter o aplicativo WhatsApp Business instalado não basta. Mensagens livres respeitam a janela de 24 horas; modelos de encaixe e presença fora dela exigem aprovação da Meta e autorização explícita no painel para possíveis cobranças, desligada por padrão. Para receber mensagens, a aplicação precisa de HTTPS público.

A publicação Cloudflare inclui a tabela WhatsApp e uma rotina a cada minuto para lembretes e filas, mesmo com o painel fechado. Ela só processa conexões com automação ativada. A data da última execução aparece em Integrações. Nenhuma mensagem real é enviada pelos testes automatizados.

Após atualizar uma instalação existente, execute `npm run build` e `npm run db:init` para preparar a nova tabela sem apagar a agenda.

## Limites atuais

- WhatsApp exige conta Meta liberada e servidor HTTPS acessível. Sem conexão, o atendimento manual permanece disponível. Há suporte a texto, botões e dois modelos específicos; anexos e cadastro Embedded Signup não estão incluídos.
- Lembretes são preparados na janela de 30 minutos antes pelo painel local ou pela rotina na hospedagem. Silêncio nunca cancela uma reserva. A confirmação final após aprovação da gerente ainda depende da janela de conversa ativa.
- A lista de espera informa a demanda; novos encaixes dessa lista são agendados pela gerente. O motor importado antecipa clientes que já têm horário futuro.
- Os parâmetros de probabilidade são heurísticos; não há promessa de aumento de receita.
- Ainda não há contas individuais por funcionária, recuperação de senha ou importação de dados externos.
- O endereço local funciona neste computador. Estas alterações não publicam o site automaticamente.

Agendas antigas abertas com o link de gerente são preservadas após login. Os dados previamente usados como exemplos continuam sendo exemplos; renomear a interface não os transforma em registros reais. Serviços e reservas antigas sem preço preservam valor zero até revisão. Novos acessos sem agenda anterior começam vazios, com catálogo inicial editável.

## Código e validação

| Caminho | Responsabilidade |
|---|---|
| `app/admin-dashboard.tsx`, `app/admin-modal.tsx` | Painel e formulários |
| `app/agendar/`, `app/servicos/`, `app/a/[token]/` | Páginas públicas de agendamento |
| `lib/agendamento.mjs`, `app/api/agendar/route.ts` | Horários livres, pedidos e cancelamento pelo site |
| `app/globals.css` | Aparência e layout responsivo |
| `lib/flowagenda.mjs` | Regras, classificação, aprovação e histórico |
| `lib/response-agent.ts` | Interpretação limitada das respostas |
| `lib/admin-auth.ts`, `app/api/session/route.ts` | Acesso administrativo |
| `app/api/room/route.ts` | API e persistência com controle de versão |
| `lib/google-calendar.ts`, `lib/calendar-core.mjs` | OAuth e sincronização |
| `app/whatsapp-panel.tsx`, `app/whatsapp-chat.tsx` | Configuração Meta e central de atendimento |
| `lib/whatsapp-core.mjs`, `lib/whatsapp.ts`, `lib/whatsapp-inbox.ts` | Transporte, fila, assinatura e processamento de respostas |
| `lib/whatsapp-templates.mjs`, `lib/whatsapp-scheduler.ts`, `worker/index.ts` | Modelos e lembretes automáticos na hospedagem |
| `app/api/whatsapp/` | API administrativa e webhook público assinado |
| `tests/fixtures/remarcacao-parity.json` | Resultados dos oito cenários executados no Python |
| `agente-remarcacao/` | Projeto Python/Streamlit original |

```sh
npm test
npm run typecheck
npm run build
```

Os testes comparam ordem, elegibilidade, ganho, risco e probabilidade com os oito cenários do Python. Também verificam aprovação, rejeição, ambiguidade, conflitos, idempotência e sincronização de calendário com respostas controladas. Os arquivos `lib/salon.mjs` e `lib/agent.ts` são legado, mantidos para referência e testes; a API administrativa usa `flowagenda.mjs`.

A hospedagem usa React, Vinext, Cloudflare Workers e D1. Preserve `.openai/hosting.json` e a integração Sites no Vite. Não foram alteradas as migrações existentes.

## Área reservada das funcionárias

Em **Equipe e serviços → Acesso das funcionárias**, crie e copie o link `/funcionarios-<48 caracteres aleatórios>`. Ele não aparece na página pública e a página sinaliza aos buscadores para não indexar. A entrada mostra as profissionais ativas do cadastro; não usa nomes fixos.

A área prioriza o celular: até 760 px, a agenda usa cartões e o menu fica fixo na parte inferior (Agenda, Clientes e Aprovações). Os controles têm área de toque ampliada, campos de 16 px e espaço para a área segura do aparelho. Há atalhos para o dia anterior, próximo dia e hoje; no computador, a agenda continua em tabela. O endereço é o mesmo nos dois formatos.

O link é uma credencial compartilhada: quem o receber pode escolher qualquer nome ativo. A escolha identifica a sessão e registra as ações, mas não comprova a identidade da pessoa. Para revogar acessos, a gerente pode trocar ou desativar o link; isso também invalida as sessões existentes. Inativar uma profissional bloqueia seu acesso. Sessões duram oito horas e são separadas das sessões administrativas.

Permissões da equipe, verificadas no servidor:

- Consultar a agenda por data, filtrando seus atendimentos ou toda a equipe.
- Identificar pedidos do site que ainda aguardam aceite; aceitar ou recusar esses pedidos continua sendo uma ação da gerência na aba Aceitações. Pedidos pendentes também impedem remarcações conflitantes.
- Marcar horário para quem chegou na loja ou para outro dia (aba **Novo horário**): serviço, profissional (qualquer uma da equipe; já vem quem está usando), dia, horário, cliente e se ela quer antecipar. Entra direto como confirmado, a partir de agora, sem a antecedência mínima do site.
- A cliente é buscada por nome (sem ligar para acento) ou por parte do número; a busca mostra só o nome e o final do número. Cadastro novo com o número de outra cliente é bloqueado e oferece usar o cadastro dela; com o mesmo nome, pede para escolher a existente ou confirmar que é outra pessoa. Se a cliente da lista trocou de número, o novo substitui o antigo (fica registrado nas atividades). Um número que já é de outra cliente não pode ser usado.
- A resposta sobre antecipar, dada ali pessoalmente, atualiza o cadastro da cliente.
- No cadastro da gerência vale o mesmo: número repetido é recusado e nome repetido pede confirmação.
- **Data cheia**: se não houver horário livre no dia, a funcionária pode tocar em "Demonstrar interesse nesta data" e colocar a cliente na lista de espera daquele dia, com prioridade. No site, a cliente faz o mesmo deixando nome e celular.
- Aprovar remarcações já aceitas pela cliente que envolvam a profissional escolhida (horário de origem ou destino). Disponibilidade e conflitos são conferidos novamente; a aprovação registra a responsável e mantém a sincronização Google e WhatsApp existente.
- Não pode cancelar, reagendar livremente, rejeitar propostas, registrar faltas, modificar equipe/configurações, enviar mensagens avulsas ou acessar credenciais da integração.

O servidor devolve apenas os dados necessários à agenda e às aprovações. As ações ficam em `staffAudit` e na atividade da gerência. Link e dados locais não são transportados automaticamente para a hospedagem: depois de publicar, gere e copie o link na versão hospedada. Um endereço localhost só funciona no computador do servidor.

Arquivos principais: `app/staff-portal.tsx` (interface), `app/staff.css` (estilos da equipe), `app/staff-access-panel.tsx` (controle do link pela gerente), `app/[employeeEntry]/page.tsx`, `app/api/staff*/`, `lib/staff-auth.ts` e `lib/staff-core.mjs` (acesso e permissões). A configuração é armazenada no registro da agenda, sem nova migração de banco.
