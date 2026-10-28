# Decisões de projeto

Cada item tem a decisão, o motivo e o que ficou de fora. Vale o que está na seção 2 do plano,
a não ser quando um item abaixo diz outra coisa.

## D1. O projeto fica em `agente-remarcacao/`, dentro deste repositório

- Decisão: projeto Python numa subpasta, com o Encaixa do Samuel intacto na raiz.
- Motivo: quem avaliar vê os dois juntos e entende de onde vieram as ideias (ver `AUDITORIA.md`).
- Ficou de fora: apagar o código TypeScript da raiz ou abrir outro repositório.

## D2. Esmalteria com uma manicure só

- Decisão: os dados fictícios são de uma esmalteria com uma profissional e uma agenda.
- Motivo: mantém o tema do Encaixa e respeita o "uma profissional" da seção 3.
- Ficou de fora: consultório individual, que era o padrão do plano.
- O domínio fica só em `data/` e nos prompts, então dá para trocar depois sem muito trabalho.

## D3. Gemini (camada gratuita) no lugar do Claude. Muda a seção 2 do plano

- Decisão: API do Gemini, modelo `gemini-3.5-flash-lite` (o mesmo do Encaixa), pelo SDK
  `google-genai`. Chave em `GEMINI_API_KEY` no `.env`. O nome do modelo também fica no `.env`.
- Motivo: custo. A camada gratuita sai de graça. Pelas contas, uma rodada dos 6 cenários
  custaria uns US$ 0,32 no Claude Sonnet 5.5 e uns US$ 0,02 no Claude Haiku 5.5.
- Ficou de fora: Claude Sonnet 5.5 (o do plano) e Claude Haiku 5.5.
- Riscos:
  - A camada gratuita tem limite de chamadas e pode travar no meio de uma demonstração.
  - Nela o Google pode usar o que enviamos para melhorar os produtos dele. Como só mandamos
    dados fictícios, aceitamos.
- Para não ficar preso: só o `src/llm.py` fala com o modelo. Para voltar ao Claude, troca esse
  arquivo e o resto do agente continua igual. O "tool use" da seção 9 vira o function calling
  do Gemini, com as mesmas regras: duas funções expostas e `confirmar_movimento` fora da lista.

## D4. Do Encaixa vêm as ideias, não o código

- Decisão: reescrever em Python as regras que valem (filtros, conferir antes de confirmar,
  recusou passa para a próxima).
- Motivo: a linguagem é outra e o problema também (lista de espera contra antecipação em cascata).
- Ficou de fora: traduzir o `lib/salon.mjs` linha por linha.

## D5. O laço de function calling é nosso, não o automático do SDK

- Decisão: desligar o `automatic_function_calling` do `google-genai` e escrever o laço em `src/llm.py`.
- Motivo: assim cada passo (ferramenta, argumentos, resultado) fica registrado no log e o limite
  de 8 voltas da seção 9.4 é garantido pelo nosso código.
- Ficou de fora: deixar o SDK executar as funções sozinho, que é mais curto mas esconde os passos.

## D6. Cada cenário tem a sua agenda

- Decisão: `agenda.json` guarda uma agenda por cenário (horários e situação de cada dia). As
  clientes são as mesmas para todos. O `agendamento_atual` da cliente não fica no cadastro:
  sai do horário dela na agenda do cenário.
- Motivo: com uma agenda só para a semana inteira, todo cenário teria as mesmas candidatas e
  ficaria difícil montar, por exemplo, o cenário 3 (ninguém compensa) junto com o 2 (alguém compensa).
  Separando, cada cenário prova uma coisa e dá para conferir a conta na mão.
- Ficou de fora: uma agenda única de 7 dias com `agendamento_atual` dentro de `clientes.json`.
  Os cenários juntos cobrem 28/10 a 03/11 (domingo fechado).

## D7. Quem recusou não recebe outra proposta na mesma cascata

- Decisão: a lista de recusadas passa de um nível da cascata para o outro.
- Motivo: na vida real ninguém quer receber duas mensagens seguidas pedindo para mudar de horário.
  No cenário 4 a Larissa recusa e não é chamada de novo para o buraco de sábado.
- Ficou de fora: zerar as recusas a cada buraco novo.

## D8. Dois tipos de serviço: manicure (45 min, R$ 45) e pé e mão (90 min, R$ 80)

- Decisão: continua uma profissional só, mas com dois serviços.
- Motivo: sem isso os filtros de tipo e de duração da seção 7.1 nunca eliminariam ninguém.
- Ficou de fora: um serviço só.

