// The iOS client opts into its own UI. Public web assets are left intact.
export function nativeUI(request,files){
 const url=new URL(request.url);if(url.origin!=='https://schiild.app'||!['GET','HEAD'].includes(request.method))return null;
 const native=/\bSchiildNative\/1\.1\b/.test(request.headers.get('user-agent')??'');
 const key=url.pathname.startsWith('/__ios/')?url.pathname.slice('/__ios/'.length):native&&['/','/index.html'].includes(url.pathname)?'index.html':null;
 const file=key?files[key]:null;if(!file)return null;
 const type=key.endsWith('.js')?'text/javascript; charset=utf-8':key.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8';
 return new Response(request.method==='HEAD'?null:file,{headers:{'Content-Type':type,'Cache-Control':key==='index.html'?'no-store':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'camera=(self)','Vary':'User-Agent'}});
}
