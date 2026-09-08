import assert from 'node:assert/strict';
import test from 'node:test';
import {SCHEDULES,precedingDay,redisConnection} from '../dist/queues.js';
import {lotteryOrder} from '../dist/lottery.js';
test('UTC scheduling and lottery verification contracts',()=>{
 assert.deepEqual(SCHEDULES.generation,{pattern:'0 0 0 * * *',tz:'UTC'});
 assert.deepEqual(SCHEDULES.notification,{pattern:'0 15 0 * * *',tz:'UTC'});
 assert.equal(precedingDay(Date.parse('2030-01-02T00:15:00Z')),'2030-01-01');
 assert.equal(redisConnection('redis://localhost:6379').host,'localhost');
 const users=['a','b','c','d'];const one=lotteryOrder('01'.repeat(32),users);
 assert.deepEqual(one,lotteryOrder('01'.repeat(32),users.slice().reverse()));assert.deepEqual([...one].sort(),users);
});
