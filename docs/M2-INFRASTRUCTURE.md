# M2 接続先の構成提案

2026-09-09。サービスは未準備。これは構成選定の提案であり、リソースは未作成。M2全体・本番接続は未完了。

## 推奨

[ASSUMPTION] まず招待した少人数で試す段階と仮定し、AWS東京のLightsail 4GB / 2 vCPUを1台使う案を推奨する。NestJS API・Rustワーカー・PostgreSQL 16・Redisをプロセス／コンテナで分け、写真はS3へ保存する。Firebase Auth、S3 + CloudFront、Redis + BullMQ、Terraformという仕様§8の選定は維持する。AWSの地域は東京を提案するが、Firebaseを含めた全データの国内限定を保証する構成ではない。

これは停止を許容できる試験向け。1台の障害でAPI・DB・キューが停止する。4GBで現在の生成並列数4が安全かは未測定なので、実機負荷試験でメモリ上限と並列数を調整する。UTC 00:00の生成から00:15の通知までの時間枠を実測する。

| 用途 | 少人数試験の候補 | 公開運用へ進む際の候補 |
|---|---|---|
| 認証・通知 | Firebase Auth / FCM | 同じ。認証方式、ユーザー対応付け、端末登録を実装・検証 |
| API・生成 | Lightsail上でAPIとワーカーを分離 | ECS Fargateで別サービス、APIを複数AZへ配置 |
| DB | PostgreSQL 16、外部へポート非公開 | RDS PostgreSQL 16、Multi-AZ、復元試験 |
| キュー | Redis、AOF、noeviction、外部へ非公開 | ElastiCacheの非クラスタ構成を候補として接続・復旧試験 |
| 写真・生成物 | 非公開S3 + CloudFront | 同じ。OACでS3への直接アクセスを制限 |
| 画像審査 | Rekognitionの標準モデレーションを第一候補 | 同じ。独自学習モデルは当初不要 |
| 監視 | 仕様のSentry / Datadogを候補、プラン未選定 | 日次処理遅延・DLQ・エラー・容量・復元の監視を具体化 |
| 構成管理 | Terraformで作成内容をレビュー | 環境分離、変更レビュー、復旧手順を維持 |

BullMQはnoevictionと永続化が重要。マネージドRedisは単なるキャッシュとして設定せず、保持・フェイルオーバー特性を確認する。DBのgeneration_jobs/outboxから欠落キューを復旧する運用も必要。現在、この復旧運用は未実装。[BullMQ公式](https://docs.bullmq.io/guide/going-to-production)

CloudFront OACはS3へのアクセス制限であり、閲覧者の認可を代替しない。写真原本を作品公開パスへ流さず、作品の公開範囲に合わせて署名URL等を設計する。現在のAPIが返す保存キーを配信URLへ変える処理は残っている。[AWS公式](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

## 画像審査で決めること

[ASSUMPTION] Rekognition DetectModerationLabelsを第一候補とする。現在のHTTPアダプターとAWS APIは別の契約なので、AWS結果を変換するゲートウェイが別途必要。まだAWSへ写真を送っていない。[サービス機能](https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html)

仕様§10.4に従い、高い確信度のときだけ除外し、灰色判定は通す。数値の閾値や除外ラベルは未確定で、評価用写真で誤除外を調べてから判断する。通信失敗は灰色判定ではなく503とする。

顔があることから、写った本人の同意の有無は判定できない。顔検出だけを理由にperson除外へ変換しない。通常の不適切画像ラベルはotherへの対応を提案し、personを自動適用する条件は未解決事項として残す。新しい日本語文言は追加しない。

## 費用の見方

公式表示を確認した時点のUSD、税別。無料体験・クレジット・為替換算を含めない。

- Lightsail Linux、公開IPv4付き、4GB / 2 vCPU / SSD 80GBの基本料金は月24 USD。追加のスナップショット、外部サービス、転送超過は別。[Lightsail料金](https://aws.amazon.com/lightsail/pricing/)
- Firebase Authの電話認証はSMS送信ごとの課金。非電話の認証には無償枠があるが、電話認証を含む全体を無料とは見積もらない。送信先と回数を決めて算出する。[Firebase料金](https://firebase.google.com/pricing)
- 審査は月間画像数×東京リージョンの標準API単価。Custom Moderationの料金と混同しない。今回、東京の確定単価を取得できていないため確定金額は記載しない。[Rekognition料金](https://aws.amazon.com/rekognition/pricing/)
- S3容量・PUT/GET、CloudFront配信量、監視、バックアップ、ドメイン、SMS、審査ゲートウェイの実行費が別途必要。月24 USDは合計ではない。

試算用の負荷を100人が毎日投稿、1枚平均200KB、30日と置くと、月3,000枚、写真原本だけで約0.6GB増加する。1,000人なら30,000枚・約6GB。これは画像サイズの仮定からの計算であり実測値ではない。作品6成果物・アトリエ数・再生成・バックアップ・閲覧通信を加算する。保存期間を勝手に短縮しない。

公開運用案は、FargateのCPU/メモリ常時稼働料金に、RDS、ElastiCache、ALB、NATまたは外向き通信経路、IPv4、ログ、保存・配信費を加算する。少人数試験の基本料金と同列には扱えない。サイズ・AZ・閲覧量未決のため総額未算出。作成前に東京のAWS Pricing Calculator見積もりを提示する。[Fargate料金](https://aws.amazon.com/fargate/pricing/)・[RDS料金](https://aws.amazon.com/rds/postgresql/pricing/)・[計算ツール](https://calculator.aws/)

## 準備する順序

1. 試験人数、許容停止時間、月額予算を決めて試験案／公開案を確定する。
2. Terraformの構成案、月額見積もり、写真の保存・配信範囲、審査ラベルをレビューする。
3. 有料リソース作成の承認後、AWSとFirebaseをユーザーのアカウントで設定する。秘密鍵をチャットへ貼らず、サーバー側の秘密情報管理へ入れる。
4. Linux向けRustビルド、DB権限・マイグレーション、Redis永続化、S3、審査、Firebaseを接続する。API用DBロールと移行用管理ロールを分ける。
5. 認証・写真投稿・除外・生成・配信・端末通知・再起動／復元を実サービスで検証する。iPad通知の端末登録とAPNs設定も別途確認する。

今回の成果は接続先候補と残作業の整理。構成を承認しただけでは課金リソース作成やPRマージの承認とは扱わない。
