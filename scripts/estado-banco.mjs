// Ler e gravar o registro da agenda direto no banco (local ou publicado), para os scripts de
// manutenção. O D1 aceita no máximo ~100 KB por comando, então a gravação vai em pedaços para uma
// tabela de passagem e só o último comando troca o registro (que continua inteiro até lá).
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import './sites-env.mjs';

export const SALA = 'flowagenda';
const aspas = (v) => `'${String(v).replaceAll("'", "''")}'`;

/** Acesso ao registro de uma área (padrão: a agenda do salão). */
export function banco(remoto, sala = SALA) {
  const base = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--config', 'dist/server/wrangler.json',
    ...(remoto ? ['--remote'] : ['--local', '--persist-to', '.wrangler/state'])];
  const d1 = (args) => {
    const r = spawnSync(process.execPath, [...base, ...args, '--json'], { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || 'Não foi possível acessar o banco.');
    return JSON.parse(r.stdout.slice(r.stdout.search(/[[{]/))).flatMap((x) => x.results || []);
  };
  return {
    /** O registro da agenda ({state, version}) ou undefined se ninguém entrou no painel ainda. */
    ler() { return d1(['--command', `SELECT state,version FROM rooms WHERE id=${aspas(sala)}`])[0]; },
    /** Grava o estado; com `linha`, só se ninguém salvou no meio do caminho. */
    gravar(estado, linha) {
      const json = JSON.stringify(estado), agora = Date.now(), pedacos = json.match(/[\s\S]{1,40000}/g);
      const sql = [
        'CREATE TABLE IF NOT EXISTS import_staging (id TEXT PRIMARY KEY, data TEXT NOT NULL);',
        `DELETE FROM import_staging WHERE id=${aspas(sala)};`,
        `INSERT INTO import_staging (id, data) VALUES (${aspas(sala)}, '');`,
        ...pedacos.map((p) => `UPDATE import_staging SET data = data || ${aspas(p)} WHERE id=${aspas(sala)};`),
        linha
          ? `UPDATE rooms SET state=(SELECT data FROM import_staging WHERE id=${aspas(sala)}), version=version+1, updated=${agora} WHERE id=${aspas(sala)} AND version=${Number(linha.version)};`
          : `INSERT INTO rooms (id, manager, client, state, version, created, updated) VALUES (${aspas(sala)}, ${aspas(randomBytes(16).toString('hex'))}, ${aspas(randomBytes(16).toString('hex'))}, (SELECT data FROM import_staging WHERE id=${aspas(sala)}), 0, ${agora}, ${agora});`,
        `DELETE FROM import_staging WHERE id=${aspas(sala)};`,
      ];
      const pasta = mkdtempSync(join(tmpdir(), 'santa-cor-'));
      try { const caminho = join(pasta, 'gravar.sql'); writeFileSync(caminho, sql.join('\n')); d1(['--file', caminho]); }
      finally { rmSync(pasta, { recursive: true, force: true }); }
      const [conferido] = d1(['--command', `SELECT length(state) AS tamanho FROM rooms WHERE id=${aspas(sala)}`]);
      if (conferido?.tamanho !== json.length) throw new Error('A agenda mudou durante a gravação (alguém salvou ao mesmo tempo). Nada foi perdido: rode de novo.');
      return json.length;
    },
  };
}
