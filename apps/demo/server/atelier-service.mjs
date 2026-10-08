// Netlify/local adapter only. Cloudflare imports atelier-core without native sharp.
import sharp from 'sharp';
import {createAtelierService as core} from './atelier-core.mjs';
import {render} from '../src/engine.ts';
export {ApiError} from './atelier-core.mjs';
const images={
 async normalize(bytes){const image=sharp(bytes,{limitInputPixels:1080*1080}),meta=await image.metadata();if(meta.width!==1080||meta.height!==1080||meta.format!=='jpeg')throw Error('image_invalid');return image.jpeg({quality:85}).toBuffer();},
 async compose(rects,load,seed){const sources=await Promise.all(rects.map(async rect=>{const photo=await load(rect);if(!photo)return null;const {data,info}=await sharp(Buffer.from(photo)).ensureAlpha().raw().toBuffer({resolveWithObject:true});return {width:info.width,height:info.height,data:new Uint8ClampedArray(data)};}));const pixels=render(rects,sources,seed);return sharp(Buffer.from(pixels.data),{raw:{width:128,height:128,channels:4}}).png().toBuffer();},
};
export function createAtelierService(store,options={}){return core(store,{...options,images});}
