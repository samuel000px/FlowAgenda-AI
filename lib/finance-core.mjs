const day=now=>new Date(now-3*3600000).toISOString().slice(0,10);
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const sum=list=>list.reduce((n,v)=>n+Math.round(Number(v.amount||0)*100),0)/100;
export function financeView(s,date=day(Date.now())){
 const appointments=s.appointments.filter(a=>a.date===date),payments=(s.payments||[]).filter(p=>p.date===date),expenses=(s.expenses||[]).filter(e=>e.date===date);
 const pending=appointments.filter(a=>a.status==='booked'&&a.result==='attended'&&!(s.payments||[]).some(p=>p.appointmentId===a.id));
 return {payments,expenses,pending,received:sum(payments),spent:sum(expenses),balance:Math.round((sum(payments)-sum(expenses))*100)/100,expected:sum(appointments.filter(a=>a.status==='booked'&&a.result!=='missed').map(a=>({amount:a.price}))),attended:appointments.filter(a=>a.status==='booked'&&a.result==='attended').length,missed:appointments.filter(a=>a.result==='missed').length};
}
export function financeAction(s,action,p,now=Date.now()){
 if(action==='payment_record'){
  const a=s.appointments.find(a=>a.id===p.id);if(!a||a.status!=='booked'||a.result!=='attended')throw Error('Marque o comparecimento em Fechamento antes de registrar o pagamento.');
  if(!['Pix','Dinheiro','Cartão'].includes(p.method))throw Error('Escolha como a cliente pagou.');
  if((s.payments||[]).some(x=>x.appointmentId===a.id))return;
  if(!Number.isFinite(a.price)||a.price<0)throw Error('Confira o valor do serviço.');
  s.payments??=[];s.payments.push({id:crypto.randomUUID(),appointmentId:a.id,clientName:s.clients.find(c=>c.id===a.client_id)?.name||'Cliente',serviceName:s.services.find(v=>v.id===a.service_id)?.name||'Serviço',amount:Math.round(a.price*100)/100,method:p.method,date:day(now),created:now});
 }else if(action==='expense_add'){
  const description=String(p.description||'').trim(),amount=Number(p.amount),date=String(p.date||'');
  if(!description||description.length>120||!Number.isFinite(amount)||amount<=0||amount>1000000||!validDate(date)||date>day(now))throw Error('Confira a descrição, a data e o valor da despesa.');
  if(!/^[a-f0-9-]{36}$/i.test(p.requestId||''))throw Error('Atualize a página antes de salvar.');
  if((s.expenses||[]).some(e=>e.requestId===p.requestId))return;
  s.expenses??=[];s.expenses.push({id:crypto.randomUUID(),requestId:p.requestId,description,amount:Math.round(amount*100)/100,date,created:now});
 }else throw Error('Ação financeira inválida.');
}

// ---- Fechamento, repasse das parceiras, custos fixos e resultado do mês ----
// Fazem o que a planilha do salão fazia à mão: somar cada parceira na semana, separar a parte dela
// (padrão de 40%) e a do salão, descontar lanche e adiantamento, e fechar o mês com os custos.
export const COMISSAO_PADRAO=40;
const METODOS=['Pix','Dinheiro','Cartão'];
const cents=v=>Math.round(Number(v||0)*100)/100;
const fail=t=>{throw Error(t)};
const at=a=>Date.parse(`${a.date}T${String(Math.floor(a.start/60)).padStart(2,'0')}:${String(a.start%60).padStart(2,'0')}:00-03:00`);
export const commissionOf=p=>Number.isFinite(p?.commission)?p.commission:COMISSAO_PADRAO;
const paymentOf=(s,a)=>(s.payments||[]).find(p=>p.appointmentId===a.id);
const monthOf=d=>String(d).slice(0,7);

/**
 * Fecha um atendimento: marca que a cliente veio e registra o pagamento com o valor que ficou de
 * verdade, a forma de pagamento e quem atendeu (pode ser outra profissional). Serve para a gerência
 * e para a equipe; a funcionária pode fechar o atendimento de uma colega.
 */
