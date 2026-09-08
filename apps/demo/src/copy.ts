import official from './copy.json';
import {demoCopy} from './demo-copy';
const values={...official,...demoCopy};
export type CopyKey = keyof typeof values;
export function t(key:CopyKey,params:Record<string,string|number>={}){return values[key].replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??`{${name}}`));}
