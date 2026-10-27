import {reviewGateway} from './review-isolation.mjs';
import {supportPages} from './support-pages.mjs';
import {postingRulesPage} from './posting-rules-page.mjs';
export async function reviewSurface(request,env,ctx,app,files,scripts){
 const url=new URL(request.url);
 if(supportPages[url.pathname]&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:supportPages[url.pathname],{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
 if(url.pathname==='/api/review')return reviewGateway(request,env,(value,nextEnv)=>app.fetch(value,nextEnv,ctx));
 if(url.pathname==='/posting-rules.html'&&['GET','HEAD'].includes(request.method))return new Response(request.method==='HEAD'?null:postingRulesPage(url.searchParams.get('lang')??'ja'),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
 if(url.pathname==='/review')return Response.redirect(url.origin+'/review/',308);
 if(url.pathname.startsWith('/review/')){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  const file=files[url.pathname==='/review/'?'index.html':url.pathname.slice('/review/'.length)];
  if(!file)return new Response('Not found',{status:404});
  return new Response(request.method==='HEAD'?null:file,{headers:{'Content-Type':url.pathname.endsWith('.js')?'text/javascript; charset=utf-8':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(self)','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 if(scripts[url.pathname])return new Response(request.method==='HEAD'?null:scripts[url.pathname],{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 const response=await app.fetch(request,env,ctx);
 if(request.method!=='GET'||!response.ok||!['/','/index.html','/week/','/week/index.html','/__ios/index.html'].includes(url.pathname)||!response.headers.get('Content-Type')?.includes('text/html'))return response;
 let html=await response.text();for(const path of Object.keys(scripts))html=html.replaceAll(path+'?ui=20261027-support',path+'?ui=20261027-human-review');
 const headers=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])headers.delete(name);headers.set('Cache-Control','no-store');return new Response(html,{headers});
}
