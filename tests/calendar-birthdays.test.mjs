import test from 'node:test';
import assert from 'node:assert/strict';
import {seedAdmin,actAdmin} from '../lib/flowagenda.mjs';
import {normalizeBirthday,birthdayLabel} from '../lib/client-birthday.mjs';
import {birthdayEventFor,eventFor,pushEvents,calendarChanges} from '../lib/calendar-core.mjs';
const now=Date.parse('2030-01-01T09:00:00-03:00');
function fixture(){
 const s=seedAdmin();s.settings.autoNext=false;
 s.clients=[{id:'c',name:'Ana',birthday:'12-31',consent:false}];
 s.staff=[{id:'p',name:'Lia',active:true,start:540,end:1080,break_start:0,break_end:0,services:['s']}];
 s.services=[{id:'s',name:'Manicure',duration:45,price:50}];
 s.appointments=[{id:'a',client_id:'c',service_id:'s',staff_id:'p',date:'2030-01-02',start:600,end:660,status:'booked',variant:'Em gel',addons:[{name:'Nail art'}]}];
 return s;
}
test('birthdays accept optional day/month, including leap day, and reject impossible dates',()=>{
 for(const [input,expected] of [['25/10','10-25'],['02-29','02-29'],['31/12','12-31'],['',''],[undefined,'']])assert.equal(normalizeBirthday(input),expected);
 for(const value of ['31/04','30/02','00/10','15/13','2020-10-25','25/1'])assert.throws(()=>normalizeBirthday(value),/aniversário|dia\/mês/);
 assert.equal(birthdayLabel('10-25'),'25/10');
});
test('customer edit preserves absent birthday, validates updates and allows clearing it',()=>{
 const s=fixture(),p={id:'c',name:'Ana',phone:'',consent:false};
 actAdmin(s,'client_save',p,now);assert.equal(s.clients[0].birthday,'12-31');
 actAdmin(s,'client_save',{...p,birthday:'29/02'},now);assert.equal(s.clients[0].birthday,'02-29');
 assert.throws(()=>actAdmin(s,'client_save',{...p,birthday:'31/02'},now),/aniversário/);assert.equal(s.clients[0].birthday,'02-29');
 actAdmin(s,'client_save',{...p,birthday:''},now);assert.equal(s.clients[0].birthday,'');
});
test('new booking stores birthday atomically and rejects invalid birthday without creating a client',()=>{
 const s=fixture(),p={date:'2030-01-03',start:600,staff_id:'p',service_id:'s',newClient:{name:'Bia',birthday:'31/04'}};
 assert.throws(()=>actAdmin(s,'book',p,now),/aniversário/);assert.equal(s.clients.length,1);
 p.newClient.birthday='15/08';actAdmin(s,'book',p,now);assert.equal(s.clients.at(-1).birthday,'08-15');assert.equal(s.appointments.at(-1).client_id,s.clients.at(-1).id);
});
test('calendar uses actual appointment duration, variants, extras, professional and stable color',async()=>{
 const s=fixture(),e=await eventFor('r',s,s.appointments[0],'2030-01-01');
 for(const text of ['Ana','Lia','Manicure','Em gel','Nail art'])assert.ok(e.summary.includes(text));
 assert.match(e.description,/Duração: 60 minutos/);assert.match(e.description,/Santa Cor/);assert.equal(e.end.dateTime,'2030-01-02T11:00:00-03:00');
 s.staff.push({id:'x',name:'Outra'});s.staff.reverse();assert.equal((await eventFor('r',s,s.appointments[0],'2030-01-01')).colorId,e.colorId);
 assert.equal(e.attendees,undefined);
});
test('birthday is annual all-day and free, with exclusive end across year and leap-day fallback',async()=>{
 const c=fixture().clients[0],e=await birthdayEventFor('r',c);
 assert.equal(e.start.date,'2000-12-31');assert.equal(e.end.date,'2001-01-01');assert.deepEqual(e.recurrence,['RRULE:FREQ=YEARLY']);assert.equal(e.transparency,'transparent');assert.equal(e.attendees,undefined);
 c.birthday='02-29';const leap=await birthdayEventFor('r',c);assert.equal(leap.id,e.id);assert.equal(leap.end.date,'2000-03-01');assert.match(leap.recurrence[0],/BYMONTHDAY=-1/);
});
test('renaming, changing and removing birthdays updates one series; removed clients clean up their events',async()=>{
 const s=fixture(),calls=[],call=async(path,method,body)=>{calls.push({path,method,body});return {}};
 let entries=await pushEvents('r',s,'2030-01-01','cal',{},call);assert.equal(calls.length,2);
 calls.length=0;s.clients[0].name='Ana Maria';s.clients[0].birthday='10-25';
 entries=await pushEvents('r',s,'2030-01-01','cal',entries,call);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.method==='PATCH'));
 calls.length=0;s.clients[0].birthday='';entries=await pushEvents('r',s,'2030-01-01','cal',entries,call);assert.equal(calls.length,1);assert.equal(calls[0].method,'DELETE');
 calls.length=0;s.clients[0].birthday='01-10';entries=await pushEvents('r',s,'2030-01-01','cal',entries,call);assert.equal(calls[0].method,'POST');
 calls.length=0;s.clients=[];s.appointments=[];await pushEvents('r',s,'2030-01-01','cal',entries,call);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.method==='DELETE'));
});
test('bounded initial import resumes and pending requests do not become bookings',async()=>{
 const s=fixture();s.appointments[0].status='requested';s.clients=Array.from({length:50},(_,i)=>({id:'c'+i,name:'Cliente '+i,birthday:'08-15'}));
 const remote=new Map(),call=async(path,method,body)=>{if(method==='DELETE'){remote.delete(path.split('/').at(-1));return {}};remote.set(body.id,body);return {}};
 let entries={};for(let i=0;i<3;i++)entries=await pushEvents('r',s,'2030-01-01','cal',entries,call,{limit:20});
 assert.equal(remote.size,50);assert.ok([...remote.values()].every(e=>e.start.date));assert.equal((await calendarChanges('r',s,'2030-01-01',entries)).length,0);
});
test('clearing a birthday after an uncertain insertion deletes the orphan on retry',async()=>{
 const s=fixture();s.appointments=[];let entries;
 try{await pushEvents('r',s,'2030-01-01','cal',{},async()=>{throw Error('timeout')});}catch(e){entries=e.entries;}
 assert.ok(entries);s.clients[0].birthday='';let method='';await pushEvents('r',s,'2030-01-01','cal',entries,async(p,m)=>{method=m;return {}});assert.equal(method,'DELETE');
});
