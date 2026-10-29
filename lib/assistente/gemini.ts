// Cliente do Gemini com chamada de funções: devolve a ferramenta escolhida ou o texto da resposta.
type Entrada={key:string,model?:string,instrucoes:string,historico:{de:'gerente'|'assistente',texto:string}[],texto:string,ferramentas:any[],fetcher?:typeof fetch};
type Saida={ferramenta:{nome:string,args:Record<string,any>}}|{texto:string};
const FALHA='O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.';
// Se o modelo escolhido demorar, cair ou estiver no limite, tenta uma vez este.
export const RESERVA='gemini-3.1-flash-lite';
const ESPERA=9000;
const corta=(t:unknown)=>String(t??'').slice(0,500);
export async function pedirAoGemini({key,model='gemini-3.5-flash-lite',instrucoes,historico,texto,ferramentas,fetcher=fetch}:Entrada):Promise<Saida>{
 const contents=[...historico.map(h=>({role:h.de==='gerente'?'user':'model',parts:[{text:corta(h.texto)}]})),{role:'user',parts:[{text:corta(texto)}]}];
 const body=JSON.stringify({
  systemInstruction:{parts:[{text:instrucoes}]},contents,tools:[{functionDeclarations:ferramentas}],toolConfig:{functionCallingConfig:{mode:'AUTO'}}
 });
 let limite=false;
 for(const modelo of [...new Set([model,RESERVA])]){
  let response:Response;
  try{response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,{
   method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(ESPERA),body});}
  catch(e){console.error('gemini: sem resposta',modelo,(e as Error)?.name);limite=false;continue;}
  if(!response.ok){
   // Só o código e a mensagem do Gemini vão para o log, nunca a chave.
   const erro=await response.text().catch(()=>'');
   console.error('gemini:',response.status,modelo,corta(erro).slice(0,300));
   limite=response.status===429;
   // Chave errada ou pedido recusado não melhoram trocando de modelo.
   if(response.status!==429&&response.status!==404&&response.status<500)break;
   continue;
  }
  let parts:any[];
  try{const data:any=await response.json();parts=data.candidates?.[0]?.content?.parts||[];}catch{throw Error(FALHA);}
  const chamada=parts.find(p=>p?.functionCall)?.functionCall;
  if(chamada)return {ferramenta:{nome:String(chamada.name),args:chamada.args&&typeof chamada.args==='object'?chamada.args:{}}};
  return {texto:parts.map(p=>p?.text||'').join('')};
 }
 throw Error(limite?'limite-gemini':FALHA);
}
