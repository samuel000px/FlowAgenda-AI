import handler from "vinext/server/fetch-handler";
import {runWhatsAppSchedule} from '../lib/whatsapp-scheduler';
import {runCalendarSchedule} from '../lib/google-calendar';

export default {
 ...handler,
 async scheduled(_controller:ScheduledController,env:Cloudflare.Env) {
  // Calendar retries must run even when WhatsApp is disconnected or fails.
  const results=await Promise.allSettled([runWhatsAppSchedule(env),runCalendarSchedule(env)]);
  const failed=results.find(r=>r.status==='rejected');
  if(failed?.status==='rejected')throw failed.reason;
 },
};