## D9. O loader fica em `src/dados.py`

- Decisão: `src/dados.py` lê os três JSON e para com uma mensagem clara se algo não bater
  (cliente que não existe, faltas maiores que consultas, hora fora do formato etc.).
- Motivo: o plano pede um loader que valide, mas não diz onde. `modelos.py` fica só com as estruturas.

## D10. Modo `--auto` no terminal aprova sozinho

- Decisão: `python terminal.py S1 --auto` usa as respostas prontas do cenário e aprova o movimento
  sem perguntar. A tela avisa "Aprovação automática (modo --auto)" e o log marca `automatica: true`.
- Motivo: precisamos rodar os 6 cenários de uma vez para a avaliação (Fase 7). Sem `--auto`, a
  pessoa responde como a cliente e aprova ou rejeita, como o plano pede.
- Ficou de fora: exigir aprovação manual até na avaliação.

## D11. O modelo só vê as candidatas elegíveis

- Decisão: a ferramenta `buscar_candidatos` que o modelo chama devolve só quem passou nos filtros
  e na poda. A tabela completa, com quem ficou de fora e por quê, é mostrada só para a pessoa.
- Motivo: é a regra da seção 2. O modelo escolhe entre opções válidas e não precisa decidir o que é válido.
- Ficou de fora: mandar todo mundo e pedir para o modelo ignorar as excluídas.

## D12. Fórmula do valor esperado ajustada (muda a seção 7 do plano)

- Decisão: `valor_esperado = p_aceitar × [valor_vago × (dif_vago − p_falta) − valor_dela × dif_dela]`,
  onde `dif` é a `dificuldade_de_preencher` de cada horário. As funções `taxa_falta`, `prob_aceitar`
  e `dificuldade_de_preencher` continuam iguais às do plano.
- Motivo: a fórmula do plano (`valor × p_aceitar × p_comparecer − valor × dif_dela`) tinha dois problemas:
  1. Supunha que o horário vago ficaria vazio com certeza se ninguém fosse puxado. Mas ele também
     pode ser preenchido pela fila; a própria seção 10 mede isso com `dificuldade_de_preencher`.
  2. Cobrava o risco do buraco novo mesmo quando a cliente recusa, e aí nenhum buraco novo existe.
  Com a fórmula nova, o sinal do resultado segue exatamente a regra central do plano: só compensa
  quando o buraco novo é mais fácil de preencher que o atual, descontado o risco de ela faltar.
  E o score fica coerente com a métrica da Fase 7. Com a fórmula antiga, a regra ingênua "ganharia"
  do agente justamente no cenário 3, onde não mexer é a decisão certa pela própria métrica.
- Ficou de fora: a fórmula literal da seção 7.
- Efeito nos dados: os cenários 2 e 3 foram ajustados para continuar provando o que prometem
  (no 2 a cascata agora puxa duas clientes; no 3 as candidatas estão amanhã cedo e faltam mais).

## D13. Um aviso no topo do README da raiz

- Decisão: o README da raiz (do Encaixa) ganhou um bloco curto no topo apontando para
  `agente-remarcacao/`. O resto do texto do Samuel ficou igual.
- Motivo: quem avalia abre o GitHub e vê primeiro o README da raiz. Sem o aviso, o projeto do agente
  ficaria escondido numa subpasta.
- Ficou de fora: substituir o README da raiz.

## D14. Ponto de encaixe para o Google Agenda

- Decisão: a interface `AgendaExterna` (`src/agenda_externa.py`) tem dois métodos, `carregar_slots` e
  `registrar_movimento`. Toda mudança aprovada passa por `aplicar_movimento_aprovado`, que troca na
  agenda local, avisa a agenda de fora e desfaz a troca local se a de fora falhar. O padrão é
  `SemAgendaExterna`, que não envia nada.
- Motivo: o Samuel vai ligar o Google Agenda em paralelo. Com a interface pronta, ele escreve um arquivo
  novo (`src/agenda_google.py`) e não precisa mexer na cascata, na tela nem no agente, o que evita
  conflito na hora de juntar. Os testes com uma agenda falsa garantem que só movimentos aprovados saem.
- Também: o `.gitignore` (raiz e pasta do agente) ignora arquivos de credencial do Google, e um workflow
  do GitHub roda o `pytest` em todo push e pull request que mexa no agente.
