// Select standard simulator sizes; never target a developer's existing devices.
import {execFileSync} from 'node:child_process';
const list=JSON.parse(execFileSync('xcrun',['simctl','list','--json'],{encoding:'utf8'})),runtime=list.runtimes.filter(item=>item.isAvailable&&item.identifier.includes('.iOS-')).sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}))[0];if(!runtime)throw Error('No available iOS runtime');
const choices={iphone:['iPhone 16 Pro','iPhone 15 Pro','iPhone 16','iPhone 15'],ipad:['iPad Pro 13-inch (M4)','iPad Pro 13-inch (M5)','iPad Pro (12.9-inch) (6th generation)']};
for(const [family,names]of Object.entries(choices)){const type=names.map(name=>list.devicetypes.find(item=>item.name===name)).find(Boolean);if(!type)throw Error('No supported '+family+' simulator');console.log([family,type.identifier,runtime.identifier].join('\t'));}
