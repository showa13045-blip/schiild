import {createHash,createHmac,randomBytes} from 'node:crypto';
// Reproducible unbiased shuffle. The CSPRNG seed is independent of image inputs.
export function lotteryOrder(seed:string,users:string[]):string[] {
 const result=[...new Set(users)].sort();let counter=0;
 function bounded(bound:number) { const limit=0x100000000-(0x100000000%bound);for(;;){const bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter++));const n=createHmac('sha256',Buffer.from(seed,'hex')).update(bytes).digest().readUInt32BE();if(n<limit)return n%bound;} }
 for(let n=result.length-1;n>0;n--){const other=bounded(n+1);[result[n],result[other]]=[result[other],result[n]];}
 return result;
}
export function draw(users:string[]) { const seed=randomBytes(32).toString('hex');return {seed,order:lotteryOrder(seed,users)}; }
export function generationSeed(atelierId:string,day:string,hashes:string[]) {
 const digest=createHash('sha256').update('v1.0.0').update(atelierId).update(day);
 for(const hash of [...hashes].sort()) digest.update(Buffer.from(hash,'hex'));
 return digest.digest();
}
