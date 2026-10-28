import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {closeAppointment,financeAdminAction,monthResult,monthlySeries,parseHistory,partnerWeek} from '../lib/finance-core.mjs';
import {applyStaffAction,staffView} from '../lib/staff-core.mjs';
import {backtest,fit,forecast,predict} from '../lib/previsao.mjs';

const now=Date.parse('2026-11-07T19:00:00-03:00');
function salao(){
 const s=seedAdmin();
 s.staff=[{id:'P1',name:'Lili',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1','S7']},{id:'P2',name:'Ester',active:true,start:480,end:1080,break_start:0,break_end:0,services:['S1','S7'],commission:50}];
 s.clients=[{id:'C1',name:'Ana',phone:'5583999990000',consent:true,visits:0,missed:0,proposals:0,accepted:0},{id:'C2',name:'Bia',phone:'5583988887777',consent:true,visits:0,missed:0,proposals:0,accepted:0}];
 const a=(id,client,staff,date,start,price,service='S1')=>({id,client_id:client,service_id:service,staff_id:staff,date,start,end:start+45,price,status:'booked',attendance:'unknown',reminded:false,result:null});
 s.appointments=[a('A1','C1','P1','2026-11-03',540,30),a('A2','C2','P1','2026-11-04',600,100,'S7'),a('A3','C1','P2','2026-11-06',540,30),a('A4','C2','P2','2026-11-20',540,30)];
 return s;
}

test('fechar atendimento: valor que ficou, forma de pagamento e quem atendeu',()=>{
 const s=salao();
 closeAppointment(s,{id:'A2',amount:120,method:'Pix',staffId:'P2',note:'fez babyboomer'},{name:'Gerência'},now);
 const a=s.appointments.find(x=>x.id==='A2'),pay=s.payments[0];
 assert.equal(a.result,'attended');assert.equal(pay.amount,120);assert.equal(pay.staffId,'P2');assert.equal(pay.note,'fez babyboomer');
 assert.equal(s.clients[1].visits,1);
 assert.throws(()=>closeAppointment(s,{id:'A2',amount:120,method:'Pix'},{name:'X'},now),/já foi fechado/);
 assert.throws(()=>closeAppointment(s,{id:'A4',amount:30,method:'Pix'},{name:'X'},now),/não começou/);
 assert.throws(()=>closeAppointment(s,{id:'A1',amount:30,method:'Cheque'},{name:'X'},now),/como a cliente pagou/);
});

test('semana das parceiras: 40% padrão, 50% de quem tem outro repasse, descontos e parte do salão',()=>{
 const s=salao();
 closeAppointment(s,{id:'A1',amount:30,method:'Pix'},{name:'G'},now);
 closeAppointment(s,{id:'A2',amount:100,method:'Cartão'},{name:'G'},now);
 closeAppointment(s,{id:'A3',amount:30,method:'Dinheiro'},{name:'G'},now);
 financeAdminAction(s,'deduction_add',{staffId:'P1',description:'Lanche',amount:12.5,date:'2026-11-07'},now);
 const [lili,ester]=partnerWeek(s,'2026-11-02','2026-11-08');
 assert.deepEqual([lili.count,lili.total,lili.share,lili.deducted,lili.toPay,lili.salon],[2,130,52,12.5,39.5,78]);
 assert.deepEqual([ester.count,ester.total,ester.commission,ester.share,ester.salon],[1,30,50,15,15]);
});

test('resultado do mês: bruto, repasses, despesas, custos fixos e líquido',()=>{
 const s=salao();
 closeAppointment(s,{id:'A1',amount:30,method:'Pix'},{name:'G'},now);closeAppointment(s,{id:'A2',amount:100,method:'Pix'},{name:'G'},now);
 financeAdminAction(s,'fixed_save',{name:'Aluguel',amount:1300},now);financeAdminAction(s,'fixed_save',{name:'Internet',amount:50},now);
 s.expenses=[{id:'E1',description:'Material',amount:40,date:'2026-11-05'}];
 const r=monthResult(s,'2026-11');
 assert.deepEqual([r.gross,r.shares,r.expenses,r.fixed,r.net],[130,52,40,1350,-1312]);
 assert.throws(()=>financeAdminAction(s,'commission_save',{staffId:'P1',commission:120},now),/0% a 100%/);
});

test('histórico da planilha: formatos aceitos, mês repetido substitui; no mesmo mês vale o mais completo',()=>{
 const rows=parseHistory('mes;faturamento_bruto;faturamento_liquido;atendimentos\n2025-08;16955,00;6011,99;184\n09/2025;14.390,00;;198\n');
 assert.deepEqual(rows[1],{month:'2025-09',gross:14390,net:null,count:198});
 assert.throws(()=>parseHistory('agosto;10'),/não entendida/);
 const s=salao();
 financeAdminAction(s,'history_import',{text:'2025-08;16955;6011,99;184\n2026-11;999;;1'},now);
 financeAdminAction(s,'history_import',{text:'2025-08;17000;;'},now);
 assert.equal(s.financeHistory.length,2);assert.equal(s.financeHistory[0].gross,17000);
 closeAppointment(s,{id:'A1',amount:30,method:'Pix'},{name:'G'},now);
 assert.equal(monthResult(s,'2026-11').source,'planilha','R$ 999 da planilha é mais completo que os R$ 30 do sistema');
 closeAppointment(s,{id:'A2',amount:1000,method:'Pix'},{name:'G'},now);
 assert.equal(monthResult(s,'2026-11').source,'sistema');
 assert.deepEqual(monthlySeries(s,'2026-12-01').map(m=>[m.month,m.gross]),[['2025-08',17000],['2026-11',1030]]);
});

test('funcionária fecha o atendimento de uma colega, sem ver valores na agenda',()=>{
 const s=salao();
 applyStaffAction(s,'P1',{action:'closing_record',requestId:crypto.randomUUID(),id:'A3',amount:35,method:'Pix',staffId:'P2'},now);
 assert.equal(s.payments[0].staffId,'P2');assert.equal(s.payments[0].by,'Lili');
 const v=staffView(s,'P1','2026-11-06');
 assert.equal(v.appointments[0].closed,true);assert.equal(v.appointments[0].price,undefined);
});

// Faturamento mensal com tendência de ~3% ao mês e dezembro forte, como na Santa Cor.
const serie=Array.from({length:24},(_,i)=>{const d=new Date(Date.UTC(2024,10+i,1)),m=d.getUTCMonth()+1;return {month:d.toISOString().slice(0,7),gross:Math.round(8000*1.03**i*(m===12?1.2:m===1?0.85:1))};});

test('previsão: acha a tendência, o pico de dezembro e dá uma faixa',()=>{
 const m=fit(serie);
 assert.ok(Math.abs(Math.exp(m.b)-1.03)<0.01,'crescimento perto de 3% ao mês');
 const nov=predict(m,'2026-11'),dez=predict(m,'2026-12');
 assert.ok(dez.value>nov.value*1.05,'dezembro acima de novembro');
 assert.ok(nov.low<nov.value&&nov.value<nov.high);
 const f=forecast(serie);assert.equal(f.months.length,3);assert.equal(f.months[0].month,'2026-11');
 assert.ok(backtest(serie).mape<0.1);
 assert.equal(forecast(serie.slice(0,4)),null,'com menos de 6 meses não prevê');
});
