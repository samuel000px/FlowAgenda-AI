import {env} from 'cloudflare:workers';
import {requireAdmin,sameOrigin} from '../../../lib/admin-auth';
import {today,upgrade} from '../../../lib/flowagenda.mjs';
import {pedirAoGemini} from '../../../lib/assistente/gemini';
import {FERRAMENTAS,desfazerPacote,executarChamadas,instrucoes,orientarConfirmacao} from '../../../lib/assistente/ferramentas.mjs';
import {aplicarPlano} from '../../../lib/assistente/planos.mjs';
export const dynamic='force-dynamic';
// Assistente do painel da gerência. Só "perguntar" chama o Gemini (1 vez) e conta no teto do dia, e só
// quando ele respondeu. Confirmar, descartar e desfazer usam o plano guardado no cadastro: sem Gemini e sem contar.
// O teto é conferido antes (lendo "used") e somado depois da resposta do Gemini, para falha não gastar pedido.
// Para os testes: globalThis.__assistenteFetch, quando existe, faz o papel do fetch; em produção não existe.
const FALHA='O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.';
const TETO='O assistente chegou ao limite de hoje. Ele volta amanhã às 0h. Enquanto isso, tudo funciona pelos botões do painel.';
const NAO_ENTENDI='Não entendi esse pedido. Pode dizer de outro jeito? Eu vejo a agenda, as clientes, o resumo do dia e o estoque.';
const TETO_GEMINI='O Gemini atingiu o limite de uso disponível. Tente mais tarde ou use os botões do painel. O prazo de liberação depende da cota do provedor.';
const SUMIU='Este plano não está mais disponível. Peça de novo.';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const limiteDe=(v:unknown)=>Number.isInteger(v)&&(v as number)>=10&&(v as number)<=500?v as number:60;
type Linha={state:string,version:number,limite:unknown,used:number|null};
type Feito={corpo:Record<string,unknown>,gravar?:boolean};
const contaDoDia=(room:string,now:number)=>`assistente:${room}:${today(now)}`;
// Uma ida ao banco traz o cadastro, o teto escolhido e o uso de hoje. O teto sai do próprio SQLite para
// não abrir o cadastro inteiro (300 KB) quando o pedido para no teto ou no GET.
async function ler(room:string,conta:string){
 const row=await env.DB!.prepare("SELECT state,version,json_extract(state,'$.settings.assistantDailyLimit') AS limite,(SELECT used FROM limits WHERE id=?) AS used FROM rooms WHERE id=?").bind(conta,room).first<Linha>();
 if(!row)throw Error('Cadastro administrativo não encontrado.');
 return row;
}
const restante=(row:Linha)=>Math.max(0,limiteDe(row.limite)-(row.used||0));
// Muda o cadastro com controle de versão: se outra tela gravou no meio, relê e refaz (no máximo 2 vezes a mais).
// O cadastro é aberto uma vez e só vira texto de novo quando há o que gravar.
async function comCadastro(room:string,conta:string,mudar:(s:any)=>Feito,primeira?:{row:Linha,s:any}){
 let corpo:Record<string,unknown>={};
 for(let i=0;i<3;i++){
  const row=i===0&&primeira?primeira.row:await ler(room,conta),s=i===0&&primeira?primeira.s:upgrade(JSON.parse(row.state));
  const r=mudar(s);corpo={restante:restante(row),...r.corpo};
  if(!r.gravar)return json(corpo);
  const saved=await env.DB!.prepare('UPDATE rooms SET state=?,version=version+1,updated=? WHERE id=? AND version=?').bind(JSON.stringify(s),Date.now(),room,row.version).run();
  if(saved.meta.changes)return json(corpo);
 }
 return json({resposta:'A agenda foi atualizada em outra tela. Tente de novo em instantes.',restante:corpo.restante},409);
}
// Histórico vindo da tela: só mensagens bem formadas, as 6 últimas (o cliente do Gemini corta cada uma em 500).
// Conversa para o Gemini: sem os avisos de falha, com falas seguidas da mesma pessoa juntas e começando
// pela gerente, para uma resposta curta ("expositor da entrada") completar o pedido anterior.
const AVISOS=new Set([FALHA,NAO_ENTENDI,TETO,TETO_GEMINI]);
type Fala={de:'gerente'|'assistente',texto:string};
const historicoDe=(h:unknown)=>{
 const lista=(Array.isArray(h)?h:[]).filter((m:any)=>m&&(m.de==='gerente'||m.de==='assistente')&&typeof m.texto==='string'&&m.texto.trim()&&!(m.de==='assistente'&&AVISOS.has(m.texto))).slice(-8);
 const falas:Fala[]=[];
 for(const m of lista as Fala[]){const ultima=falas[falas.length-1];if(ultima?.de===m.de)ultima.texto+='\n'+m.texto;else falas.push({de:m.de,texto:m.texto});}
 while(falas[0]?.de==='assistente')falas.shift();
 return falas;
};

