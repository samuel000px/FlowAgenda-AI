import {env} from 'cloudflare:workers';
import {requireAdmin,sameOrigin} from '../../../lib/admin-auth';
import {createStaffAccess,staffPath} from '../../../lib/staff-auth';
import {updateRoom} from '../../../lib/whatsapp';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
async function view(room:string){const row=await env.DB!.prepare('SELECT state FROM rooms WHERE id=?').bind(room).first<any>();if(!row)throw Error('Agenda não encontrada.');const access=JSON.parse(row.state).staffAccess;
 // Um link criado com outra chave do servidor não abre mais: o painel oferece gerar outro.
 try{return {path:await staffPath(env,room,access),created:access?.created||0};}catch{return {path:'',broken:true,created:access?.created||0};}}
export async function GET(req:Request){let room;try{room=await requireAdmin(req,env);}catch(e){return json({error:(e as Error).message},401);}
 try{return json(await view(room));}catch(e){return json({error:(e as Error).message},400);}}
export async function POST(req:Request){try{
 sameOrigin(req);const room=await requireAdmin(req,env),raw=await req.text();if(raw.length>1000)throw Error('Solicitação inválida.');
 let {action}=JSON.parse(raw);if(!['create','rotate','disable'].includes(action))throw Error('Operação inválida.');
 // Criar com um link que não abre mais (gravado com outra chave do servidor) troca por um novo.
 if(action==='create'&&(await view(room)).broken)action='rotate';
 const access=action==='disable'?null:await createStaffAccess(env,room);
 await updateRoom(env,room,s=>{if(action==='create'&&s.staffAccess)return;if(access)s.staffAccess=access;else delete s.staffAccess;});
 return json(await view(room));
}catch(e){return json({error:(e as Error).message},400);}}
