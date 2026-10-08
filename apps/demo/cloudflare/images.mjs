// DEMO ONLY. Portable image codec for Workers; never import into M1–M4.
import jpeg from 'jpeg-js';
import {deflateSync} from 'node:zlib';
import {render,nearest,colors} from '../src/engine.ts';

function decode(bytes){
 const image=jpeg.decode(Buffer.from(bytes),{useTArray:true,maxResolutionInMP:1.2,maxMemoryUsageInMB:32,tolerantDecoding:false});
 if(image.width!==1080||image.height!==1080)throw Error('image_invalid');
 return {...image,data:new Uint8ClampedArray(image.data)};
}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(kind,data){const type=Buffer.from(kind),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);}
function png(pixels){
 const {width,height}=pixels,header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const stride=width*4,scan=Buffer.alloc(height*(1+stride));for(let y=0;y<height;y++)scan.set(pixels.data.subarray(y*stride,(y+1)*stride),y*(stride+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
export const workerImages={
 async mean(bytes){const image=decode(bytes),sum=[0,0,0];for(let n=0;n<image.data.length;n+=4)for(let channel=0;channel<3;channel++)sum[channel]+=image.data[n+channel];return nearest(sum.map(n=>n/(image.width*image.height)));},
 async global(pixels){const data=new Uint8ClampedArray(256*256*4);for(let n=0;n<65536;n++)data.set([...colors[1],255],n*4);for(const pixel of pixels)data.set([...pixel.color,255],pixel.position*4);return png({width:256,height:256,data});},
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
