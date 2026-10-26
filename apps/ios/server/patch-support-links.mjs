// Guarded addition to both deployed UI revisions. No authentication code is replaced.
export function patchSupportLinks(source){
 const pattern=/\(0,([\w$]+)\.jsx\)\("p",\{children:\(0,([\w$]+)\.t\)\((['"])demo\.settings\.privacy\3\)\}\)/g;
 let count=0;
 const output=source.replace(pattern,(original,jsx,copy)=>{
  count++;
  // ISO 639 "id" refers to the Indonesian language.
  // eslint-disable-next-line schiild/domain-names
  const labels={ja:'お問い合わせ',en:'Support',ko:'문의',fr:'Assistance',nl:'Ondersteuning',es:'Ayuda',it:'Assistenza',id:'Bantuan',km:'ជំនួយ',hi:'सहायता'};
  return original+', (0,'+jsx+'.jsxs)("p",{className:"support-links",children:[(0,'+jsx+'.jsx)("a",{href:"/privacy.html",children:(0,'+copy+'.t)("settings.privacy")})," · ",(0,'+jsx+'.jsx)("a",{href:"/support.html",children:('+JSON.stringify(labels)+')[document.documentElement.lang]??"Support"})]})';
 });
 if(count!==1)throw Error('Settings component changed; support links not applied');
 return output;
}
