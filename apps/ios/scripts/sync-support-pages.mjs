import {writeFile} from 'node:fs/promises';
import {supportPages} from '../server/support-pages.mjs';
for(const route of ['/support.html','/privacy.html'])await writeFile(new URL('../../demo/public'+route,import.meta.url),supportPages[route]);
console.log('Public support and privacy files synchronized');
