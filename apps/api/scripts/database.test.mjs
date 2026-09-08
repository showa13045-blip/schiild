import pg from 'pg';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for real PostgreSQL tests');
test('PostgreSQL 16 constraints, UTC boundary, FK isolation and immutable history', async () => {
 const client=new pg.Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try {
  await client.query('BEGIN');
  const version=await client.query('SHOW server_version_num');assert.equal(Math.floor(Number(version.rows[0].server_version_num)/10000),16);
  await client.query(await readFile(new URL('../../../db/seed.sql',import.meta.url),'utf8'));
  const person='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002',atelier='00000000-0000-0000-0000-000000000010';
  const photo='00000000-0000-0000-0000-000000000101', nextPhoto='00000000-0000-0000-0000-000000000102',work='00000000-0000-0000-0000-000000000201';
  async function rejects(sql,params,code) {
   await client.query('SAVEPOINT rejection');
   await assert.rejects(client.query(sql,params),e=>e.code===code);
   await client.query('ROLLBACK TO SAVEPOINT rejection');
  }
  const insertPhoto='INSERT INTO schiils(id,user_id,schiild_date,image_key,image_sha256,created_at) VALUES($1,$2,to_schiild_date($3::timestamptz),$1::uuid::text,$4,$3)';
  await client.query(insertPhoto,[photo,person,'2026-09-08T23:59:00Z','a'.repeat(64)]);
  await rejects(insertPhoto,[nextPhoto,person,'2026-09-08T23:59:59Z','b'.repeat(64)],'23505');
  await client.query(insertPhoto,[nextPhoto,person,'2026-09-09T00:01:00Z','b'.repeat(64)]);
  const dates=await client.query('SELECT schiild_date::text FROM schiils WHERE user_id=$1 ORDER BY schiild_date',[person]);assert.deepEqual(dates.rows.map(r=>r.schiild_date),['2026-09-08','2026-09-09']);
  await client.query("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
  assert.equal((await client.query("SELECT to_schiild_date('2026-09-09T00:01:00Z')::text AS logical_day")).rows[0].logical_day,'2026-09-09');
  const insertWork=`INSERT INTO schiilds(id,atelier_id,kind,schiild_date,schiild_index,participant_count,capacity_at_gen,fill_rate,algorithm_version,generation_seed,lottery_seed,lottery_order,palette_id,image_key,thumbnail_key,region_map,metadata) VALUES($1,$2,$3,'2026-09-08',1,1,2,0.5,'v1.0.0',$4,$5,'[]','schiild_32','work.png','thumb.png','[]','{}')`;
  await client.query(insertWork,[work,atelier,'atelier','c'.repeat(64),'d'.repeat(64)]);
  await rejects(insertWork,['00000000-0000-0000-0000-000000000202',atelier,'atelier','c'.repeat(64),'d'.repeat(64)],'23505');
  await client.query(insertWork,['00000000-0000-0000-0000-000000000203',null,'global','c'.repeat(64),'d'.repeat(64)]);
  await rejects(insertWork,['00000000-0000-0000-0000-000000000204',null,'global','c'.repeat(64),'d'.repeat(64)],'23505');
  const post=`INSERT INTO schiil_posts(id,schiil_id,atelier_id,user_id,schiild_date,posted_at) VALUES(gen_random_uuid(),$1,$2,$3,'2026-09-08','2026-09-08T23:59:00Z')`;
  await rejects(post,[work,atelier,person],'23503');
  await rejects(post,[photo,atelier,other],'23503');
  await client.query(post,[photo,atelier,person]);await rejects(post,[photo,atelier,person],'23505');
  await client.query("INSERT INTO schiild_custody_events(schiild_id,event_type,user_id) VALUES($1,'assigned',$2)",[work,person]);
  await client.query("INSERT INTO schiild_revisions(id,schiild_id,revision,input_set_hash,reason,purge_after) VALUES($1,$2,1,$3,'test',now()+interval '90 days')",['00000000-0000-0000-0000-000000000301',work,'a'.repeat(64)]);
  await rejects('DELETE FROM schiild_custody_events',[],'42501');await rejects('TRUNCATE schiild_custody_events',[],'42501');
  await rejects("UPDATE schiild_custody_events SET event_type='returned'",[],'42501');
  await rejects('DELETE FROM schiild_revisions',[],'42501');
  await rejects('TRUNCATE schiild_revisions CASCADE',[],'42501');
  await client.query('SET LOCAL ROLE schiild_app');
  await rejects('DELETE FROM schiild_custody_events',[],'42501');await rejects('DELETE FROM schiild_revisions',[],'42501');
  await rejects("UPDATE schema_migrations SET sha256='changed'",[],'42501');
  await client.query('RESET ROLE');
 } finally { await client.query('ROLLBACK'); await client.end(); }
});
