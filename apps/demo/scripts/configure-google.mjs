// Local setup only. Never include this input server in the exported site or Worker.
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {validGoogleClient} from '../server/google-identity.mjs';
const directory=new URL('../.deploy-private/',import.meta.url),port=8799,origin=`http://127.0.0.1:${port}`,csrf=randomBytes(32).toString('hex');let saved=false;
await mkdir(directory,{recursive:true});
const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"};
const complete='<meta charset="utf-8"><h1>Google設定を保存しました</h1><p>チャットに「Google設定完了」とだけ教えてください。IDやキーを送る必要はありません。</p>';
const form=`<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>SchiildのGoogleログイン設定</title><style>body{font-family:system-ui;max-width:680px;margin:40px auto;padding:24px;line-height:1.9}input{box-sizing:border-box;width:100%;padding:14px;font-size:16px}button{margin-top:24px;padding:14px 24px;font-size:16px}code{overflow-wrap:anywhere}</style><h1>Googleログインの接続設定</h1><ol><li><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Google Auth Platform</a>でプロジェクトを作成または選択します。</li><li>「ブランディング」でアプリ名をSchiild、サポートと連絡先を自分のメールアドレスに設定します。対象は「外部」。承認済みドメインは <code>pickleballnavi.jp</code>、ホームページは <code>https://schiild.pickleballnavi.jp/</code> です。プライバシーポリシーは運用内容を確認してから <code>https://schiild.pickleballnavi.jp/privacy.html</code> を指定してください。</li><li>「クライアント」から「ウェブアプリケーション」を作成し、承認済みJavaScript生成元へ <code>https://schiild.pickleballnavi.jp</code> を追加します。リダイレクトURIは不要です。</li><li>データアクセスは基本の <code>openid / email / profile</code> だけです。Gmail APIやメールへのアクセス権限を追加する必要はありません。</li><li>テスト中は「対象」で利用者のGoogleメールをテストユーザーに追加します。誰でも使えるようにする場合はGoogle側の公開状態と確認事項を確認してください。</li><li>作成した「クライアントID」を下に入力します。クライアントシークレットやGoogleパスワードは入力しません。</li></ol><p>この入力ページはPC内だけで動作します。値はGit対象外のローカル設定へ保存します。</p><form method="post" action="/save"><input type="hidden" name="csrf" value="${csrf}"><label for="client">GoogleのWeb用クライアントID</label><input id="client" name="clientId" placeholder="123456789-xxx.apps.googleusercontent.com" autocomplete="off" required><button>PCに保存する</button></form></html>`;
const server=http.createServer(async(req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
 if(req.method==='GET'&&req.url==='/'){res.writeHead(200,headers);res.end(saved?complete:form);return;}
 if(req.method==='POST'&&req.url==='/save'&&!saved&&req.headers.origin===origin){
  try{let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)throw Error('size');}
   const values=new URLSearchParams(body),nonce=values.get('csrf')??'',clientId=values.get('clientId')?.trim();
   if(nonce.length!==csrf.length||!timingSafeEqual(Buffer.from(nonce),Buffer.from(csrf))||!validGoogleClient(clientId))throw Error('invalid');
   await writeFile(new URL('google-auth.json',directory),JSON.stringify({clientId})+'\n',{mode:0o600});saved=true;
   console.log('Google client configuration saved; value not logged.');res.writeHead(200,headers);res.end(complete);
  }catch{res.writeHead(400,headers);res.end('<meta charset="utf-8"><p>保存できませんでした。クライアントIDの形式を確認してください。</p><a href="/">戻る</a>');}return;
 }res.writeHead(403);res.end();
});
server.listen(port,'127.0.0.1',()=>console.log(`Google setup input: ${origin}/`));
