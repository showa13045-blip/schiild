import {receptionManageHtml,receptionCollectHtml,receptionScript,receptionLinksScript} from './reception-pages.mjs';
import {receptionCopy} from './reception-copy.mjs';
import {receptionQr} from '../../demo/server/reception-qr.mjs';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(self)','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"};
function response(body,type='text/html',extra={}){return new Response(body,{headers:{...headers,'Content-Type':type+'; charset=utf-8',...extra}});}
function widgetClient(settings,labels){const source=document.currentScript;if(!source||document.querySelector('[data-schiild-reception="'+settings.key+'"]'))return;const section=document.createElement('div');section.setAttribute('data-schiild-reception',settings.key);for(const [url,label]of [[settings.receptionUrl,labels.camera],[settings.viewUrl,labels.openApp]]){const link=document.createElement('a');link.href=url;link.textContent=label;link.rel='noreferrer';link.style.cssText='display:inline-block;margin:8px 16px 8px 0;text-underline-offset:4px';section.append(link);}source.after(section);}
export async function receptionSurface(request,fetchOriginal,{publicInfo}={}){
 const url=new URL(request.url),route=url.pathname.match(/^\/collect\/([a-f0-9]{32})\/(view\/|qr\.svg|widget\.js)?$/),manage=url.pathname==='/atelier-reception/';
 if(manage||route||['/reception/app-v1.js','/reception/links-v1.js'].includes(url.pathname)){
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  if(request.method==='HEAD')return response(null,url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.svg')?'image/svg+xml':'text/html');
  if(manage)return response(receptionManageHtml);
  if(url.pathname==='/reception/app-v1.js')return response(receptionScript,'text/javascript');
  if(url.pathname==='/reception/links-v1.js')return response(receptionLinksScript,'text/javascript');
  if(route[2]==='qr.svg')return response(receptionQr(route[1]),'image/svg+xml',url.searchParams.get('download')==='1'?{'Content-Disposition':'attachment; filename="schiild-reception.svg"'}:{});
  if(route[2]==='widget.js'){
   const info=await publicInfo?.(route[1]);if(!info)return response('/* Reception unavailable. */','text/javascript');const language=url.searchParams.get('lang')||'ja',text=receptionCopy[language]??receptionCopy.en;return response('('+widgetClient.toString()+')('+JSON.stringify({key:info.key,receptionUrl:info.receptionUrl,viewUrl:info.viewUrl})+','+JSON.stringify({camera:text.camera,openApp:text.openApp})+');','text/javascript',{'Cross-Origin-Resource-Policy':'cross-origin'});
  }
  return response(receptionCollectHtml);
 }
 const original=await fetchOriginal(request);if(request.method!=='GET'||original.status!==200||!original.headers.get('Content-Type')?.includes('text/html')||!['/','/index.html','/__ios/index.html'].includes(url.pathname))return original;
 const body=(await original.text()).replace('</body>','<script src="/reception/links-v1.js" defer></script></body>'),updated=new Headers(original.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])updated.delete(name);updated.set('Cache-Control','no-store');return new Response(body,{status:original.status,headers:updated});
}
