import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin} from '../lib/flowagenda.mjs';
import {digest,eventFor,pushEvents} from '../lib/calendar-core.mjs';
function fixture(){
 const s=seedAdmin();s.settings.autoNext=false;
 s.clients=[{id:'c',name:'Ana',birthday:'10-30',consent:false}];
 s.staff=[{id:'p',name:'Lia'}];s.services=[{id:'s',name:'Manicure',duration:45,price:50}];
 s.appointments=[{id:'a',client_id:'c',service_id:'s',staff_id:'p',date:'2030-01-02',start:600,end:660,status:'booked',variant:'Em gel',addons:[{name:'Nail art'}]}];
 return s;
}
test('calendar keeps real duration, service details and stable professional color',async()=>{
 const s=fixture(),e=await eventFor('r',s,s.appointments[0],'2030-01-01');
 for(const text of ['Ana','Lia','Manicure','Em gel','Nail art'])assert.ok(e.summary.includes(text));
 assert.match(e.description,/Duração: 60 minutos/);assert.equal(e.end.dateTime,'2030-01-02T11:00:00-03:00');
 s.staff.push({id:'x',name:'Outra'});s.staff.reverse();assert.equal((await eventFor('r',s,s.appointments[0],'2030-01-01')).colorId,e.colorId);
 assert.equal(e.attendees,undefined);
});
test('retired birthday events are removed while appointments remain and old client data never recreates them',async()=>{
 const s=fixture(),calls=[],call=async(path,method,body)=>{calls.push({path,method,body});return {}};
 let entries=await pushEvents('r',s,'2030-01-01','cal',{},call);
 assert.equal(calls.length,1);assert.ok(calls[0].body.start.dateTime);
 const oldBirthday=await digest('r:birthday:c');entries[oldBirthday]='old-birthday-signature';
 calls.length=0;entries=await pushEvents('r',s,'2030-01-01','cal',entries,call);
 assert.deepEqual(calls,[{path:'/calendars/cal/events/'+oldBirthday,method:'DELETE',body:undefined}]);
 calls.length=0;await pushEvents('r',s,'2030-01-01','cal',entries,call);assert.equal(calls.length,0);
});
test('removing an uncertain insertion still cleans the event up on retry',async()=>{
 const s=fixture();let entries;
 try{await pushEvents('r',s,'2030-01-01','cal',{},async()=>{throw Error('timeout')});}catch(e){entries=e.entries;}
 assert.ok(entries);s.appointments=[];let method='';await pushEvents('r',s,'2030-01-01','cal',entries,async(p,m)=>{method=m;return {}});assert.equal(method,'DELETE');
});
