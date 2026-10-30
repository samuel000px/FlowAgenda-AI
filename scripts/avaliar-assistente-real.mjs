// Avaliação real, somente com dados inventados e sem gravar na agenda.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import ts from 'typescript';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {FERRAMENTAS,instrucoes,executarChamadas,orientarConfirmacao} from '../lib/assistente/ferramentas.mjs';
const env={...parseEnv(readFileSync(new URL('../.dev.vars',import.meta.url),'utf8')),...process.env};
if(!env.GEMINI_API_KEY)throw Error('GEMINI_API_KEY não configurada.');
const js=ts.transpileModule(readFileSync(new URL('../lib/assistente/gemini.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {pedirAoGemini}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const now=Date.parse('2026-10-29T08:00:00-03:00');
const s=seedAdmin();s.salon.name='Salão fictício de avaliação';
s.staff=[{id:'P1',name:'Lia',active:true,start:540,end:1080,break_start:720,break_end:780,services:['S1']},{id:'P2',name:'Bia',active:true,start:540,end:1080,break_start:720,break_end:780,services:['S1']}];
s.clients=[{id:'C1',name:'Ana Silva',phone:''},{id:'C2',name:'Ana Souza',phone:''}];
s.appointments=[{id:'A1',client_id:'C1',service_id:'S1',staff_id:'P1',date:'2026-10-30',start:600,end:645,price:45,status:'booked',attendance:'unknown',result:null}];
s.stock=[{id:'I1',name:'Acetona',qty:3,min:2,place:'Expositor da entrada',unit:'frascos'}];
const cases=[
 ['agenda','Quem a Lia atende amanhã?','consultar_agenda',{data:'2026-10-30',profissional:'Lia'}],
 ['erro-digitacao','qem a lia atendi amanha?','consultar_agenda',{data:'2026-10-30',profissional:'Lia'}],
 ['resumo','Resumo de hoje','consultar_resumo_dia',{}],
 ['estoque','Tem acetona?','consultar_estoque',{}],
 ['apelido','O que tem no painel da entrada?','consultar_estoque',{}],
 ['cliente-ambigua','Como anda a Ana?','consultar_historico_cliente',{}],
 ['remarcar','Passe a Ana Silva de amanhã às 10h para sábado às 15h','remarcar_atendimento',{cliente:'Ana Silva',data:'2026-10-30',nova_data:'2026-10-31',nova_hora:'15:00'}],
 ['ausencia','A Lia não vem amanhã, redistribui os horários dela','registrar_ausencia_profissional',{profissional:'Lia',data:'2026-10-30'}],
 ['desfazer','Desfaz a última alteração','desfazer_ultima_acao',{}],
 ['data-impossivel','Quem a Lia atende em 31/02/2027?',null,{}],
 ['multiplos','Me mostre a agenda da Lia amanhã e a quantidade de acetona no estoque','MULTIPLO',{}],
 ['continuacao','E da Bia?','consultar_agenda',{profissional:'Bia',data:'2026-10-30'},[{de:'gerente',texto:'Quem a Lia atende amanhã?'},{de:'assistente',texto:'Lia atende Ana Silva às 10h em 30/10.'}]],
 ['trocar','Troque a Ana Silva de amanhã às 10h da Lia para Bia, no mesmo horário','trocar_profissional',{cliente:'Ana Silva',data:'2026-10-30',nova_profissional:'Bia'}],
 ['livres','Tem horário para manicure com Bia amanhã?','consultar_horarios_livres',{data:'2026-10-30',servico:'Manicure',profissional:'Bia'}],
 ['cliente-inexistente','Mostra o histórico da cliente Zuleica Inventada','consultar_historico_cliente',{}],
 ['falta-cliente','A cliente Ana Silva faltou hoje, registra a falta dela',null,{}],
 ['alteracao-nao-suportada','Apague todas as clientes do cadastro',null,{}],
 ['confirmacao-texto','Sim, pode confirmar a remarcação',null,{},[{de:'gerente',texto:'Passe Ana Silva de amanhã às 10h para sábado às 15h'},{de:'assistente',texto:'Plano: Remarcar Ana Silva: 30/10 10:00 → 31/10 15:00. Aguarda confirmação no cartão.'}]],
 ['duas-alteracoes','Mude Ana Silva de amanhã para sábado às 15h e depois troque a profissional para Bia',null,{}],
 ['corrigir-contexto','Não, quero sábado, com a mesma profissional','consultar_agenda',{data:'2026-10-31',profissional:'Lia'},[{de:'gerente',texto:'Agenda da Lia amanhã'},{de:'assistente',texto:'Agenda de 30/10 com Lia: 10:00 Ana Silva.'}]],
];
const rows=[];mkdirSync(new URL('../.sites-runtime/',import.meta.url),{recursive:true});
for(let rodada=1;rodada<=Number(process.env.AVAL_RODADAS||2);rodada++)for(const [id,texto,fn,args,historico=[]] of cases){
 if(process.env.AVAL_CASOS&&!process.env.AVAL_CASOS.split(',').includes(id))continue;
 const started=Date.now();let result,output,status='REVISAR';
 try{
  const orientacao=orientarConfirmacao(texto,historico);
  result=orientacao?{texto:orientacao}:await pedirAoGemini({key:env.GEMINI_API_KEY,model:env.GEMINI_MODEL||undefined,instrucoes:instrucoes(s,now),historico,texto,ferramentas:FERRAMENTAS});
  if(result.ferramenta||result.ferramentas){const calls=result.ferramentas||[result.ferramenta];output=executarChamadas(structuredClone(s),calls,now);status=calls.length===1&&calls[0].nome===fn&&Object.entries(args).every(([k,v])=>calls[0].args[k]===v)?'OK':'REVISAR';if(fn==='MULTIPLO'&&calls.some(c=>c.nome==='consultar_agenda')&&calls.some(c=>c.nome==='consultar_estoque')&&/Acetona/.test(output.texto))status='OK';}
  else {output={texto:result.texto};status='REVISAR';}
 }catch(e){status='ERRO_API';output={erro:env.GEMINI_API_KEY?String(e.message).split(env.GEMINI_API_KEY).join('[redigido]'):String(e.message)};}
 rows.push({rodada,id,pergunta:texto,esperado:{funcao:fn,args},status,ms:Date.now()-started,result,output});
 writeFileSync(new URL('../.sites-runtime/avaliacao-assistente-real.json',import.meta.url),JSON.stringify({data:new Date().toISOString(),modelo:env.GEMINI_MODEL||'gemini-3.5-flash-lite',relogioFicticio:'2026-10-29 08:00 -03:00',rows},null,2));
 console.log(rodada,id,status,Date.now()-started+'ms');
 await new Promise(resolve=>setTimeout(resolve,4000));
}
