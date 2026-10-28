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
