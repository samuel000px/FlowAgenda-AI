// Previsão do faturamento mensal. Com uns dois anos de meses, um modelo complicado decoraria o
// passado; aqui vai um simples e honesto: a tendência (crescimento médio por mês, em escala
// logarítmica) mais o efeito de cada mês do ano (dezembro e junho/julho fortes, janeiro fraco),
// encolhido para perto de zero porque cada mês do ano só aparece uma ou duas vezes. A previsão sai
// como faixa, e o modelo é testado contra os últimos meses para mostrar quanto costuma errar.
const MINIMO=6,JANELA=18,Z80=1.2816;
const nextMonth=(m,n=1)=>{const d=new Date(Date.UTC(Number(m.slice(0,4)),Number(m.slice(5,7))-1+n,1));return d.toISOString().slice(0,7);};
const calMonth=m=>Number(m.slice(5,7));
const idx=m=>Number(m.slice(0,4))*12+calMonth(m);

/** Ajusta tendência + efeito do mês do ano em [{month, gross}] (em ordem). */
export function fit(series){
 const pts=series.filter(p=>p.gross>0).slice(-JANELA);
 if(pts.length<MINIMO)return null;
 const x=pts.map(p=>idx(p.month)),y=pts.map(p=>Math.log(p.gross)),n=pts.length;
 const mx=x.reduce((a,b)=>a+b,0)/n,my=y.reduce((a,b)=>a+b,0)/n;
 const b=x.reduce((s,xi,i)=>s+(xi-mx)*(y[i]-my),0)/x.reduce((s,xi)=>s+(xi-mx)**2,0),a=my-b*mx;
 const res=y.map((yi,i)=>yi-(a+b*x[i])),soma={},vezes={};
 pts.forEach((p,i)=>{const m=calMonth(p.month);soma[m]=(soma[m]||0)+res[i];vezes[m]=(vezes[m]||0)+1;});
 const season=Object.fromEntries(Object.keys(soma).map(m=>[m,soma[m]/(vezes[m]+1)]));
 const final=y.map((yi,i)=>yi-(a+b*x[i]+(season[calMonth(pts[i].month)]||0)));
 const sd=Math.max(0.05,Math.sqrt(final.reduce((s,r)=>s+r*r,0)/Math.max(1,n-2)));
 return {a,b,season,sd,last:pts.at(-1).month,points:n};
}

export function predict(model,month){
 const log=model.a+model.b*idx(month)+(model.season[calMonth(month)]||0),mid=Math.exp(log);
 return {month,value:Math.round(mid),low:Math.round(Math.exp(log-Z80*model.sd)),high:Math.round(Math.exp(log+Z80*model.sd))};
}

/** Prevê cada um dos últimos meses usando só os anteriores e mede o erro médio (em %). */
export function backtest(series,meses=4){
 const pts=series.filter(p=>p.gross>0),testes=[];
 for(let i=Math.max(MINIMO,pts.length-meses);i<pts.length;i++){
  const m=fit(pts.slice(0,i));if(!m)continue;
  const p=predict(m,pts[i].month);testes.push({month:pts[i].month,actual:pts[i].gross,predicted:p.value,error:Math.abs(p.value-pts[i].gross)/pts[i].gross});
 }
 return {tests:testes,mape:testes.length?testes.reduce((s,t)=>s+t.error,0)/testes.length:null};
}

/** Próximos meses a partir do último fechado, com faixa de 80%, crescimento médio e o teste contra o passado. */
export function forecast(series,horizonte=3){
 const model=fit(series);if(!model)return null;
 const meses=Array.from({length:horizonte},(_,i)=>nextMonth(model.last,i+1));
 return {months:meses.map(m=>predict(model,m)),growth:Math.exp(model.b)-1,points:model.points,...backtest(series)};
}
