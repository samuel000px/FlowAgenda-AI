// Aniversariantes dos próximos dias e a mensagem de parabéns com cupom. O cupom é um desconto que a
// gerência define (porcentagem e validade); a mensagem vai pelo WhatsApp de quem tocar em enviar, sem
// custo, e quem já recebeu no ano fica marcada para ninguém mandar duas vezes.
import {today} from './flowagenda.mjs';

export const CUPOM_PADRAO={percent:10,days:7};
export const cupom=s=>({...CUPOM_PADRAO,...(s.settings?.birthdayCoupon||{})});
const dia=d=>new Date(d+'T12:00:00Z');
const somar=(d,n)=>{const x=dia(d);x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const ddmm=d=>d.slice(8,10)+'/'+d.slice(5,7);

/** Quem faz aniversário de hoje até `dias` à frente, do mais próximo ao mais distante. */
export function aniversariantes(s,now=Date.now(),dias=7){
  const hoje=today(now),ano=hoje.slice(0,4),lista=[];
  for(const c of s.clients){
    if(!/^\d{2}-\d{2}$/.test(c.birthday||''))continue;
    // 29/02 em ano que não é bissexto vira 28/02.
    let data=`${ano}-${c.birthday}`;if(dia(data).toISOString().slice(0,10)!==data)data=`${ano}-02-28`;
    if(data<hoje)data=`${Number(ano)+1}-${data.slice(5)}`;
    const faltam=Math.round((dia(data)-dia(hoje))/86400000);
    if(faltam<=dias)lista.push({id:c.id,name:c.name,phone:c.phone||'',date:data,inDays:faltam,wished:c.birthdayWished===data.slice(0,4)});
  }
  return lista.sort((a,b)=>a.inDays-b.inDays||a.name.localeCompare(b.name));
}

/** Texto de parabéns com o cupom, válido por alguns dias a partir do aniversário. */
export function mensagemAniversario(s,a){
  const {percent,days}=cupom(s),primeiro=a.name.split(' ')[0],ate=ddmm(somar(a.date,days));
  const quando=a.inDays===0?'hoje':`no dia ${ddmm(a.date)}`;
  return `Feliz aniversário, ${primeiro}! 🎉 Pra comemorar ${quando}, a ${s.salon?.name||'Santa Cor'} preparou um presente: ${percent}% de desconto em qualquer serviço até ${ate}. É só mostrar esta mensagem quando vier. Com carinho, equipe ${s.salon?.name||'Santa Cor'} 💅`;
}
