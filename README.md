# FlowAgenda

**Cancelamento vira hora vazia. O FlowAgenda transforma hora vazia em hora recuperada.**

Agenda para salões pequenos que se reorganiza sozinha quando alguém cancela: encontra quem pode vir
antes, escreve a mensagem, entende a resposta e só mexe na agenda depois que a dona aprova.

**[Conheça o FlowAgenda: como funciona, esquemas, resultados e como rodar](agente-remarcacao/README.md)**

Este repositório tem duas partes:

| Pasta | O que é |
|---|---|
| [`agente-remarcacao/`](agente-remarcacao/README.md) | O FlowAgenda: remarcação em cascata, página pública do salão e painel com senha (Python, Streamlit, Gemini). |
| raiz (abaixo) | O **Encaixa · Esmalteria**, de Samuel Almeida, em que o FlowAgenda se inspirou (TypeScript, Cloudflare). |

---

# Encaixa · Esmalteria

Plataforma de agenda com painel do gerente, chat, simulador de clientes e recuperação de horários pela lista de espera. A demonstração usa 50 clientes fictícias e três profissionais.

## Executar

Requer Node.js 22.13 ou superior. No Windows, abra **INICIAR.cmd**. Pelo terminal, na primeira execução:

```sh
npm run setup
npm run dev
```

Abra o endereço exibido no terminal, normalmente http://localhost:5173. Nas próximas execuções, use `npm run dev`. O banco local fica em `.wrangler/`; não apague essa pasta se quiser preservar as salas.

## Usar a plataforma

1. Clique em **Criar minha sala de teste**.
2. Use **Convidar para testar** para abrir o simulador de clientes em outra aba.
3. Avance o relógio em **+5 min**: o sistema solicita confirmação 30 minutos antes do atendimento.
4. Responda **Não vou** como Ana Lima para liberar um horário.
5. Acompanhe a proposta para uma cliente da lista de espera e confirme o encaixe no simulador.

O silêncio mantém a reserva. As propostas respeitam duração, profissional, disponibilidade e tempo de deslocamento. Recusas ou expiração levam à busca de outra cliente.

## Gemini opcional

Copie `.dev.vars.example` para `.dev.vars`, preencha a chave, reinicie o servidor e marque **Interpretar com Gemini** no chat. A chave fica somente no servidor. Sem chave, a simulação por regras e os botões funcionam normalmente.

## Código

| Pasta/arquivo | Função |
|---|---|
| `app/dashboard.tsx` | Interface do gerente e das clientes |
| `app/globals.css` | Aparência e adaptação para celular |
| `app/api/room/route.ts` | API, acesso às salas e persistência |
| `lib/salon.mjs` | Agenda, confirmações e otimização dos encaixes |
| `lib/agent.ts` | Interpretação das mensagens com Gemini |
| `db/` e `drizzle/` | Estrutura e migrações do banco |
| `tests/` | Testes das regras de negócio |
| `scripts/` e `worker/` | Execução, compilação e hospedagem |

## Verificação e hospedagem

```sh
npm test
npm run typecheck
npm run build
```

`npm run db:init` prepara o banco local após a compilação e preserva um banco existente. `npm start` abre a prévia local da versão compilada. Novas migrações precisam ser aplicadas separadamente.

A aplicação usa React/TypeScript, Vinext, Cloudflare Workers e D1. `.openai/hosting.json` mantém o vínculo com o projeto Sites. Salvar no editor não publica alterações; o endereço localhost funciona apenas neste computador.

Esta versão usa dados fictícios e não envia mensagens externas. Os lembretes dependem de uma tela aberta. Ainda não inclui importação de clientes reais ou autenticação individual de clientes.
