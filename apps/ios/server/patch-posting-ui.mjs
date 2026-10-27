import {postingCopy,POSTING_POLICY_VERSION} from './posting-policy.mjs';
// These exact expressions are executable bundle text, not new product copy.
/* eslint-disable schiild/product-copy */
export function patchPostingUI(source){
 const once=(old,value)=>{if(source.split(old).length!==2)throw Error('Posting UI changed: '+old.slice(0,90));source=source.replace(old,value);};
 const element=(jsx)=>`(0,${jsx}.jsxs)("div",{className:"posting-rules",children:[(0,${jsx}.jsxs)("details",{children:[(0,${jsx}.jsx)("summary",{children:policyCopy.title}),(0,${jsx}.jsx)("p",{children:policyCopy.summary}),(0,${jsx}.jsx)("a",{href:"/posting-rules.html?lang="+document.documentElement.lang,target:"_blank",rel:"noreferrer",children:policyCopy.title})]}),(0,${jsx}.jsxs)("label",{style:{display:"flex",gap:12,alignItems:"flex-start",margin:"20px 0",lineHeight:1.7},children:[(0,${jsx}.jsx)("input",{type:"checkbox",checked:policyAccepted,onChange:event=>setPolicyAccepted(event.target.checked),style:{flex:"0 0 auto",width:20,height:20,marginTop:4}}),(0,${jsx}.jsx)("span",{children:policyCopy.agree})]})]})`;
 const state=react=>`const[policyAccepted,setPolicyAccepted]=(0,${react}.useState)(false);const policyCopy=(${JSON.stringify(postingCopy)})[document.documentElement.lang]??(${JSON.stringify(postingCopy.en)});`;
 once('function R({day:e,atelier:t,concept:o,onBack:c,onSubmit:l,shared:x=!1}){','function R({day:e,atelier:t,concept:o,onBack:c,onSubmit:l,shared:x=!1}){'+state('r'));
 once('async function P(){if(v&&!D.current){','async function P(){if(v&&policyAccepted&&!D.current){');
 once('(0,N.jsx)(_,{disabled:C,onClick:()=>{P()},',element('N')+',(0,N.jsx)(_,{disabled:C||!policyAccepted,onClick:()=>{P()},');
 once("onClick:()=>{b(null),f('idle')},children:(0,s.t)('camera.confirm.back')","onClick:()=>{setPolicyAccepted(false),b(null),f('idle')},children:(0,s.t)('camera.confirm.back')");
 once('function j({collection:e,initialSource:j,onLocalReuse:x,onRefresh:v,onBack:N}){','function j({collection:e,initialSource:j,onLocalReuse:x,onRefresh:v,onBack:N}){'+state('o'));
 once('if(E(null),B([]),G(!1),A(!1),','if(setPolicyAccepted(false),E(null),B([]),G(!1),A(!1),');
 once('(0,y.jsx)("button",{className:"button",disabled:L||!U,onClick:()=>{X()},',element('y')+',(0,y.jsx)("button",{className:"button",disabled:L||!U||!policyAccepted,onClick:()=>{if(policyAccepted)X()},');
 // Both revisions have exactly one network serialization point.
 let serializations=0;source=source.replace(/JSON\.stringify\(\{action:([\w$]+),\.\.\.([\w$]+)\}\)/g,(whole,action,values)=>{serializations++;return `JSON.stringify({action:${action},...(["post","reuse","global.record"].includes(${action})?{policyVersion:${JSON.stringify(POSTING_POLICY_VERSION)}}:{}),...${values}})`;});
 if(serializations!==1)throw Error('Request serialization changed');
 const marker='"data-testid":"auth-page",children:[',index=source.indexOf(marker);if(index<0||source.indexOf(marker,index+1)>=0)throw Error('Auth page changed');
 const jsx=source.slice(index+marker.length).match(/^\(0,([\w$]+)\.jsx\)/)?.[1];if(!jsx)throw Error('Auth renderer changed');
 once(marker,marker+`(0,${jsx}.jsx)("p",{children:(0,${jsx}.jsx)("a",{href:"/review/?login=1",children:"審査用アクセス / App Review"})}),`);
 return source;
}
