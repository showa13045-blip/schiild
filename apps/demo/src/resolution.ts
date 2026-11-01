// DEMO ONLY. Keep the 128-unit layout stable and sample new works at 256 pixels.
export const LOGICAL_SIZE=128;
export const WORK_SIZE=256;
import {CONTRIBUTOR_LAYOUT,contributorSize} from './atelier-layout.ts';
export function workSize(record?:{outputSize?:number;status?:string;layoutVersion?:string;posts?:Record<string,unknown>}){if(record?.layoutVersion===CONTRIBUTOR_LAYOUT)return contributorSize(Object.keys(record.posts??{}).length);return record?.outputSize===128||record?.outputSize===256?record.outputSize:record?.status==='ready'||record?.status==='generating'?128:WORK_SIZE;}