- Ficou de fora: escrever a integração com o Google agora, sem saber o que ele já fez.

## D15. Cadastro enxuto pensado para o uso real

- Decisão: a cliente tem só nome, serviço, visitas, faltas, propostas recebidas e aceitas, e uma
  **nota de 0 a 10** que ela mesma dá ("se abrir um horário antes, quanto toparia trocar?").
  Saíram o deslocamento, a nota livre e a janela de horário.
  - `prob_aceitar = (aceitas + 2 × nota/10) / (propostas + 2)`: sem histórico vale a nota; com nota 5
    a conta é igual à do plano. Nota 0 é filtro duro: nunca é chamada.
  - No lugar do filtro de chegada a tempo, um aviso mínimo do salão (`AVISO_MINIMO_H`, padrão 1h).
    A própria cliente responde se consegue chegar.
  - Para o modelo vai só o primeiro nome, sem telefone nem anotações.
  - Botão "Não respondeu, tentar outra": a dona do salão decide quando passar para a próxima, e a cliente
    recebe um aviso educado. Não há prazo automático nem "quem responder primeiro leva".
- Motivo: conversa com o autor sobre usar na esmalteria da tia. Manter distância atualizada é difícil
  e enganoso (perto de casa não é perto do trabalho); notas livres carregam dados pessoais; e oferecer a
  vaga e depois dar para outra pessoa seria injusto com a cliente.
- Efeito nos dados: todas as clientes fictícias ficaram com nota 5 (os números não mudam), menos Luana
  e Daniela, com nota 0. No cenário 1 elas agora ficam de fora por "não quer ser chamada".
- Ficou de fora: um bônus extra para clientes fiéis (5+ visitas). A suavização já dá mais peso ao histórico
  de quem vem sempre; a dona do salão ainda vai dizer se quer algo além disso.

## D16. Várias profissionais, com a preferida da cliente primeiro

- Decisão: `data/profissionais.json` (Lia, Nina e Rafa, nomes do seed do Encaixa). Cada horário tem
  `profissional_id` e cada cliente pode ter `profissional_preferida` (ou nenhuma). Todas fazem todos
  os serviços. Entre as elegíveis, vem primeiro quem prefere a profissional do horário vago ou não tem
  preferência; o modelo só vê esse grupo e, quando ele acaba, vê as outras. A mensagem diz com quem
  seria o atendimento.
- Motivo: o salão da tia tem 2 ou 3 profissionais e as clientes "preferem a sua, mas aceitam outra".
  Colocar a regra no código (e não só no prompt) garante que ela sempre vale.
- Ficou de fora: baixar a chance de aceitar quando a profissional é outra. Seria um número chutado;
  a ordem de prioridade já faz o que o salão pediu.
- Novo cenário 7 (Profissional preferida). As clientes dos cenários 1 a 6 ficaram sem preferência, então
  os resultados deles não mudaram. Na métrica, o cenário 7 empata: ela não mede preferência.

## D17. Registro de visitas, faltas e propostas em CSV, com "Fechar o dia"

- Decisão: `src/historico.py` grava um acontecimento por linha em `registro/historico.csv`
  (`data_hora, cliente_id, evento, slot_id`). Os números da cliente são o cadastro mais a soma do
  registro. As propostas (aceita, recusada, sem resposta) são gravadas pelo próprio fluxo da tela; as
  presenças (veio, faltou), pela dona do salão no painel "Fechar o dia". O registro fica fora do git e
  só é usado com a chave "Usar e registrar histórico" ligada.
- Motivo: sem a API do WhatsApp, o sistema não enxerga as conversas. A forma mais simples e confiável é
  a dona do salão marcar presença no fim do dia (cerca de um minuto) e o sistema contar sozinho o que
  ele mesmo faz, que são as propostas. Uma linha por evento nunca perde informação, é fácil de conferir
  e vira uma aba do Google Planilhas sem mudança.
- Ficou de fora: contar visitas pelo Google Agenda (depende da integração do Samuel), ler conversas
  exportadas do WhatsApp (pouco confiável e ruim para a privacidade) e planilha editada à mão.
- O terminal e a avaliação não gravam nada: rodam os cenários fictícios repetidas vezes.

## D18. Senha na entrada e guia de hospedagem

- Decisão: `src/acesso.py` lê `APP_SENHA`; com ela configurada, a interface só aparece depois da senha
  certa (comparação em tempo constante, 1 s de espera a cada erro, botão Sair). Sem `APP_SENHA`, abre
  direto, para uso no próprio computador. O guia `docs/hospedagem.md` compara três opções:
  Streamlit Community Cloud, computador do salão com Tailscale e servidor pago.