export function closeAppointment(s,p,actor,now=Date.now()){
 const a=s.appointments.find(a=>a.id===p.id);
 if(!a||a.status!=='booked'||a.result==='missed')fail('Este atendimento não pode ser fechado.');
 if(at(a)>now)fail('O atendimento ainda não começou.');
 if(paymentOf(s,a))fail('Este atendimento já foi fechado.');
 if(!METODOS.includes(p.method))fail('Escolha como a cliente pagou.');
 const amount=Number(p.amount);if(!Number.isFinite(amount)||amount<0||amount>10000)fail('Confira o valor que a cliente pagou.');
 const staffId=String(p.staffId||a.staff_id);if(!s.staff.some(x=>x.id===staffId))fail('Escolha quem atendeu.');
 const note=String(p.note||'').trim().slice(0,200);
 if(!a.result){a.result='attended';a.attendance='yes';const c=s.clients.find(c=>c.id===a.client_id);
  if(c&&!s.history.some(h=>h.reference===a.id&&h.type==='attended')){s.history.push({id:crypto.randomUUID(),client_id:c.id,type:'attended',reference:a.id,created:now});c.visits=(c.visits||0)+1;}}
 s.payments??=[];
 s.payments.push({id:crypto.randomUUID(),appointmentId:a.id,clientName:s.clients.find(c=>c.id===a.client_id)?.name||'Cliente',serviceName:s.services.find(v=>v.id===a.service_id)?.name||'Serviço',
  amount:cents(amount),method:p.method,staffId,note,by:actor.name,date:a.date,created:now});
 s.events.unshift({id:crypto.randomUUID(),text:`${actor.name} fechou o atendimento de ${s.clients.find(c=>c.id===a.client_id)?.name||'cliente'}: R$ ${cents(amount).toFixed(2).replace('.',',')} no ${p.method}.`,created:now});
 return a;
}

/** Atendimentos realizados no período, com o valor pago (ou o da agenda) e quem atendeu. */
function realizados(s,from,to){
 return s.appointments.filter(a=>a.status==='booked'&&a.result==='attended'&&a.date>=from&&a.date<=to).map(a=>{
  const pay=paymentOf(s,a);return {a,amount:cents(pay?pay.amount:a.price),staffId:pay?.staffId||a.staff_id,paid:!!pay};
 });
}

/** A semana de cada parceira, igual ao quadro da planilha: atendimentos, total, parte dela, descontos, a pagar e parte do salão. */
export function partnerWeek(s,from,to){
 const linhas=realizados(s,from,to),descontos=(s.deductions||[]).filter(d=>d.date>=from&&d.date<=to);
 const ids=[...new Set([...s.staff.filter(p=>p.active!==false).map(p=>p.id),...linhas.map(l=>l.staffId)])];
 return ids.map(id=>{
  const p=s.staff.find(x=>x.id===id)||{id,name:'—'},meus=linhas.filter(l=>l.staffId===id),total=cents(meus.reduce((n,l)=>n+l.amount,0));
  const pct=commissionOf(p),parte=cents(total*pct/100),meusDescontos=descontos.filter(d=>d.staffId===id),desconto=cents(meusDescontos.reduce((n,d)=>n+d.amount,0));
  return {staffId:id,name:p.name,count:meus.length,total,commission:pct,share:parte,deductions:meusDescontos,deducted:desconto,toPay:cents(parte-desconto),salon:cents(total-parte),unpaid:meus.filter(l=>!l.paid).length};
 }).filter(r=>r.count||r.deducted);
}

/** Totais que vieram da planilha antiga, por mês ("2025-08"). */
const historico=s=>Object.fromEntries((s.financeHistory||[]).map(h=>[h.month,h]));

/** Resultado do mês: o que entrou, os repasses, as despesas, os custos fixos e o que sobrou. */
export function monthResult(s,month){
 const from=month+'-01',to=month+'-31',linhas=realizados(s,from,to);
 const bruto=cents(linhas.reduce((n,l)=>n+l.amount,0));
 const repasse=cents(partnerWeek(s,from,to).reduce((n,r)=>n+r.share,0));
 const despesas=cents((s.expenses||[]).filter(e=>monthOf(e.date)===month).reduce((n,e)=>n+e.amount,0));
 const fixos=cents((s.fixedCosts||[]).filter(f=>f.active!==false).reduce((n,f)=>n+f.amount,0));
 const h=historico(s)[month];
 // Na transição da planilha para o sistema, o mesmo mês pode ter os dois: vale o mais completo (o maior).
 if(h&&h.gross>=bruto)return {month,source:'planilha',gross:h.gross,count:h.count||0,net:h.net??null,shares:null,expenses:null,fixed:null};
 return {month,source:'sistema',gross:bruto,count:linhas.length,shares:repasse,expenses:despesas,fixed:fixos,net:cents(bruto-repasse-despesas-fixos)};
}

