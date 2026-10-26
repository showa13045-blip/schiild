// Preserve the deployed public frontend and its newer WhatsApp flow.
export async function publicSurface(request,fetchOriginal,files){
 const url=new URL(request.url);
 if(!['GET','HEAD'].includes(request.method)||/\bSchiildNative\//.test(request.headers.get('user-agent')??'')||url.pathname.startsWith('/__ios/'))return fetchOriginal(request);
 if(url.pathname===files.path)return new Response(request.method==='HEAD'?null:files.script,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
 if(!['/','/index.html','/week/','/week/index.html'].includes(url.pathname))return fetchOriginal(request);
 const headers=new Headers(request.headers);headers.delete('If-None-Match');headers.delete('If-Modified-Since');
 const response=await fetchOriginal(new Request(request,{headers}));
 if(response.status!==200||request.method==='HEAD'||!response.headers.get('Content-Type')?.includes('text/html'))return response;
 let html=await response.text();if(!html.includes(files.path))return new Response(html,response);
 html=html.replaceAll(files.path,files.path+'?ui=20261027-copy-id').replace('</head>','<style data-schiild-copy-id>'+files.css+'</style></head>');
 const out=new Headers(response.headers);for(const key of ['Content-Length','Content-Encoding','ETag','Last-Modified'])out.delete(key);out.set('Cache-Control','no-store');
 return new Response(html,{status:response.status,headers:out});
}
