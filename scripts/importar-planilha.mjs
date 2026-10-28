// Leva os dados da planilha antiga (dados/santa-cor.json, fora do Git) para o banco: o local, ou o
// publicado com --remote. O npm run deploy chama este script sozinho quando o arquivo existe.
// Importar de novo o mesmo arquivo não faz nada; um arquivo novo só completa o que falta.
//   node scripts/importar-planilha.mjs [--remote] [arquivo]
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './sites-env.mjs';
import { seedAdmin, upgrade } from '../lib/flowagenda.mjs';
import { alreadyImported, importPackage } from '../lib/importacao.mjs';

const remoto = process.argv.includes('--remote');
const arquivo = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'dados/santa-cor.json';
const SALA = 'flowagenda';
if (!existsSync(arquivo)) {
  console.log(`Sem ${arquivo}: nada da planilha para importar.`);
  process.exit(0);
}
const base = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--config', 'dist/server/wrangler.json',
  ...(remoto ? ['--remote'] : ['--local', '--persist-to', '.wrangler/state'])];
function d1(args) {
  const r = spawnSync(process.execPath, [...base, ...args, '--json'], { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'Não foi possível acessar o banco.');
  return JSON.parse(r.stdout.slice(r.stdout.search(/[[{]/))).flatMap((x) => x.results || []);
}
const aspas = (v) => `'${String(v).replaceAll("'", "''")}'`;

const pacote = readFileSync(arquivo, 'utf8');
const [linha] = d1(['--command', `SELECT state,version FROM rooms WHERE id=${aspas(SALA)}`]);
const estado = linha ? upgrade(JSON.parse(linha.state)) : seedAdmin();
if (alreadyImported(estado, pacote)) {
  console.log('Os dados desta planilha já estão no sistema.');
  process.exit(0);
}
const r = importPackage(estado, pacote);
const json = JSON.stringify(estado), agora = Date.now();

// O D1 aceita no máximo ~100 KB por comando, então o estado vai em pedaços para uma tabela de
// passagem e só no último comando troca o registro da agenda (que continua inteiro até lá).
const pedacos = json.match(/[\s\S]{1,40000}/g);
const sql = [
  'CREATE TABLE IF NOT EXISTS import_staging (id TEXT PRIMARY KEY, data TEXT NOT NULL);',
  `DELETE FROM import_staging WHERE id=${aspas(SALA)};`,
  `INSERT INTO import_staging (id, data) VALUES (${aspas(SALA)}, '');`,
  ...pedacos.map((p) => `UPDATE import_staging SET data = data || ${aspas(p)} WHERE id=${aspas(SALA)};`),
  linha
    ? `UPDATE rooms SET state=(SELECT data FROM import_staging WHERE id=${aspas(SALA)}), version=version+1, updated=${agora} WHERE id=${aspas(SALA)} AND version=${Number(linha.version)};`
    : `INSERT INTO rooms (id, manager, client, state, version, created, updated) VALUES (${aspas(SALA)}, ${aspas(randomBytes(16).toString('hex'))}, ${aspas(randomBytes(16).toString('hex'))}, (SELECT data FROM import_staging WHERE id=${aspas(SALA)}), 0, ${agora}, ${agora});`,
  `DELETE FROM import_staging WHERE id=${aspas(SALA)};`,
];
const pasta = mkdtempSync(join(tmpdir(), 'santa-cor-'));
try {
  const caminho = join(pasta, 'importar.sql');
  writeFileSync(caminho, sql.join('\n'));
  d1(['--file', caminho]);
} finally { rmSync(pasta, { recursive: true, force: true }); }
const [conferido] = d1(['--command', `SELECT length(state) AS tamanho FROM rooms WHERE id=${aspas(SALA)}`]);
if (conferido?.tamanho !== json.length) throw new Error('A agenda mudou durante a importação (alguém salvou ao mesmo tempo). Nada foi perdido: rode de novo.');
console.log(`Planilha importada${remoto ? ' no site publicado' : ''}: ${r.clients} cliente(s) novas, ${r.updated} completadas, ${r.staff} profissional(is), ${r.history} mês(es) de faturamento, ${r.fixedCosts} custo(s) fixo(s), ${r.stock} item(ns) de estoque.`);
