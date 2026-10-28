// Uma semana inteira de atendimentos fictícios (25 a 31/10/2026) numa área separada do banco local,
// para ver a agenda, o fechamento, as finanças e as remarcações funcionando juntos. A equipe é a do
// salão; as clientes são inventadas, sem telefones reais. Com --remote vai para o site publicado, também numa área separada.
//   npm run exemplos:semana            (no computador)
//   npm run exemplos:semana -- --remote (no site publicado, numa área separada)
import {readFileSync,existsSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {seedAdmin,actAdmin,at,clock} from '../lib/flowagenda.mjs';
import {closeAppointment,financeAction,financeAdminAction} from '../lib/finance-core.mjs';
import {openSupport} from '../lib/support-core.mjs';
import {banco} from './estado-banco.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),now=Date.now();
let semente=20261025;const sorte=()=>((semente=(semente*1103515245+12345)%2147483648)/2147483648);
const escolher=pesos=>{let r=sorte()*pesos.reduce((n,[,p])=>n+p,0);for(const [v,p] of pesos)if((r-=p)<0)return v;return pesos[0][0];};

const s=seedAdmin();s.settings.block=30;s.settings.autoNext=false;
const nomes=JSON.parse(readFileSync(join(root,'examples/casos-ficticios.json'),'utf8')).clients;
s.clients=nomes.map((name,i)=>({id:`SF-C${i+1}`,name,phone:`55839000${String(i+1).padStart(5,'0')}`,consent:sorte()<0.7,preferred:'',visits:Math.floor(sorte()*20),missed:sorte()<0.15?1:0,proposals:Math.floor(sorte()*4),accepted:Math.floor(sorte()*2),sample:true}));
const areas={Lili:['Mãos e pés','Alongamento e gel'],Ester:['Mãos e pés','Cabelo','Sobrancelha e depilação'],Lane:['Mãos e pés','Alongamento e gel'],Jessica:['Mãos e pés','Alongamento e gel'],Avyllen:['Mãos e pés']};
s.staff=Object.entries(areas).map(([name,a],i)=>({id:`SF-P${i+1}`,name,services:s.services.filter(v=>!v.addon&&a.includes(v.group)).map(v=>v.id),start:480,end:1080,break_start:720,break_end:780,active:true,commission:name==='Ester'?50:40,sample:true}));
// Peso de cada serviço: o quanto ele aparece na planilha do salão.
const PESOS={'Mãos e pés':[['S3',30],['S1',12],['S2',10],['S16',10],['S17',4],['S18',3],['S36',2],['S5',2],['S4',1]],'Alongamento e gel':[['S7',18],['S6',5],['S8',3],['S19',3],['S20',3]],
 'Cabelo':[['S11',12],['S29',5],['S26',4],['S13',3],['S27',2],['S28',2],['S30',2]],'Sobrancelha e depilação':[['S31',12],['S32',3],['S35',2],['S43',1]]};
const EXTRAS={'Mãos e pés':['S10','S9'],'Alongamento e gel':['S21','S22','S23','S24']};
const dias=['2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31'];
const semana=d=>new Date(d+'T12:00:00Z').getUTCDay();
let cliente=0;const proxima=()=>s.clients[(cliente++)%s.clients.length];
const book=(c,svc,staff,date,start)=>{try{actAdmin(s,'book',{client_id:c.id,service_id:svc,staff_id:staff.id,date,start},Math.min(now,Date.parse(date+'T06:00:00-03:00')));return s.appointments.at(-1);}catch{return null;}};

for(const date of dias){
 const h=s.settings.hours[semana(date)];if(!h)continue; // domingo e segunda: fechado
 for(const p of s.staff){
  const minhas=areas[p.name],ocupacao=p.name==='Avyllen'?0.45:p.name==='Jessica'?0.6:0.78;
  for(let t=h[0];t<h[1];){
   if(sorte()>ocupacao){t+=30;continue;}
   const area=escolher(minhas.map(a=>[a,a==='Mãos e pés'?3:a==='Alongamento e gel'?2:1.5]));
   const id=escolher(PESOS[area]),svc=s.services.find(v=>v.id===id);
   const a=t+svc.duration<=h[1]?book(proxima(),svc.id,p,date,t):null;
   t=a?Math.ceil(a.end/30)*30:t+30;
  }
 }
}

// O que já aconteceu: fechado com o valor que ficou, a forma de pagamento e quem fechou.
const passou=a=>at(a)+(a.end-a.start)*60000<=now;
const metodos=[['Pix',50],['Cartão',30],['Dinheiro',20]];
for(const a of s.appointments.filter(passou)){
 if(sorte()<0.05){actAdmin(s,'close',{id:a.id,result:'missed'},now);continue;}
 const area=s.services.find(v=>v.id===a.service_id).group,extraId=EXTRAS[area]&&sorte()<0.2?EXTRAS[area][Math.floor(sorte()*EXTRAS[area].length)]:null,extra=extraId?s.services.find(v=>v.id===extraId):null;
 const quem=sorte()<0.6?s.staff.find(p=>p.id===a.staff_id).name:'Gerência';
 closeAppointment(s,{id:a.id,amount:a.price+(extra?.price||0),method:escolher(metodos),note:extra?`fez ${extra.name.toLowerCase()} também`:''},{name:quem},now);
}
// Despesas, descontos das parceiras e custos fixos.
for(const [date,description,amount] of [['2026-10-27','Material de unhas (distribuidora)',85],['2026-10-28','Lanche da equipe',32],['2026-10-28','Algodão e acetona',27.5]])
 financeAction(s,'expense_add',{description,amount,date,requestId:randomUUID()},Date.parse('2026-10-28T20:00:00-03:00'));
financeAdminAction(s,'deduction_add',{staffId:'SF-P1',description:'Lanche de quarta',amount:12.5,date:'2026-10-28'},now);
financeAdminAction(s,'deduction_add',{staffId:'SF-P3',description:'Adiantamento',amount:50,date:'2026-10-27'},now);
for(const [name,amount] of [['Aluguel',1300],['Energia',450],['Água (Cagepa)',150],['Internet',50],['Material de limpeza',150]])financeAdminAction(s,'fixed_save',{name,amount},now);
const pacote=join(root,'dados/santa-cor.json');
if(existsSync(pacote))s.financeHistory=JSON.parse(readFileSync(pacote,'utf8')).history.filter(h=>h.month<'2026-10');

// O que vem: pedidos do site, cancelamentos que viram propostas de antecipação e lista de espera.
const futuros=s.appointments.filter(a=>a.status==='booked'&&at(a)>now);
for(const a of futuros.filter((_,i)=>i%11===3).slice(0,3)){a.status='requested';a.source='site';a.order='SF-R'+a.id;a.token=randomBytes(16).toString('hex');a.created=now;}
s.settings.autoNext=true;
const cancelar=futuros.filter(a=>a.status==='booked'&&a.date==='2026-10-29'&&['S3','S1','S7'].includes(a.service_id)).slice(0,2);
for(const a of cancelar)actAdmin(s,'cancel',{id:a.id},now);
const proposta=s.offers.find(o=>o.status==='pending');
if(proposta)actAdmin(s,'response',{id:proposta.id,text:'Pode ser sim, consigo ir mais cedo.',result:'accepted'},now);
for(const c of s.clients.slice(45,48))actAdmin(s,'waitlist_add',{client_id:c.id,service_id:'S3',date:'2026-10-31'},now);
openSupport(s,{channel:'demo:semana',source:'demo',name:s.clients[10].name,phone:'',text:'Posso trocar meu horário de sábado para sexta?'},now);
s.stock=[['Esmalte em gel vermelho','Expositor 1',6,3],['Acetona','Armário',1,3],['Lixa descartável','Armário',0,20],['Algodão','Armário',8,5],['Removedor','Mesa da Lili',2,2]].map(([name,place,qty,min],i)=>({id:`SF-K${i}`,name,place,qty,min,updated:now}));
s.sampleData={version:1,description:'Semana fictícia 25–31/10/2026',loadedAt:now};

const resumo=dias.map(d=>{const l=s.appointments.filter(a=>a.date===d&&['booked','requested'].includes(a.status));return `${d.slice(8)}/10: ${l.length} atendimento(s)`;}).join(' · ');
// Área nova a cada execução: nunca toca na agenda de verdade nem nas clientes reais.
const room='semana-'+randomBytes(6).toString('hex'),remoto=process.argv.includes('--remote');
banco(remoto,room).gravar(s);
mkdirSync(join(root,'.sites-runtime'),{recursive:true});
writeFileSync(join(root,'.sites-runtime/semana-ficticia.json'),JSON.stringify({room,resumo},null,2));
console.log(`Semana fictícia criada.\n${resumo}\nPagamentos: ${(s.payments||[]).length} · faltas: ${s.appointments.filter(a=>a.result==='missed').length} · pedidos do site: ${s.appointments.filter(a=>a.status==='requested').length} · propostas: ${s.offers.length}`);
console.log(`Abra: ${remoto?'https://santa.cor-esmalteria.workers.dev':'http://localhost:5173'}/painel#room=${room}\nSe já estiver no painel, clique em Sair antes. A área de verdade continua em /painel#room=flowagenda.`);
