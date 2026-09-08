import 'reflect-metadata';
import {resolve} from 'node:path';
import {Database} from './database.js';
import {S3Store,RustEngine,FirebasePush} from './adapters.js';
import {DailyGeneration} from './daily.js';
import {startWorkers} from './queues.js';
function required(name:string){const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);return value;}
async function start(){
 const db=new Database(required('DATABASE_URL')),store=new S3Store(required('S3_BUCKET'));
 const engine=new RustEngine(store,resolve(required('GEN_EXECUTABLE')),resolve(required('GEN_WASM')),resolve(required('GEN_PALETTE')));
 const workers=await startWorkers(db,new DailyGeneration(db,engine,store),new FirebasePush(),required('REDIS_URL'));
 for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void workers.close().then(()=>db.pool.end());});
}
void start().catch(error=>{console.error(error instanceof Error?error.message:'worker_startup_error');process.exitCode=1;});
