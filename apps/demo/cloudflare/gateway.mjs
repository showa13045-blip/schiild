const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export async function gateway(request,env){
 const url=new URL(request.url),origin=request.headers.get('origin');
 const allowed=String(env.ALLOWED_ORIGINS??'').split(',').map(x=>x.trim()).filter(Boolean);
 const cors=origin&&allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'}:{};
 if(origin&&!allowed.includes(origin))return json({error:'forbidden'},403);
 if(url.pathname!=='/api/atelier')return json({error:'not_found'},404,cors);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return json({error:'method'},405,cors);
 try{
  const ip=request.headers.get('cf-connecting-ip')??'local';
  if(env.RATE_LIMITER&&!((await env.RATE_LIMITER.limit({key:ip})).success))return json({error:'retry'},429,cors);
  if(Number(request.headers.get('content-length'))>4100000)return json({error:'image_invalid'},413,cors);
  const reader=request.body?.getReader();let length=0;const chunks=[];
  if(reader)while(true){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>4100000){await reader.cancel();return json({error:'image_invalid'},413,cors);}chunks.push(value);}
  const all=new Uint8Array(length);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
  const credential=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(!/^[a-f0-9]{64}$/.test(credential??''))return json({error:'unauthorized'},401,cors);
  const stub=env.ATELIERS.get(env.ATELIERS.idFromName('shared-demo-v1'));
  // JSON parsing and image processing belong to the Durable Object CPU budget.
  const result=await stub.fetch(new Request('https://internal/execute',{method:'POST',headers:{Authorization:`Bearer ${credential}`,'Content-Type':'application/json','X-Demo-IP':ip},body:all}));
  return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors}});
 }catch{return json({error:'unavailable'},503,cors);}
}
