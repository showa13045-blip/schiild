// Update public information pages only; preserve every live authentication/UI module.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import ts from '../../../node_modules/typescript/lib/typescript.js';
import {supportPages} from '../server/support-pages.mjs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Provide the deployed runtime and output directory');
const source=await readFile(input,'utf8'),tree=ts.createSourceFile('runtime.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),matches=[];
function visit(node){if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&/^supportPages\d*$/.test(node.name.text)&&node.initializer)matches.push(node.initializer);ts.forEachChild(node,visit);}visit(tree);
// Bundled wrappers retain three historical page maps. The outermost wrapper wins.
if(matches.length!==3)throw Error('Public pages boundary changed');let updated=source;for(const node of matches.sort((a,b)=>b.pos-a.pos))updated=updated.slice(0,node.getStart(tree))+JSON.stringify(supportPages)+updated.slice(node.end);
const digest=value=>createHash('sha256').update(value).digest('hex');await mkdir(output,{recursive:true});await writeFile(path.join(output,'runtime.mjs'),updated);
const receipt={preparedAt:new Date().toISOString(),previousRuntimeSha256:digest(source),newRuntimeSha256:digest(updated),changedRoutes:Object.keys(supportPages),pageMaps:matches.length,authenticationAndUIUnchanged:true};await writeFile(path.join(output,'prepared.json'),JSON.stringify(receipt,null,2));console.log(receipt);
