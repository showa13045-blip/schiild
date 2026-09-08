# PostgreSQL 16 database

M2のPhase 1スキーマと実DB制約テスト。マイグレーションは専用データベースの管理接続で実行する。

```sh
# DATABASE_URLを設定して実行
pnpm db:migrate
pnpm test:db
pnpm db:seed  # ローカルの明示的な試験データ投入
```

`DATABASE_URL`は環境変数からのみ取得し、接続文字列をリポジトリへ保存しない。マイグレーションはトランザクションとadvisory lockを使い、適用済みSQLのSHAを照合する。既に適用したファイルの書き換えは拒否する。変更は後続の番号付きSQLに追加する。

アプリ用ログインには`schiild_app`グループロールを付与する。マイグレーション用アカウントと分離し、アプリをsuperuserで運用しない。`schiild_app`はNOLOGINで、パスワードや本番ユーザーを本マイグレーションから作らない。履歴のDELETE/TRUNCATE権限を与えず、誤った管理接続による削除もトリガーで拒否する。管理者によるDDL変更を防ぐ仕組みではない。

テストは専用の空データベースへマイグレーションした後に実行する。固定の試験IDをトランザクション内で使い、終了時にロールバックする。実ユーザーのDBでは実行しない。seedは明示的なローカルデータ投入で、Firebase UIDや認証情報を作らない。

## 仕様を実行可能にするための補完

- Phase 1アトリエ定員は§6.2の2 / 5 / 12 / 20へ制限し、bsp_128とする。公式アトリエや経済圏は含めない。
- 運営者roleの旧`owner`表記はルート規約の禁止語と衝突するため、内部コードを`creator`とする。
- `schiil_posts`は写真・ユーザー・論理日を複合FKで結び、他人の写真や別日への付け替えをDBでも拒否する。
- 写真・投稿の日時と論理日をUTCのCHECK制約で照合する。
- 全生命作品のNULL atelier_idにもUNIQUEが効くよう`NULLS NOT DISTINCT`を使う。
- `removed_schiil_ids`配列を`schiild_revision_removals`へ正規化し、各写真にFKを張る。版と除去写真の対応も履歴として保護する。
- Firebase UIDは認証済みユーザーとの対応に使う予約列。登録・認証APIは本変更には含まない。

PostgreSQL公式の[制約](https://www.postgresql.org/docs/16/ddl-constraints.html)と[権限](https://www.postgresql.org/docs/16/ddl-priv.html)に基づく。ER図はER.md。
