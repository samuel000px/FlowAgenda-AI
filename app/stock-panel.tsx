"use client";
// Estoque: o que tem, onde fica, o que está acabando. Entrada e saída com um toque.
import {useState,type FormEvent} from 'react';
import {stockView} from '../lib/estoque.mjs';
type Row=Record<string,any>;

export default function StockPanel({state,busy,run}:{state:Row,busy:boolean,run:(a:string,p:Row)=>Promise<boolean>}){
 const [busca,setBusca]=useState(''),[lugar,setLugar]=useState<Row|null>(null),[editando,setEditando]=useState<Row|null>(null),[mov,setMov]=useState<Row|null>(null);
 const v=stockView(state,busca),lugares=[...new Set((state.stock||[]).map((i:Row)=>i.place).filter(Boolean))] as string[];
 async function salvar(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);
  if(await run('stock_save',{id:editando?.id,name:f.get('name'),place:f.get('place'),qty:Number(f.get('qty')),min:Number(f.get('min')||0)}))setEditando(null);}
 async function mover(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget),n=Number(f.get('n'));
  if(await run('stock_move',{id:mov!.item.id,delta:mov!.tipo==='entrada'?n:-n,reason:f.get('reason')}))setMov(null);}
 return <div className="finance-workspace">
  {v.low.length>0&&<section className="panel finance-section stock-low"><h2>Para repor ({v.low.length})</h2><p className="muted small">Itens no mínimo ou abaixo dele.</p>
   <div className="tags">{v.low.map((i:Row)=><span className="badge amber" key={i.id}>{i.name}: {i.qty} (mín. {i.min})</span>)}</div></section>}
  <section className="panel finance-section"><div className="row between wrap"><div><h2>Itens</h2><p className="muted small">{v.total} item(ns). Defina um mínimo para ser avisado quando estiver acabando.</p></div>
   <div className="row"><label className="search"><input aria-label="Buscar no estoque" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar item ou lugar…"/></label><button onClick={()=>setEditando({})}>Novo item</button></div></div>
   {v.places.map(([lugar,itens]:[string,Row[]])=><details key={lugar} className="stock-place" open={!!busca||v.places.length<=3}><summary><strong>{lugar||'Sem lugar definido'}</strong> <span className="muted small">{itens.length} item(ns)</span> <button className="text-button" disabled={busy} onClick={e=>{e.preventDefault();setLugar({de:lugar});}}>Renomear lugar</button></summary>
    <div className="table-wrap"><table><thead><tr><th>ITEM</th><th>QUANTIDADE</th><th>MÍNIMO</th><th/></tr></thead><tbody>{itens.map(i=><tr key={i.id} className={i.min>0&&i.qty<=i.min?'stock-alert':''}><td><strong>{i.name}</strong></td><td>{i.qty}</td><td>{i.min||'—'}</td>
     <td><div className="actions"><button className="secondary small-button" disabled={busy} onClick={()=>setMov({item:i,tipo:'entrada'})}>+ Entrada</button><button className="secondary small-button" disabled={busy||!i.qty} onClick={()=>setMov({item:i,tipo:'saida'})}>− Saída</button><button className="secondary small-button" disabled={busy} onClick={()=>setEditando(i)}>Editar</button></div></td></tr>)}</tbody></table></div></details>)}
   {!v.total&&<p className="muted">Nenhum item cadastrado. Os itens da planilha antiga entram pela importação em Configurações.</p>}
  </section>
  {editando&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setEditando(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="stock-title"><form className="modal-content closing-form" onSubmit={salvar}>
   <h2 id="stock-title">{editando.id?'Editar item':'Novo item'}</h2>
   <label className="field"><span>Item</span><input name="name" required maxLength={100} defaultValue={editando.name} disabled={busy}/></label>
   <label className="field"><span>Onde fica</span><input name="place" maxLength={80} list="lugares" defaultValue={editando.place} disabled={busy}/><datalist id="lugares">{lugares.map(l=><option key={l} value={l}/>)}</datalist></label>
   <div className="form-grid"><label className="field"><span>Quantidade</span><input name="qty" type="number" min="0" step="any" required defaultValue={editando.qty??0} disabled={busy}/></label><label className="field"><span>Mínimo (avisar abaixo de)</span><input name="min" type="number" min="0" step="any" defaultValue={editando.min??0} disabled={busy}/></label></div>
   <div className="modal-actions">{editando.id&&<button type="button" className="secondary" disabled={busy} onClick={async()=>{if(confirm(`Apagar ${editando.name}?`)&&await run('stock_remove',{id:editando.id}))setEditando(null);}}>Apagar</button>}<button type="button" className="secondary" disabled={busy} onClick={()=>setEditando(null)}>Voltar</button><button disabled={busy}>Salvar</button></div>
  </form></section></div>}
  {lugar&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setLugar(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="place-title"><form className="modal-content closing-form" onSubmit={async e=>{e.preventDefault();if(await run('stock_place_rename',{from:lugar.de,to:new FormData(e.currentTarget).get('to')}))setLugar(null);}}>
   <h2 id="place-title">Renomear lugar</h2><p className="muted">{lugar.de||'Sem lugar definido'} · todos os itens dele mudam juntos.</p>
   <label className="field"><span>Novo nome</span><input name="to" required maxLength={80} list="lugares" defaultValue={lugar.de} autoFocus disabled={busy}/><small>Para juntar dois lugares, escolha o nome de um que já existe.</small></label>
   <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setLugar(null)}>Voltar</button><button disabled={busy}>Salvar</button></div>
  </form></section></div>}
  {mov&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget&&!busy)setMov(null);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="mov-title"><form className="modal-content closing-form" onSubmit={mover}>
   <h2 id="mov-title">{mov.tipo==='entrada'?'Entrada':'Saída'}: {mov.item.name}</h2><p className="muted">Hoje: {mov.item.qty}</p>
   <label className="field"><span>Quantidade</span><input name="n" type="number" min="0.01" step="any" required autoFocus disabled={busy}/></label>
   <label className="field"><span>Motivo (opcional)</span><input name="reason" maxLength={80} placeholder={mov.tipo==='entrada'?'Ex.: compra na distribuidora':'Ex.: usado no atendimento'} disabled={busy}/></label>
   <div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setMov(null)}>Voltar</button><button disabled={busy}>Registrar</button></div>
  </form></section></div>}
 </div>;
}
