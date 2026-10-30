# Avaliação do assistente — 29/10/2026

Versão de referência: ca220f4. Não foram alterados o prompt, o modelo nem as regras do assistente para esta avaliação.

## Método

Foram executados os 206 testes automatizados existentes (todos passaram) e 24 pedidos reais ao Gemini: 12 situações, repetidas duas vezes. A avaliação real utilizou o cliente Gemini e o despachante de ferramentas do projeto, com um salão inventado em memória, duas profissionais, duas clientes chamadas Ana e um agendamento. Data de referência: 29/10/2026 às 08h de Brasília. Nenhuma agenda real foi lida ou alterada, nenhum plano foi confirmado e nenhuma mensagem foi enviada.

O modelo principal configurado no código é gemini-3.5-flash-lite; o cliente pode recorrer a gemini-3.1-flash-lite. A execução registrou um timeout e quatro respostas 429 do principal; o reserva permitiu continuar. O tempo do pedido mais lento foi de aproximadamente 10,7 segundos. Esses eventos são problemas de disponibilidade/cota, não de compreensão.

Este é um teste do caminho modelo → ferramenta, não um teste completo da interface, autenticação ou banco de produção. Os testes automatizados usam respostas simuladas; passar neles não comprova qualidade de linguagem natural. Esta amostra pequena não permite estimar uma taxa geral de acerto.

## Resultado revisado

| Situação | Resultado nas duas rodadas |
|---|---|
| Agenda de amanhã da Lia | Correto: data, profissional e atendimento |
| Mesmo pedido com erros de digitação | Correto |
| Resumo de hoje | Correto para o cenário vazio do dia |
| Quantidade de acetona | Correto: 3 |
| “Painel da entrada” como apelido do expositor | Encontrou o item correto |
| “Como anda a Ana?”, com duas Anas | Perguntou qual cliente; não escolheu arbitrariamente |
| Remarcar Ana Silva para sábado às 15h | Plano correto, preservando duração e preço; sem aplicar |
| Lia ausente amanhã | Plano de redistribuição para Bia, sem aplicar |
| Desfazer sem alteração anterior | Informou corretamente que não havia mudança |
| Data impossível, 31/02/2027 | Gemini passou data inválida; código bloqueou e perguntou “Qual dia você quer?” |
| Agenda e estoque na mesma pergunta | Resposta incompleta: mostrou apenas a agenda |
| Continuação “E da Bia?” | Manteve a data e trocou corretamente a profissional |

Após revisão das respostas: **20 respostas adequadas, 2 respostas seguras mas pouco explicativas e 2 respostas incompletas**. O marcador automático REVISAR não significa necessariamente erro: em uma rodada a busca da Ana utilizou outra ferramenta, mas a resposta final foi igualmente correta.

## Problemas e prioridade

1. **Pedidos múltiplos:** o cliente do Gemini seleciona apenas a primeira chamada de função; a rota também executa uma única ferramenta. Reproduzido nas duas rodadas. Melhorar a coordenação de consultas ou avisar explicitamente que precisa de um pedido por vez.
2. **Data inválida:** proteção funcionou, mas “Qual dia você quer?” não explica que fevereiro não tem dia 31. Melhorar o retorno de validação.
3. **Ausência não bloqueia novas reservas:** o próprio plano avisa que Lia continuará disponível no agendamento público. Redistribuir os atendimentos atuais não resolve sozinho uma ausência no dia. Requer uma regra de indisponibilidade por data, não treinamento do modelo.
4. **Latência e cota:** timeout e limite do provedor acionaram o reserva. Preservar diagnóstico distinto de “não entendi”.

Não é necessário começar por treinamento de modelo: os problemas observados apontam primeiro para coordenação de ferramentas, validação e regras de negócio.

## Reproduzir

Com GEMINI_API_KEY em .dev.vars, execute `node scripts/avaliar-assistente-real.mjs` na raiz do projeto. A avaliação inicial fez 24 pedidos; o roteiro ampliado agora faz 40 pedidos ao modelo e usa a cota da conta configurada. As saídas completas, só com dados fictícios, ficam em `.sites-runtime/avaliacao-assistente-real.json`, fora do Git. A avaliação depende de rede e pode variar entre execuções. O script não grava no banco nem chama o WhatsApp.

