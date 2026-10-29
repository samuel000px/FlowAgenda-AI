// Garante no .dev.vars a chave que protege o login, o link da equipe e a conexão do WhatsApp.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const path=new URL('../.dev.vars',import.meta.url);
let content=existsSync(path)?readFileSync(path,'utf8'):readFileSync(new URL('../.dev.vars.example',import.meta.url),'utf8');
const pattern=/^CALENDAR_ENCRYPTION_KEY=.*$/m;
const existing=content.match(pattern)?.[0];
if(!existing||/^CALENDAR_ENCRYPTION_KEY=["']?["']?\s*$/.test(existing)){
  const line=`CALENDAR_ENCRYPTION_KEY="${randomBytes(32).toString('hex')}"`;
  content=existing?content.replace(pattern,line):`${content}\n${line}\n`;
}
writeFileSync(path,content,{mode:0o600});
console.log('Configuração local preparada em .dev.vars. A chave de proteção existente foi preservada.');
