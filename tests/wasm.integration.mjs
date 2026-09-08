import test from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadBsp } from '../packages/shared/bsp.ts';
const binary = new URL('../target/release/gen' + (process.platform === 'win32' ? '.exe' : ''), import.meta.url);
const wasm = await loadBsp(readFileSync(new URL('../target/wasm32-unknown-unknown/release/gen.wasm', import.meta.url)));
test('Rust native and actual TypeScript WASM wrapper return identical rectangles', () => {
  for (const capacity of [1, 3, 7, 12, 50, 200, 500, 2000]) {
    for (const variance of [0, 0.55, 1]) {
      const seed = Uint8Array.from({ length: 32 }, (_, index) => (index * 17 + capacity) % 256);
      const native = JSON.parse(execFileSync(fileURLToPath(binary), ['--layout-only', '--frozen-seed', Buffer.from(seed).toString('hex'), '--capacity', String(capacity), '--resolution', '256', '--variance', String(variance)], { encoding: 'utf8' }));
      assert.deepEqual(wasm(seed, capacity, 256, variance), native);
    }
  }
});
test('WASM wrapper rejects invalid input and can recover', () => {
  assert.throws(() => wasm(new Uint8Array(1), 1));
  assert.throws(() => wasm(new Uint8Array(32), 0));
  assert.throws(() => wasm(new Uint8Array(32), 100, 1));
  assert.equal(wasm(new Uint8Array(32), 1).length, 1);
});
