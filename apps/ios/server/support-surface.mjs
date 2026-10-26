// Add only public information pages and guarded UI links to an existing release.
export async function supportSurface(request,fetchOriginal,files){
 const url=new URL(request.url);if(!['GET','HEAD'].includes(request.method))return fetchOriginal(request);
 if(files.pages[url.pathname])return new Response(request.method==='HEAD'?null:files.pages[url.pathname],{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"}});
 if(files.scripts[url.pathname])return new Response(request.method==='HEAD'?null:files.scripts[url.pathname],{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 if(!['/','/index.html','/week/','/week/index.html','/__ios/index.html'].includes(url.pathname))return fetchOriginal(request);
 const headers=new Headers(request.headers);headers.delete('If-None-Match');headers.delete('If-Modified-Since');const response=await fetchOriginal(new Request(request,{headers}));
 if(response.status!==200||request.method==='HEAD'||!response.headers.get('Content-Type')?.includes('text/html'))return response;
 let html=await response.text();for(const path of Object.keys(files.scripts))html=html.replaceAll(path+'?ui=20261027-copy-id',path+'?ui=20261027-support').replaceAll('src="'+path+'"','src="'+path+'?ui=20261027-support"');
 const out=new Headers(response.headers);for(const name of ['Content-Length','Content-Encoding','ETag','Last-Modified'])out.delete(name);out.set('Cache-Control','no-store');return new Response(html,{status:200,headers:out});
}
