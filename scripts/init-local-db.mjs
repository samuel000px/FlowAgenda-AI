import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import './sites-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = new URL('../dist/server/wrangler.json', import.meta.url);
if (!existsSync(config)) throw new Error('Execute npm run build antes de preparar o banco.');
const base = ['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state'];
function wrangler(args) {
  const result = spawnSync(process.execPath,[...base,...args],{cwd:root,encoding:'utf8',timeout:60000});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(result.stderr||result.stdout||'Não foi possível acessar o banco local.');
  return result.stdout;
}
const output = wrangler(['--command',"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('rooms','limits')",'--json']);
const rows = JSON.parse(output).flatMap(item=>item.results||[]);
if (rows.length===2) {
  console.log('Banco local pronto. Salas existentes foram preservadas.');
} else if (rows.length===0) {
  wrangler(['--file','drizzle/0000_young_lizard.sql','--json']);
  console.log('Banco local criado. A primeira sala será criada pela interface.');
} else {
  throw new Error('Banco parcialmente configurado. Nenhum dado foi apagado. Confira as migrações antes de continuar.');
}

const whatsappTables=JSON.parse(wrangler(['--command',"SELECT name FROM sqlite_master WHERE type='table' AND name='whatsapp_connections'",'--json'])).flatMap(item=>item.results||[]);
if(!whatsappTables.length)wrangler(['--file','drizzle/0002_whatsapp.sql','--json']);
console.log('Integração WhatsApp preparada.');
