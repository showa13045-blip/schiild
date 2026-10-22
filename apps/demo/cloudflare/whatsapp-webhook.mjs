import {createHmac,timingSafeEqual} from 'node:crypto';
import {readWhatsAppConfig} from '../server/whatsapp-accounts.mjs';
const reply=(status=200)=>new Response(status===200?'OK':'Unavailable',{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function whatsappWebhook(request,env){
 if(request.method!=='POST')return reply(405);
 const config=readWhatsAppConfig(env.WHATSAPP_LOGIN_CONFIG);
 if(!config)return reply(503);
 const signature=request.headers.get('X-Webhook-Signature');
 if(!/^[a-f0-9]{64}$/.test(signature??''))return reply(401);
 if(request.headers.get('X-Webhook-Event')!=='whatsapp.message.received')return reply(400);
 if(Number(request.headers.get('content-length'))>131072)return reply(413);
 try{
  const reader=request.body?.getReader(),chunks=[];let size=0;
  if(reader)while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>131072){await reader.cancel();return reply(413);}chunks.push(value);}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
  const expected=createHmac('sha256',config.webhookSecret).update(raw).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))return reply(401);
  let payload;try{payload=JSON.parse(new TextDecoder().decode(raw));}catch{return reply(400);}
  const stub=env.ATELIERS.get(env.ATELIERS.idFromName('shared-demo-v1'));
  await stub.receiveWhatsApp(payload);
  return reply();
 }catch{return reply(503);}
}
