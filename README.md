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

## Organizar a operação

1. Em **Configurações**, informe o nome da esmalteria e a antecedência mínima.
2. Em **Equipe e serviços**, revise preços, durações, especialidades e expedientes.
3. Em **Clientes**, cadastre contato, autorização para antecipação, disposição de 0 a 10 e profissional preferida.
4. Cadastre horários em **Agenda → Novo agendamento**.
5. Um cancelamento libera uma vaga e prepara uma proposta quando há candidata elegível e benefício esperado positivo.
6. Em **Atendimento**, copie a proposta para o canal usado pela esmalteria e registre a resposta recebida. Uma resposta ambígua gera um pedido de esclarecimento; uma segunda ambiguidade encerra aquela proposta.
7. O aceite da cliente aguarda **Remarcações → Aprovar alteração**. Só então o horário muda; a vaga de origem pode gerar até dois desdobramentos. Recusas e encerramento sem resposta podem preparar a próxima proposta.
8. Em **Fechamento**, registre presenças e faltas após o atendimento. O histórico alimenta os cálculos e pode ser exportado em CSV.

Sem chave Gemini, respostas diretas e botões de aceite/recusa continuam funcionando. Para interpretação livre, configure `GEMINI_API_KEY` e opcionalmente `GEMINI_MODEL` no servidor e reinicie. O modelo recebe apenas a proposta e a resposta, nunca acesso direto à agenda. A interpretação tem limite diário e prazo de resposta.

## Regras incorporadas

- Compatibilidade de serviço e duração, antecedência mínima, autorização e disponibilidade.
- Preferência da profissional e disposição para antecipar; redução de disposição quando a cliente escolheu um horário posterior apesar de haver opções anteriores.
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

## Limites atuais

- WhatsApp é um canal manual: há registro de conversas e mensagens preparadas, mas nenhum envio automático.
- Lembretes são preparados 30 minutos antes enquanto o painel está aberto. Silêncio nunca cancela uma reserva.
- A lista de espera informa a demanda; novos encaixes dessa lista são agendados pela gerente. O motor importado antecipa clientes que já têm horário futuro.
- Os parâmetros de probabilidade são heurísticos; não há promessa de aumento de receita.
- Ainda não há contas individuais por funcionária, recuperação de senha ou importação de dados externos.
- O endereço local funciona neste computador. Estas alterações não publicam o site automaticamente.

Agendas antigas abertas com o link de gerente são preservadas após login. Os dados previamente usados como exemplos continuam sendo exemplos; renomear a interface não os transforma em registros reais. Serviços e reservas antigas sem preço preservam valor zero até revisão. Novos acessos sem agenda anterior começam vazios, com catálogo inicial editável.

## Código e validação

| Caminho | Responsabilidade |
|---|---|
| `app/admin-dashboard.tsx`, `app/admin-modal.tsx` | Painel e formulários |
| `app/globals.css` | Aparência e layout responsivo |
| `lib/flowagenda.mjs` | Regras, classificação, aprovação e histórico |
| `lib/response-agent.ts` | Interpretação limitada das respostas |
| `lib/admin-auth.ts`, `app/api/session/route.ts` | Acesso administrativo |
| `app/api/room/route.ts` | API e persistência com controle de versão |
| `lib/google-calendar.ts`, `lib/calendar-core.mjs` | OAuth e sincronização |
| `tests/fixtures/remarcacao-parity.json` | Resultados dos oito cenários executados no Python |
| `agente-remarcacao/` | Projeto Python/Streamlit original |

```sh
npm test
npm run typecheck
npm run build
```

Os testes comparam ordem, elegibilidade, ganho, risco e probabilidade com os oito cenários do Python. Também verificam aprovação, rejeição, ambiguidade, conflitos, idempotência e sincronização de calendário com respostas controladas. Os arquivos `lib/salon.mjs` e `lib/agent.ts` são legado, mantidos para referência e testes; a API administrativa usa `flowagenda.mjs`.

A hospedagem usa React, Vinext, Cloudflare Workers e D1. Preserve `.openai/hosting.json` e a integração Sites no Vite. Não foram alteradas as migrações existentes.
