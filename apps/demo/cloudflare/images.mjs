// DEMO ONLY. Portable image codec for Workers; never import into M1–M4.
import jpeg from 'jpeg-js';
import {deflateSync} from 'node:zlib';
import {render} from '../src/engine.ts';

function decode(bytes){
 const image=jpeg.decode(Buffer.from(bytes),{useTArray:true,maxResolutionInMP:1.2,maxMemoryUsageInMB:32,tolerantDecoding:false});
 if(image.width!==1080||image.height!==1080)throw Error('image_invalid');
 return {...image,data:new Uint8ClampedArray(image.data)};
}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(kind,data){const type=Buffer.from(kind),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
function png(pixels){
 const header=Buffer.alloc(13);header.writeUInt32BE(128,0);header.writeUInt32BE(128,4);header[8]=8;header[9]=6;
 const scan=Buffer.alloc(128*(1+128*4));for(let y=0;y<128;y++)scan.set(pixels.data.subarray(y*512,(y+1)*512),y*513+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
export const workerImages={
 async normalize(bytes){const image=decode(bytes);return Buffer.from(jpeg.encode({width:image.width,height:image.height,data:Buffer.from(image.data)},85).data);},
 async compose(rects,load,seed){
  // Process photos sequentially to stay below Workers' memory ceiling at 20 slots.
  const out=render(rects,[],seed);
  for(const rect of rects){const photo=await load(rect);if(!photo)continue;
   const sources=[];sources[rect.slot]=decode(photo);const tile=render([rect],sources,seed);
   for(let y=rect.y;y<rect.y+rect.h;y++){const start=(y*128+rect.x)*4;out.data.set(tile.data.subarray(start,start+rect.w*4),start);}
  }
  const signature=render([],[],seed);for(const [x,y] of [[0,0],[124,0],[0,127],[124,127]])out.data.set(signature.data.subarray((y*128+x)*4,(y*128+x+4)*4),(y*128+x)*4);
  return png(out);
 },
};
