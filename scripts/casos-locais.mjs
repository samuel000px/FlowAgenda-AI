// Reproducible fictional scenarios. This script cannot access a remote database.
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {seedAdmin,actAdmin,today,candidates,tickAdmin,at} from '../lib/flowagenda.mjs';
import {closeAppointment,financeAction,financeView} from '../lib/finance-core.mjs';
import {openSupport} from '../lib/support-core.mjs';

const args=process.argv.slice(2);
if(args.some(a=>!['--local','--check'].includes(a)))throw Error('Use --local ou --check. Não existe modo remoto.');
const root=fileURLToPath(new URL('../',import.meta.url));
const input=JSON.parse(readFileSync(join(root,'examples/casos-ficticios.json'),'utf8'));
const now=Date.now(),s=seedAdmin(),day=today(now);
const plus=(d,n)=>new Date(Date.parse(d+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const openDay=d=>{while(!s.settings.hours[new Date(d+'T12:00:00Z').getUTCDay()])d=plus(d,1);return d;};
const near=openDay(plus(day,1)),later=openDay(plus(near,6));
// Keep prices and durations from the real application catalogue, but people are all invented.
s.staff=input.staff.map(p=>({...p,services:s.services.filter(v=>!v.addon&&p.areas.includes(v.group)).map(v=>v.id),start:540,end:1080,break_start:720,break_end:780,active:true,sample:true}));
s.clients=input.clients.map((name,i)=>({id:`EX-C${i+1}`,name,phone:'',consent:true,preferred:'',visits:24,missed:0,proposals:8,accepted:6,sample:true}));
s.settings.autoNext=false;
const client=i=>s.clients[i-1];
function book(i,service,staff,date,start){
  // Historical records are replayed as if created before their scheduled day.
  actAdmin(s,'book',{client_id:client(i).id,service_id:service,staff_id:staff,date,start},Math.min(now,Date.parse(date+'T00:00:00-03:00')));
  return s.appointments.at(-1);
}

// Today's cash register. If it is too early, use the preceding day for completed services.
const financeDay=now>=Date.parse(day+'T12:00:00-03:00')?day:plus(day,-1);
const payments=[30,35,35,60],methods=['Pix','Dinheiro','Cartão','Pix'];
const done=[book(1,'S1','EX-P1',financeDay,540),book(2,'S2','EX-P2',financeDay,540),book(3,'S11','EX-P3',financeDay,540),book(4,'S16','EX-P1',financeDay,585)];
done.forEach((a,i)=>closeAppointment(s,{id:a.id,amount:payments[i],method:methods[i]},{name:'Gerência'},now));
const unpaid=book(5,'S2','EX-P2',financeDay,585);
actAdmin(s,'close',{id:unpaid.id,result:'attended'},now);
const missed=book(6,'S11','EX-P3',financeDay,585);
actAdmin(s,'close',{id:missed.id,result:'missed'},now);
financeAction(s,'expense_add',{description:'Material de atendimento — exemplo',amount:25,date:financeDay,requestId:randomUUID()},now);

// A busy later day and waiting list make anticipation genuinely beneficial to the scoring engine.
const slots=[540,585,630,675,780,825,870,915,960];
let i=7;
for(const start of slots)for(const [staff,service] of [['EX-P1','S1'],['EX-P2','S2'],['EX-P3','S11']])book(i++,service,staff,later,start);
for(let n=40;n<=44;n++)actAdmin(s,'waitlist_add',{client_id:client(n).id,service_id:'S1',date:later},now);
const cancelled=[book(34,'S1','EX-P1',near,540),book(35,'S2','EX-P2',near,585),book(36,'S11','EX-P3',near,630)];
cancelled.forEach(a=>actAdmin(s,'cancel',{id:a.id},now));
const gaps=s.gaps.slice();
actAdmin(s,'seek',{id:gaps[0].id},now);
const accepted=s.offers.find(o=>o.gap_id===gaps[0].id);
assert.ok(accepted,'O cenário precisa de uma proposta com benefício positivo.');
actAdmin(s,'response',{id:accepted.id,text:'Sim, consigo ir nesse horário.',result:'accepted'},now);
actAdmin(s,'seek',{id:gaps[1].id},now);
const refused=s.offers.find(o=>o.gap_id===gaps[1].id);
assert.ok(refused);
s.settings.autoNext=true;
actAdmin(s,'response',{id:refused.id,text:'Não posso, prefiro manter meu horário.',result:'refused'},now);
assert.ok(s.offers.some(o=>o.gap_id===gaps[1].id&&o.status==='pending'),'A recusa deve chamar outra cliente.');
assert.ok(candidates(s,gaps[2].id,now).some(c=>!c.reason),'A terceira vaga deve permitir preparar proposta.');

// Requests, a regular confirmed visit and human support.
for(const [n,svc,p,time] of [[37,'S1','EX-P1',675],[38,'S11','EX-P3',780]]){
  const a=book(n,svc,p,near,time);a.status='requested';a.order='EX-ORDER-'+n;a.name=client(n).name;
}
book(39,'S2','EX-P2',near,825);
openSupport(s,{channel:'demo:cliente-37',source:'demo',name:client(37).name,phone:'',text:'Gostaria de saber se posso levar meu próprio esmalte.'},now);
openSupport(s,{channel:'demo:cliente-38',source:'demo',name:client(38).name,phone:'',text:'Preciso falar com a atendente antes de confirmar o serviço.'},now);
s.stock=[{id:'EX-K1',name:'Esmalte vermelho',place:'Bancada',qty:8,min:3},{id:'EX-K2',name:'Acetona',place:'Armário',qty:1,min:3},{id:'EX-K3',name:'Lixa descartável',place:'Armário',qty:0,min:20},{id:'EX-K4',name:'Algodão',place:'Armário',qty:12,min:5}].map(v=>({...v,updated:now}));
tickAdmin(s,now);
s.sampleData={version:2,loadedAt:now,description:input.description,financeDay,near,later};

// Validate the examples before writing anything.
const totals=financeView(s,financeDay);
assert.equal(totals.received,160);assert.equal(totals.spent,25);assert.equal(totals.balance,135);
assert.equal(totals.pending.length,1);assert.equal(totals.missed,1);
assert.ok(s.clients.every(c=>!c.phone));
for(const a of s.appointments.filter(a=>['booked','requested'].includes(a.status)))for(const b of s.appointments){
  if(a.id===b.id||!['booked','requested'].includes(b.status)||a.date!==b.date)continue;
  assert.ok(a.staff_id!==b.staff_id||a.end<=b.start||b.end<=a.start,'Há horários sobrepostos.');
}
assert.ok(s.offers.filter(o=>['pending','approval'].includes(o.status)).every(o=>at(o)>now));
const report={clients:s.clients.length,staff:s.staff.length,appointments:s.appointments.length,financeDay,near,later,received:totals.received,expenses:totals.spent,balance:totals.balance,cases:input.cases};

if(args.includes('--local')){
  const {DatabaseSync}=await import('node:sqlite');
  const folder=join(root,'.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const files=readdirSync(folder).filter(f=>f.endsWith('.sqlite')&&f!=='metadata.sqlite');
  assert.equal(files.length,1,'Banco local ambíguo. Nenhum dado foi alterado.');
  const db=new DatabaseSync(join(folder,files[0]));
  // A fresh isolated workspace on every run: never replaces existing clients or integrations.
  const room='exemplos-'+randomBytes(8).toString('hex');
  db.prepare('INSERT INTO rooms(id,manager,client,state,version,created,updated) VALUES(?,?,?,?,0,?,?)').run(room,randomBytes(24).toString('hex'),randomBytes(24).toString('hex'),JSON.stringify(s),now,now);
  assert.equal(db.prepare('SELECT count(*) n FROM calendar_connections WHERE room=?').get(room).n,0);
  assert.equal(db.prepare('SELECT count(*) n FROM whatsapp_connections WHERE room=?').get(room).n,0);
  db.close();
  report.room=room;report.url='http://localhost:5173/painel#room='+room;
  mkdirSync(join(root,'.sites-runtime'),{recursive:true});
  writeFileSync(join(root,'.sites-runtime/casos-locais.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
