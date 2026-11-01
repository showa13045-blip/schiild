// DEMO ONLY. Newly generated atelier works allocate space only to accepted contributions.
// Legacy, already generated layouts keep their original coordinates.
import {partition,random,shuffle} from './engine.ts';
import type {Rect} from './engine.ts';
export const CONTRIBUTOR_LAYOUT='contributors-v1';
type RecordLayout={seed:number;layoutVersion?:string;posts:Record<string,unknown>};
export function contributorSize(count:number){return Math.min(2048,Math.max(256,2**Math.ceil(Math.log2(Math.max(1,Math.ceil(Math.sqrt(count))*24)))));}
// Largest-first heap gives O(n log n) splits, including large official ateliers.
export function contributorRects(slots:number[],seed:number):Rect[]{
 if(!slots.length)return [];const side=Math.max(128,2**Math.ceil(Math.log2(Math.ceil(Math.sqrt(slots.length))))),rng=random(seed),heap:Rect[]=[];
 const larger=(a:Rect,b:Rect)=>a.w*a.h>b.w*b.h;
 function push(rect:Rect){heap.push(rect);let n=heap.length-1;while(n){const parent=(n-1)>>1;if(!larger(heap[n],heap[parent]))break;[heap[n],heap[parent]]=[heap[parent],heap[n]];n=parent;}}
 function pop(){const top=heap[0],last=heap.pop();if(heap.length&&last){heap[0]=last;let n=0;for(;;){let next=n,left=n*2+1,right=left+1;if(left<heap.length&&larger(heap[left],heap[next]))next=left;if(right<heap.length&&larger(heap[right],heap[next]))next=right;if(next===n)break;[heap[n],heap[next]]=[heap[next],heap[n]];n=next;}}return top;}
 push({x:0,y:0,w:side,h:side,slot:0});while(heap.length<slots.length){const rect=pop(),vertical=rect.w>=rect.h,length=vertical?rect.w:rect.h;if(length<2)throw Error('layout_capacity');const cut=Math.max(1,Math.min(length-1,Math.round(length*(.4+rng()*.2))));if(vertical){push({...rect,w:cut});push({...rect,x:rect.x+cut,w:rect.w-cut});}else{push({...rect,h:cut});push({...rect,y:rect.y+cut,h:rect.h-cut});}}
 return shuffle(heap,rng).map((rect,index)=>({x:rect.x*128/side,y:rect.y*128/side,w:rect.w*128/side,h:rect.h*128/side,slot:slots[index]}));
}
export function atelierRects(room:{capacity:number},record:RecordLayout):Rect[]{return record.layoutVersion===CONTRIBUTOR_LAYOUT?contributorRects(Object.keys(record.posts).map(Number).sort((a,b)=>a-b),record.seed):partition(room.capacity,random(record.seed));}
