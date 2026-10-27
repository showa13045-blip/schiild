// Validate incoming native screenshots without modifying image pixels.
import {readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const require=createRequire(new URL('../../demo/package.json',import.meta.url)),sharp=(await import(pathToFileURL(require.resolve('sharp')).href)).default;
const root=process.argv[2];if(!root)throw Error('Usage: node apps/ios/scripts/check-store-screenshots.mjs <capture-directory>');
const sizes={iphone:[[1179,2556],[1206,2622]],ipad:[[2064,2752],[2048,2732]]};let failures=0;
for(const [device,allowed]of Object.entries(sizes)){
 let files=[];try{files=(await readdir(path.join(root,device))).filter(file=>/\.(png|jpe?g)$/i.test(file));}catch{/* Report the missing set below. */}
 if(files.length<1||files.length>10){console.error(device+': provide 1–10 native screenshots');failures++;continue;}
 let selected=null;
 for(const file of files){try{const meta=await sharp(path.join(root,device,file)).metadata();const dimensions=[meta.width,meta.height];const valid=allowed.some(([width,height])=>meta.width===width&&meta.height===height||meta.width===height&&meta.height===width);
 if(!valid||meta.hasAlpha||!['png','jpeg'].includes(meta.format))throw Error('unsupported size, format or transparency');
 if(selected&&selected!==dimensions.join('x'))throw Error('use one size and orientation per device set');selected=dimensions.join('x');console.log(device+'/'+file+': '+selected+' OK');
 }catch(error){console.error(device+'/'+file+': '+error.message);failures++;}}
}
if(failures)process.exitCode=1;
else console.log('File checks passed. Separately confirm native provenance, rights and absence of private information.');
