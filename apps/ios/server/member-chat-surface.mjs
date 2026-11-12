import {memberChatHtml,memberChatScript} from './member-chat-pages.mjs';
import {memberChatCopy} from './member-chat-copy.mjs';
import {automaticCopy} from './automatic-copy.mjs';
function inboxClient(catalog){
 const query=new URLSearchParams(location.search),review=query.get('mode')==='review',prefix=review?'schiild.review.':'',language=query.get('lang')||localStorage.getItem(prefix+'schiild.language.v1')||'ja',text=catalog[language]??catalog.en,key=prefix+'schiild.account.session.v2',endpoint=review?'/api/review':'/api/atelier',token=localStorage.getItem(key),heading=document.getElementById('title');
 if(heading)heading.textContent=text.notices;
 const section=document.createElement('section'),title=document.createElement('h2'),items=document.createElement('div'),older=document.createElement('button'),error=document.createElement('p');section.setAttribute('data-chat-notices','');title.textContent=text.announcementLabel;older.type='button';older.textContent=text.earlier;older.hidden=true;section.append(title,error,items,older);const original=document.getElementById('items'),label=document.createElement('h2');label.textContent=text.imageUpdates;original.before(section,label);
 let controller=null,invalid=false,cursor=null;
 function clear(){invalid=true;controller?.abort();items.replaceChildren();section.hidden=true;}
 async function api(action,values={}){if(!token||localStorage.getItem(key)!==token){clear();throw Error();}controller=new AbortController();const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...values}),signal:controller.signal,cache:'no-store'}),result=await response.json();if(invalid||localStorage.getItem(key)!==token){clear();throw Error();}if(!response.ok){if(response.status===401)clear();throw Error(text.failed);}return result;}
 const href=item=>'/chat/?'+new URLSearchParams({code:item.code,day:item.day,message:item.messageKey,lang:language,...(item.key?{notice:item.key}:{}),...(review?{mode:'review'}:{})});
 async function load(append=false){if(invalid||document.hidden)return;older.disabled=true;try{const result=await api('social.announcements.list',append&&cursor?{before:cursor}:{});if(!append)items.replaceChildren();for(const item of result.items){const row=document.createElement('article'),message=document.createElement('p'),link=document.createElement('a'),time=document.createElement('time');message.textContent=text.noticeBody;link.textContent=text.open;link.href=href(item);time.textContent=new Date(item.createdAt).toLocaleString(language);row.append(message,time,document.createElement('br'),link);items.append(row);}cursor=result.nextCursor;older.hidden=cursor===null;if(!items.children.length)items.textContent=text.empty;}catch(e){if(e.name!=='AbortError')error.textContent=text.failed;}finally{older.disabled=false;}}
 older.onclick=()=>void load(true);
 // This URL is understood by existing iOS builds. The fragment contains references only.
 const target=location.hash.match(/^#chat=([A-Z0-9]{8})\.(\d{4}-\d{2}-\d{2})\.([a-f0-9]{32})$/);
 if(target)void(async()=>{try{await api('social.chat.list',{code:target[1],day:target[2],around:target[3]});if(!invalid)location.replace(href({code:target[1],day:target[2],messageKey:target[3]}));}catch{error.textContent=text.failed;}})();else void load();
 document.getElementById('refresh')?.addEventListener('click',()=>void load());
 document.addEventListener('visibilitychange',()=>{if(document.hidden){controller?.abort();items.replaceChildren();}else if(!invalid)void load();});window.addEventListener('pagehide',()=>controller?.abort());window.addEventListener('storage',event=>{if(event.key===key||event.key===null||event.key==='schiild.account.erased.v1')clear();});
}
export const memberChatInboxScript='('+inboxClient.toString()+')('+JSON.stringify(memberChatCopy)+');';
const pageHeaders={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"};
function changed(response,body){const headers=new Headers(response.headers);for(const name of ['ETag','Last-Modified','Content-Length','Content-Encoding'])headers.delete(name);headers.set('Cache-Control','no-store');return new Response(body,{status:response.status,headers});}
export async function memberChatSurface(request,fetchOriginal){
 const url=new URL(request.url),entries={'/chat/':[memberChatHtml,'text/html'],'/community/chat-v2.js':[memberChatScript,'text/javascript'],'/community/chat-inbox-v2.js':[memberChatInboxScript,'text/javascript']},entry=entries[url.pathname];
 if(entry){if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});return new Response(request.method==='HEAD'?null:entry[0],{headers:{...pageHeaders,'Content-Type':entry[1]+'; charset=utf-8'}});}
 const response=await fetchOriginal(request);if(request.method!=='GET'||response.status!==200)return response;
 if(url.pathname==='/moderation-notices/'&&response.headers.get('Content-Type')?.includes('text/html'))return changed(response,(await response.text()).replace('</body>','<script src="/community/chat-inbox-v2.js" defer></script></body>'));
 if(url.pathname==='/automatic/links-v1.js'){
  let script=await response.text();for(const [language,value]of Object.entries(automaticCopy))script=script.replaceAll(JSON.stringify(value.title),JSON.stringify(memberChatCopy[language].notices));return changed(response,script);
 }
 return response;
}
