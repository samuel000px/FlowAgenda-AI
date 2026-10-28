// Fictional records for local exploration. This does not overwrite a database.
import {mkdir,writeFile} from 'node:fs/promises';
import {seedAdmin,actAdmin,today,candidates} from '../lib/flowagenda.mjs';
const now=Date.now(),s=seedAdmin();
const names=['Ana Lima','Beatriz Alves','Camila Rocha','Daniela Costa','Elisa Martins','Fernanda Melo','Gabriela Dias','Helena Reis','Ingrid Santos','Julia Moraes','Karina Silva','Larissa Gomes','Marina Souza','Natalia Barros','Olivia Ramos','Patricia Araujo','Rafaela Nunes','Sofia Martins','Isabela Costa','Joana Ribeiro','Luana Freitas','Marta Oliveira','Nicole Dias','Paula Castro','Renata Mendes','Sara Almeida','Talita Braga','Valeria Leal','Yasmin Lopes','Alice Teixeira','Bruna Pinheiro','Clara Dantas','Debora Pires','Ester Monteiro','Flavia Campos','Giovana Moura','Heloisa Cruz','Iara Lopes','Jessica Duarte','Livia Cardoso','Mirela Siqueira','Nara Azevedo','Priscila Vieira','Raquel Brito','Samara Cunha','Tainá Farias','Vanessa Tavares','Vitoria Sales','Wanda Maia','Zelia Coelho'];
s.services=[{id:'S1',name:'Manicure',duration:45,price:45},{id:'S2',name:'Pedicure',duration:45,price:50},{id:'S3',name:'Pé e mão',duration:90,price:85},{id:'S4',name:'Esmaltação em gel',duration:60,price:95}].map(v=>({...v,sample:true}));
s.staff=['Lia','Nina','Rafa'].map((name,i)=>({id:'P'+(i+1),name,services:s.services.map(v=>v.id),start:540,end:1080,break_start:720,break_end:780,active:true,sample:true}));
s.clients=names.map((name,i)=>({id:'C'+(i+1),name,phone:'',consent:i<47,preferred:i%4===0?'':'P'+(i%3+1),visits:20+i%12,missed:i%4===0?1:0,proposals:8,accepted:i===1?8:4+i%3,sample:true}));
s.clients[1].preferred='P1';
const addDays=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
let date=today(now),start=Math.max(540,Math.ceil(((now-3*3600000)%86400000/60000+120)/15)*15);
if(start<780&&start+45>720)start=780;
if(start+45>1080){date=addDays(date,1);start=540;}
function book(clientId,serviceId,staffId,date,start){actAdmin(s,'book',{client_id:clientId,service_id:serviceId,staff_id:staffId,date,start},now);s.appointments.at(-1).sample=true;return s.appointments.at(-1);}
const cancelled=book('C1','S1','P1',date,start);
for(let i=0;i<24;i++){
 const day=addDays(date,2+Math.floor(i/15)),time=[540,630,780,870,960][Math.floor(i%15/3)],staff='P'+(i%3+1);
 book('C'+(i+2),'S'+(i%4+1),staff,day,time);
}
// A few appointments remain on the first date, on different professionals.
book('C26','S1','P2',date,start);book('C27','S2','P3',date,start);
if(start+135<=1080&&!(start+90<780&&start+135>720))book('C28','S1','P1',date,start+90);
for(let i=28;i<50;i++){actAdmin(s,'waitlist_add',{client_id:'C'+(i+1),service_id:'S'+(i%4+1),date:addDays(date,2+(i%2))},now);s.waitlist.at(-1).sample=true;}
actAdmin(s,'cancel',{id:cancelled.id},now);
s.sampleData={loadedAt:now,version:1,description:'Clientes, histórico e agendamentos fictícios; nenhum telefone real.'};
await mkdir('.sites-runtime',{recursive:true});await writeFile('.sites-runtime/sample-agenda.json',JSON.stringify(s,null,2));
const offer=s.offers.find(o=>o.status==='pending');
console.log(JSON.stringify({clients:s.clients.length,appointments:s.appointments.length,waitlist:s.waitlist.length,date,start,pendingClient:offer?s.clients.find(c=>c.id===offer.client_id).name:null,eligible:candidates(s,s.gaps[0].id,now).filter(c=>!c.reason).length}));