## Organização da documentação

A especificação está em `docs/arquitetura/assistente-painel.md`, com o estado do documento atualizado. A configuração de compatibilidade foi preservada, assim como as licenças de terceiros e a documentação das integrações do produto.

## Aprimoramentos e comparação posterior

Após a avaliação inicial, foram alterados o prompt e a coordenação das ferramentas, sem treinamento dos pesos do modelo. As dez funções originais continuam disponíveis. As regras de aprovação, preço, duração, conflito e desfazer foram preservadas.

- O cliente Gemini preserva todas as chamadas de função; a rota executa até quatro consultas independentes. Lotes com alterações são recusados integralmente, sem criar planos parciais.
- O prompt inclui calendário dos próximos dias, catálogo de serviços/opções, exemplos de intenção e regras para ambiguidade, correções e ações não suportadas.
- Datas inválidas ganham explicação clara. A mensagem de cota não promete retorno em minutos.
- Confirmações simples após um plano são orientadas ao botão por código, sem gasto de IA ou duplicação do plano. Uma correção como “sim, mas às 16h” continua indo para interpretação.

Foram feitas mais 40 tentativas (20 situações em duas rodadas), além de oito verificações finais. Sete tentativas da segunda rodada falharam por conexão e não contam como respostas corretas. Das oito verificações finais, sete consultaram o Gemini e uma passou pela nova orientação determinística de confirmação; todas tiveram resposta e foram revisadas. No total, foram 72 situações executadas, incluindo as 24 iniciais. Não são 72 chamadas HTTP: o reserva pode acrescentar chamadas, e a confirmação final não usa modelo.

### Evidências de melhora

| Caso | Antes | Depois |
|---|---|---|
| Agenda + acetona | Ignorava estoque nas duas rodadas | Retornou ambas as consultas nas duas rodadas e no reteste final |
| 31/02/2027 | Pergunta vaga “Qual dia você quer?” | Explicou que a data não existe nas duas rodadas; validação também foi melhorada |
| Confirmação por texto | No teste ampliado, criou outro plano | Reteste: orientou usar Confirmar, sem chamar Gemini |
| Remarcar e trocar profissional no mesmo pedido | No teste ampliado, citou cartão não criado | Reteste: pediu qual alteração fazer primeiro |
| Correção para sábado | Não constava da amostra inicial | Manteve a profissional e corrigiu a data no teste e no reteste |
| Cliente inexistente | Não constava da amostra inicial | Informou que não encontrou, sem inventar ficha |
| Falta de cliente e exclusão de clientes | Não constavam da amostra inicial | Orientou usar a interface; não executou ferramentas inadequadas |

As consultas simples, erros de digitação, apelidos, nomes ambíguos, remarcação, troca de profissional, redistribuição e desfazer sem histórico continuaram funcionando nos casos com resposta. O reteste de horários livres retornou a grade válida de Bia, respeitando o intervalo.

**Validação automatizada final: 214 testes passaram; verificação TypeScript passou.** A amostra real é limitada, usa um salão pequeno e não avalia toda conversa possível ou execução no navegador. Não há garantia de ausência de erros: textos livres ainda podem ser inadequados, o provedor pode falhar e pedidos complexos podem precisar de esclarecimento. Redistribuir uma ausência ainda não bloqueia a profissional no agendamento público; o aviso existente foi preservado para não alterar a regra de negócio sem implementar esse fluxo completo.

Arquivos locais de evidência, ignorados pelo Git: `.sites-runtime/avaliacao-assistente-antes.json`, `.sites-runtime/avaliacao-assistente-primeira-melhoria.json`, `.sites-runtime/avaliacao-assistente-final.json`. Para executar somente alguns casos, use as variáveis `AVAL_CASOS` (IDs separados por vírgulas) e `AVAL_RODADAS` (padrão 2). Os marcadores OK/REVISAR verificam escolha de função; a conclusão acima também revisa o texto e o resultado, pois ferramentas diferentes podem produzir a mesma resposta correta.
