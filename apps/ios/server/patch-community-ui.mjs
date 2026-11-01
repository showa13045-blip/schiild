// Preserve the live UI's newer authentication and invitation fixes.
export function patchCommunityUI(source){
 if(!source.includes('today-tile')||source.includes('/* community-layout-v1 */'))return source;
 const pattern=/\(0,[\w$]+\.partition\)\(([\w$]+)\.capacity,\(0,[\w$]+\.random\)\(\1\.seed\)\)/g,matches=[...source.matchAll(pattern)];
 if(matches.length!==1)throw Error('Flexible layout UI anchor changed');
 source=source.replace(pattern,(match,state)=>'('+state+'.layoutRects??'+match+')');
 const initial=/\(0,([\w$]+)\.initial\)\(([\w$]+)\.capacity,!1\)/g;if([...source.matchAll(initial)].length!==1)throw Error('Online placeholder anchor changed');
 return source.replace(initial,(_,module,value)=>'(0,'+module+'.initial)('+value+'.online?Math.min('+value+'.capacity,20):'+value+'.capacity,false)')+'\n/* community-layout-v1 */';
}
