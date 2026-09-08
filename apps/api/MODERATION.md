# 画像審査ゲートウェイ契約

M2の外部審査接続口。特定ベンダーのAPI URLをそのまま設定する形式ではなく、以下を実装するサーバー側ゲートウェイを用意する。審査サービスの選定・判定閾値・実接続は未確定。

## リクエスト

`MODERATION_URL`へHTTPS POST。リダイレクトは拒否し、本文にはEXIFを除去した1080×1080 JPEGを送る。

- Authorization: Bearer（MODERATION_TOKEN）
- Content-Type: image/jpeg
- X-Image-SHA256: 本文のSHA-256
- Idempotency-Key: 同じSHA-256

ユーザーID・名前・キャプション・撮影日時は送らない。トークンは環境変数または秘密情報管理から供給し、リポジトリに保存しない。

## レスポンス

Content-Typeはapplication/json。本文は16KiB以下。10秒以内に応答する。

```json
{
  "schema": "schiild-moderation-v1",
  "image_sha256": "リクエスト本文と一致する64桁のSHA-256",
  "decision": "approved"
}
```

除外時は `decision: "rejected"` と `reason: "person"` または `"other"` を返す。理由は既存copy.mdの `excluded.reason.person` / `excluded.reason.other` に対応する。自由文や新しいUI文言は受け付けない。personは同意に関する判断が根拠のある場合のコードであり、人物検出だけで同意の欠如を推測してはいけない。

仕様§10.4に従い、高い確信度でのみ除外し、意味上の灰色判定は通す。その閾値はゲートウェイ側の審査方針として別途決定する。ネットワーク障害・未設定・不正JSON・不明なdecision・画像SHA不一致・理由不足は審査結果ではないため、投稿APIは503を返し、写真・投稿をDBに確定しない。

## 除外と再送

除外結果を得た投稿は201でその日の写真を記録し、レスポンスにもmoderationの判定と理由を返す。写真を保存し、作品入力からは除外する。同日再投稿は409。除外を理由とする差し替えや異議申立APIは追加しない。

moderation_outboxは写真FKで一意。5秒間隔の専用処理で本人の有効端末へデータ通知を送る。通知は既存 `push.excluded.title` / `push.excluded.body` のキーを含み、他人の投稿状況を含まない。UTC 00:15の日次通知スケジュールは変更しない。
送信成功後に送信済みを記録する。外部送信成功とDB更新の間に障害があると再配信の可能性があるため、受信側はschiilId＋typeで重複排除する。

## 起動前確認

`apps/api/.env.example`を参照して、秘密値は環境変数またはGit対象外の`.env`に設定する。
`pnpm --filter api check:config`は値を出力せず、必須項目・M1ファイルの存在・URL形式を確認する。接続可否や認証情報の有効性までは検証しない。
