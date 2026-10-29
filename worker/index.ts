import handler from "vinext/server/fetch-handler";
import {runWhatsAppSchedule} from '../lib/whatsapp-scheduler';

// Cabeçalhos de segurança em toda resposta: o painel não pode ser aberto dentro de outro site (um site
// falso que esconde o painel atrás de botões e engana o clique), o navegador não adivinha o tipo de arquivo
// e o endereço completo não vai para outros sites quando alguém clica num link.
const SEGURANCA:Record<string,string>={
 'X-Frame-Options':'DENY',
 'Content-Security-Policy':"frame-ancestors 'none'",
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'strict-origin-when-cross-origin',
 'Strict-Transport-Security':'max-age=31536000',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
};

const worker:ExportedHandler<Cloudflare.Env>={
 ...handler,
 async fetch(request,env,ctx){
  const resposta=await handler.fetch!(request as any,env,ctx),final=new Response(resposta.body,resposta);
  for(const [nome,valor] of Object.entries(SEGURANCA))if(!final.headers.has(nome))final.headers.set(nome,valor);
  return final;
 },
 async scheduled(_controller,env) {
  await runWhatsAppSchedule(env);
 },
};
export default worker;
