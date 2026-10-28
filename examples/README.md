# Casos fictícios para explorar o painel

Os nomes e situações de `casos-ficticios.json` são inventados. Não há telefones, chaves nem dados da planilha do salão. Os preços e tempos vêm do catálogo atual da aplicação.

Com o projeto instalado e o banco local inicializado, execute no terminal da pasta do projeto:

```powershell
npm.cmd run exemplos:local
npm.cmd run dev
```

O primeiro comando cria uma área local separada com **50 clientes, 3 profissionais e 39 agendamentos**. Ele mostra o link de acesso e as datas dos casos. Cada execução cria uma área nova, preservando todos os registros anteriores. Nunca use esses exemplos como dados reais de operação.

Abra o link apresentado. Se já estiver no painel, clique em **Sair**, abra o link novamente e entre com a senha administrativa local. A parte `#room=exemplos-...` seleciona a área de exemplos após o login. A senha continua obrigatória; o link não dá acesso sozinho.

O script acessa somente `.wrangler/state`, não aceita `--remote` e não copia conexões Google ou WhatsApp. Os exemplos não são importados pelo deploy. Os telefones ficam vazios. O resultado da execução fica em `.sites-runtime/casos-locais.json`, fora do Git.

## O que testar

| Aba | Situação e ação |
| --- | --- |
| Agenda | Veja os serviços de hoje e avance para as datas indicadas no comando. As profissionais têm especialidades diferentes. |
| Finanças | Quatro pagamentos somam **R$ 160**, uma despesa soma **R$ 25** e o saldo de caixa é **R$ 135**. Repasse e resultado líquido são calculados separadamente. |
| Fechamento | Elisa Martins foi atendida e está sem pagamento: registre o recebimento. Fernanda Melo tem uma falta registrada. |
| Aceitações | Existem dois pedidos futuros para aceitar ou recusar. |
| Remarcações | Aprove a proposta que já foi aceita; veja a cliente que recusou e a próxima proposta preparada; selecione a terceira vaga e prepare outra proposta. |
| Atendimento | Acompanhe as mensagens locais do agente e as respostas de aceite e recusa. Não são mensagens reais do WhatsApp. |
| Ações | Assuma ou encerre os dois pedidos de conversa. Isso preserva os agendamentos. |
| Estoque | Compare produto suficiente, acetona abaixo do mínimo e lixas esgotadas; registre uma entrada. |

Os casos de remarcação usam uma data próxima com vagas e uma data posterior mais ocupada, com lista de espera. As propostas passam pelo mesmo cálculo de benefício da aplicação; não há pontuações forçadas. As datas futuras são calculadas novamente em cada execução. Antes das 12h, os fechamentos de exemplo ficam no dia anterior para não registrar serviços que ainda não ocorreram.

Para validar os casos sem gravar no banco:

```powershell
npm.cmd run exemplos:check
```

Para voltar à área principal, saia do painel e entre por `http://localhost:5173/painel#room=flowagenda`.
