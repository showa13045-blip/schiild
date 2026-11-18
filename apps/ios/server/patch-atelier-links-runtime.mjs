// Add one public metadata action to the existing QR-enabled runtime only.
export function patchAtelierLinksRuntime(source){const anchor='publicActions.add("reception.info");';if(source.split(anchor).length!==2||!source.includes('receptionService('))throw Error('Expected current reception-enabled runtime');return source.replace(anchor,anchor+'\npublicActions.add("reception.destination");');}
