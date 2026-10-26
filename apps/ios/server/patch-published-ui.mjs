// Narrow migration for the newer public WhatsApp UI. Do not replace it with the older checkout.
export function patchPublishedUI(source){
 const index=source.indexOf('"data-testid":"delete-account"');if(index<0)throw Error('Published deletion component missing');
 const start=source.lastIndexOf('__d(',index),next=source.indexOf('\n__d(',index),end=next<0?source.length:next;
 let module=source.slice(start,end);
 const signature='function u({account:e,onDelete:n,onWhatsAppComplete:u}){';
 if(module.split(signature).length!==2||!module.includes('e.whatsappLinked'))throw Error('Published component changed');
 module=module.replace(signature,signature+'const[copyDone,setCopyDone]=(0,t.useState)(false);');
 const display='(0,c.jsxs)("p",{className:"mono",children:["@",e.username]})';
 if(module.split(display).length!==3)throw Error('Published ID display changed');
 // ISO 639 "id" is the Indonesian locale, not a record identifier.
 // eslint-disable-next-line schiild/domain-names
 const labels={ja:'IDをコピー',en:'Copy ID',ko:'ID 복사',fr:'Copier l’identifiant',nl:'ID kopiëren',es:'Copiar ID',it:'Copia ID',id:'Salin ID',km:'ចម្លង ID',hi:'आईडी कॉपी करें'};
 module=module.replace(display,'(0,c.jsxs)("div",{className:"delete-account-id",children:[(0,c.jsx)("input",{className:"mono",readOnly:true,value:e.username,"aria-label":(0,l.t)("demo.account.id"),onFocus:event=>event.currentTarget.select()}),(0,c.jsx)("button",{type:"button",className:"text-button",onClick:async event=>{const input=event.currentTarget.previousElementSibling;setCopyDone(false);try{await navigator.clipboard.writeText(e.username);setCopyDone(true)}catch{input.focus();input.select()}},children:copyDone?(0,l.t)("common.done"):('+JSON.stringify(labels)+')[document.documentElement.lang]??"Copy ID"})]})');
 source=source.slice(0,start)+module+source.slice(end);
 const exits={'通常のデモへ':'1週間の利用例をやめる','Return to demo':'Exit the week example','일반 데모로':'일주일 이용 예시 종료','Revenir à la démo':'Quitter l’exemple d’une semaine','Terug naar de demo':'Het weekvoorbeeld verlaten','Volver a la demo':'Salir del ejemplo de una semana','Torna alla demo':'Esci dall’esempio di una settimana','Kembali ke demo':'Keluar dari contoh satu minggu','ត្រឡប់ទៅការបង្ហាញ':'ចាកចេញពីឧទាហរណ៍ប្រើប្រាស់មួយសប្ដាហ៍','डेमो पर लौटें':'एक हफ़्ते का उदाहरण बंद करें'};
 const readOnly=[
  ['この利用例','この利用例での参加情報は保存されません。撮影などは、利用例を終了してから試せます。'],
  ['Atelier membership','Atelier membership in this example is temporary. Exit the example to try the camera and other features.'],
  ['이 예시','이 예시에서는 참여 정보가 저장되지 않습니다. 촬영 등의 기능은 이용 예시를 종료한 후 사용할 수 있습니다.'],
  ['La participation','La participation aux ateliers de cet exemple est temporaire. Quittez l’exemple pour essayer la caméra et les autres fonctions.'],
  ['Deelname','Deelname aan ateliers in dit voorbeeld is tijdelijk. Verlaat het voorbeeld om de camera en andere functies te proberen.'],
  ['La participación','La participación en los ateliers de este ejemplo es temporal. Sal del ejemplo para probar la cámara y las demás funciones.'],
  ['La partecipazione','La partecipazione agli atelier di questo esempio è temporanea. Esci dall’esempio per provare la fotocamera e le altre funzioni.'],
  ['Keanggotaan','Keanggotaan atelier dalam contoh ini bersifat sementara. Keluar dari contoh ini untuk mencoba kamera dan fitur lainnya.'],
  ['សមាជិកភាព','សមាជិកភាព atelier ក្នុងឧទាហរណ៍នេះគឺបណ្តោះអាសន្ន។ ចាកចេញពីឧទាហរណ៍នេះ ដើម្បីសាកល្បងកាមេរ៉ា និងមុខងារផ្សេងទៀត។'],
  ['इस उदाहरण','इस उदाहरण में अटेलियर सदस्यता अस्थायी है। कैमरा और अन्य सुविधाओं को आज़माने के लिए यह उदाहरण बंद करें।']
 ];
 const changed={exit:0,read_only:0,push:0};
 source=source.replace(/(['"])(demo\.(?:week\.(exit|read_only)|push\.(week)))\1:('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\[(?:(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'),?)+\])/g,(whole,quote,key,kind,push,value)=>{
  const json=value.replace(/\\x([a-f0-9]{2})/gi,(_,hex)=>'\\u00'+hex).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,literal=>literal.startsWith("'")?'"'+literal.slice(1,-1).replace(/\\'/g,"'").replace(/"/g,'\\"')+'"':literal);
  const old=JSON.parse(json),category=push?'push':kind,translate=text=>{
   let replacement=category==='exit'?exits[text]:category==='read_only'?readOnly.find(([prefix])=>text.startsWith(prefix))?.[1]:text.match(/^.*?[。.!។]/u)?.[0];
   if(!replacement)throw Error('Published label changed: '+key);changed[category]++;return replacement;
  };
  return JSON.stringify(key)+':'+JSON.stringify(Array.isArray(old)?old.map(translate):translate(old));
 });
 if(Object.values(changed).some(count=>count!==10))throw Error('Published language coverage changed: '+JSON.stringify(changed));
 return source;
}
export const publicAdjustmentCSS='.delete-account-id{display:flex;align-items:center;gap:16px;margin:24px 0}.delete-account-id input{flex:1;min-width:0;width:100%;padding:12px 0;border:0;background:#fff;color:var(--ink2);user-select:text;-webkit-user-select:text}.delete-account-id .text-button{flex:none;min-height:44px;padding:12px 0}';
