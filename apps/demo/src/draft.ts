// DEMO ONLY. Temporary previews never become a formal Work or enter M1–M4.
import {dataUrl,decode,render,synthetic} from './engine';
import type {State} from './model';
export type Draft={day:string;image:string;count:number;provisional:true};
export async function localDraft(state:State):Promise<Draft>{
 const photo=state.photo?await decode(state.photo):null;
 const last=state.photo?state.count-1:state.count;
 const sources=state.rects.map(rect=>rect.slot===0?photo:rect.slot<=last?synthetic(state.seed+rect.slot*33):null);
 return {day:state.day,image:dataUrl(render(state.rects,sources,state.seed)),count:state.count,provisional:true};
}
