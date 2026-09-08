# AGENTS.md — バックエンド

要件定義書 §3・§9。Phase 1 のスコープ外（KUUN・売買・課金・eKYC）を先回りして実装しない。

## Testing

```bash
pnpm --filter api test
pnpm --filter api test -t "utc boundary"
pnpm db:migrate && pnpm db:seed
```

UTC 境界の 23:59 と 00:01 の投稿テストを必ず含めること。

## DB 制約はプロダクトの憲法

アプリ層のバリデーションだけに頼らない。以下は DB 制約として置く。

- `schiils UNIQUE(user_id, schiild_date)` — 1人1日1シール
- `schiil_posts UNIQUE(atelier_id, user_id, schiild_date)` — 1アトリエ1日1枚
- `schiilds UNIQUE(atelier_id, schiild_date)` — 生成の冪等性
- `schiild_custody_events` と `schiild_revisions` は物理削除を禁止（REVOKE DELETE）
- `schiil_id` と `schiild_id` は末尾1文字違い。**全ての参照に外部キー制約を張る**

論理日は UTC 00:00 起点。`to_schiild_date(ts)` = `(ts AT TIME ZONE 'UTC')::DATE`

## 投稿 API

- 本日投稿済みなら 409。レスポンスに「既存シールを追加アトリエへ投稿する」導線を含める
- 画像は 1080x1080 / JPEG のみ受理。他は 400
- ギャラリー由来の画像は存在しない。EXIF による撮影日時の判定を実装しない
- EXIF が含まれていたら保存前に除去（クライアントの不具合に対する保険）
- `schiils` と `schiil_posts` を同一トランザクションで作成する

## 抽選

- 順列は生成時に一度だけ確定させ `lottery_order` に保存する
- 辞退時に引き直さない。次点へ繰り下げるだけ
- `GET /v1/schiilds/{id}/lottery` は認証不要の公開エンドポイント（検証可能性の担保）
- Phase 1 では受取期限を設けない

## 日次バッチ

- UTC 00:00 起動、15分以内に完了。冪等（同じ日付で2回実行しても重複生成しない）
- 生成時にサーバー CSPRNG で `lottery_seed` を作り、順列を確定させて保存
- **UTC 00:15 に全ユーザーへ一斉配信。** ユーザーごとの予約配信をしない
- 生成が間に合わなかったアトリエの参加者には生成失敗の通知を送る
- 生成失敗時に代替画像を出さない

## レスポンスに含めてはいけないもの

- 他ユーザーの未投稿状態を「催促可能」な形で提示するデータ
- 価格・価値・希少度ランキングに類する情報
- 将来の経済圏に関する示唆
