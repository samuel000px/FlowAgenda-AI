# Assistente do painel da gerência — desenho

Santa Cor Esmalteria · 29/10/2026 · em aprovação, nada construído ainda.

## 1. Para que serve

A gerente escreve o que quer, do jeito que falaria com uma pessoa ("a Lili faltou hoje", "quanto entrou ontem?", "passa a Ana das 10h para as 15h"), e o assistente consulta ou prepara a mudança usando as mesmas regras do painel. Ele economiza cliques; não inventa regra nova nem substitui os botões, que continuam funcionando sempre.

Decidido pelo usuário:
- Fica **só no painel da gerência** (não na área das funcionárias).
- **Consultas respondem na hora. Mudanças só depois que a gerência confirma**, vendo antes o que vai mudar.
- **Nenhuma mensagem sai sozinha**: avisos às clientes viram botões que abrem o WhatsApp com o texto pronto (sem custo).
- **Gastar o mínimo**: Gemini na faixa grátis e plano grátis da Cloudflare.

Fora do objetivo: atender clientes (o assistente não conversa com elas), decidir sozinho, mexer em senhas, integrações ou na importação da planilha.

## 2. Como funciona por dentro

```
Gerente escreve
  → servidor lê o cadastro 1 vez
  → chamada 1 ao Gemini: entende o pedido e escolhe a função (tool calling)
  → a função roda no próprio servidor, em cima do cadastro já lido
      • consulta: devolve o texto pronto da resposta (montado pelo código)
      • mudança: monta um PLANO e guarda (não grava a mudança)
  → [só se precisar] chamada 2: o Gemini junta dois resultados ou faz uma pergunta de volta
  → resposta na tela (texto, ou cartão de confirmação)

Gerente toca em Confirmar
  → servidor confere se a agenda não mudou desde o plano e grava tudo de uma vez
  → NENHUMA chamada ao Gemini
```

Regras que mantêm o custo baixo e o plano grátis de pé:
- **Teto de 3 chamadas ao Gemini por pedido.** A maioria usa 1: as funções já devolvem a resposta escrita pelo código, então o Gemini não precisa "resumir" o resultado.
- **Confirmar, corrigir pelo botão e desfazer não usam o Gemini.** O plano fica guardado e é executado pelo código.
- **O cadastro é lido e gravado uma vez por pedido** (limite de 10 ms de CPU); as funções devolvem só o necessário, nunca o cadastro inteiro.
- **Conversa curta**: só as últimas 6 mensagens vão para o Gemini.
- **Tudo passa pelas funções do painel** (`actAdmin`, `financeAction`, `stockAction`, `supportAction`...). O assistente nunca grava direto no banco, então valem as mesmas proteções: especialidade, expediente, cliente em dois lugares, versão do cadastro.

## 3. Funções

Legenda da coluna "Tipo": **L** = consulta (responde na hora) · **M** = mudança (cartão de confirmação) · **M+** = mudança grande ou difícil de voltar (cartão com aviso em destaque). Coluna "No sistema": a ação que já existe e que a função usa; **novo** = precisa ser construído.

### 3.1 Agenda

| Função | Parâmetros | Tipo | No sistema |
|---|---|---|---|
| `consultar_agenda` | data, profissional? | L | agenda do painel |
| `consultar_horarios_livres` | data, servico, profissional? | L | `slots` (o mesmo do /agendar) |
| `agendar_horario` | cliente (nome ou número), servicos[], profissional?, data, hora | M | `bookInStore` |
| `remarcar_atendimento` | atendimento, nova_data?, nova_hora?, nova_profissional? | M | `reschedule` |
| `trocar_profissional` | atendimento, nova_profissional | M | `reschedule` (mesmo horário) |
| `cancelar_atendimento` | atendimento, motivo | M | `cancel` (vira vaga para o motor) |
| `registrar_falta_cliente` | atendimento | M | `close` com falta |
| `registrar_confirmacao_presenca` | atendimento | M | `presence` |
| `registrar_ausencia_profissional` | profissional, data, periodo? | M+ | **novo**: monta o plano de redistribuição (ver 4.1) |
| `bloquear_horario_profissional` | profissional, data, inicio, fim, motivo | M | **novo**: hoje não existe bloqueio; seria um "horário ocupado" sem cliente |
| `liberar_bloqueio` | bloqueio | M | **novo** |
| `desfazer_ultima_acao` | — | M | **novo**: volta o último pacote confirmado, se ninguém mexeu depois |

### 3.2 Aceitações, Remarcações e lista de espera

