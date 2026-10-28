# Integração com o Google Agenda

Guia para quem for ligar o agente ao Google Agenda. A ideia é a mesma do canal de mensagens: o
agente conhece só uma interface (`AgendaExterna`, em [`src/agenda_externa.py`](../src/agenda_externa.py)),
e o Google entra como um arquivo novo que implementa essa interface. Não é preciso mexer no agente,
no score nem na cascata.

> Se a integração for no **Encaixa** (o app TypeScript da raiz do repositório), ela não toca nesta
> pasta e não há conflito com o agente. Só vale a regra das credenciais lá no fim deste guia: o
> `.gitignore` da raiz já ignora `credentials.json`, `token.json`, `client_secret*.json` e a pasta `credenciais/`.

## Onde colocar o código

| O quê | Onde |
|---|---|
| A classe `AgendaGoogle(AgendaExterna)` | arquivo novo `src/agenda_google.py` |
| Bibliotecas do Google | no fim de `requirements.txt`: `google-api-python-client` e `google-auth-oauthlib` |
| Variáveis de configuração | `.env` (os nomes já estão em `.env.example`: `GOOGLE_CALENDAR_ID`, `GOOGLE_CREDENTIALS_FILE`, `GOOGLE_TOKEN_FILE`) |
| Arquivo JSON de credenciais | pasta `credenciais/`, que fica fora do git |
| Testes | arquivo novo em `tests/`, usando uma agenda falsa (veja `tests/test_agenda_externa.py`) |

## O que a classe precisa fazer

```python
class AgendaGoogle(AgendaExterna):
    def carregar_slots(self, inicio, fim) -> list[dict]:
        ...  # eventos do período -> horários

    def registrar_movimento(self, cliente_id, de, para) -> None:
        ...  # a cliente saiu do horário `de` e foi para `para`
```

**`carregar_slots`** devolve cada evento no mesmo formato de um horário de `data/agenda.json`:

```json
{"id": "...", "data": "2026-10-28", "hora": "13:00", "duracao_min": 45,
 "tipo_atendimento": "manicure", "status": "ocupado", "cliente_id": "C01", "valor": 45,
 "profissional_id": "P2"}
```

O `cliente_id` precisa existir em `data/clientes.json` e o `profissional_id` em `data/profissionais.json`.
Uma forma simples é guardar os dois no evento, em `extendedProperties.private`. Outra é ter uma agenda do
Google por profissional e usar o ID da agenda para saber de quem é o horário. Antes de usar, passe os horários por
`src.dados.montar_agenda({"dias": ..., "slots": ...}, "google", clientes, profissionais)`: é a mesma conferência que os
cenários passam, e ela para com uma mensagem clara se algo não bater.

**`registrar_movimento`** atualiza o evento da cliente para o novo horário (ou apaga um evento e cria
outro, como preferir). O código só chama isso **depois** da aprovação humana. Se der erro, é só levantar
a exceção: `aplicar_movimento_aprovado` desfaz a troca local e mostra o erro na tela, então as duas
agendas nunca ficam diferentes.

## Como ligar

- Na tela (`app.py`), onde o fluxo é criado: `Fluxo(cenarios[escolhido], agenda_externa=AgendaGoogle(...))`.
- No terminal (`terminal.py`): `Atores(..., agenda_externa=AgendaGoogle(...))`.

Sem isso, tudo continua funcionando com `SemAgendaExterna`, que não envia nada para fora.

## Regras que não podem quebrar

1. **A IA não ganha acesso ao Google.** Ela só lê as respostas das clientes (`src/interpretacao.py`);
   não dê a ela nenhuma função que mexa na agenda.
2. **Só `registrar_movimento` escreve no Google**, e só depois da aprovação.
3. **Os testes não chamam o Google.** Use uma agenda falsa, como a `AgendaFalsa` de
   `tests/test_agenda_externa.py`. Os testes rodam no GitHub sem nenhuma chave.
4. **Credenciais só no `.env` e na pasta `credenciais/`.** Nada de chave no código.

## Antes de juntar com o `main`

```bash
git pull origin main
```

Trabalhe num branch próprio e abra um pull request. O GitHub roda os testes automaticamente
(`.github/workflows/testes-agente.yml`). Antes de juntar, rode na sua máquina:

```bash
pytest
python terminal.py S1 --auto
streamlit run app.py
```

Arquivos que os dois lados podem mexer, e como evitar conflito:

| Arquivo | Como mexer |
|---|---|
| `requirements.txt` | só acrescentar linhas no fim |
| `.env.example` | a seção do Google já existe; só ajustar se precisar de outra variável |
| `app.py` | só a linha que cria o `Fluxo` |
| `src/agenda_externa.py` | não precisa mexer; se precisar, avise antes |

## Como conseguir as credenciais do Google

1. Em [console.cloud.google.com](https://console.cloud.google.com), crie um projeto e ative a **Google Calendar API**.
2. Em **Credenciais**, escolha uma das duas:
   - **ID do cliente OAuth, tipo "App para computador"**: para usar a agenda da sua própria conta. No
     primeiro uso abre o navegador para autorizar, e o login fica salvo em `GOOGLE_TOKEN_FILE`.
   - **Conta de serviço**: para rodar sem login. Compartilhe a agenda com o e-mail da conta de serviço,
     com permissão para fazer alterações.
3. Baixe o JSON e salve como `credenciais/google-credentials.json`.
4. Coloque o ID da agenda em `GOOGLE_CALENDAR_ID`. Ele fica em Configurações da agenda > Integrar
   agenda; para a agenda principal, use `primary`.

Uma "chave de API" simples do Google não serve aqui: ela só lê agendas públicas e não consegue mover
um horário.
