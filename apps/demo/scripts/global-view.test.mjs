import test from 'node:test';
import assert from 'node:assert/strict';
import {fullView,boundView,zoomAt,pixelAt,pixelPosition} from '../src/global-view.ts';
test('zoom keeps the pointed image coordinate fixed and resets without empty edges',()=>{
 const size=340,start=fullView(),point={x:43,y:-29},pixel=pixelAt(start,point,size),zoomed=zoomAt(start,32,point,size);
 assert.deepEqual(pixelAt(zoomed,point,size),pixel);assert.deepEqual(zoomAt(zoomed,1,point,size),start);
 assert.deepEqual(boundView({scale:100,x:1e9,y:-1e9},size),{scale:64,x:10710,y:-10710});
});
test('selected pixels round-trip at multiple zoom levels, corners and phone sizes',()=>{
 for(const size of [280,342,600])for(const scale of [1,2,18,64])for(const pixel of [{x:0,y:0},{x:128,y:128},{x:255,y:255},{x:17,y:233}]){const view=boundView({scale,x:123,y:-123},size),position=pixelPosition(view,pixel,size);assert.deepEqual(pixelAt(view,{x:position.x-size/2,y:position.y-size/2},size),pixel);}
});
test('panning beyond every corner stays inside the picture and selects valid coordinates',()=>{
 for(const x of [-1e5,1e5])for(const y of [-1e5,1e5]){const size=342,view=boundView({scale:4,x,y},size);assert(Math.abs(view.x)<=513&&Math.abs(view.y)<=513);const pixel=pixelAt(view,{x:-171,y:-171},size);assert(pixel.x>=0&&pixel.x<=255&&pixel.y>=0&&pixel.y<=255);}
});
