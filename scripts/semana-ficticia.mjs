// Uma semana inteira de atendimentos fictícios (padrão: 25 a 31/10/2026) numa área separada do banco
// local, para ver a agenda, Aceitações, Remarcações, Atendimento, Finanças e Fechamento funcionando
// juntos. Só pessoas inventadas, sem telefone. Com --remote, grava no site publicado, também numa área
// nova e separada: a agenda real, o /agendar e o WhatsApp (que só existe na área com conexão) não mudam.
//   node scripts/semana-ficticia.mjs [--inicio AAAA-MM-DD] [--check] [--remote]
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {seedAdmin,actAdmin,tickAdmin,at,message,clock} from '../lib/flowagenda.mjs';
import {bookInStore,interestInStore} from '../lib/agendamento.mjs';
import {closeAppointment,financeAction} from '../lib/finance-core.mjs';
import {openSupport} from '../lib/support-core.mjs';
import {NEEDS_STAFF} from '../lib/whatsapp-core.mjs';
import {banco} from './estado-banco.mjs';

const args=process.argv.slice(2),inicio=args.includes('--inicio')?args[args.indexOf('--inicio')+1]:'2026-10-25';
if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio))throw Error('Use --inicio AAAA-MM-DD.');
const root=fileURLToPath(new URL('../',import.meta.url));
const nomes=JSON.parse(readFileSync(join(root,'examples/casos-ficticios.json'),'utf8')).clients;
const now=Date.now(),s=seedAdmin();
const mais=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const dias=[...Array(7)].map((_,i)=>mais(inicio,i)),abertos=dias.filter(d=>s.settings.hours[new Date(d+'T12:00:00Z').getUTCDay()]);
const vespera=d=>Date.parse(d+'T00:00:00-03:00')-86400000;
// Sorteio repetível: rodar de novo monta a mesma semana.
let semente=20261025;const sorte=()=>(semente=(semente*1103515245+12345)%2147483648)/2147483648;
const um=l=>l[Math.floor(sorte()*l.length)];

const id=g=>s.services.filter(v=>!v.addon&&v.group===g).map(v=>v.id);
const equipe=[
  ['EX-P1','Lia',['Mãos e pés','Alongamento e gel'],40,[720,780]],['EX-P2','Nina',['Mãos e pés','Alongamento e gel'],40,[750,810]],
  ['EX-P3','Rafa',['Cabelo','Sobrancelha e depilação'],45,[720,780]],['EX-P4','Duda',['Mãos e pés'],40,[0,0]],['EX-P5','Bel',['Mãos e pés','Alongamento e gel'],40,[780,840]],
];
s.staff=equipe.map(([pid,name,areas,commission,[bs,be]])=>({id:pid,name,services:areas.flatMap(id),start:480,end:1080,break_start:bs,break_end:be,active:true,commission,sample:true}));
s.clients=nomes.map((name,i)=>({id:`EX-C${i+1}`,name,phone:'',consent:i%4!==0,preferred:'',visits:3+Math.floor(sorte()*20),missed:0,proposals:0,accepted:0,sample:true}));
s.settings.autoNext=false;
// Aniversariantes da semana, para o aviso de parabéns aparecer.
for(const [n,d] of [[3,dias[4]],[11,dias[5]],[27,dias[6]]])s.clients[n].birthday=d.slice(5);

// O que mais sai na planilha, por área (com peso pela repetição).
const procura={'Mãos e pés':['S3','S3','S3','S1','S1','S2','S2','S16','S16','S17','S36','S18','S5'],'Alongamento e gel':['S7','S7','S7','S6','S8','S19','S20'],
  'Cabelo':['S11','S11','S11','S29','S26','S13','S30','S27'],'Sobrancelha e depilação':['S31','S31','S31','S35','S32','S40']};
const servico=k=>s.services.find(v=>v.id===k);
const livres=[...s.clients];
function marcar(c,svc,pid,date,start){
  try{actAdmin(s,'book',{client_id:c.id,service_id:svc,staff_id:pid,date,start},vespera(date));return s.appointments.at(-1);}catch{return null;}
}

