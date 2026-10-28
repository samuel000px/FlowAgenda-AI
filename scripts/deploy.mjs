// Publica o painel na conta Cloudflare de quem rodou `npx wrangler login`.
// Na primeira vez cria o banco D1 e as tabelas; nas próximas só atualiza o código.
// Nenhum dado existente é apagado. As senhas e chaves ficam nos segredos do Cloudflare.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import './sites-env.mjs';

const NOME = 'santa-cor';
const BANCO = 'santa-cor-db';
const CONFIG = 'dist/server/wrangler.json';

function rodar(args, { entrada, falhaOk = false } = {}) {
  const r = spawnSync(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', ...args],
    { encoding: 'utf8', input: entrada, timeout: 180000 });
  if (r.error) throw r.error;
  if (r.status !== 0 && !falhaOk) throw new Error(r.stderr || r.stdout || `wrangler ${args.join(' ')} falhou.`);
  return r.status === 0 ? r.stdout : null;
}
const json = (texto) => JSON.parse(texto.slice(texto.search(/[[{]/)));

if (!rodar(['whoami'], { falhaOk: true })?.includes('@')) {
  console.error('Entre na sua conta Cloudflare primeiro: npx wrangler login');
  process.exit(1);
}

let banco = json(rodar(['d1', 'list', '--json'])).find((d) => d.name === BANCO);
if (!banco) {
  console.log(`Criando o banco ${BANCO}...`);
  rodar(['d1', 'create', BANCO]);
  banco = json(rodar(['d1', 'list', '--json'])).find((d) => d.name === BANCO);
}

console.log('Montando o app...');
const build = spawnSync(process.execPath, ['scripts/run-framework.mjs', 'build'], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

// O build sai com um banco de exemplo; aqui entram o nome do app e o banco de verdade.
const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
config.name = config.topLevelName = NOME;
config.triggers = { crons: ['* * * * *'] };
config.d1_databases = [{ binding: 'DB', database_name: BANCO, database_id: banco.uuid }];
writeFileSync(CONFIG, JSON.stringify(config));

// Mesmas tabelas do scripts/init-local-db.mjs, só que no banco publicado.
const sql = (args) => json(rodar(['d1', 'execute', 'DB', '--remote', '--config', CONFIG, '--json', ...args]));
const tabelas = (nomes) => sql(['--command', `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${nomes.map((n) => `'${n}'`).join(',')})`])
  .flatMap((item) => item.results || []).length;
for (const [arquivo, nomes] of [['drizzle/0000_young_lizard.sql', ['rooms', 'limits']], ['drizzle/0001_foamy_klaw.sql', ['calendar_connections', 'calendar_oauth']], ['drizzle/0002_whatsapp.sql', ['whatsapp_connections']]]) {
  const achadas = tabelas(nomes);
  if (achadas === 0) { sql(['--file', arquivo]); console.log(`Tabelas criadas: ${nomes.join(', ')}.`); }
  else if (achadas !== nomes.length) throw new Error(`Banco publicado incompleto (${nomes.join(', ')}). Nada foi apagado; confira antes de continuar.`);
}

console.log('Publicando...');
let saida;
try { saida = rodar(['deploy', '--config', CONFIG]); } catch (e) {
  const painel = e.message.match(/https:\/\/dash\.cloudflare\.com\/\S+\/workers\/onboarding/)?.[0];
  if (!painel) throw e;
  console.error(`\nFalta escolher o endereço *.workers.dev da conta (uma vez só). Abra ${painel}, escolha um nome e rode npm run deploy de novo.`);
  process.exit(1);
}
const endereco = saida.match(/https:\/\/\S+\.workers\.dev/)?.[0];

// A chave que assina o login é gerada aqui uma vez e nunca aparece na tela.
const segredos = json(rodar(['secret', 'list', '--name', NOME, '--format', 'json'])).map((s) => s.name);
if (!segredos.includes('CALENDAR_ENCRYPTION_KEY')) {
  rodar(['secret', 'put', 'CALENDAR_ENCRYPTION_KEY', '--name', NOME], { entrada: randomBytes(32).toString('hex') });
}

console.log(`\nPublicado${endereco ? ` em ${endereco}` : ''}.`);
const faltam = ['APP_SENHA', 'GEMINI_API_KEY'].filter((s) => !segredos.includes(s));
if (faltam.length) {
  console.log('\nFalta cadastrar (cada comando pede o valor, que não aparece na tela):');
  for (const s of faltam) console.log(`  npx wrangler secret put ${s} --name ${NOME}`);
  console.log('Sem APP_SENHA ninguém entra no painel. Sem GEMINI_API_KEY, os botões de aceite e recusa funcionam, mas o texto livre não é interpretado.');
}
