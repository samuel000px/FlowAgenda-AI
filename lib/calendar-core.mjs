const encoder = new TextEncoder();
export const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export async function digest(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2,'0')).join('');
}
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
export const nonce = () => b64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function challenge(verifier) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function key(secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || '')) throw Error('Configure CALENDAR_ENCRYPTION_KEY no servidor.');
  return crypto.subtle.importKey('raw',Uint8Array.from(secret.match(/../g), x => parseInt(x,16)), 'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(value, secret, room) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(room)},await key(secret),encoder.encode(JSON.stringify(value)));
  return `${b64(iv)}.${b64(new Uint8Array(bytes))}`;
}
export async function unseal(value, secret, room) {
  const [iv, bytes] = value.split('.');
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encoder.encode(room)},await key(secret),unb64(bytes));
  return JSON.parse(new TextDecoder().decode(plain));
}
export function validDay(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0,10) === day;
}
export async function eventFor(room, state, appointment, day) {
  day=appointment.date||day;
  if(!validDay(day)) throw Error('Escolha uma data válida.');
  const lookup = (table,id) => state[table].find(item=>item.id===id).name;
  const time = minute => new Date(Date.parse(`${day}T00:00:00Z`)+minute*60000).toISOString().slice(0,19)+'-03:00';
  return {
    id: await digest(`${room}:${appointment.id}`),
    summary: `${lookup('clients',appointment.client_id)} · ${lookup('services',appointment.service_id)}`,
    description: `Santa Cor · Agenda de atendimentos\nProfissional: ${lookup('staff',appointment.staff_id)}\nPresença: ${appointment.attendance==='yes'?'confirmada':'aguardando confirmação'}\nGerencie este atendimento pelo painel da Santa Cor.`,
    start:{dateTime:time(appointment.start),timeZone:'America/Fortaleza'},
    end:{dateTime:time(appointment.end),timeZone:'America/Fortaleza'},
    extendedProperties:{private:{encaixaRoom:room,encaixaAppointment:appointment.id}},
    reminders:{useDefault:false}
  };
}
export async function googleCall(access, path, method='GET', body, fetcher=fetch) {
  const response = await fetcher(`https://www.googleapis.com/calendar/v3${path}`,{method,headers:{Authorization:`Bearer ${access}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
  if(!response.ok){const error=new Error(response.status===401?'A autorização Google expirou. Reconecte a conta.':response.status===429?'O Google limitou as solicitações. Tentaremos novamente.':`Google Agenda indisponível (HTTP ${response.status}).`);error.status=response.status;throw error;}
  return response.status===204?null:response.json();
}
// Stable IDs make retries safe, including when an insert succeeded before a timeout.
export async function pushEvents(room, state, day, calendarId, previous, call) {
  const entries={...previous}, base=`/calendars/${encodeURIComponent(calendarId)}/events`;
  for (let offset=0;offset<state.appointments.length;offset+=4) {
    const results=await Promise.allSettled(state.appointments.slice(offset,offset+4).map(async appointment=>{
      const body=await eventFor(room,state,appointment,day), signature=appointment.status==='cancelled'?'deleted':await digest(JSON.stringify(body));
      if(entries[body.id]===signature)return;
      if(signature==='deleted'){
        try{await call(`${base}/${body.id}`,'DELETE')}catch(e){if(![404,410].includes(e.status))throw e;}
      }else{
        try{
          if(entries[body.id]&&entries[body.id]!=='deleted')await call(`${base}/${body.id}`,'PATCH',body);
          else await call(base,'POST',body);
        }catch(e){
          if(e.status===409)await call(`${base}/${body.id}`,'PATCH',body);
          else if([404,410].includes(e.status))await call(base,'POST',body);
          else throw e;
        }
      }
      entries[body.id]=signature;
    }));
    const failed=results.find(result=>result.status==='rejected');
    if(failed){const error=failed.reason;error.entries=entries;throw error;}
  }
  return entries;
}
