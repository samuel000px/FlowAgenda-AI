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

1. O catálogo fica em **Equipe e serviços**, separado por área (Unhas, Cabelo). Cada serviço pode ter **opções** com tempo e valor próprios (o comprimento da escova) e **adicionais** da mesma área, que somam só no preço (francesinha, babyliss). São quatro áreas: Mãos e pés, Alongamento e gel, Cabelo, e Sobrancelha e depilação. O catálogo traz todos os serviços que aparecem sozinhos na planilha do salão; combinações como "manutenção + pedicure" viram dois itens no carrinho. Os preços iniciais são os mais cobrados na planilha (ago/2025 a out/2026); os tempos são estimativas. "Importar serviços das fichas" acrescenta o que faltar, sem duplicar nem mudar o que já existe. Agendas que já estavam em uso recebem uma vez os serviços que faltavam (esmaltação no pé, esmaltação simples, postiça, ajuste de unha, nariz, orelha, queixo e brow lamination), já com as profissionais que fazem a área. Um serviço só aparece no site se alguma profissional ativa o faz; no catálogo do painel, o que está fora do site vem marcado.
2. O carrinho aceita até 3 serviços. Eles ficam **em sequência**, um começando quando o outro termina, com **uma profissional por área**: unhas com quem faz unhas, escova com quem faz escova.
3. **Ofertas "Pegue também"**: em Equipe e serviços, cada oferta diz quem escolher o gatilho (um serviço ou qualquer serviço de uma área) ganha desconto, em % ou R$, no alvo. A cliente vê a oferta de maior desconto. O desconto vale só no item que entrou depois no carrinho, então duas ofertas cruzadas não somam.
4. Os horários seguem uma grade de blocos (45 minutos por padrão) dentro do funcionamento de cada dia, definido em **Configurações** (padrão: terça a sexta 9h–18h, sábado 8h–17h). Só aparecem inícios em que o carrinho inteiro cabe, fora do intervalo das profissionais e sem bater em outro atendimento.
5. O pedido entra em **Aceitações** e já segura os horários. Aceitar ou recusar vale para o pedido inteiro. A gerência aceita ou recusa; o painel traz a mensagem pronta para avisar a cliente pelo WhatsApp. Pedido sem resposta até o horário é encerrado sozinho.
6. No fim do pedido, a cliente toca em "Confirmar pelo WhatsApp" e manda ao salão uma mensagem já escrita, com o link do agendamento. Como a conversa parte dela, a resposta do salão não é cobrada.
7. A cliente pode cancelar pelo link (o pedido inteiro). Um horário confirmado que é cancelado vira vaga, e o motor de remarcação procura quem antecipar.
8. Pedidos com mais de um atendimento ficam fora da antecipação automática, porque antecipar só um quebraria a sequência.
9. O aniversário (dia e mês, opcional) é pedido no site, no cadastro da gerência e no horário marcado pela equipe. Pelo site ele só preenche um aniversário vazio, nunca troca o que já existe.
10. Quem marca "quero ser avisada se abrir um horário mais cedo" entra como autorizada a antecipar.

## Publicar no Cloudflare

Uma vez só: crie uma conta grátis em cloudflare.com e rode `npx wrangler login`. Depois, para publicar ou atualizar:

```sh
npm run deploy
```

Na primeira vez o comando cria o banco `santa-cor-db` e as tabelas, publica o app `santa` e gera a chave que assina o login. Com o subdomínio da conta definido como `cor-esmalteria`, o endereço fica `https://santa.cor-esmalteria.workers.dev`. No fim o comando mostra o endereço e quais segredos faltam. Cadastre a senha e a chave do Gemini, uma vez, com `npx wrangler secret put APP_SENHA --name santa` e `npx wrangler secret put GEMINI_API_KEY --name santa`. Nenhum dado publicado é apagado nas atualizações.

## Painel da gerência

