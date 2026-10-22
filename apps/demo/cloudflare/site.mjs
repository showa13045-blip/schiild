// DEMO ONLY. Static UI and API share the same Cloudflare Worker and origin.
import {gateway} from './gateway.mjs';
import {imageMigration} from './image-migration.mjs';
import {whatsappWebhook} from './whatsapp-webhook.mjs';
export async function siteRequest(request,env){
 const url=new URL(request.url);
 if(url.hostname==='www.schiild.app'){url.hostname='schiild.app';url.protocol='https:';return Response.redirect(url.href,308);}
 if(url.pathname==='/api/auth/whatsapp')return whatsappWebhook(request,env);
 if(url.pathname==='/api/migration/images')return imageMigration(request,env);
 if(url.pathname==='/api/atelier'||!env.ASSETS)return gateway(request,env);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
 // Image blobs and server configuration never belong to the public asset namespace.
 if(/\.(?:php|env|sqlite|sql|tar|gz|ps1)$/i.test(url.pathname)||/^\/(?:images|private|\.deploy-private)(?:\/|$)/.test(url.pathname))return new Response('Not found',{status:404});
 const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');headers.set('Permissions-Policy','camera=(self)');
 if(/(?:\/|\/index\.html|\/deployment\.json|\/push-worker\.js|\/manifest\.webmanifest)$/.test(url.pathname))headers.set('Cache-Control','no-cache, must-revalidate');
 if(/^\/week\/art\/[a-f0-9]{24}\.png$/.test(url.pathname))headers.set('Cache-Control','public, max-age=31536000, immutable, no-transform');
 if(url.pathname==='/manifest.webmanifest')headers.set('Content-Type','application/manifest+json');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