/** Série mensal para o gráfico e a previsão: planilha antiga + o que o sistema já registrou. */
export function monthlySeries(s,until=day(Date.now())){
 const meses=new Set([...(s.financeHistory||[]).map(h=>h.month),...s.appointments.filter(a=>a.result==='attended').map(a=>monthOf(a.date))]);
 return [...meses].filter(m=>m<monthOf(until)).sort().map(m=>monthResult(s,m)).filter(r=>r.gross>0);
}

/** Linhas "mês;faturamento bruto;faturamento líquido;atendimentos" (o líquido e a quantidade podem faltar). */
export function parseHistory(text){
 const rows=[];
 for(const [i,linha] of String(text||'').split(/\r?\n/).entries()){
  const t=linha.trim();if(!t||/^m[eê]s/i.test(t))continue;
  const [mes,bruto,liquido,qtd]=t.split(/[;\t]/).map(x=>x.trim());
  const num=v=>v===undefined||v===''?null:Number(v.replace(/[R$\s.]/g,'').replace(',','.'));
  const month=/^\d{4}-\d{2}$/.test(mes)?mes:/^\d{2}\/\d{4}$/.test(mes)?mes.slice(3)+'-'+mes.slice(0,2):null;
  const gross=num(bruto),net=num(liquido),count=num(qtd);
  if(!month||!Number.isFinite(gross)||gross<0||(net!==null&&!Number.isFinite(net))||(count!==null&&!Number.isInteger(count)))fail(`Linha ${i+1} não entendida: "${t.slice(0,60)}". Use mês;bruto;líquido;atendimentos, como 2025-08;16955;6011,99;184.`);
  rows.push({month,gross:cents(gross),net:net===null?null:cents(net),count:count??null});
 }
 if(!rows.length)fail('Nenhuma linha para importar.');
 if(rows.length>240)fail('Histórico grande demais.');
 return rows;
}

export function financeAdminAction(s,action,p,now=Date.now()){
 switch(action){
  case 'closing_record':return closeAppointment(s,p,{name:'Gerência'},now);
  case 'commission_save':{
   const st=s.staff.find(x=>x.id===p.staffId)||fail('Profissional não encontrada.');const v=Number(p.commission);
   if(!Number.isFinite(v)||v<0||v>100)fail('O repasse vai de 0% a 100%.');st.commission=v;break;
  }
  case 'deduction_add':{
   const st=s.staff.find(x=>x.id===p.staffId)||fail('Escolha a parceira.');const description=String(p.description||'').trim(),amount=Number(p.amount),date=String(p.date||'');
   if(!description||description.length>120||!Number.isFinite(amount)||amount<=0||amount>100000||!validDate(date))fail('Confira a parceira, o motivo, a data e o valor do desconto.');
   s.deductions??=[];s.deductions.push({id:crypto.randomUUID(),staffId:st.id,description,amount:cents(amount),date,created:now});break;
  }
  case 'deduction_remove':s.deductions=(s.deductions||[]).filter(d=>d.id!==p.id);break;
  case 'fixed_save':{
   const name=String(p.name||'').trim(),amount=Number(p.amount);
   if(!name||name.length>80||!Number.isFinite(amount)||amount<0||amount>1000000)fail('Confira o nome e o valor mensal.');
   s.fixedCosts??=[];const atual=s.fixedCosts.find(f=>f.id===p.id);
   if(atual)Object.assign(atual,{name,amount:cents(amount),active:p.active!==false});else s.fixedCosts.push({id:crypto.randomUUID(),name,amount:cents(amount),active:true});break;
  }
  case 'fixed_remove':s.fixedCosts=(s.fixedCosts||[]).filter(f=>f.id!==p.id);break;
  case 'history_import':{
   const novos=parseHistory(p.text),porMes=historico(s);for(const r of novos)porMes[r.month]=r;
   s.financeHistory=Object.values(porMes).sort((a,b)=>a.month.localeCompare(b.month));break;
  }
  default:fail('Ação financeira inválida.');
 }
}
