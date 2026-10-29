import {env} from 'cloudflare:workers';
import {requireAdmin,sameOrigin} from '../../../lib/admin-auth';
import {requireStaff} from '../../../lib/staff-auth';
import {updateRoom} from '../../../lib/whatsapp';
export const dynamic='force-dynamic';
// Foto de perfil da equipe. Fica numa tabela própria, fora do cadastro (que já passa de 300 KB e é lido
// a cada atualização do painel); o cadastro guarda só o id da foto. Cada envio gera um id novo, então a
// imagem pode ficar em cache por um ano: trocar a foto troca o endereço.
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const TIPOS=['image/jpeg','image/png','image/webp'];

export async function GET(req:Request){
 const fotoId=new URL(req.url).searchParams.get('id')||'';
 if(!/^F[a-f0-9]{24}$/.test(fotoId))return new Response('Foto não encontrada.',{status:404});
 const row=await env.DB!.prepare('SELECT tipo,data FROM fotos WHERE id=?').bind(fotoId).first<any>();
 if(!row)return new Response('Foto não encontrada.',{status:404});
 const bytes=Uint8Array.from(atob(row.data),c=>c.charCodeAt(0));
 return new Response(bytes,{headers:{'Content-Type':row.tipo,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
}

/** Envia a foto: a gerência para qualquer profissional; a funcionária só a dela. {staffId, data:'data:image/jpeg;base64,...'} */
export async function POST(req:Request){
 try{
  sameOrigin(req);const raw=await req.text();if(raw.length>400000)return json({error:'A foto ficou grande demais. Escolha outra.'},413);
  const p=JSON.parse(raw),staffId=String(p.staffId||'');
  let room:string;
  try{room=await requireAdmin(req,env);}catch{const s=await requireStaff(req,env);if(s.staffId!==staffId)throw Error('Você só pode trocar a sua foto.');room=s.room;}
  const m=/^data:([a-z/]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(p.data||''));
  if(!m||!TIPOS.includes(m[1]))throw Error('Envie uma imagem JPG, PNG ou WebP.');
  const fotoId='F'+Array.from(crypto.getRandomValues(new Uint8Array(12)),n=>n.toString(16).padStart(2,'0')).join('');
  await env.DB!.prepare('INSERT INTO fotos(id,room,staff_id,tipo,data,created) VALUES(?,?,?,?,?,?)').bind(fotoId,room,staffId,m[1],m[2],Date.now()).run();
  try{
   await updateRoom(env,room,s=>{const pro=s.staff.find((x:any)=>x.id===staffId&&!x.removed);if(!pro)throw Error('Profissional não encontrada.');pro.photo=fotoId;});
  }catch(e){await env.DB!.prepare('DELETE FROM fotos WHERE id=?').bind(fotoId).run();throw e;}
  // A foto anterior (e qualquer sobra) sai; só a atual fica guardada.
  await env.DB!.prepare('DELETE FROM fotos WHERE room=? AND staff_id=? AND id<>?').bind(room,staffId,fotoId).run();
  return json({photo:fotoId});
 }catch(e){return json({error:(e as Error).message},400);}
}
