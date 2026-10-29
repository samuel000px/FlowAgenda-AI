// Ferramentas que o Gemini pode chamar e o despachante que as executa. Os argumentos vêm do modelo e não
// são confiáveis: só as chaves conhecidas de cada ferramenta passam, com data, hora e tamanho conferidos.
import {today} from '../flowagenda.mjs';
import {acharCliente,consultarAgenda,consultarHistoricoCliente,consultarHorariosLivres,consultarResumoDia,diaValido,pergunta,resposta} from './consultas.mjs';
import {planoAusencia,planoDesfazer,planoRemarcar,planoTrocarProfissional} from './planos.mjs';

const DATA='Data AAAA-MM-DD',HORA='Hora HH:MM';
const fn=(name,description,props={},required=[])=>({name,description,parameters:{type:'OBJECT',properties:Object.fromEntries(Object.entries(props).map(([k,d])=>[k,{type:'STRING',description:d}])),required}});

export const FERRAMENTAS=[
  fn('consultar_agenda','Lista os atendimentos de um dia, de todas ou de uma profissional.',{data:DATA,profissional:'Nome da profissional'},['data']),
  fn('consultar_horarios_livres','Mostra os horários livres de um serviço num dia.',{data:DATA,servico:'Nome do serviço',profissional:'Nome da profissional',opcao:'Opção do serviço, se houver (ex.: Cabelo longo)'},['data','servico']),
  fn('buscar_cliente','Acha uma cliente pelo nome ou final do celular e mostra a ficha dela.',{busca:'Nome ou final do celular'},['busca']),
  fn('consultar_historico_cliente','Mostra visitas, faltas, gasto e próximos horários de uma cliente.',{cliente:'Nome da cliente'},['cliente']),
  fn('consultar_resumo_dia','Resumo do dia: atendimentos, receita, recebido e pendências. Sem data, é hoje.',{data:DATA}),
  fn('remarcar_atendimento','Monta o plano para mudar o dia, a hora ou a profissional de um atendimento.',{cliente:'Nome da cliente',data:DATA+' atual do atendimento',hora:HORA+' atual, se a cliente tiver mais de um',nova_data:DATA+' nova',nova_hora:HORA+' nova',nova_profissional:'Nome da nova profissional'},['cliente','data']),
  fn('trocar_profissional','Monta o plano para trocar a profissional de um atendimento, no mesmo horário.',{cliente:'Nome da cliente',data:DATA+' do atendimento',hora:HORA+' do atendimento',nova_profissional:'Nome da nova profissional'},['cliente','data','nova_profissional']),
  fn('registrar_ausencia_profissional','Monta o plano para redistribuir a agenda de uma profissional que vai faltar num dia.',{profissional:'Nome da profissional que falta',data:DATA},['profissional','data']),
  fn('desfazer_ultima_acao','Monta o plano para desfazer a última mudança feita pelo assistente.'),
];

const DIAS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
export function instrucoes(s,now=Date.now()){
  const dia=today(now),semana=DIAS[new Date(dia+'T12:00:00Z').getUTCDay()];
  const equipe=(s.staff||[]).filter(p=>p.active!==false&&!p.removed).map(p=>p.name).join(', ');
  return `Você é o assistente do painel da gerência da ${s.salon?.name||'Santa Cor'}. Hoje é ${semana}, ${dia}. Equipe: ${equipe}. Responda em português, curto. Para qualquer pedido sobre agenda, clientes ou o dia, chame uma das funções; nunca invente horários, nomes ou valores. Se faltar informação (qual cliente, qual dia), pergunte em uma frase. Datas relativas ("amanhã", "sexta") viram AAAA-MM-DD a partir de hoje. Você não envia mensagens nem grava nada: mudanças viram um plano que a gerência confirma.`;
}

