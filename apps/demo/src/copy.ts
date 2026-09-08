import values from './copy.json';
export type CopyKey = keyof typeof values;
export function t(key:CopyKey,params:Record<string,string|number>={}){return values[key].replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??`{${name}}`));}
