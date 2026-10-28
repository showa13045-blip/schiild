// Runs the exact prepared release against mock authentication and disposable SQLite.
// Node mode does not certify workerd compatibility or real-device behavior.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const input=process.argv[2];if(!input)throw Error('Usage: node apps/ios/scripts/check-review-runtime.mjs <prepared-stage> [--workerd]');
const stage=path.resolve(input),receipt=JSON.parse(await readFile(path.join(stage,'prepared.json'),'utf8')),runtime=await readFile(path.join(stage,'runtime.mjs'));
if(createHash('sha256').update(runtime).digest('hex')!==receipt.newRuntimeSha256)throw Error('Prepared runtime hash changed');
const root=fileURLToPath(new URL('../../../',import.meta.url)),mode=process.argv.includes('--workerd')?'workerd':'node';
console.log('Prepared release '+receipt.newRuntimeSha256+'; '+mode+' + mock Apple + disposable SQLite');
const child=spawn(process.execPath,['--experimental-strip-types','--test','apps/ios/tests/apple-runtime.test.mjs','apps/ios/tests/human-runtime.test.mjs','apps/ios/tests/review-isolation.test.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,IOS_APPLE_STAGE:stage,IOS_APPLE_RUNTIME:mode,IOS_MODERATION_STAGE:stage,IOS_REVIEW_STAGE:stage,IOS_SAFETY_STAGE:'1',IOS_BLOCKS_STAGE:receipt.personalBlocking?'1':''}});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