- Motivo: a dona do salão vai aprovar pelo celular, então o app vai estar acessível fora do computador.
  A senha vale para qualquer hospedagem. A escolha de onde hospedar depende de onde fica o histórico:
  no Community Cloud o disco é apagado quando o app reinicia.
- Ficou de fora: contas de usuário separadas (só há uma pessoa aprovando) e login pelo Google (mais
  configuração do que o caso pede agora).

## D19. Site com página pública e painel escondido

- Decisão: `app.py` virou a entrada de um site com três páginas e nenhum menu (`st.navigation` com
  `position="hidden"`): `/` é a página pública do salão (`paginas/inicio.py`), `/painel` é a remarcação
  e `/equipe` mostra clientes e equipe. As duas últimas pedem senha (`paginas/comum.py`). A página pública
  não lê nada das clientes e não tem link para o painel (um teste confere).
- Visual da página pública: um bloco "vinho de esmalte" (#7A1E48) com texto branco, que fica igual
  nos temas claro e escuro, com o brilho de um esmalte recém-passado. Nome em Gloock e texto em Figtree.
  Uma coluna só, pensada para celular, e o botão "Agendar pelo WhatsApp" logo abaixo do nome.
- Dados do salão em `data/salao.json` (exemplo, no git) com `data/salao.local.json` por cima (dados
  reais, fora do git). O botão usa um link `wa.me`: abre o WhatsApp do celular de quem clica, com a
  mensagem escrita, sem API e sem custo.
- Motivo: o autor pediu um site do salão que leve ao WhatsApp, com o painel do administrador escondido
  e protegido por senha.
- Ficou de fora: login separado por pessoa e editar clientes pelo site (fica para o Google Planilhas).

## D20. Página pública com a identidade da Santa Cor

- Decisão: a página pública passou a seguir o flyer da Santa Cor Esmalteria (João Pessoa): cartão
  perolado com brilho suave, monograma "sc" manuscrito (Pinyon Script), nome em Cinzel, texto em
  Cormorant Garamond, detalhes em dourado rosé e serviços com ✦, separados em "Unhas" e "Beleza".
  O cartão tem cores fixas, então fica igual nos temas claro e escuro.
- Os dados reais (nome, WhatsApp, endereço, Instagram, serviços) ficam em `data/salao.local.json`,
  fora do git. Na hospedagem, vão no segredo `SALAO_JSON`. O `salao.json` do repositório continua com
  dados de exemplo.
- Serviços sem preço e sem duração são aceitos (o salão ainda não passou), e a seção "Quem atende" só
  aparece se o salão informar a equipe, para não mostrar as profissionais fictícias dos cenários.
  Sem horário de funcionamento, a página convida a combinar pelo WhatsApp.
- Motivo: o autor mandou o flyer, a lista de serviços e os contatos reais do salão da tia.

## D21. Conjunto de casos difíceis para medir a IA

- Decisão: `avaliacao_ia/` guarda 25 respostas de cliente difíceis (gíria, emoji, aceite com condição,
  recusa educada, outro horário, pergunta solta e tentativas de dar instrução ao modelo) e 7 situações
  de escolha montadas como armadilha (vencedora clara, empate exato, nota 10 com histórico ruim, só sobra
  quem prefere outra profissional, margem mínima, cinco candidatas, nova animada contra veterana).
  `avaliar_ia.py` roda tudo com o Gemini, repete cada escolha para medir consistência, confere as
  mensagens por regras (hora, profissional, manter o horário, sem sobrenome, sem "quem responder
  primeiro") e escreve `docs/avaliacao-ia.md`. `--recalcular` refaz as notas a partir do resultado salvo.
- Motivo: antes de dar mais liberdade para a IA, medir onde ela acerta e onde erra. Os 7 cenários
  originais tinham poucas escolhas de verdade.
- Primeira rodada: interpretação 25 de 25; escolhas 14 de 14 aceitáveis e iguais nas duas rodadas;
  10 de 14 iguais ao topo do código. As diferenças foram onde o caso permitia: na margem mínima a IA
  preferiu não mexer, e no quase empate escolheu a veterana em vez da cliente nova, citando o risco de falta.
- Ficou de fora: notas dadas por outro modelo ("LLM como juiz"). As regras em código bastam para o que
  queremos conferir e não custam nada.
