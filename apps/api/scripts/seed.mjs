import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (process.env.NODE_ENV === 'production') throw new Error('Demo seed is disabled in production');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query(await readFile(new URL('../../../db/seed.sql',import.meta.url),'utf8'));
  await client.query('COMMIT');
  console.log('Local fixtures seeded');
} catch(error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