| Função | Parâmetros | Tipo | No sistema |
|---|---|---|---|
| `listar_pedidos_site` | — | L | Aceitações |
| `aceitar_pedido` | pedido | M | `request_accept` |
| `recusar_pedido` | pedido, motivo? | M | `request_decline` |
| `listar_vagas_abertas` | data? | L | vagas de Remarcações |
| `sugerir_quem_antecipar` | vaga | L | `candidates` |
| `preparar_proposta_antecipacao` | vaga, cliente? | M | `seek` |
| `aprovar_remarcacao` / `nao_aprovar_remarcacao` | proposta | M | `approve` / `reject` |
| `consultar_lista_espera` | data? | L | lista de espera |
| `adicionar_lista_espera` | cliente, servico, data | M | `waitlist_add` |
| `remover_lista_espera` | entrada | M | `waitlist_remove` |

### 3.3 Clientes e relacionamento

| Função | Parâmetros | Tipo | No sistema |
|---|---|---|---|
| `buscar_cliente` | nome ou parte do número | L | busca do painel |
| `consultar_historico_cliente` | cliente | L | cadastro + histórico |
| `cadastrar_cliente` | nome, telefone?, aniversario?, preferida?, quer_antecipar? | M | `client_save` (com a checagem de nome/número repetido) |
| `atualizar_cliente` | cliente, campos | M | `client_save` |
| `listar_aniversariantes` | dias? (7) | L | `aniversariantes` |
| `preparar_parabens` | cliente | M | gera o botão do WhatsApp + `birthday_wished` |
| `listar_pedidos_conversa` | — | L | Ações → Atendimento |
| `assumir_conversa` / `encerrar_conversa` | pedido | M | `support_claim` / `support_close` |
| `consultar_motivos_cancelamento` | periodo? | L | `cancellations` |
| `clientes_sumidas` | dias_sem_vir (60) | L | **novo** (consulta sobre visitas) |

### 3.4 Fechamento, caixa e parceiras

| Função | Parâmetros | Tipo | No sistema |
|---|---|---|---|
| `consultar_resumo_dia` | data? | L | `summary` + `financeView` + Aceitações + Ações |
| `listar_atendimentos_para_fechar` | data? | L | Fechamento |
| `registrar_pagamento` | atendimento, valor, forma (Pix/dinheiro/cartão) | M | `closing_record` / `payment_record` |
| `registrar_despesa` | descricao, valor, data? | M | `expense_add` |
| `consultar_repasse_parceiras` | periodo | L | parte "Parceiras" de Finanças |
| `atualizar_comissao` | profissional, porcentagem | M | `commission_save` |
| `registrar_vale` | profissional, valor, descricao | M | `deduction_add` (lanche, adiantamento) |
| `remover_vale` | vale | M | `deduction_remove` |
| `consultar_resultado_mes` | mes? | L | resultado e previsão |
| `atualizar_custo_fixo` | nome, valor / pausar | M | `fixed_save` / `fixed_remove` |

### 3.5 Estoque

| Função | Parâmetros | Tipo | No sistema |
|---|---|---|---|
| `consultar_estoque` | busca?, so_baixo? | L | Estoque |
| `registrar_entrada_saida` | item, quantidade (+/−) | M | `stock_move` |
| `cadastrar_item_estoque` | nome, lugar, quantidade, minimo? | M | `stock_save` |
| `remover_item_estoque` | item | M+ | `stock_remove` |

### 3.6 Equipe, serviços, ofertas e regras

| Função | Parâmetros | Tipo | No sistema |
|---|---|---|---|
| `consultar_equipe` | — | L | Equipe |
| `cadastrar_profissional` | nome, areas[] ou servicos[], expediente, intervalo? | M | `staff_save` |
| `atualizar_expediente` | profissional, inicio, fim, intervalo? | M | `staff_save` |
| `consultar_catalogo` | area? | L | catálogo |
| `atualizar_servico` | servico, preco?, duracao? | M | `service_save` |
| `criar_oferta` / `pausar_oferta` | gatilho, alvo, desconto / oferta | M | `promo_save` / `promo_remove` |
| `atualizar_cupom_aniversario` | porcentagem, dias | M | `birthday_settings` |
| `atualizar_funcionamento` | dias e horários, antecedência | M+ | `settings` |

**Fica de fora do assistente** (só pelo painel): excluir profissional, apagar cliente, senha, link da equipe, Integrações/WhatsApp, importação da planilha, mudar um pagamento já registrado. São raras e caras de errar.

