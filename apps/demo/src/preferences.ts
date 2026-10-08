export const PREFERENCES='schiild.preferences.v1';
export type Preferences={name:string;reduceMotion:boolean};
export function preferences():Preferences{try{const value=JSON.parse(localStorage.getItem(PREFERENCES)??'null');return {name:typeof value?.name==='string'?value.name:'',reduceMotion:value?.reduceMotion===true};}catch{return {name:'',reduceMotion:false};}}
export function savePreferences(value:Preferences){localStorage.setItem(PREFERENCES,JSON.stringify(value));}
