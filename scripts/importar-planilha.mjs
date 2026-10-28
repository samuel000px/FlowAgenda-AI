// Leva os dados da planilha antiga (dados/santa-cor.json, fora do Git) para o banco: o local, ou o
// publicado com --remote. O npm run deploy chama este script sozinho quando o arquivo existe.
// Importar de novo o mesmo arquivo não faz nada; um arquivo novo só completa o que falta.
//   node scripts/importar-planilha.mjs [--remote] [arquivo]
import { existsSync, readFileSync } from 'node:fs';
import { seedAdmin, upgrade } from '../lib/flowagenda.mjs';
import { alreadyImported, completeStaff, importPackage } from '../lib/importacao.mjs';
import { banco } from './estado-banco.mjs';

const remoto = process.argv.includes('--remote');
const arquivo = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'dados/santa-cor.json';
if (!existsSync(arquivo)) {
  console.log(`Sem ${arquivo}: nada da planilha para importar.`);
  process.exit(0);
}
const db = banco(remoto), pacote = readFileSync(arquivo, 'utf8'), linha = db.ler();
const estado = linha ? upgrade(JSON.parse(linha.state)) : seedAdmin();
if (alreadyImported(estado, pacote)) {
  // Já importada: só completa as especialidades da equipe (uma vez), se faltar alguma.
  const marca = estado.staffCompleted, n = completeStaff(estado, pacote);
  if (estado.staffCompleted !== marca) db.gravar(estado, linha);
  console.log(n ? `Os dados desta planilha já estão no sistema. Especialidades completadas pela planilha: ${n} profissional(is).` : 'Os dados desta planilha já estão no sistema.');
  process.exit(0);
}
const r = importPackage(estado, pacote);
completeStaff(estado, pacote);
db.gravar(estado, linha);
console.log(`Planilha importada${remoto ? ' no site publicado' : ''}: ${r.clients} cliente(s) novas, ${r.updated} completadas, ${r.staff} profissional(is), ${r.history} mês(es) de faturamento, ${r.fixedCosts} custo(s) fixo(s), ${r.stock} item(ns) de estoque.`);
