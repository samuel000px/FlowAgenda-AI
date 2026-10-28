// Hash, códigos aleatórios e cifra usados no login da gerência, no link da equipe e na conexão do
// WhatsApp. A chave do servidor continua com o nome CALENDAR_ENCRYPTION_KEY: trocar o nome derrubaria
// os logins e o link da equipe já publicados.
const encoder = new TextEncoder();
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2,'0')).join('');
}
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const nonce = () => b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
async function key(secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw Error('Configure CALENDAR_ENCRYPTION_KEY no servidor.');
  return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g), x => parseInt(x,16)), 'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(value, secret, room) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(room)},await key(secret),encoder.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(bytes))}`;
}
export async function unseal(value, secret, room) {
  const [iv, bytes] = value.split('.');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(room)},await key(secret),unb64(bytes));
  return JSON.parse(new TextDecoder().decode(plain));
}
