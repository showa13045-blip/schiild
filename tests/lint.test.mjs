import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { forbiddenWords } from '../scripts/eslint/product-copy.mjs';

const eslint = new ESLint();
async function messages(source, filePath = 'apps/mobile/src/copy-probe.tsx') {
  const [result] = await eslint.lintText(source, { filePath });
  assert.equal(result.fatalErrorCount, 0, 'test input must parse successfully');
  return result.messages.filter(item => item.ruleId === 'schiild/product-copy');
}
test('ESLint rejects every prohibited word in application source', async () => {
  for (const word of forbiddenWords) assert.equal((await messages(`export const label = ${JSON.stringify(word)};`)).length, 1, word);
});
test('ESLint rejects both exclamation marks in shared copy files', async () => {
  for (const mark of ['!', '！']) assert.equal((await messages(`export const label = '記録${mark}';`, 'packages/shared/probe.ts')).length, 1);
});
test('ESLint covers JSX text, template literals, attributes and escaped strings', async () => {
  for (const source of ['const x = <Text>所有</Text>;', 'const x = `所有 ${count}`;', 'const x = <Text title="所有" />;', 'const x = "\\u6240\\u6709";']) assert.ok((await messages(source)).length > 0, source);
});
test('ESLint accepts product terms and boolean operators', async () => {
  assert.equal((await messages('const x = "預かり手"; if (!x) throw new Error("EMPTY"); // 所有 is a test comment')).length, 0);
});

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
test('ESLint command exits nonzero for prohibited source copy', () => {
  const binary = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin/eslint.js');
  const result = spawnSync(process.execPath, [binary, '--stdin', '--stdin-filename', 'apps/mobile/src/probe.ts'], { input: 'export const text = "所有！";', encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /schiild\/product-copy/);
});