const hora=h=>/^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const MAX=100;
// Tipo de cada argumento (d=data, h=hora, t=texto); o que não está aqui é descartado.
const ARGS={
  consultar_agenda:{data:'d',profissional:'t'},
  consultar_horarios_livres:{data:'d',servico:'t',profissional:'t',opcao:'t'},
  buscar_cliente:{busca:'t'},
  consultar_historico_cliente:{cliente:'t'},
  consultar_resumo_dia:{data:'d'},
  remarcar_atendimento:{cliente:'t',data:'d',hora:'h',nova_data:'d',nova_hora:'h',nova_profissional:'t'},
  trocar_profissional:{cliente:'t',data:'d',hora:'h',nova_profissional:'t'},
  registrar_ausencia_profissional:{profissional:'t',data:'d'},
  desfazer_ultima_acao:{},
};
const EXIGIDOS=Object.fromEntries(FERRAMENTAS.map(f=>[f.name,f.parameters.required]));
const FALTA={d:'Qual dia você quer?',h:'Que horas? Preciso de um horário como 14:30.',t:'Pode dizer com outras palavras?'};
const PEDIR={cliente:'Qual cliente?',busca:'Qual cliente?',servico:'Qual serviço?',profissional:'Qual profissional?',nova_profissional:'Com qual profissional?'};

// Devolve os argumentos limpos ou {erro} com a pergunta para a gerente.
function limpar(nome,args){
  const modelo=ARGS[nome],origem=args&&typeof args==='object'?args:{},out={};
  for(const [k,tipo] of Object.entries(modelo)){
    const v=origem[k];
    if(v==null||v==='')continue;
    if(typeof v!=='string')return {erro:pergunta(FALTA[tipo])};
    const t=v.trim();
    if(t.length>MAX)return {erro:pergunta(tipo==='t'?'Esse texto ficou grande demais. Pode resumir?':FALTA[tipo])};
    if(tipo==='d'&&!diaValido(t))return {erro:pergunta(FALTA.d)};
    if(tipo==='h'&&!hora(t))return {erro:pergunta(FALTA.h)};
    out[k]=t;
  }
  for(const k of EXIGIDOS[nome])if(!out[k])return {erro:pergunta(modelo[k]==='d'?FALTA.d:PEDIR[k]||FALTA.t)};
  return {args:out};
}

// Plano novo vai para a lista da sala: sem vencidos, no máximo 5, o mais novo por último.
function guardar(s,plano,now){
  s.assistente??={planos:[],pacotes:[]};
  s.assistente.planos??=[];s.assistente.pacotes??=[];
  s.assistente.planos=[...s.assistente.planos.filter(p=>p.validoAte>=now),plano].slice(-5);
}
const comoPlano=(s,r,now)=>{
  if(!r.plano)return r;
  guardar(s,r.plano,now);return {tipo:'plano',plano:r.plano};
};
const ficha=(s,r,now)=>r.pergunta?pergunta(r.pergunta):consultarHistoricoCliente(s,{cliente:r.cliente},now);

const EXECUTORES={
  consultar_agenda:(s,a)=>consultarAgenda(s,a),
  consultar_horarios_livres:(s,a,now)=>consultarHorariosLivres(s,a,now),
  buscar_cliente:(s,a,now)=>ficha(s,acharCliente(s,a.busca),now),
  consultar_historico_cliente:(s,a,now)=>ficha(s,acharCliente(s,a.cliente),now),
  consultar_resumo_dia:(s,a,now)=>consultarResumoDia(s,a,now),
  remarcar_atendimento:(s,a,now)=>comoPlano(s,planoRemarcar(s,a,now),now),
  trocar_profissional:(s,a,now)=>comoPlano(s,planoTrocarProfissional(s,a,now),now),
  registrar_ausencia_profissional:(s,a,now)=>comoPlano(s,planoAusencia(s,a,now),now),
  desfazer_ultima_acao:(s,a,now)=>comoPlano(s,planoDesfazer(s,now),now),
};

export function executarFerramenta(s,nome,args,now=Date.now()){
  if(!Object.hasOwn(EXECUTORES,nome))return resposta('Ainda não sei fazer isso por aqui. Você encontra em Agenda.');
  const l=limpar(nome,args);if(l.erro)return l.erro;
  return EXECUTORES[nome](s,l.args,now);
}
