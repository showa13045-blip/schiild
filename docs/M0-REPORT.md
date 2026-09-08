# M0 実装・検証報告（正式資料受領後）

状態: **M0の受け入れ検査に成功。GitHubへpush済み。PR #1はドラフトでレビュー待ち。**

## 実装

- mobile / api / sharedのpnpmワークスペース、dbディレクトリ、Rust genワークスペース。
- 提供AGENTSを対応ディレクトリへ配置。Gitをローカル初期化。
- ESLintによる禁止語・感嘆符、曖昧なID名、予約名の検査。
- SchiilId / SchiildIdの取り違え・未ブランド文字列を型検査で拒否。
- 空のNestJSモジュールと起動コード。DB接続・機能APIはM2。
- 空のRustライブラリ。BSP・生成・WASMはM1。
- CIへlint、typecheck、test、cargo test、ビルド、正式資料の存在チェックを設定。
- requirements.md / copy.md / legal.mdを原文のまま受領・配置。

## 検証

| 項目 | 状況 |
|---|---|
| pnpm lint | 成功 |
| pnpm typecheck | 成功。ID取り違えの負例を含む |
| pnpm test | 17件成功 |
| pnpm check:requirements | 成功 |
| cargo test -p gen | 成功。M0の空のライブラリのためテスト件数0。生成の決定性検証ではない |
| APIビルド | 前段階で成功 |
| GitHub CI | 全ジョブ成功（下記リンク） |
| 正式資料のpush | m0-foundationへ反映済み |

Rust 1.98.1（Windows GNU）を作業フォルダに限定して導入しました。ユーザー全体のPATHは変更していません。

## 受け入れ条件

- [x] 禁止語でlintが失敗する
- [x] 感嘆符のある文言でlintが失敗する
- [x] SchiilIdとSchiildIdの取り違えを型検査で検出
- [x] requirements.md §1.4の用語辞書を確認（docs/SOURCE-REVIEW.mdに記録）
- [x] CIが緑: lint、型、17件のテスト、Rust基盤、API、iOS/Android/Webのビルド、正式資料検査が成功

ローカル成功をCI成功やpush済みとは表現しません。正式文言への全画面移行はM3で実施します。

## GitHub

- PR: https://github.com/showa13045-blip/schiild/pull/1
- 検証実行: https://github.com/showa13045-blip/schiild/actions/runs/34182189144
- 検証対象コード: 2a9d558834904f82f80e5bc542bbde1f5c3ef6fe
- mainへのマージは未実施。Rust生成機能はM1で実装するため、この成功は決定性の確認ではありません。
