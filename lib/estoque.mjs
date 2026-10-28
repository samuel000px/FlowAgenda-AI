// Estoque do salão, no lugar da aba da planilha: cada item tem onde fica, quantidade e um mínimo.
// Abaixo do mínimo, o item aparece na lista de reposição. Entradas e saídas ficam registradas.
const fail=t=>{throw Error(t)};
const texto=(v,max)=>String(v??'').trim().replace(/\s+/g,' ').slice(0,max);
const qtd=(v,label)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>100000)fail(`Confira ${label}.`);return Math.round(n*100)/100;};

/** Itens agrupados por lugar, com a busca aplicada, e a lista do que está acabando. */
export function stockView(s,query=''){
 const q=query.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
 const itens=(s.stock||[]).filter(i=>!q||(i.name+' '+i.place).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().includes(q));
 const lugares={};for(const i of itens)(lugares[i.place||'']??=[]).push(i);
 return {places:Object.entries(lugares),low:(s.stock||[]).filter(i=>i.min>0&&i.qty<=i.min).sort((a,b)=>a.qty/a.min-b.qty/b.min),total:(s.stock||[]).length};
}

export function stockAction(s,action,p,actor='Gerência',now=Date.now()){
 s.stock??=[];s.stockLog??=[];
 const item=()=>s.stock.find(i=>i.id===p.id)||fail('Item não encontrado.');
 switch(action){
  case 'stock_save':{
   const name=texto(p.name,100),place=texto(p.place,80);if(!name)fail('Informe o nome do item.');
   const values={name,place,qty:qtd(p.qty,'a quantidade'),min:qtd(p.min??0,'o mínimo')};
   if(p.id)Object.assign(item(),values,{updated:now});else s.stock.push({id:'K'+crypto.randomUUID().replaceAll('-','').slice(0,16),...values,updated:now});break;
  }
  case 'stock_move':{
   // Entrada (compra) soma; saída (uso ou perda) diminui, sem passar de zero.
   const i=item(),delta=Number(p.delta);if(!Number.isFinite(delta)||delta===0||Math.abs(delta)>100000)fail('Informe quanto entrou ou saiu.');
   if(i.qty+delta<0)fail(`Só há ${i.qty} de ${i.name}.`);
   i.qty=Math.round((i.qty+delta)*100)/100;i.updated=now;
   s.stockLog.push({id:crypto.randomUUID(),item:i.id,name:i.name,delta,reason:texto(p.reason,80),by:actor,created:now});s.stockLog=s.stockLog.slice(-500);break;
  }
  case 'stock_remove':s.stock=s.stock.filter(i=>i.id!==p.id);break;
  case 'stock_place_rename':{
   // Renomear um lugar (ou juntar dois: dar o nome de um lugar que já existe) muda todos os itens dele.
   const de=texto(p.from,80),para=texto(p.to,80);if(!para)fail('Informe o novo nome do lugar.');
   const itens=s.stock.filter(i=>(i.place||'')===de);if(!itens.length)fail('Lugar não encontrado.');
   for(const i of itens){i.place=para;i.updated=now;}break;
  }
  default:fail('Ação de estoque inválida.');
 }
}
