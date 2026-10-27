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

公開準備の実績と未完了項目は [APP-STORE-READINESS.md](./APP-STORE-READINESS.md)、
審査用の説明は [REVIEW-NOTES.md](./REVIEW-NOTES.md) に記録します。EUは配信対象外、
承認後は手動公開です。プライバシーの下書き保存を一般公開・審査提出の完了とは扱いません。

サポート・プライバシー本文の情報源は `server/support-pages.mjs` です。静的Webの
書き出し前に `node apps/ios/scripts/sync-support-pages.mjs` で `apps/demo/public/` も同期します。
`prepare-server.mjs` はこの2ページを既存のAPI・画像と分けて配信します。
既存の公開UIへリンクだけを追加する場合は `patch-support-links.mjs` の照合を通し、
Web・iOS両方のJavaScriptとHTMLのキャッシュ更新を確認します。照合失敗時は上書きしません。

署名済み IPA や TestFlight への送信成功だけでは、一般公開の審査通過を保証しません。
実機のカメラ・LINE / Apple / WhatsApp 認証・削除・共有を確認してください。
ネイティブのプッシュ通知はまだ実装していません。Web Push の動作を iOS ネイティブの
通知対応と見なさないでください。App Store の一般公開前には、プライバシー情報、
スクリーンショット、サポート先、UGC 対応、審査用の説明を用意します。

## 隔離したApp Reviewアクセスと公開前確認

`/review/?login=1` は審査専用のID・パスワードを使う。通常の外部連携認証を緩めるものではない。
同じDurable Object namespace内の別の固定名 `app-store-review-v1` を使い、アカウント・画像・
作品・セッションを通常データから分離する。ブラウザの保存領域も `schiild.review.` で分離する。
通常APIは審査用セッションを認めず、審査APIは通常のアカウント・招待コードを利用しない。
審査用の公開作品も、審査用アカウントの認証なしでは読めない。

`APP_REVIEW_CONFIG` はCloudflare secretで、専用IDと高エントロピーのパスワードのハッシュのみを持つ。
原文は保護されたWindows資格情報に置き、Appleの非公開の審査情報欄へ保存する。Gitや画面例には含めない。
削除を試した後も、専用資格情報で空の審査アカウントを新しく作れる。通常アカウントの削除・再登録の仕様は変更しない。

`MODERATION_CONFIG` は `enabled` と担当者のアカウントID配列 `operators` を持つシークレット。
通常環境の担当者は利用者が指定する。審査環境では `review_one` に限定して審査用画像の確認を試せる。
両方で、未承認の画像は共同作品・GLOBAL・公開サムネイルへ流さない。
元写真の確認・承認・非公開は `/moderation/`（審査環境は `?mode=review`）から行う。
通常データを審査モードへ複製せず、利用者の投稿を検証用に作成・削除しない。

リリースは最新の生きたWhatsApp対応バックエンドを保ったガード付きの差分にする。
今回の既知の元リリースに対し、`prepare-review.mjs`、次に `prepare-moderation.mjs` で段階的に準備した。
すでに適用したコードへ同じパッチを重ねたり、古いcheckoutのWorkerを丸ごと公開したりしない。
準備時に現在のモジュール・UIのSHA256とシークレット／画像設定を照合し、直前に再確認する。
今後は更新済みのソースとリリース記録を使い、圧縮後のサイズと通常・審査両方の分離テストも確認する。

承認が翌日になっても、受け付けた元の日付の作品を更新する。通常APIの過去日投稿は許可しない。
すでに発表した預かり手・種・区画を維持し、退会者の匿名の描画を消さない。
アカウント削除時は元写真・確認待ち・個人への同意記録も消す。共同作品と匿名の画素は維持する。
