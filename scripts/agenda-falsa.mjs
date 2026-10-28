// Atendimentos falsos na agenda de verdade do salão (padrão: 25 a 31/10/2026), com a equipe e o
// catálogo reais, para ver como a agenda fica cheia. As clientes se chamam "Cliente Falso 1", "Cliente
// Falso 2"... sem telefone, então nada é enviado pelo WhatsApp. Tudo leva a marca "sample" e sai de
// uma vez com --apagar. Não cancela nem prepara remarcação: isso chamaria clientes reais.
//   node scripts/agenda-falsa.mjs [--remote] [--inicio AAAA-MM-DD] [--apagar]
import assert from 'node:assert/strict';
import {upgrade,free,id,at} from '../lib/flowagenda.mjs';
import {banco} from './estado-banco.mjs';

const args=process.argv.slice(2),remoto=args.includes('--remote');
const inicio=args.includes('--inicio')?args[args.indexOf('--inicio')+1]:'2026-10-25';
if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio))throw Error('Use --inicio AAAA-MM-DD.');
const FALSO=/^Cliente Falso \d+$/,onde=remoto?'no site publicado':'no banco local';
const db=banco(remoto),linha=db.ler();
if(!linha)throw Error('A agenda ainda não existe. Entre no painel uma vez antes.');
const s=upgrade(JSON.parse(linha.state)),now=Date.now();

/** Tira tudo o que é falso: clientes, horários, lista de espera, conversas, histórico e avisos. */
function apagar(){
  const clientes=new Set(s.clients.filter(c=>FALSO.test(c.name)||c.sample).map(c=>c.id));
  const horarios=new Set(s.appointments.filter(a=>a.sample||clientes.has(a.client_id)).map(a=>a.id));
  const antes=s.appointments.length;
  s.clients=s.clients.filter(c=>!clientes.has(c.id));
  s.appointments=s.appointments.filter(a=>!horarios.has(a.id));
  s.waitlist=s.waitlist.filter(w=>!clientes.has(w.client_id));
  s.messages=s.messages.filter(m=>!clientes.has(m.channel));
  s.history=s.history.filter(h=>!clientes.has(h.client_id));
  s.offers=s.offers.filter(o=>!clientes.has(o.client_id)&&!horarios.has(o.origin_id));
  s.gaps=s.gaps.filter(g=>!horarios.has(g.cancelled_id));
  if(s.payments)s.payments=s.payments.filter(p=>!horarios.has(p.appointmentId));
  s.events=s.events.filter(e=>!/Cliente Falso \d+/.test(e.text));
  return {clientes:clientes.size,horarios:antes-s.appointments.length};
}

if(args.includes('--apagar')){
  const r=apagar();
  if(r.clientes||r.horarios)db.gravar(s,linha);
  console.log(`Apagados ${onde}: ${r.clientes} cliente(s) falsa(s) e ${r.horarios} horário(s).`);
  process.exit(0);
}
if(s.clients.some(c=>FALSO.test(c.name)))throw Error('A agenda já tem clientes falsas. Rode com --apagar antes de criar de novo.');

const mais=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const dias=[...Array(7)].map((_,i)=>mais(inicio,i)),abertos=dias.filter(d=>s.settings.hours[new Date(d+'T12:00:00Z').getUTCDay()]);
let semente=20261025;const sorte=()=>(semente=(semente*1103515245+12345)%2147483648)/2147483648;
const um=l=>l[Math.floor(sorte()*l.length)];
const equipe=s.staff.filter(p=>p.active!==false&&!p.removed&&p.services?.length);
assert.ok(equipe.length,'A agenda não tem profissionais ativas.');
const servico=k=>s.services.find(v=>v.id===k);
// O que mais sai na planilha, por área (repetido pelo peso); fica só o que cada uma faz.
const procura={'Mãos e pés':['Manicure + Pedicure','Manicure + Pedicure','Manicure + Pedicure','Manicure','Pedicure','Esmaltação permanente','Esmaltação permanente','Esmaltação permanente mão e pé','Plástica dos pés'],
  'Alongamento e gel':['Manutenção de alongamento','Manutenção de alongamento','Manutenção de alongamento','Aplicação de alongamento','Banho de gel','Blindagem'],
  'Cabelo':['Escova','Escova','Escova','Combo Wella','Corte','Coloração (aplicação)'],'Sobrancelha e depilação':['Sobrancelha','Sobrancelha','Sobrancelha','Sobrancelha com henna','Buço']};