// Pedidos com mais de um serviço, marcados na loja (o carrinho cuida da sequência).
const carrinhos=[
  [abertos[0],540,{items:[{service:'S7'},{service:'S2'}],staff:{'Alongamento e gel':'EX-P1','Mãos e pés':'EX-P1'}}],
  [abertos[2],630,{items:[{service:'S1'},{service:'S11',variant:1}],staff:{'Mãos e pés':'EX-P4','Cabelo':'EX-P3'}}],
  [abertos[3],630,{items:[{service:'S31'},{service:'S32'}],staff:{'Sobrancelha e depilação':'EX-P3'}}],
];
carrinhos.forEach(([date,start,cart],n)=>bookInStore(s,{client_id:s.clients[40+n].id,cart,date,start,earlier:true},'Gerência',vespera(date)));

// Dois pedidos do site esperando a gerência em Aceitações (um com dois serviços).
// Marcados antes de encher a agenda (para caber) e só viram pedido no fim: a montagem da semana roda
// com o relógio de cada dia, e um pedido em aberto num dia já "passado" seria encerrado.
const pedidos=[];
const futuros=abertos.filter(d=>Date.parse(d+'T18:00:00-03:00')>now);
for(const [n,date,cart] of [[47,futuros[0],{items:[{service:'S16'}],staff:{'Mãos e pés':''}}],[48,futuros[1]||futuros[0],{items:[{service:'S31'},{service:'S11',variant:2}],staff:{}}]]){
  const antes=s.appointments.length;
  for(const start of [900,945,990,855,810,765,720,675,630,585,540]){try{bookInStore(s,{client_id:s.clients[n].id,cart,date,start,earlier:true},'Site',vespera(date));break;}catch{/* tenta outro horário */}}
  pedidos.push(...s.appointments.slice(antes).map(a=>[a,s.clients[n].name]));
}

// O resto da semana: cada profissional com a agenda cheia em boa parte; sábado lotado nas unhas.
for(const date of abertos){
  const [abre,fecha]=s.settings.hours[new Date(date+'T12:00:00Z').getUTCDay()],sabado=date===abertos.at(-1);
  for(const p of s.staff){
    for(let t=abre;t<fecha;t+=45){
      if(!sabado&&sorte()<0.3)continue;
      const area=um([...new Set(p.services.map(k=>servico(k).group))]);
      const svc=um(procura[area].filter(k=>p.services.includes(k)));
      if(t+servico(svc).duration>fecha)continue;
      for(let tentativa=0;tentativa<5&&!marcar(um(livres),svc,p.id,date,t);tentativa++);
    }
  }
}

// Data cheia no sábado: duas clientes demonstram interesse e entram na espera com prioridade.
const sabado=abertos.at(-1);
for(const n of [44,45])try{interestInStore(s,{client_id:s.clients[n].id,cart:{items:[{service:'S3'}],staff:{'Mãos e pés':''}},date:sabado,earlier:true},'Lia',vespera(sabado));}catch{/* se sobrou horário, fica sem */}
actAdmin(s,'waitlist_add',{client_id:s.clients[46].id,service_id:'S11',date:abertos[3]},now);

// Cancelamentos que viram vaga: uma proposta esperando a cliente e outra esperando aprovação.
const remarcaveis=s.appointments.filter(a=>a.status==='booked'&&!a.order&&at(a)>now+86400000&&['S1','S2','S3','S16'].includes(a.service_id));
for(const a of remarcaveis.slice(0,2))actAdmin(s,'cancel',{id:a.id},now);
for(const [g,resposta] of s.gaps.filter(g=>g.status==='open').slice(0,2).map((g,i)=>[g,i?'Sim, consigo ir nesse horário.':''])){
  try{actAdmin(s,'seek',{id:g.id},now);}catch{continue;}
  const o=s.offers.find(o=>o.gap_id===g.id&&o.status==='pending');
  if(o&&resposta)actAdmin(s,'response',{id:o.id,text:resposta,result:'accepted'},now);
}

