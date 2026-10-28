"use client";
// Partes de Finanças que substituem a planilha do salão: a semana de cada parceira (repasse),
// o resultado do mês com o histórico e a previsão, e o cadastro de custos fixos e do histórico.
import {useMemo,useState,type FormEvent} from 'react';
import {commissionOf,monthResult,monthlySeries,partnerWeek} from '../lib/finance-core.mjs';
import {forecast} from '../lib/previsao.mjs';
import {today} from '../lib/flowagenda.mjs';
type Row=Record<string,any>;
type Run=(a:string,p:Row)=>Promise<boolean>;
const money=(n:number)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const short=(n:number)=>n>=1000?`R$ ${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`:money(n);
const MESES=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const mesLabel=(m:string)=>`${MESES[Number(m.slice(5,7))-1]}/${m.slice(2,4)}`;
const addDays=(d:string,n:number)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const segunda=(d:string)=>{const w=new Date(d+'T12:00:00Z').getUTCDay();return addDays(d,w===0?-6:1-w);};
const br=(d:string)=>d.split('-').reverse().join('/');

export function PartnersView({state,busy,run}:{state:Row,busy:boolean,run:Run}){
 const [inicio,setInicio]=useState(segunda(today())),fim=addDays(inicio,6);
 const linhas=partnerWeek(state,inicio,fim),soma=(k:string)=>linhas.reduce((n:number,r:Row)=>n+r[k],0);
 const semPagamento=linhas.reduce((n:number,r:Row)=>n+r.unpaid,0);
 async function descontar(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,f=new FormData(form);
  if(await run('deduction_add',{staffId:f.get('staffId'),description:f.get('description'),amount:Number(f.get('amount')),date:f.get('date')}))form.reset();}
 return <>
  <section className="panel support-intro"><div><h2>Fechamento da semana por parceira</h2><p>O mesmo quadro da planilha: quanto cada uma atendeu, a parte dela, os descontos e o que fica para o salão.</p></div>
   <div className="row"><button className="secondary small-button" aria-label="Semana anterior" onClick={()=>setInicio(addDays(inicio,-7))}>‹</button><label className="field"><span>Semana de</span><input type="date" value={inicio} onChange={e=>e.target.value&&setInicio(segunda(e.target.value))}/></label><button className="secondary small-button" aria-label="Próxima semana" onClick={()=>setInicio(addDays(inicio,7))}>›</button></div></section>
  <section className="panel finance-section"><h2>{br(inicio)} a {br(fim)}</h2>
   <div className="table-wrap"><table><thead><tr><th>PARCEIRA</th><th>ATEND.</th><th>TOTAL</th><th>REPASSE</th><th>PARTE DELA</th><th>DESCONTOS</th><th>A PAGAR</th><th>SALÃO</th></tr></thead>
    <tbody>{linhas.map((r:Row)=><tr key={r.staffId}><td><strong>{r.name}</strong>{r.deductions.map((d:Row)=><small key={d.id}>− {d.description} ({money(d.amount)}) <button className="text-button" disabled={busy} onClick={()=>run('deduction_remove',{id:d.id})}>tirar</button></small>)}</td><td>{r.count}</td><td>{money(r.total)}</td><td>{r.commission}%</td><td>{money(r.share)}</td><td>{r.deducted?'− '+money(r.deducted):'—'}</td><td><strong>{money(r.toPay)}</strong></td><td>{money(r.salon)}</td></tr>)}
     {linhas.length>0&&<tr className="total-row"><td><strong>Total</strong></td><td>{soma('count')}</td><td><strong>{money(soma('total'))}</strong></td><td/><td>{money(soma('share'))}</td><td>{money(soma('deducted'))}</td><td><strong>{money(soma('toPay'))}</strong></td><td><strong>{money(soma('salon'))}</strong></td></tr>}</tbody></table></div>
   {!linhas.length&&<p className="muted">Nenhum atendimento fechado nesta semana.</p>}
   {semPagamento>0&&<p className="notice">{semPagamento} atendimento(s) realizados sem pagamento registrado: entram com o preço da agenda.</p>}
   <p className="muted small">O repasse de cada parceira (padrão {40}%) é ajustado na aba Custos e histórico.</p>
  </section>
  <section className="panel finance-section"><h2>Descontar da parceira</h2><p className="muted small">Lanche, adiantamento ou serviço que ela fez no salão. Sai do valor a pagar daquela semana.</p>
   <form className="finance-expense" onSubmit={descontar}><label className="field"><span>Parceira</span><select name="staffId" required disabled={busy}>{state.staff.filter((p:Row)=>p.active!==false).map((p:Row)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="field"><span>Motivo</span><input name="description" required maxLength={120} list="motivos" placeholder="Ex.: lanche de sábado" disabled={busy}/><datalist id="motivos"><option value="Lanche"/><option value="Adiantamento"/><option value="Serviço feito no salão"/></datalist></label>
    <label className="field"><span>Valor (R$)</span><input name="amount" type="number" min="0.01" step="0.01" required disabled={busy}/></label>
    <label className="field"><span>Data</span><input name="date" type="date" required defaultValue={inicio} min={inicio} max={fim} disabled={busy}/></label><button disabled={busy}>Adicionar desconto</button></form></section>
 </>;
}

/** Barras por mês: realizado (cheio) e previsão (claro, com a faixa de 80%). Uma série só, sem legenda extra. */
function Grafico({series,previsao,atual}:{series:Row[],previsao:Row[],atual:Row|null}){
 const [foco,setFoco]=useState<Row|null>(null);
 const barras:Row[]=[...series.slice(-15).map(r=>({month:r.month,value:r.gross,tipo:'real'})),...(atual?[{month:atual.month,value:atual.value,tipo:'parcial'}]:[]),...previsao.map(p=>({month:p.month,value:p.value,low:p.low,high:p.high,tipo:'previsto'}))];
 if(!barras.length)return <p className="muted">Importe o histórico ou feche atendimentos para ver o gráfico.</p>;
 const W=720,H=240,top=16,base=H-28,left=64,right=8,teto=Math.max(...barras.map(b=>b.high||b.value))*1.08,y=(v:number)=>base-(v/teto)*(base-top);
 const passo=(W-left-right)/barras.length,larg=Math.max(6,passo-6),grade=[0.25,0.5,0.75].map(f=>Math.round(teto*f/1000)*1000);
 return <figure className="fin-chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Faturamento por mês, com previsão dos próximos meses">
  {grade.map(g=><g key={g}><line x1={left} x2={W-right} y1={y(g)} y2={y(g)} className="fin-grid"/><text x={left-8} y={y(g)+4} textAnchor="end" className="fin-axis">{short(g)}</text></g>)}
  <line x1={left} x2={W-right} y1={base} y2={base} className="fin-base"/>
  {barras.map((b,i)=>{const x=left+i*passo+(passo-larg)/2;return <g key={b.month} onMouseEnter={()=>setFoco(b)} onMouseLeave={()=>setFoco(null)} onFocus={()=>setFoco(b)} onBlur={()=>setFoco(null)} tabIndex={0}>
   <rect x={left+i*passo} y={top} width={passo} height={base-top} fill="transparent"/>
   <path d={`M${x},${base} V${y(b.value)+4} q0,-4 4,-4 h${larg-8} q4,0 4,4 V${base} Z`} className={'fin-bar '+b.tipo}/>
   {b.tipo==='previsto'&&<line x1={x+larg/2} x2={x+larg/2} y1={y(b.high)} y2={y(b.low)} className="fin-range"/>}
   {((barras.length-1-i)%3===0)&&<text x={x+larg/2} y={H-10} textAnchor="middle" className="fin-axis">{mesLabel(b.month)}</text>}
  </g>;})}
 </svg>
 {foco&&<figcaption className="fin-tip"><strong>{mesLabel(foco.month)}</strong> · {foco.tipo==='previsto'?`previsão ${money(foco.value)} (entre ${money(foco.low)} e ${money(foco.high)})`:foco.tipo==='parcial'?`até agora ${money(foco.value)}`:money(foco.value)}</figcaption>}
 <p className="fin-legend"><span className="sw real"/>Realizado <span className="sw parcial"/>Mês atual (até hoje) <span className="sw previsto"/>Previsão, com a faixa provável</p>
 </figure>;
}

export function ResultView({state}:{state:Row}){
 const mesAtual=today().slice(0,7),[mes,setMes]=useState(mesAtual);
 const r=monthResult(state,mes),series=useMemo(()=>monthlySeries(state),[state]),prev=useMemo(()=>forecast(series),[series]);
 const doMes=monthResult(state,mesAtual),agendado=state.appointments.filter((a:Row)=>a.status==='booked'&&!a.result&&a.date.startsWith(mesAtual)&&a.date>=today()).reduce((n:number,a:Row)=>n+a.price,0);
 const previsaoAtual=prev?.months.find((p:Row)=>p.month===mesAtual);
 return <>
  <section className="panel support-intro"><div><h2>Resultado do mês</h2><p>{r.source==='planilha'?'Números importados da planilha antiga.':'Calculado com os atendimentos fechados, os repasses, as despesas e os custos fixos.'}</p></div><label className="field"><span>Mês</span><input type="month" value={mes} max={mesAtual} onChange={e=>e.target.value&&setMes(e.target.value)}/></label></section>
  <div className="finance-metrics">{[['Faturamento bruto',r.gross,`${r.count||0} atendimento(s)`],['Repasse das parceiras',r.shares,'Parte de cada uma'],['Despesas e custos fixos',r.expenses===null?null:r.expenses+r.fixed,'Compras do mês + contas fixas'],['Líquido do salão',r.net,'O que sobrou']].map(([l,v,h])=><section className="panel finance-metric" key={String(l)}><span>{l}</span><strong>{v===null||v===undefined?'—':money(Number(v))}</strong><small>{h}</small></section>)}</div>
  <section className="panel finance-section"><h2>Faturamento por mês</h2><Grafico series={series} previsao={(prev?.months||[]).filter((p:Row)=>p.month!==mesAtual)} atual={doMes.gross?{month:mesAtual,value:doMes.gross}:null}/>
   {prev?<div className="fin-forecast">
    <div><span>Este mês</span><strong>{previsaoAtual?money(previsaoAtual.value):'—'}</strong><small>{previsaoAtual&&`entre ${money(previsaoAtual.low)} e ${money(previsaoAtual.high)} · `}já entrou {money(doMes.gross)} e há {money(agendado)} agendado</small></div>
    {prev.months.filter((p:Row)=>p.month!==mesAtual).slice(0,2).map((p:Row)=><div key={p.month}><span>{mesLabel(p.month)}</span><strong>{money(p.value)}</strong><small>entre {money(p.low)} e {money(p.high)}</small></div>)}
    <div><span>Crescimento médio</span><strong>{(prev.growth*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}% ao mês</strong><small>nos últimos {prev.points} meses</small></div>
   </div>:<p className="muted">A previsão aparece com pelo menos 6 meses de histórico.</p>}
   {prev?.mape!=null&&<details className="fin-test"><summary>Quanto a previsão costuma errar? <strong>{(prev.mape*100).toLocaleString('pt-BR',{maximumFractionDigits:1})}% em média</strong></summary><p className="muted small">Testamos o modelo prevendo cada um dos últimos meses só com os meses anteriores a ele.</p><div className="table-wrap"><table><thead><tr><th>MÊS</th><th>PREVISTO</th><th>REAL</th><th>ERRO</th></tr></thead><tbody>{prev.tests.map((t:Row)=><tr key={t.month}><td>{mesLabel(t.month)}</td><td>{money(t.predicted)}</td><td>{money(t.actual)}</td><td>{(t.error*100).toFixed(1)}%</td></tr>)}</tbody></table></div></details>}
   <details className="fin-test"><summary>Ver os meses em tabela</summary><div className="table-wrap"><table><thead><tr><th>MÊS</th><th>BRUTO</th><th>LÍQUIDO</th><th>ATENDIMENTOS</th><th>ORIGEM</th></tr></thead><tbody>{[...series].reverse().map((m:Row)=><tr key={m.month}><td>{mesLabel(m.month)}</td><td>{money(m.gross)}</td><td>{m.net==null?'—':money(m.net)}</td><td>{m.count||'—'}</td><td>{m.source==='planilha'?'Planilha':'Sistema'}</td></tr>)}</tbody></table></div></details>
  </section>
 </>;
}

export function CostsView({state,busy,run}:{state:Row,busy:boolean,run:Run}){
 const [texto,setTexto]=useState(''),fixos:Row[]=state.fixedCosts||[],total=fixos.filter(f=>f.active!==false).reduce((n,f)=>n+f.amount,0);
 async function novoFixo(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget,f=new FormData(form);if(await run('fixed_save',{name:f.get('name'),amount:Number(f.get('amount'))}))form.reset();}
 async function importar(){if(await run('history_import',{text:texto}))setTexto('');}
 return <>
  <div className="finance-columns">
   <section className="panel finance-section"><h2>Custos fixos do mês</h2><p className="muted small">Contas que se repetem todo mês. Entram no resultado mensal.</p>
    {fixos.map(f=><div className="finance-line" key={f.id}><div><strong>{f.name}</strong>{f.active===false&&<small>Pausado</small>}</div><strong>{money(f.amount)}</strong><div className="actions"><button className="secondary small-button" disabled={busy} onClick={()=>run('fixed_save',{...f,active:f.active===false})}>{f.active===false?'Ativar':'Pausar'}</button><button className="icon-button" aria-label={'Apagar '+f.name} disabled={busy} onClick={()=>run('fixed_remove',{id:f.id})}>×</button></div></div>)}
    {fixos.length>0&&<div className="finance-line total-row"><strong>Total por mês</strong><strong>{money(total)}</strong><span/></div>}
    <form className="finance-expense" onSubmit={novoFixo}><label className="field"><span>Conta</span><input name="name" required maxLength={80} list="contas" placeholder="Ex.: aluguel" disabled={busy}/><datalist id="contas">{['Aluguel','Energia','Água','Internet','Material de limpeza','Contador','Sistema/maquininha'].map(c=><option key={c} value={c}/>)}</datalist></label><label className="field"><span>Valor mensal (R$)</span><input name="amount" type="number" min="0" step="0.01" required disabled={busy}/></label><button disabled={busy}>Adicionar</button></form></section>
   <section className="panel finance-section"><h2>Repasse de cada parceira</h2><p className="muted small">Quanto do valor do atendimento vai para a parceira. Na planilha, o mais comum era 40%.</p>
    {state.staff.filter((p:Row)=>p.active!==false).map((p:Row)=><form key={p.id} className="finance-line" onSubmit={async e=>{e.preventDefault();await run('commission_save',{staffId:p.id,commission:Number(new FormData(e.currentTarget).get('commission'))});}}><strong>{p.name}</strong><label className="inline-field"><input name="commission" type="number" min="0" max="100" step="1" defaultValue={commissionOf(p)} aria-label={'Repasse de '+p.name} disabled={busy}/>%</label><button className="secondary small-button" disabled={busy}>Salvar</button></form>)}</section>
  </div>
  <section className="panel finance-section"><h2>Importar histórico da planilha</h2><p className="muted small">Uma linha por mês: <code>mês;faturamento bruto;faturamento líquido;atendimentos</code>. O líquido e os atendimentos podem ficar em branco. Um mês que já existe é substituído.</p>
   <label className="field"><span>Arquivo .csv</span><input type="file" accept=".csv,text/csv,text/plain" disabled={busy} onChange={async e=>{const f=e.target.files?.[0];if(f)setTexto(await f.text());}}/></label>
   <label className="field"><span>Ou cole as linhas</span><textarea rows={6} value={texto} onChange={e=>setTexto(e.target.value)} placeholder={'2025-08;16955,00;6011,99;184\n2025-09;14390,00;4739,72;198'} disabled={busy}/></label>
   <button disabled={busy||!texto.trim()} onClick={importar}>Importar histórico</button>
   {(state.financeHistory||[]).length>0&&<p className="muted small">{state.financeHistory.length} mês(es) no histórico: de {mesLabel(state.financeHistory[0].month)} a {mesLabel(state.financeHistory.at(-1).month)}.</p>}</section>
 </>;
}