- **Receita prevista** soma o valor de cada atendimento confirmado do dia escolhido na agenda (o valor gravado na hora de marcar, com desconto e adicionais) e tira as faltas registradas. Pedidos do site ainda não aceitos não entram.
- **Responder WhatsApp** conta as conversas cuja última mensagem é da cliente e que o atendimento automático não resolveu (por exemplo, quem pediu para falar com alguém). Com uma ou mais, o cartão fica em alerta e aparece um aviso que leva ao Atendimento; some quando alguém da equipe responde.
- **Lista de espera** fica numa faixa acima da agenda, que usa a largura toda. Quem demonstrou interesse numa data cheia aparece primeiro, marcado como prioridade, e cada entrada avisa quando abre uma vaga daquele serviço no dia.

## Organizar a operação

1. Em **Configurações**, informe o nome da esmalteria, a antecedência mínima, o tamanho do bloco e o funcionamento de cada dia.
2. Em **Equipe e serviços**, revise preços, durações, especialidades e expedientes. Use durações que sejam múltiplos do bloco (com bloco de 45 min: 45, 90, 135...).
3. Em **Equipe e serviços**, **Excluir** tira a profissional da equipe, do site e das listas. Quem ainda tem horário marcado ou proposta em aberto precisa ter esses horários remarcados ou cancelados antes. Se ela já atendeu, o registro fica guardado só para a agenda antiga e as finanças continuarem com o nome dela; sem histórico, sai de vez.
4. Em **Clientes**, cadastre contato, profissional preferida e se ela gostaria de antecipar caso apareça um horário mais cedo (sim ou não).
5. Cadastre horários em **Agenda → Novo agendamento**.
6. Um cancelamento libera uma vaga e prepara uma proposta quando há candidata elegível e benefício esperado positivo.
7. Em **Atendimento**, acompanhe o WhatsApp conectado em Integrações ou registre retornos de outros canais. Na conexão Meta, propostas novas são enviadas aos participantes autorizados quando existe uma janela de conversa ativa. Uma resposta ambígua gera um pedido de esclarecimento; uma segunda ambiguidade encerra aquela proposta.
8. O aceite da cliente aguarda **Remarcações → Aprovar alteração**. Só então o horário muda; a vaga de origem pode gerar até dois desdobramentos. Recusas e encerramento sem resposta podem preparar a próxima proposta.
9. Em **Fechamento**, registre presenças e faltas após o atendimento. O histórico alimenta os cálculos e pode ser exportado em CSV.

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

A administração acessa **Configurações → Integrações → Conectar conta Google**, escolhe a conta e autoriza. O retorno abre a mesma seção, com o progresso e o botão para abrir a agenda. A instalação precisa das credenciais do aplicativo uma única vez; cada administrador não precisa criar um projeto Google.

- Agenda dedicada à esmalteria: título com serviço, cliente e profissional; uma cor estável por profissional; início e fim reais do atendimento, incluindo opções e adicionais. Cada serviço de um pedido com vários serviços tem seu próprio evento.
- Horários confirmados, atuais e futuros, são sincronizados. Pedidos aguardando aceite não ocupam o Google antes da aprovação. Remarcações aprovadas atualizam o evento existente; cancelamentos o removem.
- Mudanças são enviadas ao salvar e reavaliadas periodicamente. A rotina da hospedagem trabalha com o painel fechado, independentemente da ativação do WhatsApp. Importações iniciais seguem em lotes de até 20 alterações; o painel informa o que falta. Em instalações com várias agendas, a rotina prioriza a menos recentemente sincronizada.

A sincronização é **do painel para o Google**; edições diretamente no Google não são importadas. Dados locais permanecem salvos em caso de falha. Tokens são criptografados; autorização e renovação ficam no servidor. A permissão se limita às agendas criadas pelo aplicativo. Trocar a conta verifica o acesso à agenda anterior e cria outra quando necessário; a antiga permanece na conta anterior. Desconectar interrompe a sincronização, sem excluir os eventos já enviados.

A configuração inicial do responsável técnico, a publicação e a conferência com uma conta real estão no [guia Google Agenda](docs/google-agenda.md).

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

