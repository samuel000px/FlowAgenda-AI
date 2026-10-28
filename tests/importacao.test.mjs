import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {alreadyImported,importPackage,readPackage} from '../lib/importacao.mjs';

const pacote=()=>({versao:1,origem:'planilha teste',gerado:'2026-10-28',
 clients:[{name:'Mariana Pinto',phone:'5583987654321',birthday:'03-01',visits:12,spent:900,lastVisit:'2026-10-20',lastService:'Manutenção',staff:'Lili'},
  {name:'Sheila',phone:'',birthday:'',visits:3,spent:105,lastVisit:'2026-09-01',lastService:'Pedicure',staff:'Ester'},
  {name:'Ana Já Cadastrada',phone:'5583911112222',birthday:'12-25',visits:5,spent:200,lastVisit:'2026-08-01'}],
 staff:[{name:'Lili',areas:['Mãos e pés','Alongamento e gel']},{name:'Ester',areas:['Mãos e pés','Cabelo','Sobrancelha e depilação']}],
 history:[{month:'2026-08',gross:23775,net:13788,count:291},{month:'2026-09',gross:27850,net:null,count:340}],
 fixedCosts:[{name:'Aluguel',amount:1300},{name:'Internet',amount:50}],
 stock:[{name:'Alicate de unha',qty:10,place:'Material'},{name:'Esmalte em gel',qty:30,place:'Expositor 1'}]});

test('importa clientes, equipe, faturamento, custos e estoque',()=>{
 const s=seedAdmin(),r=importPackage(s,pacote());
 assert.deepEqual([r.clients,r.staff,r.history,r.fixedCosts,r.stock],[3,2,2,2,2]);
 const m=s.clients.find(c=>c.name==='Mariana Pinto');
 assert.deepEqual([m.phone,m.birthday,m.visits,m.lastVisit,m.consent],['5583987654321','03-01',12,'2026-10-20',false]);
 assert.equal(m.preferred,s.staff.find(p=>p.name==='Lili').id);
 const ester=s.staff.find(p=>p.name==='Ester');
 assert.ok(ester.services.includes('S11')&&ester.services.includes('S31')&&!ester.services.includes('S6'),'Ester: escova e sobrancelha, sem alongamento');
 assert.equal(s.financeHistory.length,2);assert.equal(s.stock[0].qty,10);
});

test('importar de novo não duplica, e quem já existe só é completado',()=>{
 const s=seedAdmin();s.clients.push({id:'C1',name:'Ana já cadastrada',phone:'',consent:true,visits:1,missed:0,proposals:0,accepted:0});
 importPackage(s,pacote());
 const ana=s.clients.filter(c=>c.name.toLowerCase().startsWith('ana'));
 assert.equal(ana.length,1,'mesmo nome (sem ligar para acento e maiúscula) é a mesma cliente');
 assert.deepEqual([ana[0].phone,ana[0].birthday,ana[0].visits,ana[0].consent],['5583911112222','12-25',5,true]);
 assert.ok(alreadyImported(s,pacote()));
 const r=importPackage(s,pacote());
 assert.deepEqual([r.clients,r.staff,r.fixedCosts,r.stock],[0,0,0,0]);
 assert.equal(s.clients.length,3);
});

test('celular que já é de outra cliente não é repetido; arquivo estranho é recusado',()=>{
 const s=seedAdmin();s.clients.push({id:'C9',name:'Outra Pessoa',phone:'5583987654321',consent:false,visits:0,missed:0,proposals:0,accepted:0});
 importPackage(s,pacote());
 assert.equal(s.clients.filter(c=>c.phone==='5583987654321').length,1);
 assert.throws(()=>readPackage({versao:2}),/não reconhecido/);
 assert.throws(()=>readPackage({versao:1,clients:'x'}),/inválida/);
});
