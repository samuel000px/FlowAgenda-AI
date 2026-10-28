// Cadastra no site publicado os três segredos do Google Agenda, numa pergunta só:
//   npm run google:configurar
// Antes, no Google Cloud: ative a Google Calendar API, crie um "ID do cliente OAuth" do tipo
// "Aplicativo da Web" e cadastre o endereço de retorno que este script mostra.
// Os valores vão direto para os segredos do Cloudflare e não ficam em nenhum arquivo.
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import './sites-env.mjs';

const NOME = 'santa';
const PADRAO = 'https://santa.cor-esmalteria.workers.dev';
const rl = createInterface({ input: process.stdin, output: process.stdout });
const perguntar = async (texto, padrao = '') => ((await rl.question(padrao ? `${texto} [${padrao}]: ` : `${texto}: `)).trim() || padrao);

console.log('\nGoogle Agenda: preparação única do site publicado.\n');
const site = (await perguntar('Endereço do painel publicado', PADRAO)).replace(/\/+$/, '');
if (!/^https:\/\/[^/]+$/.test(site)) { console.error('Use o endereço completo, começando com https:// e sem caminho no final.'); process.exit(1); }
const retorno = `${site}/api/google/callback`;
console.log(`\nNo Google Cloud, em "URIs de redirecionamento autorizados", cadastre exatamente:\n  ${retorno}\n`);
const id = await perguntar('Cole o ID do cliente (termina em .apps.googleusercontent.com)');
if (!/\.apps\.googleusercontent\.com$/.test(id)) { console.error('Esse não parece um ID do cliente OAuth do Google. Confira em Credenciais.'); process.exit(1); }
const segredo = await perguntar('Cole a chave secreta do cliente (começa com GOCSPX-)');
if (segredo.length < 10) { console.error('Chave secreta vazia ou curta demais.'); process.exit(1); }
rl.close();

for (const [nome, valor] of [['GOOGLE_CLIENT_ID', id], ['GOOGLE_CLIENT_SECRET', segredo], ['GOOGLE_REDIRECT_URI', retorno]]) {
  const r = spawnSync(process.execPath, ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'secret', 'put', nome, '--name', NOME],
    { input: valor, encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0) { console.error(`Não foi possível gravar ${nome}:\n${r.stderr || r.stdout}`); process.exit(1); }
  console.log(`✓ ${nome} gravado.`);
}
console.log(`\nPronto. Abra ${site}/painel → Configurações → Google Agenda e toque em "Conectar conta Google".`);
console.log('Enquanto o app do Google estiver em modo "Teste", adicione a conta do salão em "Usuários de teste".');