A área prioriza o celular: até 760 px, a agenda usa cartões e o menu fica fixo na parte inferior (Agenda, Novo horário e Atendimento). Os controles têm área de toque ampliada, campos de 16 px e espaço para a área segura do aparelho. Há atalhos para o dia anterior, próximo dia e hoje; no computador, a agenda continua em tabela. O endereço é o mesmo nos dois formatos.

O link é uma credencial compartilhada: quem o receber pode escolher qualquer nome ativo. A escolha identifica a sessão e registra as ações, mas não comprova a identidade da pessoa. Para revogar acessos, a gerente pode trocar ou desativar o link; isso também invalida as sessões existentes. Inativar ou excluir uma profissional bloqueia seu acesso. Sessões duram oito horas e são separadas das sessões administrativas.

Permissões da equipe, verificadas no servidor:

- Consultar a agenda por data, filtrando seus atendimentos ou toda a equipe.
- Identificar pedidos do site que ainda aguardam aceite; aceitar ou recusar esses pedidos continua sendo uma ação da gerência na aba Aceitações. Pedidos pendentes também impedem remarcações conflitantes.
- Marcar horário para quem chegou na loja ou para outro dia (aba **Novo horário**): serviço, profissional (qualquer uma da equipe; já vem quem está usando), dia, horário, cliente e se ela quer antecipar. Entra direto como confirmado, a partir de agora, sem a antecedência mínima do site.
- A cliente é buscada por nome (sem ligar para acento) ou por parte do número; a busca mostra só o nome e o final do número. Cadastro novo com o número de outra cliente é bloqueado e oferece usar o cadastro dela; com o mesmo nome, pede para escolher a existente ou confirmar que é outra pessoa. Se a cliente da lista trocou de número, o novo substitui o antigo (fica registrado nas atividades). Um número que já é de outra cliente não pode ser usado.
- A resposta sobre antecipar, dada ali pessoalmente, atualiza o cadastro da cliente.
- No cadastro da gerência vale o mesmo: número repetido é recusado e nome repetido pede confirmação.
- **Data cheia**: se não houver horário livre no dia, a funcionária pode tocar em "Demonstrar interesse nesta data" e colocar a cliente na lista de espera daquele dia, com prioridade. No site, a cliente faz o mesmo deixando nome e celular.
- Assumir e encerrar pedidos de conversa em Atendimento. Fechar a conversa não cancela nenhum horário. Propostas do agente e suas aprovações ficam exclusivamente com a administração, inclusive nas APIs.
- Não pode cancelar horários, reagendar livremente, acessar/aprovar/rejeitar propostas do agente, registrar faltas, consultar Finanças, modificar equipe/configurações ou acessar credenciais da integração. Para conversar com a cliente, abre o WhatsApp do próprio aparelho; o envio é manual.

O servidor devolve apenas os dados necessários à agenda, ao cadastro presencial e aos pedidos de conversa. As ações ficam em `staffAudit` e na atividade da gerência. Link e dados locais não são transportados automaticamente para a hospedagem: depois de publicar, gere e copie o link na versão hospedada. Um endereço localhost só funciona no computador do servidor.

Arquivos principais: `app/staff-portal.tsx` (interface), `app/staff.css` (estilos da equipe), `app/staff-access-panel.tsx` (controle do link pela gerente), `app/[employeeEntry]/page.tsx`, `app/api/staff*/`, `lib/staff-auth.ts` e `lib/staff-core.mjs` (acesso e permissões). A configuração é armazenada no registro da agenda, sem nova migração de banco.

## Ações e Finanças

