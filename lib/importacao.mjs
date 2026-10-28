// Migração da planilha antiga para o sistema, de uma vez só: clientes (telefone, aniversário e
// histórico de visitas), equipe, histórico de faturamento, custos fixos e estoque. O pacote é um
// JSON gerado a partir da planilha e fica fora do Git (tem dados pessoais). Importar de novo não
// duplica: cliente é reconhecida pelo celular ou pelo nome, e o que já existe no sistema é mantido.
import {id,nameKey,phoneKey} from './flowagenda.mjs';
import {normalizeBirthday} from './client-birthday.mjs';
const fail=t=>{throw Error(t)};
const LIMITES={clients:5000,staff:50,history:240,fixedCosts:50,stock:2000};
const texto=(v,max)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const numero=(v,min,max)=>{const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;};
const dia=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?v:'';
const niver=v=>{try{return normalizeBirthday(v||'');}catch{return '';}};

export function readPackage(raw){
 const p=typeof raw==='string'?JSON.parse(raw):raw;
 if(!p||typeof p!=='object'||p.versao!==1)fail('Arquivo de dados não reconhecido.');
 for(const [k,max] of Object.entries(LIMITES))if(p[k]!==undefined&&(!Array.isArray(p[k])||p[k].length>max))fail(`Parte "${k}" do arquivo é inválida.`);
 return p;
}

export function importPackage(s,raw,now=Date.now()){
 const p=readPackage(raw),r={clients:0,updated:0,staff:0,history:0,fixedCosts:0,stock:0};
 const marca=`${p.origem||'planilha'}|${p.gerado||''}`;
 // Equipe: entra quem ainda não existe, com os serviços das áreas que ela atende.
 for(const e of p.staff||[]){
  const name=texto(e.name,80);if(!name||s.staff.some(x=>nameKey(x.name)===nameKey(name)))continue;
  const services=s.services.filter(v=>!v.addon&&(e.areas||[]).includes(v.group)).map(v=>v.id);if(!services.length)continue;
  s.staff.push({id:id('P'),name,services,start:480,end:1080,break_start:0,break_end:0,active:true});r.staff++;
 }
 const porNome=new Map(s.clients.map(c=>[nameKey(c.name),c])),porTel=new Map(s.clients.filter(c=>c.phone).map(c=>[phoneKey(c.phone),c]));
 const profissional=nome=>s.staff.find(x=>nameKey(x.name)===nameKey(nome))?.id||'';
 for(const x of p.clients||[]){
  const name=texto(x.name,100);if(name.length<2)continue;
  const phone=/^55\d{10,11}$/.test(phoneKey(x.phone))?phoneKey(x.phone):'';
  const visits=numero(x.visits,0,10000)||0,extra={birthday:niver(x.birthday),lastVisit:dia(x.lastVisit),spent:numero(x.spent,0,1e7)||0,lastService:texto(x.lastService,80)};
  let c=(phone&&porTel.get(phone))||porNome.get(nameKey(name));
  if(c){
   // Já existe: só completa o que está vazio e guarda o histórico da planilha, sem trocar nada.
   if(phone&&!c.phone&&!porTel.has(phone)){c.phone=phone;porTel.set(phone,c);}
   if(extra.birthday&&!c.birthday)c.birthday=extra.birthday;
   c.visits=Math.max(c.visits||0,visits);if(extra.lastVisit>(c.lastVisit||''))c.lastVisit=extra.lastVisit;
   c.spent=Math.max(c.spent||0,extra.spent);c.lastService||=extra.lastService;r.updated++;continue;
  }
  c={id:id('C'),name,phone:phone&&!porTel.has(phone)?phone:'',consent:false,preferred:profissional(x.staff),visits,missed:0,proposals:0,accepted:0,...extra,origin:'planilha'};
  s.clients.push(c);porNome.set(nameKey(name),c);if(c.phone)porTel.set(c.phone,c);r.clients++;
 }
 const meses=Object.fromEntries((s.financeHistory||[]).map(h=>[h.month,h]));
 for(const h of p.history||[]){
  if(!/^\d{4}-\d{2}$/.test(h.month||'')||numero(h.gross,0,1e8)===null)continue;
  meses[h.month]={month:h.month,gross:Number(h.gross),net:numero(h.net,-1e8,1e8),count:numero(h.count,0,1e6)};r.history++;
 }
 s.financeHistory=Object.values(meses).sort((a,b)=>a.month.localeCompare(b.month));
 s.fixedCosts??=[];
 for(const f of p.fixedCosts||[]){const name=texto(f.name,80),amount=numero(f.amount,0,1e6);if(name&&amount!==null&&!s.fixedCosts.some(x=>nameKey(x.name)===nameKey(name))){s.fixedCosts.push({id:id('F'),name,amount,active:true});r.fixedCosts++;}}
 s.stock??=[];
 for(const it of p.stock||[]){
  const name=texto(it.name,100),place=texto(it.place,80);if(!name||s.stock.some(x=>nameKey(x.name)===nameKey(name)&&nameKey(x.place)===nameKey(place)))continue;
  s.stock.push({id:id('K'),name,place,qty:numero(it.qty,0,100000)??0,min:0,updated:now});r.stock++;
 }
 s.imports=[...(s.imports||[]).filter(i=>i.mark!==marca),{mark:marca,at:now,...r}].slice(-20);
 s.events.unshift({id:id('E'),text:`Dados da planilha importados: ${r.clients} cliente(s) novas, ${r.updated} completadas, ${r.staff} profissional(is), ${r.history} mês(es) de faturamento, ${r.stock} item(ns) de estoque.`,created:now});
 return r;
}
export const alreadyImported=(s,raw)=>{const p=readPackage(raw);return (s.imports||[]).some(i=>i.mark===`${p.origem||'planilha'}|${p.gerado||''}`);};
