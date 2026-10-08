// Netlify/local adapter only. Cloudflare imports atelier-core without native sharp.
import sharp from 'sharp';
import {createAtelierService as core} from './atelier-core.mjs';
import {render,nearest,colors} from '../src/engine.ts';
export {ApiError} from './atelier-core.mjs';
const images={
 async mean(bytes){const {data,info}=await sharp(Buffer.from(bytes)).removeAlpha().raw().toBuffer({resolveWithObject:true});const sum=[0,0,0];for(let n=0;n<data.length;n+=info.channels)for(let c=0;c<3;c++)sum[c]+=data[n+c];return nearest(sum.map(n=>n/(info.width*info.height)));},
 async global(pixels){const data=Buffer.alloc(256*256*4);for(let n=0;n<65536;n++)data.set([...colors[1],255],n*4);for(const pixel of pixels)data.set([...pixel.color,255],pixel.position*4);return sharp(data,{raw:{width:256,height:256,channels:4}}).png().toBuffer();},
 async normalize(bytes){const image=sharp(bytes,{limitInputPixels:1080*1080}),meta=await image.metadata();if(meta.width!==1080||meta.height!==1080||meta.format!=='jpeg')throw Error('image_invalid');return image.jpeg({quality:85}).toBuffer();},
 async compose(rects,load,seed){const sources=await Promise.all(rects.map(async rect=>{const photo=await load(rect);if(!photo)return null;const {data,info}=await sharp(Buffer.from(photo)).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,data:new Uint8ClampedArray(data)};}));const pixels=render(rects,sources,seed);return sharp(Buffer.from(pixels.data),{raw:{width:128,height:128,channels:4}}).png().toBuffer();},
};
export function createAtelierService(store,options={}){return core(store,{...options,images});}
