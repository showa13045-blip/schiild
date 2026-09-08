import { existsSync } from 'node:fs';
const required = ['docs/requirements.md', 'docs/copy.md', 'docs/legal.md'];
const missing = required.filter(path => !existsSync(new URL('../' + path, import.meta.url)));
if (missing.length) { console.error('Missing authoritative documents:\n' + missing.join('\n')); process.exitCode = 1; }
else console.log('Required document files exist. Content review and remote push verification remain separate checks.');