// O que já passou: presença, pagamento (Pix, cartão, dinheiro), falta e um sem pagamento.
const metodos=['Pix','Pix','Cartão','Dinheiro'];let k=0;
for(const a of s.appointments.filter(a=>a.status==='booked'&&at(a)+(a.end-a.start)*60000<=now).sort((x,y)=>at(x)-at(y))){
  k++;
  if(k%17===0){actAdmin(s,'close',{id:a.id,result:'missed'},now);continue;}
  if(k%23===0){actAdmin(s,'close',{id:a.id,result:'attended'},now);continue;}
  closeAppointment(s,{id:a.id,amount:a.price,method:metodos[k%4]},{name:s.staff.find(p=>p.id===a.staff_id).name},now);
}
for(const [d,desc,v] of [[abertos[0],'Lanche da equipe',38],[abertos[1],'Algodão e lixas',64.9]])if(Date.parse(d+'T12:00:00-03:00')<now)financeAction(s,'expense_add',{description:desc,amount:v,date:d,requestId:randomUUID()},now);
s.fixedCosts=[['Aluguel',1300],['Energia',450],['Água',150],['Internet',50]].map(([name,amount],i)=>({id:'EX-F'+i,name,amount,active:true}));

// WhatsApp: duas clientes pediram para falar com uma pessoa e uma conversa no atendimento.
for(const [n,texto] of [[12,'Oi, queria trocar a cor que combinei, dá pra falar com alguém?'],[19,'Vocês fazem unha em criança? Prefiro falar com a atendente.']])
  message(s,s.clients[n].id,'client',texto,{whatsapp:{id:'EX-W'+n,status:'received',outcome:NEEDS_STAFF}},now-3600000*(n%5+1));
openSupport(s,{channel:'demo:cliente-30',source:'demo',name:s.clients[30].name,phone:'',text:'Posso levar meu próprio esmalte?'},now);
s.stock=[['Esmalte vermelho','Bancada',8,3],['Acetona','Armário',1,3],['Lixa descartável','Armário',0,20],['Algodão','Armário',12,5],['Gel construtor','Expositor',2,2]]
  .map(([name,place,qty,min],i)=>({id:'EX-K'+i,name,place,qty,min,updated:now}));
for(const [a,name] of pedidos)Object.assign(a,{status:'requested',source:'site',name});
tickAdmin(s,now);
s.sampleData={version:1,loadedAt:now,description:'Semana fictícia',days:dias};

// Conferências antes de gravar qualquer coisa.
const vivos=s.appointments.filter(a=>['booked','requested'].includes(a.status));
for(const a of vivos)for(const b of vivos)if(a.id!==b.id&&a.date===b.date&&(a.staff_id===b.staff_id||a.client_id===b.client_id))assert.ok(a.end<=b.start||b.end<=a.start,'Há horários sobrepostos.');
assert.ok(s.clients.every(c=>!c.phone));
const porDia=Object.fromEntries(dias.map(d=>[d,s.appointments.filter(a=>a.date===d).length]));
const resumo={dias:porDia,atendimentos:s.appointments.length,pedidosDoSite:s.appointments.filter(a=>a.status==='requested').length,
  propostas:s.offers.map(o=>o.status),esperaSabado:s.waitlist.filter(w=>w.date===sabado).length,
  pedidos:s.appointments.filter(a=>a.status==='requested').map(a=>a.date+' '+clock(a.start)+' '+a.service_id+' '+a.client_id),
  primeiro:`${s.appointments[0].date} ${clock(s.appointments[0].start)}`};

if(args.includes('--remote')){
  const room='semana-'+randomBytes(8).toString('hex'),db=banco(true,room);
  if(db.ler())throw Error('Área já existe. Nada foi gravado.');
  db.gravar(s);
  resumo.link='https://santa.cor-esmalteria.workers.dev/painel#room='+room;
}else if(!args.includes('--check')){
  const {DatabaseSync}=await import('node:sqlite');
  const pasta=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const arquivos=readdirSync(pasta).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
  assert.equal(arquivos.length,1,'Banco local ambíguo. Nada foi alterado.');
  const db=new DatabaseSync(join(pasta,arquivos[0]));
  // Sempre uma área nova: não mexe nas clientes nem nas integrações que já existem no banco local.
  const room='semana-'+randomBytes(8).toString('hex');
  db.prepare('INSERT INTO rooms(id,manager,client,state,version,created,updated) VALUES(?,?,?,?,0,?,?)').run(room,randomBytes(24).toString('hex'),randomBytes(24).toString('hex'),JSON.stringify(s),now,now);
  db.close();
  resumo.link='http://localhost:5173/painel#room='+room;
}
console.log(JSON.stringify(resumo,null,2));
