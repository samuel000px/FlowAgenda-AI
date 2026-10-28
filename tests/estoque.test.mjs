import test from 'node:test';
import assert from 'node:assert/strict';
import {stockAction,stockView} from '../lib/estoque.mjs';

test('estoque: cadastrar, entrada, saída sem passar de zero e lista de reposição',()=>{
 const s={};
 stockAction(s,'stock_save',{name:'Esmalte em gel',place:'Expositor 1',qty:3,min:5});
 stockAction(s,'stock_save',{name:'Algodão',place:'Armário',qty:10,min:2});
 const gel=s.stock[0];
 assert.deepEqual(stockView(s).low.map(i=>i.name),['Esmalte em gel']);
 stockAction(s,'stock_move',{id:gel.id,delta:4,reason:'compra'},'Lili');
 assert.equal(gel.qty,7);assert.equal(stockView(s).low.length,0);
 assert.throws(()=>stockAction(s,'stock_move',{id:gel.id,delta:-8}),/Só há 7/);
 stockAction(s,'stock_move',{id:gel.id,delta:-2});
 assert.equal(s.stockLog.length,2);assert.equal(s.stockLog[0].by,'Lili');
 assert.deepEqual(stockView(s,'armario').places.map(([l])=>l),['Armário'],'busca sem acento');
 stockAction(s,'stock_remove',{id:gel.id});assert.equal(s.stock.length,1);
 assert.throws(()=>stockAction(s,'stock_save',{name:'',qty:1}),/nome/);
});
