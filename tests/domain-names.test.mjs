import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
const eslint = new ESLint();
async function check(name) {
  const [result] = await eslint.lintText(`export const ${name} = 'value';`, { filePath: 'packages/shared/name-probe.ts' });
  assert.equal(result.fatalErrorCount, 0);
  return result.messages.filter(item => item.ruleId === 'schiild/domain-names');
}
test('ambiguous identifiers are rejected per requirements section 1.5', async () => {
  for (const name of ['id', 'sid', 'sId']) assert.equal((await check(name)).length, 1, name);
});
test('reserved platform names and Owner terminology are rejected', async () => {
  for (const name of ['Owner', 'ownerId', 'SchiildService', 'SchiildModule', 'SchiildConfig']) assert.equal((await check(name)).length, 1, name);
});
test('explicit Schiil, Schiild and Custodian names remain valid', async () => {
  for (const name of ['schiilId', 'schiildId', 'atelierId', 'custodianUserId', 'SchiildId', 'AppModule']) assert.equal((await check(name)).length, 0, name);
});
