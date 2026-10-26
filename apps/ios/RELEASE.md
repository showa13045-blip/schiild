# iOS 初回テスト版

2026-10-27 JST 時点。

- バージョン: `1.0.0 (4)`
- 対象: iPhone / iPad、iOS / iPadOS 16.4 以降
- [EAS の署名付きビルド](https://expo.dev/accounts/show.a.13045/projects/schiild-ios/builds/44a358b0-a068-4ded-84fe-92d1099d11ff)
- [App Store Connect / TestFlight](https://appstoreconnect.apple.com/apps/6827169562/testflight/ios)
- Apple 側の build ID: `0a0ed809-d623-4593-b4f3-6e5fa68b413c`

build 3 は EAS Submit から送信しました。Apple 認証対応の build 4 は、EAS の送信待機を
避けて公式 App Store Connect `buildUploads` / `buildUploadFiles` API から送り、
Apple 側の `VALID` と `READY_FOR_BETA_TESTING` を確認しました。重複する EAS の
待機ジョブは取り消しています。App Store の一般公開・審査提出は行っていません。

Cloudflare に Apple 認証と iOS 専用 UI を反映し、通常の Web・週サンプル・LINE /
WhatsApp の設定が維持されることを確認しました。秘密情報は Windows の保護された
保存先と Cloudflare シークレットで扱い、配布コード・Git には含めません。

確認済み: 語彙 lint、全パッケージの型検査、ルート 17 テスト、デモと iOS の
158 テスト（追加の外部ランタイム依存テスト 8 件はスキップ）、配信用コードと実 SQLite
による Apple 登録・投稿・生成・元写真削除・連携解除・再登録の統合テスト。
Rust のコマンドも成功しましたが、元の該当パッケージのテスト数は 0 件です。

実機での Apple / LINE / WhatsApp 認証、カメラ、共有、アカウント削除は、
この TestFlight ビルドで確認する必要があります。ネイティブプッシュは未対応です。
