/** DEMO ONLY: browser TypeScript approximation of requirements §4.2.
 * Never import this module into production M1–M4. Production stays Rust/WASM.
 * Temporary palette, demo randomness and synthetic participants are intentional.
 */
export type RGB=[number,number,number];
export type Rect={x:number;y:number;w:number;h:number;slot:number};
export type Pixels={width:number;height:number;data:Uint8ClampedArray};
export const PALETTE=['#14130f','#292823','#44453d','#77796b','#b5b7a5','#f3efe1','#26384d','#345673','#4b7895','#87a6b0','#bcc6bd','#334638','#52684c','#798959','#a8a36c','#d7c49a','#442f38','#69474c','#9c6965','#c39582','#e5bbaa','#543e2e','#7b573a','#aa7745','#d4a561','#e9ca7d','#473e59','#726781','#a795aa','#afb6ca','#61777a','#8d9890'];
export const colors:RGB[]=PALETTE.map(hex=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]);
export function random(seed:number){return ()=>{seed|=0;seed=seed+0x6d2b79f5|0;let n=Math.imul(seed^seed>>>15,1|seed);n^=n+Math.imul(n^n>>>7,61|n);return ((n^n>>>14)>>>0)/4294967296;};}
export function shuffle<T>(items:T[],rng= Math.random){const out=[...items];for(let n=out.length-1;n>0;n--){const k=Math.floor(rng()*(n+1));[out[n],out[k]]=[out[k],out[n]];}return out;}
export function partition(capacity=12,rng=Math.random):Rect[]{
 const rects:Rect[]=[{x:0,y:0,w:128,h:128,slot:0}];
 while(rects.length<capacity){
  const ranked=rects.filter(r=>r.w>1||r.h>1).sort((a,b)=>b.w*b.h-a.w*a.h);
  if(!ranked.length)break;
  const target=ranked[Math.floor(rng()*Math.max(1,Math.floor(ranked.length*.45)))];
  const vertical=target.w>=target.h,length=vertical?target.w:target.h;
  const cut=Math.max(1,Math.min(length-1,Math.round(length/2+(rng()*2-1)*.55*length*.34)));
  const a={...target},b={...target};if(vertical){a.w=cut;b.x+=cut;b.w-=cut;}else{a.h=cut;b.y+=cut;b.h-=cut;}
  rects.splice(rects.indexOf(target),1,a,b);
 }
 return shuffle(rects,rng).map((r,slot)=>({...r,slot}));
}
export function oklab(rgb:RGB):RGB {
 const [r,g,b]=rgb.map(v=>{v=Math.max(0,Math.min(255,v))/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
const labs=colors.map(oklab);
export function nearest(rgb:RGB):RGB {const lab=oklab(rgb);let best=0,distance=Infinity;labs.forEach((p,n)=>{const d=p.reduce((sum,v,k)=>sum+(v-lab[k])**2,0);if(d<distance){distance=d;best=n;}});return colors[best];}
/** Fractional area-average after centered aspect crop; no filter or photo edits. */
export function resample(source:Pixels,w:number,h:number):Float32Array {
 const scale=Math.min(source.width/w,source.height/h),ox=(source.width-w*scale)/2,oy=(source.height-h*scale)/2,out=new Float32Array(w*h*3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=ox+x*scale,y0=oy+y*scale,x1=x0+scale,y1=y0+scale,index=(y*w+x)*3;
  for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
   const weight=(Math.min(x1,sx+1)-Math.max(x0,sx))*(Math.min(y1,sy+1)-Math.max(y0,sy))/(scale*scale),input=(Math.min(source.height-1,sy)*source.width+Math.min(source.width-1,sx))*4;
   for(let c=0;c<3;c++)out[index+c]+=source.data[input+c]*weight;
  }
 }
 return out;
}
export function render(rects:Rect[],sources:(Pixels|null)[],seed:number):Pixels{
 const rng=random(seed),out=new Uint8ClampedArray(128*128*4);
 for(const rect of rects){
  const source=sources[rect.slot],sample=source?resample(source,rect.w,rect.h):null;
  for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){
   const index=(y*rect.w+x)*3,input:RGB=sample?[sample[index],sample[index+1],sample[index+2]]:colors[rng()<.12?1:0],color=nearest(input),target=((y+rect.y)*128+x+rect.x)*4;
   out.set([...color,255],target);
   if(sample){for(const [dx,dy,weight] of [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]])if(x+dx>=0&&x+dx<rect.w&&y+dy<rect.h){const next=((y+dy)*rect.w+x+dx)*3;for(let c=0;c<3;c++)sample[next+c]+=(input[c]-color[c])*weight*.65;}}
  }
 }
 // Demo signature only; intentionally not a production algorithm version.
 for(const [x,y] of [[0,0],[124,0],[0,127],[124,127]])for(let n=0;n<4;n++)out.set([...colors[n%2?5:0],255],(y*128+x+n)*4);
 return {width:128,height:128,data:out};
}
export function synthetic(seed:number):Pixels{
 const rng=random(seed),data=new Uint8ClampedArray(128*128*4),sky=colors[6+Math.floor(rng()*5)],land=colors[11+Math.floor(rng()*5)],sun=colors[23+Math.floor(rng()*3)],horizon=40+rng()*40,cx=rng()*128,cy=rng()*60;
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  let rgb=y>horizon+Math.sin(x/18+seed)*12?land:sky;
  if((x-cx)**2+(y-cy)**2<170)rgb=sun;
  if(y>horizon+26&&Math.sin(x/9+seed)>0.55)rgb=colors[21];
  const light=(rng()-.5)*18;data.set([...rgb.map(c=>Math.max(0,Math.min(255,c+light))),255],(y*128+x)*4);
 }
 return {width:128,height:128,data};
}
export function dataUrl(pixels:Pixels){const canvas=document.createElement('canvas');canvas.width=pixels.width;canvas.height=pixels.height;canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height),0,0);return canvas.toDataURL('image/png');}
export async function decode(url:string):Promise<Pixels>{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');if(!context)throw Error('canvas_unavailable');context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height);}
export function globalPixels(mine:Pixels,seed:number){const rng=random(seed),data=new Uint8ClampedArray(256*256*4),mean=resample(mine,1,1),color=nearest([mean[0],mean[1],mean[2]]),x=64+Math.floor(rng()*128),y=64+Math.floor(rng()*128);
 for(let py=0;py<256;py++)for(let px=0;px<256;px++){const field=Math.sin(px/35+seed)+Math.cos(py/28)+Math.sin((px+py)/55),n=Math.max(0,Math.min(31,Math.floor((field+3)*4+rng()*5)));data.set([...colors[n],255],(py*256+px)*4);}
 data.set([...color,255],(y*256+x)*4);return {pixels:{width:256,height:256,data},x,y};
}
