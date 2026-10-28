import {digest,nonce,seal,unseal} from './cripto.mjs';
import {activeStaff} from './staff-core.mjs';
const cookieName='flowagenda_staff_session';
export const validStaffToken=(value:string)=>/^[a-f0-9]{48}$/.test(value);
const encode=(s:string)=>btoa(s).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const decode=(s:string)=>atob(s.replaceAll('-','+').replaceAll('_','/'));
async function key(env:Cloudflare.Env){
 if(!env.CALENDAR_ENCRYPTION_KEY||!env.APP_SENHA)throw Error('A administração precisa configurar o acesso.');
 return crypto.subtle.importKey('raw',new TextEncoder().encode(await digest(env.CALENDAR_ENCRYPTION_KEY+':staff-session:'+env.APP_SENHA)),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
export async function createStaffAccess(env:Cloudflare.Env,room:string){
 const token=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
 return {hash:await digest(token),sealed:await seal({token},env.CALENDAR_ENCRYPTION_KEY,'staff-link:'+room),created:Date.now()};
}
export async function staffPath(env:Cloudflare.Env,room:string,access:any){
 if(!access)return '';
 const {token}=await unseal(access.sealed,env.CALENDAR_ENCRYPTION_KEY,'staff-link:'+room);
 return '/funcionarios-'+token;
}
export async function roomByStaffToken(env:Cloudflare.Env,token:string){
 if(!validStaffToken(token))throw Error('Link da equipe inválido ou desativado.');
 const hash=await digest(token);
 const row=await env.DB!.prepare("SELECT id,state FROM rooms WHERE json_extract(state,'$.staffAccess.hash')=?").bind(hash).first<any>();
 if(!row)throw Error('Link da equipe inválido ou desativado.');
 return {room:row.id,state:JSON.parse(row.state),grant:hash};
}
export async function staffCookie(env:Cloudflare.Env,room:string,staffId:string,grant:string,secure:boolean){
 const payload=encode(JSON.stringify({role:'staff',room,staffId,grant,expires:Date.now()+8*3600000,nonce:nonce()}));
 const sig=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),new TextEncoder().encode(payload))),n=>n.toString(16).padStart(2,'0')).join('');
 return `${cookieName}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure?'; Secure':''}`;
}
export const clearStaffCookie=(secure:boolean)=>`${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure?'; Secure':''}`;
export async function requireStaff(req:Request,env:Cloudflare.Env){
 try{
  const raw=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
  if(raw.length>2048)throw Error();
  const [payload,sig]=raw.split('.');if(!/^[a-f0-9]{64}$/.test(sig||''))throw Error();
  const bytes=Uint8Array.from(sig.match(/../g)!,n=>parseInt(n,16));
  if(!await crypto.subtle.verify('HMAC',await key(env),bytes,new TextEncoder().encode(payload)))throw Error();
  const data=JSON.parse(decode(payload));
  if(data.role!=='staff'||!Number.isFinite(data.expires)||data.expires<Date.now())throw Error();
  const row=await env.DB!.prepare('SELECT state FROM rooms WHERE id=?').bind(data.room).first<any>();if(!row)throw Error();
  const state=JSON.parse(row.state);if(!state.staffAccess||state.staffAccess.hash!==data.grant)throw Error();
  activeStaff(state,data.staffId);
  return {room:data.room as string,staffId:data.staffId as string,grant:data.grant as string,state,expires:data.expires as number};
 }catch{throw Error('Abra o link da equipe e escolha seu nome para entrar.');}
}
