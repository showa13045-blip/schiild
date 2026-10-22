import {currentLanguage} from './language';
// Receive-only registration copy. Other interface catalogs keep their existing keys.
const rows={
 login:['WhatsAppでログイン','Sign in with WhatsApp'],
 register:['WhatsAppで新規登録','Sign up with WhatsApp'],
 open:['WhatsAppを開いて送信','Open WhatsApp and send'],
 note:['入力済みの確認メッセージを送信して、この画面に戻ってください。自分で始めた操作のメッセージだけを送信してください。','Send the pre-filled verification message, then return here. Only send messages for actions you started yourself.'],
 waiting:['送信を待っています。この画面からWhatsAppへの返信は送りません。','Waiting for your message. No WhatsApp reply will be sent.'],
 check:['送信を確認','Check my message'],
 received:['送信元を確認しました：{hint}','Sender verified: {hint}'],
 finish:['このアカウントで続ける','Continue with this account'],
 delete:['WhatsAppで削除を認証','Verify deletion with WhatsApp'],
 deleteNote:['確定後、WhatsAppで確認メッセージを送信し、この画面で削除を完了します。','After confirming, send a verification message in WhatsApp and finish deleting your account here.'],
 linked:['WhatsApp連携済み','WhatsApp linked'],
 expired:['確認の有効期限が切れました。最初からやり直してください。','Verification expired. Please start again.'],
 unavailable:['WhatsAppで確認できません。時間をおいて、もう一度お試しください。','WhatsApp verification is unavailable. Please try again later.'],
 pending:['確認メッセージはまだ届いていません。WhatsAppで送信してから確認してください。','Your verification message has not arrived yet. Send it in WhatsApp, then check again.'],
 notRegistered:['このWhatsAppアカウントは登録されていません。新規登録してください。','This WhatsApp account is not registered. Please sign up.'],
 registered:['このWhatsAppアカウントは登録済みです。ログインしてください。','This WhatsApp account is already registered. Please sign in.'],
 invalid:['WhatsAppで本人確認できませんでした。最初からやり直してください。','WhatsApp verification failed. Please start again.'],
 conflict:['このWhatsAppアカウントでは連携できません。','This WhatsApp account cannot be linked.'],
 limited:['現在、WhatsAppでの確認を受け付けていません。時間をおいてお試しください。','WhatsApp verification has reached its current limit. Please try again later.'],
 restart:['最初からやり直す','Start again'],
 authRequired:['参加するにはログインしてください。','Sign in to take part.'],
} as const;
export type WhatsAppCopyKey=keyof typeof rows;
export function w(key:WhatsAppCopyKey,params:Record<string,string>={}){
 // English is the explicit fallback for new copy while further translations are prepared.
 return rows[key][currentLanguage()==='ja'?0:1].replace(/\{(\w+)\}/g,(_,name)=>params[name]??`{${name}}`);
}
export function whatsappError(key:string){
 const codes={whatsapp_expired:'expired',whatsapp_unavailable:'unavailable',whatsapp_pending:'pending',whatsapp_not_registered:'notRegistered',whatsapp_registered:'registered',whatsapp_invalid:'invalid',whatsapp_conflict:'conflict',whatsapp_limited:'limited'} as const;
 return key in codes?w(codes[key as keyof typeof codes]):w('unavailable');
}
