// Enxuga as clientes que vieram da planilha: tira quem veio 1 vez sem deixar contato e junta nomes
// completos quase iguais. Quem já tem agendamento ou conversa no sistema novo nunca é mexida.
//   node scripts/limpar-clientes.mjs [--remote]          (mostra o que vai mudar e grava)
//   node scripts/limpar-clientes.mjs [--remote] --simular (só mostra)
import { upgrade } from '../lib/flowagenda.mjs';
import { pruneClients } from '../lib/importacao.mjs';
import { banco } from './estado-banco.mjs';

const remoto = process.argv.includes('--remote'), simular = process.argv.includes('--simular');
const db = banco(remoto), linha = db.ler();
if (!linha) { console.log('Ainda não há agenda neste banco.'); process.exit(0); }
const estado = upgrade(JSON.parse(linha.state)), antes = estado.clients.length, kb = linha.state.length >> 10;
const r = pruneClients(estado);
console.log(`Clientes: ${antes} → ${estado.clients.length} (${r.removed} sem contato e com 1 visita saem, ${r.merged} nomes repetidos juntados).`);
if (simular) { console.log('Simulação: nada foi gravado.'); process.exit(0); }
if (!r.removed && !r.merged) { console.log('Nada para limpar.'); process.exit(0); }
const tamanho = db.gravar(estado, linha);
console.log(`Gravado${remoto ? ' no site publicado' : ''}. Cadastro: ${kb} KB → ${tamanho >> 10} KB.`);
