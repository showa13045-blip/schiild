import {getStore} from '@netlify/blobs';
import {ApiError,createAtelierService} from '../../server/atelier-service.mjs';

const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export default async function handler(request){
 if(request.method!=='POST')return new Response(JSON.stringify({error:'method'}),{status:405,headers});
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return new Response(JSON.stringify({error:'forbidden'}),{status:403,headers});
 try{
  const text=await request.text();if(text.length>4100000)throw new ApiError(413,'image_invalid');
  let body;try{body=JSON.parse(text);}catch{throw new ApiError(400,'invalid');}
  if(!body||typeof body!=='object')throw new ApiError(400,'invalid');
  const service=createAtelierService(getStore({name:'schiild-shared-v1',consistency:'strong'}));
  const credential=request.headers.get('authorization')?.replace(/^Bearer /,'');
  return new Response(JSON.stringify(await service(body,credential)),{headers});
 }catch(error){
  const status=error instanceof ApiError?error.status:503;
  return new Response(JSON.stringify({error:error instanceof ApiError?error.code:'unavailable'}),{status,headers});
 }
}
export const config={rateLimit:{windowLimit:120,windowSize:60,aggregateBy:['ip'],action:'rate_limit'}};
