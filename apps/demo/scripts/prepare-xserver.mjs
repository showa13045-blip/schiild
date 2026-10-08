import {spawnSync} from 'node:child_process';
import {cp,mkdir,writeFile,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const endpoint=new URL(process.env.EXPO_PUBLIC_DEMO_API_URL??'');
if(endpoint.protocol!=='https:'||endpoint.pathname!=='/api/atelier')throw Error('Set EXPO_PUBLIC_DEMO_API_URL to your HTTPS Worker /api/atelier URL');
const sync=spawnSync(process.execPath,['scripts/sync-copy.mjs'],{cwd:root,stdio:'inherit',windowsHide:true});
if(sync.status!==0)process.exit(sync.status??1);
const build=spawnSync(process.execPath,['scripts/expo.mjs','export','--platform','web','--clear'],{cwd:root,env:{...process.env,EXPO_PUBLIC_DEMO_API_URL:endpoint.href},stdio:'inherit',windowsHide:true});
if(build.status!==0)process.exit(build.status??1);
// Metro can retain transformed EXPO_PUBLIC values across local/public exports.
// Refuse to upload a build that does not include the selected public API URL.
const scripts=path.join(root,'dist/_expo/static/js/web');
const bundles=await Promise.all((await readdir(scripts)).filter(file=>file.endsWith('.js')).map(file=>readFile(path.join(scripts,file),'utf8')));
if(!bundles.some(bundle=>bundle.includes(endpoint.href)))throw Error('Public API URL is missing from the exported JavaScript');
const dest=path.join(root,'.wrangler/xserver-site');
await mkdir(dest,{recursive:true});
await cp(path.join(root,'dist'),dest,{recursive:true});
for(const file of ['storage.php','.htaccess'])await cp(path.join(root,'xserver',file),path.join(dest,file));
await writeFile(path.join(dest,'deployment.json'),JSON.stringify({api:endpoint.href,ui:'https://schiild.pickleballnavi.jp',builtAt:new Date().toISOString()})+'\n');
console.log(`Xserver upload bundle: ${dest}`);
