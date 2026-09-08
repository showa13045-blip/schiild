import test from 'node:test';
import assert from 'node:assert/strict';
import {partition,random,render,resample,synthetic,colors,globalPixels} from '../src/engine.ts';
test('BSP covers the complete integer grid without gaps or overlap',()=>{
 for(const count of [1,2,5,12,20,200]){const grid=new Uint16Array(128*128),rects=partition(count,random(count));assert.equal(rects.length,count);for(const r of rects){assert(r.w>0&&r.h>0);for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)grid[y*128+x]++;}assert(grid.every(n=>n===1));}
});
test('photo content affects its region and output uses only the temporary palette',()=>{
 const rects=partition(12,random(29)),sources=rects.map((_,n)=>n<9?synthetic(31+n):null),a=render(rects,sources,12),b=render(rects,[synthetic(400),...sources.slice(1)],12);assert.notDeepEqual(a.data,b.data);
 const allowed=new Set(colors.map(c=>c.join(',')));for(let n=0;n<a.data.length;n+=4){assert(allowed.has(Array.from(a.data.slice(n,n+3)).join(',')));assert.equal(a.data[n+3],255);}
 for(const r of rects.slice(1)){for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const p=(y*128+x)*4;assert.deepEqual(a.data.slice(p,p+4),b.data.slice(p,p+4));}}
});
test('area average and personal global pixel retain the supplied photograph color',()=>{
 const source={width:2,height:2,data:new Uint8ClampedArray([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])};assert.deepEqual([...resample(source,1,1)],[127.5,127.5,127.5]);
 const a=globalPixels(synthetic(10),29);assert(a.x>=0&&a.x<256&&a.y>=0&&a.y<256);assert.equal(a.pixels.data.length,256*256*4);
});
