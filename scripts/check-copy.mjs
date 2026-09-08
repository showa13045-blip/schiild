import { readFileSync } from 'node:fs';
const text = readFileSync(new URL('../packages/shared/copy.ts', import.meta.url), 'utf8');
const forbidden = ['所有','オーナー','売却','出品','投資','利回り','値上がり','リターン','資産','レア度','ランキング','達成','未達','頑張り','お疲れさま','ぜひ','さあ','!','！'];
const failures = forbidden.filter(word => text.includes(word));
if (failures.length) { console.error('Prohibited UI copy:', failures.join(', ')); process.exitCode = 1; }
else console.log('UI copy check passed.');