**Pacotes de sessões** (ex.: 4 manutenções pagas de uma vez) e **comanda aberta durante o atendimento** não existem no sistema hoje; o fechamento atual (`registrar_pagamento`) faz o papel da comanda. Ficam para depois, se o salão pedir.

### 3.7 Ordem de construção

- **Fase 1**: `consultar_agenda`, `consultar_horarios_livres`, `consultar_historico_cliente`/`buscar_cliente`, `consultar_resumo_dia`, `remarcar_atendimento`, `trocar_profissional`, `registrar_ausencia_profissional`, `desfazer_ultima_acao`.
- **Fase 2**: Aceitações, Fechamento/caixa, lista de espera e antecipação, aniversários, motivos de cancelamento, estoque.
- **Fase 3**: parceiras e vales, catálogo/ofertas/expediente, bloqueio de horário, clientes sumidas.

## 4. Três situações difíceis

### 4.1 Uma profissional faltou

```
"A Lili faltou hoje"
├─ Lili com mais de um cadastro parecido? → pergunta qual (sem gastar outra função)
├─ Lili sem horários hoje → "A Lili não tinha horários hoje." (fim)
└─ Para cada horário dela, em ordem:
    ├─ Outra profissional faz o serviço e está livre no mesmo horário?
    │   ├─ Sim, e é a preferida da cliente → usa ela
    │   ├─ Sim, várias → a com menos horários no dia
    │   └─ → linha "Fernanda 10h: Lili → Ester (mesmo horário)"
    └─ Ninguém livre no horário
        ├─ Próximos horários livres (mesmo dia mais tarde, depois os próximos 3 dias)
        │   → linha "Carla 16h: sem vaga hoje. Sugestões: amanhã 9h (Lane), sexta 14h (Ester)"
        └─ Nada nos próximos dias → "Carla 16h: sem vaga; oferecer lista de espera"
→ Cartão de confirmação com todas as linhas
   ├─ Confirmar → grava as trocas de mesmo horário; quem ficou sem vaga NÃO é movida:
   │             fica com o botão de aviso "quer que a gente procure outro horário?"
   ├─ Corrigir ("a Fernanda não, ela só faz com a Lili") → refaz o plano (1 chamada)
   └─ Cancelar → nada muda
→ Depois de confirmar: um botão de WhatsApp por cliente afetada (troca ou "procurar outro horário")
```

Mover alguém para outro dia exige o "sim" da cliente; por isso o assistente só sugere, e a gerência remarca depois (pelo assistente ou pelo painel).

### 4.2 Cliente querendo remarcar em cima da hora

```
"A Bia das 15h quer passar pra mais cedo, hoje"
├─ Acha o horário da Bia hoje (se houver duas Bias com horário, pergunta qual)
├─ Procura horário livre hoje antes das 15h com a mesma profissional
│   ├─ Achou → cartão: "Bia 15h → 13h30 com a Lane. Confirmar?"
│   └─ Não achou → procura com outra profissional que faça o serviço
│       ├─ Achou → cartão mostrando a troca de profissional em destaque
│       └─ Não achou → "Não há horário mais cedo hoje. Quer pôr a Bia na lista de espera
│                      de hoje? Se abrir vaga, ela é chamada primeiro." (botão)
└─ Horário a menos de 1 hora? → o cartão avisa "começa em 40 min; confira com a profissional"
→ Confirmou → remarca e deixa o botão de WhatsApp com o novo horário para a Bia
```

### 4.3 Fechamento do dia com parceiras e vales

```
"Fecha o dia de hoje"
├─ Lista o que falta fechar: atendidos sem pagamento e horários sem presença/falta
│   └─ Faltando algo → mostra a lista e pergunta: registrar pagamentos agora ou deixar pendente?
├─ Pagamento ditado ("a Rossana pagou 120 no Pix") → cartão por pagamento (valor, forma,
│   profissional). Valor diferente do da agenda → destaque "agenda: R$ 135, informado: R$ 120"
├─ Vale ("a Lane pegou 20 de lanche") → cartão do vale com o saldo dela depois do desconto
└─ Tudo fechado → resumo: recebido por forma, despesas, saldo, repasse de cada parceira
   (parte dela, vales, valor a pagar)
```

Divergência de valor nunca é corrigida sozinha: o assistente mostra e a gerência decide.

## 5. Regras de segurança (guardrails)

