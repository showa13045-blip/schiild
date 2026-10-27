// App Review only. The server, not this flag, enforces the separate data boundary.
export const isReviewMode=typeof location!=='undefined'&&location.pathname==='/review/';
export function reviewStorage(store:Storage):Storage{
 const prefix='schiild.review.';
 const keys=()=>Object.keys(store).filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length));
 return new Proxy({} as Storage,{
  get(_target,key){if(key==='getItem')return (name:string)=>store.getItem(prefix+name);if(key==='setItem')return (name:string,value:string)=>store.setItem(prefix+name,value);if(key==='removeItem')return (name:string)=>store.removeItem(prefix+name);if(key==='clear')return ()=>{for(const name of keys())store.removeItem(prefix+name);};if(key==='key')return (index:number)=>keys()[index]??null;if(key==='length')return keys().length;},
  ownKeys:keys,getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})
 });
}
