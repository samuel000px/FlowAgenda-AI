import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {executarChamadas,executarFerramenta,orientarConfirmacao} from '../lib/assistente/ferramentas.mjs';
const now=Date.parse('2026-10-29T08:00:00-03:00');
test('orientação não bloqueia correções do plano nem respostas a esclarecimentos',()=>{
 const plano=[{de:'assistente',texto:'Plano: Remarcar Ana'}];
 assert.match(orientarConfirmacao('Sim, pode confirmar a remarcação',plano),/Confirmar/);
 assert.equal(orientarConfirmacao('Sim, mas às 16h',plano),null);
 assert.equal(orientarConfirmacao('Sim',[{de:'assistente',texto:'Você quer manicure?'}]),null);
 assert.equal(orientarConfirmacao('Sim'),null);
});
test('agenda e estoque retornam ambas as respostas sem mutação',()=>{
 const s=seedAdmin();s.stock=[{name:'Acetona',qty:3,place:'Entrada'}];
 const before=structuredClone(s);
 const r=executarChamadas(s,[{nome:'consultar_agenda',args:{data:'2026-10-30'}},{nome:'consultar_estoque',args:{busca:'acetona'}}],now);
 assert.match(r.texto,/30\/10/);assert.match(r.texto,/Acetona \(3\)/);assert.deepEqual(s,before);
});
test('lotes mistos, desconhecidos ou de alterações não deixam planos parciais',()=>{
 for(const nome of ['remarcar_atendimento','desfazer_ultima_acao','confirmar','__proto__']){
  const s=seedAdmin(),before=structuredClone(s);
  const r=executarChamadas(s,[{nome:'consultar_resumo_dia',args:{}},{nome,args:{}}],now);
  assert.equal(r.tipo,'pergunta');assert.deepEqual(s,before);
 }
});
test('limite de consultas é aplicado antes de executar e validação explica data impossível',()=>{
 const s=seedAdmin(),before=structuredClone(s);
 assert.equal(executarChamadas(s,Array(5).fill({nome:'consultar_resumo_dia',args:{}}),now).tipo,'pergunta');
 const r=executarFerramenta(s,'consultar_agenda',{data:'2027-02-31'},now);
 assert.match(r.texto,/não existe/);assert.equal(r.tipo,'pergunta');assert.deepEqual(s,before);
});
