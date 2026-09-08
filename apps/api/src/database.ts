import pg from 'pg';
import { ApiError } from './errors.js';
import type { Authenticator } from './ports.js';
export class Database {
  readonly pool: pg.Pool;
  constructor(connectionString: string) { this.pool=new pg.Pool({connectionString}); }
  async transaction<T>(action: (client: pg.PoolClient)=>Promise<T>): Promise<T> {
    const client=await this.pool.connect();
    try { await client.query('BEGIN'); const value=await action(client); await client.query('COMMIT'); return value; }
    catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async authenticate(header: unknown, verifier: Authenticator): Promise<string> {
    if(typeof header !== 'string' || !header.startsWith('Bearer ')) throw new ApiError(401,'unauthenticated');
    let uid: string;
    try { uid=(await verifier.verify(header.slice(7))).uid; } catch { throw new ApiError(401,'unauthenticated'); }
    const found=await this.pool.query('SELECT id AS user_id FROM users WHERE firebase_uid=$1 AND deleted_at IS NULL',[uid]);
    if(!found.rowCount) throw new ApiError(403,'account_not_registered');
    return found.rows[0].user_id as string;
  }
}
