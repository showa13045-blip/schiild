import 'reflect-metadata';
import {resolve} from 'node:path';
import {Database} from './database.js';
import {FirebaseAuth,S3Store,RustEngine,UnconfiguredModerator} from './adapters.js';
import {configuredModerator} from './moderation.js';
import {createApi} from './http.js';
function required(name:string){const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);return value;}
async function bootstrap(){
 const db=new Database(required('DATABASE_URL')),store=new S3Store(required('S3_BUCKET'));
 const engine=new RustEngine(store,resolve(required('GEN_EXECUTABLE')),resolve(required('GEN_WASM')),resolve(required('GEN_PALETTE')));
 const server=await createApi({db,store,engine,auth:new FirebaseAuth(),moderator:configuredModerator(process.env,new UnconfiguredModerator())});
 await server.app.listen(Number(process.env.PORT??3000),process.env.HOST??'127.0.0.1');
}
void bootstrap().catch(error=>{console.error(error instanceof Error?error.message:'startup_error');process.exitCode=1;});
