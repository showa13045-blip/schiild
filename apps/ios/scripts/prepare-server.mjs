// Build an additive iOS interface, preserving the live WhatsApp revision.
import {createRequire} from 'node:module';
import {readFile,readdir,writeFile,mkdir,copyFile,realpath} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {patchLiveApple} from '../server/patch-live-apple.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),stage=path.resolve(process.argv[3]??'');
if(!process.argv[2]||!process.argv[3])throw Error('Provide the backed-up live worker and a new output directory');
await mkdir(stage,{recursive:true});
const require=createRequire(await realpath(path.join(root,'apps/demo/node_modules/wrangler/package.json'))),esbuild=await import(pathToFileURL(require.resolve('esbuild')).href);
await esbuild.build({entryPoints:{'apple-accounts':path.join(root,'apps/demo/server/apple-accounts.mjs'),'apple-identity':path.join(root,'apps/demo/server/apple-identity.mjs')},bundle:true,splitting:true,format:'esm',platform:'node',target:'es2022',outdir:stage,outExtension:{'.js':'.mjs'},external:['node:*'],logLevel:'warning'});
await writeFile(path.join(stage,'worker.js'),patchLiveApple(await readFile(process.argv[2],'utf8')));
const directory=path.join(root,'apps/ios/dist/web'),files={};
async function collect(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory())await collect(full);else if(/\.(html|js|css)$/.test(entry.name)){const key=path.relative(directory,full).replaceAll('\\','/');files[key]=await readFile(full,'utf8');}}}
await collect(directory);
if(!files['index.html']||!Object.values(files).some(text=>text.includes('account.apple.start')&&text.includes('/api/atelier'))||Object.keys(files).length>20)throw Error('Invalid iOS web export');
files['index.html']=files['index.html'].replaceAll('/_expo/','/__ios/_expo/');
await writeFile(path.join(stage,'ios-web-files.mjs'),'export default '+JSON.stringify(files)+';\n');
await copyFile(new URL('../server/native-ui.mjs',import.meta.url),path.join(stage,'native-ui.mjs'));
for(const name of ['support-pages.mjs','support-surface.mjs'])await copyFile(new URL('../server/'+name,import.meta.url),path.join(stage,name));
await writeFile(path.join(stage,'apple-entry.mjs'),'import app from "./ios-entry.mjs";\nimport {nativeUI} from "./native-ui.mjs";\nimport files from "./ios-web-files.mjs";\nimport {supportPages} from "./support-pages.mjs";\nimport {supportSurface} from "./support-surface.mjs";\nexport * from "./ios-entry.mjs";\nexport default {...app,fetch(request,env,ctx){return supportSurface(request,value=>Promise.resolve(nativeUI(value,files)??app.fetch(value,env,ctx)),{pages:supportPages,scripts:{}});}};\n');
// A single runtime module also allows the same exact code to run in local workerd.
if(process.argv[4]){
 await copyFile(process.argv[4],path.join(stage,'ios-entry.mjs'));
 await copyFile(new URL('../server/native-surface.mjs',import.meta.url),path.join(stage,'native-surface.mjs'));
 await esbuild.build({entryPoints:[path.join(stage,'apple-entry.mjs')],bundle:true,format:'esm',platform:'node',target:'es2022',outfile:path.join(stage,'runtime.mjs'),external:['node:*','cloudflare:workers'],logLevel:'warning'});
}
console.log({prepared:true,uiFiles:Object.keys(files).length,stage});