async function perguntar(room:string,p:any,now:number){
 const texto=typeof p.texto==='string'?p.texto.trim():'';
 if(!texto)return json({error:'Escreva o que você precisa.'},400);
 if(texto.length>500)return json({error:'Escreva o pedido em até 500 caracteres.'},400);
 const conta=contaDoDia(room,now),row=await ler(room,conta),limite=limiteDe(row.limite);
 const orientacao=orientarConfirmacao(texto,historicoDe(p.historico));
 if(orientacao)return json({resposta:orientacao,restante:restante(row)});
 if(!env.GEMINI_API_KEY)return json({resposta:'O assistente ainda não está configurado. Use os botões do painel.',restante:restante(row)});
 if((row.used||0)>=limite)return json({resposta:TETO,restante:0},429);
 const s=upgrade(JSON.parse(row.state));
 let r:Awaited<ReturnType<typeof pedirAoGemini>>;
 try{r=await pedirAoGemini({key:env.GEMINI_API_KEY,model:env.GEMINI_MODEL||undefined,instrucoes:instrucoes(s,now),historico:historicoDe(p.historico),texto,ferramentas:FERRAMENTAS,fetcher:(globalThis as any).__assistenteFetch});}
 catch(e){return (e as Error).message==='limite-gemini'?json({resposta:TETO_GEMINI,restante:restante(row)},429):json({resposta:FALHA,restante:restante(row)});}
 // Sem função e sem texto (o modelo não soube o que fazer ou foi bloqueado): pede outra forma e não conta.
 if('texto' in r&&!r.texto.trim())return json({resposta:NAO_ENTENDI,restante:restante(row)});
 // Dois pedidos ao mesmo tempo podem passar juntos pela conferência; quem chegar depois do teto ainda recebe
 // a resposta (o Gemini já respondeu), com restante 0.
 const usado=await env.DB!.prepare('INSERT INTO limits(id,used) VALUES(?,1) ON CONFLICT(id) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(conta,limite).first<{used:number}>();
 const sobra=usado?Math.max(0,limite-usado.used):0;
 if('texto' in r)return json({resposta:r.texto,restante:sobra});
 const chamadas='ferramentas' in r?r.ferramentas:[r.ferramenta];
 // A ferramenta não chama o Gemini: num conflito de gravação ela roda de novo sobre o cadastro relido.
 return comCadastro(room,conta,st=>{
  const x=executarChamadas(st,chamadas,now);
  return x.tipo==='plano'?{corpo:{plano:x.plano,restante:sobra},gravar:true}:{corpo:{resposta:x.texto,restante:sobra}};
 },{row,s});
}

export async function GET(req:Request){
 try{
  const room=await requireAdmin(req,env),row=await ler(room,contaDoDia(room,Date.now()));
  return json({restante:restante(row),limite:limiteDe(row.limite)});
 }catch(e){return json({error:(e as Error).message},/Entre|sessão|acesso/i.test((e as Error).message)?401:400);}
}
export async function POST(req:Request){
 let room:string,p:any;
 try{
  sameOrigin(req);room=await requireAdmin(req,env);
  const raw=await req.text();if(raw.length>12000)return json({error:'Pedido muito longo.'},413);
  p=JSON.parse(raw);if(!p||typeof p!=='object')throw SyntaxError();
 }catch(e){return json({error:e instanceof SyntaxError?'Confira os dados do pedido.':(e as Error).message},/Entre|sessão|acesso/i.test((e as Error).message)?401:400);}
 try{
  const now=Date.now(),conta=contaDoDia(room,now),planoId=typeof p.planoId==='string'?p.planoId:'';
  switch(p.action){
   case 'perguntar':return await perguntar(room,p,now);
   // O plano vem sempre do cadastro, pelo id: um plano mandado no corpo do pedido é ignorado.
   case 'confirmar':{
    const semLinhas=Array.isArray(p.semLinhas)?p.semLinhas.filter((x:unknown)=>typeof x==='string'):[];
    return await comCadastro(room,conta,s=>{
     const plano=s.assistente?.planos?.find((x:any)=>x.id===planoId&&now<=x.validoAte);
     if(!plano)return {corpo:{resposta:SUMIU}};
     // pacoteId e desfazivel dizem à tela se esta confirmação ganha o botão Desfazer (e de qual pacote).
     try{const {avisos,pacoteId,desfazivel}=aplicarPlano(s,plano,now,semLinhas);return {corpo:{aplicado:{titulo:plano.titulo,avisos,pacoteId,desfazivel}},gravar:true};}
     catch(e){return {corpo:{resposta:(e as Error).message}};}
    });
   }
   case 'descartar':return await comCadastro(room,conta,s=>{
    const planos=s.assistente?.planos||[],resto=planos.filter((x:any)=>x.id!==planoId);
    if(resto.length===planos.length)return {corpo:{resposta:'Tudo bem, nada foi mudado.'}};
    s.assistente.planos=resto;return {corpo:{resposta:'Tudo bem, nada foi mudado.'},gravar:true};
   });
   // Desfaz exatamente o pacote da mensagem (pacoteId); se ele não é mais o último que dá para desfazer, responde
   // em vez de cair num pacote mais antigo. O plano é guardado como os outros e passa pelo Confirmar.
   case 'desfazer':{
    const pacoteId=typeof p.pacoteId==='string'?p.pacoteId:'';
    if(!pacoteId)return json({error:'Confira os dados do pedido.'},400);
    return await comCadastro(room,conta,s=>{
    const x=desfazerPacote(s,pacoteId,now);
    return x.tipo==='plano'?{corpo:{plano:x.plano},gravar:true}:{corpo:{resposta:x.texto}};
    });
   }
   default:return json({error:'Operação desconhecida.'},400);
  }
 }catch{return json({resposta:FALHA},503);}
}
