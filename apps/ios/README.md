# Schiild iOS / iPadOS

`demo` ブランチに独立した Expo 配布クライアントを置いています。
本番 M1〜M4 の `apps/mobile`・API・生成エンジンは変更しません。

- Bundle ID: `app.schiild.mobile`
- Apple Team: `PQ7WUU6HWC`
- App Store Connect: `6827169562`
- Expo project: `f6511507-2153-47f3-8e36-6285327747dd`
- 公開サービス: <https://schiild.app/>

## 構成

アプリは WKWebView でデモの UI を表示し、カメラの OS 権限、ネイティブ共有・コピー、
LINE の認証セッション、Apple の認証 UI を iOS に接続します。全面的なネイティブ UI
への書き換えではありません。WKWebView は固定の HTTPS オリジンだけにブリッジを公開し、
外部サイト・任意の URL スキーム・任意のスクリプト呼び出しは受け付けません。

LINE は `server/native-surface.mjs` で認証セッションからアプリへ戻します。
通常のブラウザの LINE 認証は変えず、短時間の HttpOnly cookie と OAuth state が
一致した場合だけ `schiild://auth/line` に戻します。

Apple はアプリ専用の nonce と一度限りの challenge を使います。Cloudflare が Apple の
署名・発行元・対象アプリ・nonce・時刻と認可コード交換の結果を検証してセッションを
発行します。認可用の秘密キーは App Store Connect のアップロード用キーとは別です。
更新トークンは暗号化して保存し、削除時には Apple の認可を取り消し、元写真と
アカウントを削除します。共同作品は匿名の記録として残します。

## ローカル確認

```sh
pnpm --filter schiild-ios typecheck
pnpm --filter schiild-ios test
pnpm --filter schiild-ios export:ios
```

Apple 認証は Expo Go と配布アプリで識別子が異なるため、最終確認には署名した
TestFlight ビルドを使います。iOS シミュレーターは Windows では起動できません。

```sh
pnpm --filter schiild-ios build:testflight
pnpm --filter schiild-ios submit:testflight
```

初回には Apple の署名情報と App Store Connect API キーを EAS に設定します。
秘密キーは Git・アプリ config・公開環境変数へ書かないでください。
`eas.json` の本来の設定には秘密キーのパスも含めません。

## iOS 専用 UI と既存デモの維持

公開中の WhatsApp バックエンドは、このチェックアウトより新しいリビジョンです。
このチェックアウトの Worker 全体をそのまま本番に上書きしないでください。

1. 現在の Worker の全モジュールと設定をバックアップします。
2. デモの静的 Web UI を `apps/ios/dist/web` に書き出します。
   `EXPO_PUBLIC_DEMO_API_URL=/api/atelier` を指定し、
   `EXPO_PUBLIC_FOLDER=public-ios-empty` で大量の週サンプル画像をコピーしません。
3. `scripts/prepare-server.mjs` にバックアップの `worker.js`、出力先、既存の
   `ios-entry.mjs` を渡します。既存の認証処理へ Apple だけを追加します。
   対象ソースが想定と異なる場合は停止する設計です。
4. 一時 SQLite で登録・投稿・生成・削除・再登録を検証します。
5. 元のモジュール・assets・bindings・secrets を維持して、新しい runtime を配信します。

`SchiildNative/1.1` のクライアントだけに専用 UI を返します。通常の Web と `/week/`
は既存の配信を使います。認証・参加の権限はサーバーで検証し、User-Agent は
権限判定には使いません。

`IOS_APPLE_STAGE` を配信用コードの検証先に指定すると統合テストを実行します。
`IOS_APPLE_RUNTIME=node` は Cloudflare のオブジェクト基底クラスだけを置き換え、
配信用コードと実 SQLite、実署名検証を通します。外部 Apple 応答だけをモックします。
Windows のローカル workerd では変更前のコードでも起動エラーが発生しているため、
Node による結果を workerd の成功と扱わないでください。

## 配布前の残る確認

署名済み IPA や TestFlight への送信成功だけでは、一般公開の審査通過を保証しません。
実機のカメラ・LINE / Apple / WhatsApp 認証・削除・共有を確認してください。
ネイティブのプッシュ通知はまだ実装していません。Web Push の動作を iOS ネイティブの
通知対応と見なさないでください。App Store の一般公開前には、プライバシー情報、
スクリーンショット、サポート先、UGC 対応、審査用の説明を用意します。
