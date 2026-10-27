// Additive preparation only. This script does not deploy or modify live records.
import {readFile,writeFile,mkdir,copyFile,readdir,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Script} from 'node:vm';
import {createHash} from 'node:crypto';
import {patchReviewRuntime} from '../server/patch-review-runtime.mjs';
import {patchPostingUI} from '../server/patch-posting-ui.mjs';
const [inputRuntime,inputScripts,webFolder,output]=process.argv.slice(2);
if(!output)throw Error('Provide current runtime, current script map, review web export and stage');
const stage=path.resolve(output),web=path.resolve(webFolder),root=fileURLToPath(new URL('../../../',import.meta.url));
await mkdir(stage,{recursive:true});
const runtime=await readFile(inputRuntime,'utf8');await writeFile(path.join(stage,'base.mjs'),patchReviewRuntime(runtime));
for(const name of ['review-isolation.mjs','posting-policy.mjs','posting-consent.mjs','review-surface.mjs','posting-rules-page.mjs','support-pages.mjs'])await copyFile(new URL('../server/'+name,import.meta.url),path.join(stage,name));
const scripts=(await import(pathToFileURL(path.resolve(inputScripts)).href)).default,patched={},sources=[];
const digest=source=>createHash('sha256').update(source).digest('hex');
for(const [file,source]of Object.entries(scripts)){patched[file]=patchPostingUI(source);new Script(patched[file]);sources.push({path:file,previousSha256:digest(source),newSha256:digest(patched[file])});}
await writeFile(path.join(stage,'scripts.mjs'),'export default '+JSON.stringify(patched)+';\n');
await writeFile(path.join(stage,'script-sources.json'),JSON.stringify(sources,null,2));
const files={};async function collect(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory()){if(!['week','photos','art'].includes(entry.name))await collect(full);}else if(/\.(html|css|js)$/.test(entry.name)){const key=path.relative(web,full).replaceAll('\\','/');files[key]=(await readFile(full,'utf8')).replaceAll('/_expo/','/review/_expo/').replaceAll('/assets/','/review/assets/');}}}
await collect(web);if(!files['index.html']||!Object.values(files).some(value=>value.includes('/api/review')&&value.includes('account.review.login')))throw Error('Review export missing');
await writeFile(path.join(stage,'files.mjs'),'export default '+JSON.stringify(files)+';\n');
await writeFile(path.join(stage,'entry.mjs'),'import app from "./base.mjs";export * from "./base.mjs";import files from "./files.mjs";import scripts from "./scripts.mjs";import {reviewSurface} from "./review-surface.mjs";export default {...app,fetch(request,env,ctx){return reviewSurface(request,env,ctx,app,files,scripts);}};\n');
const require=createRequire(await realpath(path.join(root,'apps/demo/node_modules/wrangler/package.json'))),esbuild=await import(pathToFileURL(require.resolve('esbuild')).href);
await esbuild.build({entryPoints:[path.join(stage,'entry.mjs')],outfile:path.join(stage,'runtime.mjs'),bundle:true,format:'esm',platform:'node',target:'es2022',external:['node:*','cloudflare:workers'],logLevel:'warning'});
console.log({prepared:true,reviewFiles:Object.keys(files).length,patchedScripts:sources.length,baseSha256:digest(runtime)});
