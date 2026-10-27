// Guarded additions to the existing demo interface.
export function patchModerationUI(source,copy){
 const once=(old,value)=>{if(source.split(old).length!==2)throw Error('Moderation UI changed: '+old.slice(0,90));source=source.replace(old,value);};
 const text=status=>`((${JSON.stringify(copy)})[document.documentElement.lang]??${JSON.stringify(copy.en)})[${status}==="rejected"?1:0]`;
 once('(0,v.jsxs)("div",{className:"shared-actions",children:',`_.moderationStatus&&(0,v.jsx)("p",{role:"status",className:"moderation-notice",children:${text('_.moderationStatus')}}),(0,v.jsxs)("div",{className:"shared-actions",children:`);
 once('"data-testid":"global-page","data-day":_,children:[','"data-testid":"global-page","data-day":_,children:['+`h?.moderationStatus&&(0,b.jsx)("p",{role:"status",className:"moderation-notice",children:${text('h.moderationStatus')}}),`);
 once('_.hasPhoto?(0,v.jsx)("div",{className:"posted"','_.hasPhoto?_.moderationStatus?null:(0,v.jsx)("div",{className:"posted"');
 // Exact executable boolean operators, not product copy.
 // eslint-disable-next-line schiild/product-copy
 once('_.hasPhoto&&!_.canGenerate','_.hasPhoto&&!_.canGenerate&&!_.moderationStatus');
 const marker="('demo.settings.privacy')",index=source.lastIndexOf(marker),start=source.lastIndexOf('__d(',index),end=source.indexOf('\n__d(',index);let module=source.slice(start,end);
 const signature=module.match(/_e\.SettingsPage=function\(\{[^}]+\}\)\{/);if(!signature||module.split(signature[0]).length!==2)throw Error('Settings signature changed');
 module=module.replace(signature[0],signature[0]+`const[moderationOperator,setModerationOperator]=(0,n.useState)(false);(0,n.useEffect)(()=>{let mounted=true;if(location.pathname==="/week/")return;const token=localStorage.getItem("schiild.account.session.v2");if(token)fetch("/api/atelier",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({action:"moderation.capabilities"})}).then(response=>response.ok?response.json():null).then(value=>{if(mounted)setModerationOperator(Boolean(value?.operator))}).catch(()=>{});return()=>{mounted=false}},[]);`);
 const jsx=module.match(/\(0,([\w$]+)\.jsxs\)\("section",\{className:"settings-page"/)?.[1];if(!jsx)throw Error('Settings renderer changed');
 module=module.replace('className:"settings-page",children:[','className:"settings-page",children:['+`moderationOperator&&(0,${jsx}.jsx)("p",{children:(0,${jsx}.jsx)("a",{href:"/moderation/",children:((${JSON.stringify(copy)})[document.documentElement.lang]??${JSON.stringify(copy.en)})[2]})}),`);
 return source.slice(0,start)+module+source.slice(end);
}