const porNome=n=>s.services.find(v=>!v.addon&&v.name===n);

const falsas=[...Array(40)].map((_,i)=>({id:id('C'),name:`Cliente Falso ${i+1}`,phone:'',consent:false,preferred:'',visits:0,missed:0,proposals:0,accepted:0,sample:true}));
s.clients.push(...falsas);
function marcar(c,svc,p,date,start,extra={}){
  const v=servico(svc),preco=v.variants?.length?v.variants[1%v.variants.length]:null,end=start+(preco?.duration||v.duration);
  if(!free(s,c.id,p.id,date,start,end))return null;
  const a={id:id('A'),client_id:c.id,service_id:svc,staff_id:p.id,date,start,end,price:preco?.price??v.price,...(preco?{variant:preco.name}:{}),addons:[],discount:0,
    status:'booked',attendance:'unknown',reminded:true,result:null,chosenLate:false,source:'loja',created:now,sample:true,...extra};
  s.appointments.push(a);return a;
}

// Dois pedidos do site em Aceitações, marcados primeiro para caber.
const futuros=abertos.filter(d=>Date.parse(d+'T18:00:00-03:00')>now);
const quemFaz=n=>equipe.find(p=>p.services.includes(porNome(n)?.id));
for(const [i,date,nome] of [[0,futuros[0],'Esmaltação permanente'],[1,futuros[1]||futuros[0],'Sobrancelha']]){
  const p=quemFaz(nome);if(!date||!p)continue;
  for(const t of [900,945,855,810,990])if(marcar(falsas[i],porNome(nome).id,p,date,t,{status:'requested',source:'site',name:falsas[i].name,order:'FALSO-'+i}))break;
}

// O resto: cada profissional com boa parte do dia cheia; sábado quase lotado.
for(const date of abertos){
  const [abre,fecha]=s.settings.hours[new Date(date+'T12:00:00Z').getUTCDay()],sabado=date===abertos.at(-1);
  for(const p of equipe)for(let t=abre;t<fecha;t+=s.settings.block){
    if(sorte()<(sabado?0.1:0.35))continue;
    const areas=[...new Set(p.services.map(k=>servico(k)?.group).filter(g=>procura[g]))];if(!areas.length)continue;
    const opcoes=procura[um(areas)].map(porNome).filter(v=>v&&p.services.includes(v.id));if(!opcoes.length)continue;
    const v=um(opcoes);
    if(t+(v.variants?.[1]?.duration||v.duration)>fecha)continue;
    for(let k=0;k<4&&!marcar(um(falsas.slice(2)),v.id,p,date,t);k++);
  }
}

// O que já passou aparece como atendido, com algumas faltas.
let n=0;
for(const a of s.appointments.filter(a=>a.sample&&a.status==='booked'&&at(a)+(a.end-a.start)*60000<=now).sort((x,y)=>at(x)-at(y))){
  n++;Object.assign(a,n%12===0?{result:'missed',attendance:'no'}:{result:'attended',attendance:'yes'});
}
// Duas clientes falsas na lista de espera do sábado.
for(const c of falsas.slice(38))s.waitlist.push({id:id('W'),client_id:c.id,service_id:porNome('Manicure + Pedicure')?.id||equipe[0].services[0],date:abertos.at(-1),status:'waiting',priority:1,source:'site',created:now});

const meus=s.appointments.filter(a=>a.sample),vivos=s.appointments.filter(a=>['booked','requested'].includes(a.status));
for(const a of vivos)for(const b of vivos)if(a.id!==b.id&&a.date===b.date&&(a.staff_id===b.staff_id||a.client_id===b.client_id))assert.ok(a.end<=b.start||b.end<=a.start,'Há horários sobrepostos.');
db.gravar(s,linha);
const porDia=Object.fromEntries(dias.map(d=>[d,meus.filter(a=>a.date===d).length]));
console.log(`Agenda falsa criada ${onde}: ${meus.length} horário(s) com ${equipe.map(p=>p.name).join(', ')}.`);
console.log(JSON.stringify(porDia));
console.log('Para tirar tudo: node scripts/agenda-falsa.mjs'+(remoto?' --remote':'')+' --apagar');
