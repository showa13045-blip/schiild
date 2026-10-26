// Migration bridge for the deployed demo revision whose WhatsApp backend is newer
// than this checkout. Never publish the older checkout over the live backend.
// Every targeted replacement must match; original assets, providers and bindings stay.
/* eslint-disable schiild/product-copy -- These strings are exact executable source, not UI copy. */
export function patchLiveApple(original){
 let source=original;
 function once(before,after){if(source.split(before).length!==2)throw Error('Live Apple migration precondition failed: '+before.slice(0,65));source=source.replace(before,after);}
 once('function accounts(store, { now =','function accounts(store, { appleConfig = null, now =');
 once('  const whatsapp = whatsappAccounts(store, { config: whatsappConfig, now, identity, session, purgePhotos: requireLine, images });',
  '  const whatsapp = whatsappAccounts(store, { config: whatsappConfig, now, identity, session, purgePhotos: requireLine, images });\n  const apple = appleAccounts(store, {config:appleConfig,now,identity,session,images,ErrorClass:ApiError,prepareDeletion:prepareOriginalDeletion});');
 once('    if (typeof body.action === "string" && body.action.startsWith("account.whatsapp."))',
  '    if (typeof body.action === "string" && body.action.startsWith("account.apple")) return apple(body,credential);\n    if (typeof body.action === "string" && body.action.startsWith("account.whatsapp."))');
 once('...account.whatsappSubject ? { whatsappLinked: true, hasPassword: Boolean(account.passwordHash) } : {}, canDelete:',
  '...account.whatsappSubject ? { whatsappLinked: true, hasPassword: Boolean(account.passwordHash) } : {}, ...account.appleSubject ? {appleLinked:true,hasPassword:false} : {}, canDelete:');
 source=source.replaceAll('actor.account.lineSubject || actor.account.whatsappSubject','actor.account.lineSubject || actor.account.whatsappSubject || actor.account.appleSubject');
 source=source.replaceAll('account.lineSubject || account.whatsappSubject','account.lineSubject || account.whatsappSubject || account.appleSubject');
 source=source.replaceAll('!actor.account.lineSubject && !actor.account.whatsappSubject','!actor.account.lineSubject && !actor.account.whatsappSubject && !actor.account.appleSubject');
 once('      if (requireLine && actor.account.lineSubject) fail3(400, "line_invalid");',
  '      if (actor.account.appleSubject) fail3(400,"apple_invalid");\n      if (requireLine && actor.account.lineSubject) fail3(400, "line_invalid");');
 once('    async registerWhatsApp(account) {','    async registerApple(account) { return registerAppleInStorage(storage,account); },\n    async pruneAppleChallenges(now) { storage.sql.exec("DELETE FROM rooms WHERE key LIKE \'apple-challenges/%\' AND json_extract(data,\'$.expires\') <= ?",now); },\n    async registerWhatsApp(account) {');
 source=source.replaceAll('(google|line|whatsapp)','(google|line|whatsapp|apple)').replaceAll('(line|whatsapp)-challenges','(line|whatsapp|apple)-challenges');
 once('  return isLineParticipant(actor) || Boolean(actor?.sessionKey && /^[a-f0-9]{64}$/.test(actor.account?.whatsappSubject ?? ""));',
  '  return isLineParticipant(actor) || Boolean(actor?.sessionKey && /^[a-f0-9]{64}$/.test(actor.account?.whatsappSubject ?? actor.account?.appleSubject ?? ""));');
 once('lineConfig, whatsappConfig: readWhatsAppConfig(this.env.WHATSAPP_LOGIN_CONFIG) }), credential',
  'lineConfig, whatsappConfig: readWhatsAppConfig(this.env.WHATSAPP_LOGIN_CONFIG), appleConfig: readAppleConfig(this.env.APPLE_LOGIN_CONFIG) }), credential');
 once('["account.login", "account.register", "account.google", "account.delete", "account.line", "account.whatsapp.start", "account.whatsapp.complete"]',
  '["account.login", "account.register", "account.google", "account.delete", "account.line", "account.whatsapp.start", "account.whatsapp.complete", "account.apple.start", "account.apple"]');
 return 'import {appleAccounts,registerAppleInStorage} from "./apple-accounts.mjs";\nimport {readAppleConfig} from "./apple-identity.mjs";\n'+source;
}
