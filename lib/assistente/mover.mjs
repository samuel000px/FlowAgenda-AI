import {at,free,get,gapFrom,invalidate} from '../flowagenda.mjs';

const fail=texto=>{throw Error(texto)};
const posicao=a=>({date:a.date,start:a.start,end:a.end,staff_id:a.staff_id});

// Muda dia, hora e/ou profissional de um atendimento sem tocar em duração, preço, opção e adicionais
// (a ação 'reschedule' recalcula tudo pelo serviço básico, por isso não serve aqui).
export function moverAtendimento(s,atendimentoId,destino={},opcoes={},now=Date.now()){
  const a=get(s,'appointments',atendimentoId);
  if(a.status!=='booked'||a.result||at(a)<=now)fail('Este atendimento não pode ser mudado.');
  const antes=posicao(a),original={...a},duracao=a.end-a.start;
  const date=destino.date??a.date,start=destino.start??a.start,staff=destino.staff_id??a.staff_id;
  const pro=get(s,'staff',staff),svc=get(s,'services',a.service_id);
  if(!pro.services.includes(svc.id))fail(`${pro.name} não faz ${svc.name}.`);
  const end=start+duracao;
  if(!Number.isInteger(start)||start<0||end>1440||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(at({date,start}))||at({date,start})<=now||!free(s,a.client_id,staff,date,start,end,a.id))fail('O horário não está disponível.');
  const mudouHorario=date!==a.date||start!==a.start;
  Object.assign(a,{date,start,end,staff_id:staff});
  if(mudouHorario)Object.assign(a,{attendance:'unknown',reminded:false});
  invalidate(s,a.id,now);
  if(opcoes.abrirVaga)s.gaps.push(gapFrom(original));
  return {antes,depois:posicao(a)};
}