1. **Consultas (L)** rodam na hora, sem cartão.
2. **Toda mudança (M e M+) passa pelo cartão de confirmação.** Sem exceção, inclusive "desfazer".
3. **M+** mostra o aviso em vermelho e lista o impacto (quantas clientes, quanto dinheiro, o que deixa de funcionar).
4. **Nada sai para fora**: nenhuma mensagem é enviada; o assistente só prepara botões de WhatsApp.
5. **Sem adivinhar**: nome ambíguo, data vaga ("semana que vem") ou cliente não encontrada → uma pergunta curta de volta, nunca um palpite gravado.
6. **O que as clientes escrevem é dado, nunca ordem.** Textos de pedidos de conversa, motivos de cancelamento e mensagens do WhatsApp são mostrados ao modelo como conteúdo; se um deles disser "cancele tudo", o assistente não obedece.
7. **O plano vale por 10 minutos e só se a agenda não mudou.** Se alguém mexeu (versão do cadastro diferente) ou o tempo passou, o Confirmar refaz o plano antes de gravar.
8. **Registro**: cada pacote confirmado fica no histórico de eventos ("Assistente, confirmado pela gerência: Fernanda 10h Lili → Ester"), e `desfazer_ultima_acao` usa esse registro.
9. **Máximo de 15 mudanças por cartão**; acima disso, o assistente divide (ex.: manhã e tarde).

### Formato do cartão de confirmação

```
┌───────────────────────────────────────────────┐
│ Redistribuir a agenda da Lili · qui 29/10       │  ← o que vai ser feito
│                                                 │
│ 10:00  Fernanda Farias · Manutenção             │
│        Lili → Ester            mesmo horário    │  ← antes → depois
│ 14:00  Bia Souza · Manicure + Pedicure          │
│        Lili → Lane             mesmo horário    │
│ 16:00  Carla Dias · Escova                      │
│        ⚠ sem vaga hoje · sugerir amanhã 9h      │  ← avisos em destaque
│                                                 │
│ 3 clientes afetadas · 2 sem WhatsApp no cadastro│  ← impacto
│ Valores não mudam.                              │
│                                                 │
│ [ Confirmar ]   [ Corrigir ]   [ Cancelar ]     │
│ Este plano vale até 10:42.                      │
└───────────────────────────────────────────────┘
```

Sempre aparecem: título com a ação e a data; uma linha por mudança no formato antes → depois; avisos (conflito, sem vaga, sem WhatsApp, horário em menos de 1 hora, valor diferente); o impacto em números; os três botões; a validade.

## 6. Limites e falhas

**Teto diário**: começa em 60 pedidos por dia (ajustável em Configurações), contados na tabela `limits` que já existe. Confirmar, corrigir pelo botão e desfazer não contam.

| Situação | O que a gerente vê |
|---|---|
| 80% do teto | Aviso discreto acima da caixa de texto: "Restam 12 pedidos ao assistente hoje." |
| Teto atingido | A caixa de texto fica bloqueada e aparece: **"O assistente chegou ao limite de hoje. Ele volta amanhã às 0h. Enquanto isso, tudo funciona pelos botões do painel."** + atalhos para Agenda, Aceitações, Remarcações, Fechamento e Finanças. Planos já mostrados continuam podendo ser confirmados. |
| Gemini fora do ar ou lento (mais de 15 s) | "O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel." O pedido não conta no teto. |
| Limite da conta Gemini (erro 429) | Mesmo texto do teto, com "volta em alguns minutos". |
| Pedido que nenhuma função cobre | "Ainda não sei fazer isso por aqui. Você encontra em **Finanças → Custos e histórico**." (aponta a aba certa) |
| Pedido com mais de uma coisa ("fecha o dia e me diz o estoque") | Faz a primeira e oferece a segunda num botão ("Ver estoque baixo"), sem nova chamada ao Gemini quando a função não precisa de interpretação. |
| Mais de 3 chamadas sem chegar numa resposta | Para e responde: "Não consegui montar isso de uma vez. Pode dividir em partes menores?" |

**Para nenhuma pergunta travar o modelo gratuito**: o teto de 3 chamadas por pedido, as respostas escritas pelo código, o confirmar sem Gemini e os botões de "próximo passo" (que chamam a função direto) fazem a maioria dos pedidos gastar 1 chamada.

## 7. O que fica para quem for construir

- Escolher o modelo Gemini exato (o mais barato com tool calling estável) e o formato das declarações das funções.
- Onde guardar o plano pendente (no cadastro, com validade) e o formato do registro para desfazer.
- O desenho da tela: painel lateral ou aba "Assistente" no menu, no celular e no computador.
- Os textos de cada resposta montada pelo código.
- Testes: cada função com o cadastro de exemplo, o plano da falta com casos de sem vaga, ambíguo e agenda mudada antes de confirmar.