- **Agenda → Novo agendamento** permite escolher uma cliente existente ou cadastrar uma nova e salvar junto com o horário. A aba Clientes mantém consulta e edição.
- **Ações → Testar conversa** demonstra as opções Agendar, Cancelar e Falar com atendente sem enviar mensagens. Cancelar no exemplo apenas orienta sobre o link exclusivo do agendamento; não cancela uma reserva. Falar com atendente cria um pedido de exemplo compartilhado com a equipe.
- O webhook oficial já encaminha mensagens que exigem intervenção humana à fila de pedidos. A demonstração não ativa envio automático do menu inicial. O menu automático de saudação mencionado pelo colaborador não constava no código recebido nesta atualização.
- Cada pedido pode ser assumido por uma pessoa. Outra funcionária não pode assumir ou encerrar o pedido ocupado; a administração pode encerrá-lo. Novas mensagens após o encerramento abrem um novo pedido. Não se trata de encaminhar mensagens automaticamente para um WhatsApp pessoal: o botão abre a conversa na conta conectada ao aparelho.
- **Finanças**, exclusiva da administração, separa receita prevista de pagamentos registrados. Após marcar comparecimento em Fechamento, confirme o recebimento por Pix, dinheiro ou cartão. O pagamento entra na data local em que foi registrado, mesmo que o serviço seja de outro dia.
- Registre as despesas do dia para obter o saldo recebido menos despesas. Esse saldo não é uma demonstração de lucro e não inclui despesas ainda não lançadas. Registros ficam no banco da agenda, sem nova migração.

As conexões Google Agenda e WhatsApp ficam em **Configurações → Integrações**. Os atalhos da central de atendimento abrem essa mesma seção.

## Finanças

Em **Finanças** há quatro partes:

- **Caixa do dia**: pagamentos e despesas do dia.
- **Parceiras**: o fechamento da semana de cada parceira, como na planilha antiga: atendimentos, total, percentual de repasse, parte dela, descontos (lanche, adiantamento), valor a pagar e parte do salão. Um atendimento sem pagamento registrado entra com o preço da agenda.
- **Resultado e previsão**: o mês com faturamento bruto, repasses, despesas, custos fixos e líquido; o gráfico mês a mês; e a previsão dos próximos meses em faixa (80%), com crescimento médio e o teste de quanto ela costuma errar. O modelo (`lib/previsao.mjs`) é tendência mais o efeito de cada mês do ano; precisa de pelo menos 6 meses.
- **Custos e histórico**: custos fixos mensais, o percentual de repasse de cada parceira (padrão 40%) e a importação do histórico mensal (`mês;bruto;líquido;atendimentos`). Num mês que tem planilha e sistema, vale o maior, para a transição não perder números.

Os números do salão não ficam no código: entram pelo painel.

## Fechamento dos atendimentos

"Fechar atendimento" registra que a cliente veio, quanto pagou de verdade (com o que mudou, como um babyboomer que não estava na agenda), como pagou e quem atendeu. A gerência fecha em **Fechamento**; a equipe fecha pelo celular, na aba **Fechamento** da área das funcionárias, inclusive o atendimento de uma colega. Faltas continuam com a gerência.

Perguntas em aberto para o salão: `docs/perguntas-para-o-salao.md`.

## Dados da planilha antiga e estoque

A planilha que o salão usava vira dados do sistema uma vez só. O arquivo `dados/santa-cor.json` (fora do Git, porque tem nomes e telefones de clientes) traz:

- **Clientes**: nome, celular, aniversário, quantas vezes veio, última visita, quanto gastou, último serviço e profissional mais frequente.
- **Equipe atual**, com os serviços das áreas que cada uma atende.
- **Faturamento** mês a mês, **custos fixos** e **estoque**.

Com o arquivo na pasta `dados/`, o `npm run deploy` importa sozinho no site publicado. No computador, `npm run importar` faz o mesmo no banco local. Para rodar só a importação no site publicado: `node scripts/importar-planilha.mjs --remote`. Importar de novo não duplica: a cliente é reconhecida pelo celular ou pelo nome, e o que já está no sistema é mantido (só o que está vazio é completado).

O banco publicado aceita no máximo ~100 KB por comando; por isso `scripts/importar-planilha.mjs` envia o cadastro em pedaços para uma tabela de passagem e só no fim troca o registro da agenda.

**Estoque** fica no menu do painel: itens por lugar, quantidade, mínimo, entrada e saída (com quem fez e o motivo). Itens no mínimo ou abaixo aparecem em "Para repor".
