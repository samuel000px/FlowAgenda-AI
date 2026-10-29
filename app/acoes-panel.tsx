"use client";
// "Ações" da gerência e da equipe, em duas partes: atendimento ao cliente (os pedidos de conversa) e os
// parabéns com cupom para quem faz aniversário nos próximos dias.
import {useState,type FormEvent} from 'react';
import {Cake,MessageCircle,Send} from 'lucide-react';
import {phoneKey} from '../lib/flowagenda.mjs';
import {mensagemAniversario} from '../lib/aniversario.mjs';
import SupportPanel from './support-panel';
type Row=Record<string,any>;
type Props={tickets:Row[],actor:Row,busy:boolean,run:(action:string,p:Row)=>Promise<boolean>,admin?:boolean,error?:string,
 birthdays:Row[],coupon:{percent:number,days:number},salon:string};

const quando=(a:Row)=>a.inDays===0?'Hoje':a.inDays===1?'Amanhã':`${a.date.slice(8,10)}/${a.date.slice(5,7)} · em ${a.inDays} dias`;

export default function AcoesPanel({tickets,actor,busy,run,admin=false,error='',birthdays,coupon,salon}:Props){
 const [parte,setParte]=useState('atendimento');
 const faltam=birthdays.filter(a=>!a.wished).length;
 async function parabens(a:Row){
  // O WhatsApp abre já com a mensagem; ela só sai quando a pessoa toca em Enviar. A marca evita repetir.
  const texto=mensagemAniversario({salon:{name:salon},settings:{birthdayCoupon:coupon}},a);
  window.open(`https://wa.me/${phoneKey(a.phone)}?text=${encodeURIComponent(texto)}`,'_blank','noopener');
  await run('birthday_wished',{client_id:a.id,year:a.date.slice(0,4),by:actor.name});
 }
 async function salvarCupom(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await run('birthday_settings',{percent:Number(f.get('percent')),days:Number(f.get('days'))});}
 return <div className="acoes">
  <nav className="acoes-partes" aria-label="Partes de Ações">
   <button className={parte==='atendimento'?'selected':'secondary'} aria-pressed={parte==='atendimento'} onClick={()=>setParte('atendimento')}><MessageCircle size={17}/>Atendimento ao cliente{tickets.length>0&&<b>{tickets.length}</b>}</button>
   <button className={parte==='aniversarios'?'selected':'secondary'} aria-pressed={parte==='aniversarios'} onClick={()=>setParte('aniversarios')}><Cake size={17}/>Aniversários{faltam>0&&<b>{faltam}</b>}</button>
  </nav>
  {parte==='atendimento'&&<SupportPanel error={error} admin={admin} tickets={tickets} actor={actor} busy={busy} run={run}/>}
  {parte==='aniversarios'&&<section className="panel acoes-aniversarios">
   <div className="panel-heading"><div><h2>Feliz aniversário com cupom</h2><p>Quem faz aniversário nos próximos 7 dias. A mensagem leva {coupon.percent}% de desconto, válido por {coupon.days} dia(s) a partir do aniversário.</p></div></div>
   {admin&&<form className="acoes-cupom" onSubmit={salvarCupom}><label className="field"><span>Desconto (%)</span><input name="percent" type="number" min="1" max="90" required defaultValue={coupon.percent} disabled={busy}/></label><label className="field"><span>Validade (dias)</span><input name="days" type="number" min="1" max="60" required defaultValue={coupon.days} disabled={busy}/></label><button className="secondary" disabled={busy}>Salvar cupom</button></form>}
   {error&&<p className="error" role="alert">{error}</p>}
   <div className="acoes-lista">{birthdays.map(a=><div className={'acoes-linha'+(a.inDays===0?' is-hoje':'')} key={a.id}>
    <div><strong>{a.name}</strong><small>{quando(a)}{!a.phone&&' · sem WhatsApp no cadastro'}</small></div>
    {a.wished?<span className="badge green">Parabéns enviados</span>:<button disabled={busy||!a.phone} onClick={()=>parabens(a)}><Send size={15}/>Mandar parabéns</button>}
   </div>)}</div>
   {!birthdays.length&&<p className="empty-inline">Ninguém faz aniversário nos próximos 7 dias. Os aniversários entram pelo cadastro da cliente e pelo agendamento no site.</p>}
   <p className="panel-note">O WhatsApp abre com a mensagem pronta no aparelho de quem tocou; ela só é enviada depois de tocar em Enviar, sem custo. O desconto é aplicado na hora do pagamento.</p>
  </section>}
 </div>;
}
