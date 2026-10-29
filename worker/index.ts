import handler from "vinext/server/fetch-handler";
import {runWhatsAppSchedule} from '../lib/whatsapp-scheduler';

export default {
 ...handler,
 async scheduled(_controller:ScheduledController,env:Cloudflare.Env) {
  await runWhatsAppSchedule(env);
 },
};
