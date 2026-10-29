// Cliente do Gemini com chamada de funções: devolve a ferramenta escolhida ou o texto da resposta.
type Entrada={key:string,model?:string,instrucoes:string,historico:{de:'gerente'|'assistente',texto:string}[],texto:string,ferramentas:any[],fetcher?:typeof fetch};
type Saida={ferramenta:{nome:string,args:Record<string,any>}}|{texto:string};
const FALHA='O assistente não respondeu agora. Tente de novo em instantes ou use os botões do painel.';
const corta=(t:unknown)=>String(t??'').slice(0,500);
export async function pedirAoGemini({key,model='gemini-3.5-flash-lite',instrucoes,historico,texto,ferramentas,fetcher=fetch}:Entrada):Promise<Saida>{
 const contents=[...historico.map(h=>({role:h.de==='gerente'?'user':'model',parts:[{text:corta(h.texto)}]})),{role:'user',parts:[{text:corta(texto)}]}];
 let response:Response;
 try{response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
  method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},signal:AbortSignal.timeout(15000),body:JSON.stringify({
   systemInstruction:{parts:[{text:instrucoes}]},contents,tools:[{functionDeclarations:ferramentas}],toolConfig:{functionCallingConfig:{mode:'AUTO'}}
  })});}catch{throw Error(FALHA);}
 if(response.status===429)throw Error('limite-gemini');
 if(!response.ok)throw Error(FALHA);
 let parts:any[];
 try{const data:any=await response.json();parts=data.candidates?.[0]?.content?.parts||[];}catch{throw Error(FALHA);}
 const chamada=parts.find(p=>p?.functionCall)?.functionCall;
 if(chamada)return {ferramenta:{nome:String(chamada.name),args:chamada.args&&typeof chamada.args==='object'?chamada.args:{}}};
 return {texto:parts.map(p=>p?.text||'').join('')};
}
