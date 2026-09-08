import {readFile,writeFile} from 'node:fs/promises';
const source=await readFile(new URL('../../../docs/copy.md',import.meta.url),'utf8').catch(()=>readFile(new URL('../../../../docs/copy.md',import.meta.url),'utf8'));
const copy={};
for(const line of source.split(/\r?\n/)){const match=line.match(/^([a-z][\w.]+)\s+(.+)$/);if(match)copy[match[1]]=match[2].replace(/\s+#.*$/,'').trim().replaceAll('\\n','\n');}
await writeFile(new URL('../src/copy.json',import.meta.url),JSON.stringify(copy,null,2)+'\n');
