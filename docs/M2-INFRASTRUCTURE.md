# M2 一般公開に向けた構成提案

2026-09-09。ユーザーは最終的に「一般公開を目指す」と指定。少人数向けLightsail案を推奨から外し、以下へ切り替える。AWS・Firebaseは未準備で、リソース作成・デプロイは行っていない。M2全体・本番接続は未完了。

## 推奨構成

[ASSUMPTION] AWS東京、2つのAZを使い、API・ワーカー・DB・キューを分離する。次の台数と容量は初期見積もり用。「一般公開」は個別サイズや料金の承認を意味しない。

| 用途 | 提案 | 残作業 |
|---|---|---|
| 認証・通知 | Firebase Auth / FCM | 認証方式、ユーザー対応付け、端末登録、iOSのAPNs接続 |
| API | ECS Fargate Linux x86、0.5 vCPU / 1GBを2タスク、ALB | Linuxコンテナ、HTTPS / WebSocket、ヘルスチェック |
| 日次ワーカー | Fargate 1 vCPU / 2GBを2タスク | 複数タスク時の復旧・メモリ・並列数の実測 |
| DB | RDS PostgreSQL 16、db.t4g.small、Multi-AZ、gp3 20GB | TLS、バックアップ復元、権限分離 |
| キュー | ElastiCache Redis、cache.t4g.microを主系＋レプリカ、クラスタ無効 | noeviction、TLS、フェイルオーバー、容量試験 |
| 写真・生成物 | 非公開S3 + CloudFront OAC | 配信URLと閲覧認可 |
| 画像審査 | Rekognition標準DetectModerationLabelsを第一候補 | 既存HTTP契約へ結果を変換するゲートウェイ |
| ネットワーク | 公開ALB、他は非公開サブネット、AZごとのNAT | 外向き通信・IPv4・転送を含む見積もり |
| 監視・構成管理 | 仕様§8のSentry / Datadog、Terraform | プラン選定、日次遅延・DLQ・エラー・容量・課金監視 |

仕様§8のスタックを維持する。東京を提案するが、Firebaseを含む全データの国内限定を保証するものではない。将来のNext.js公開ページは今回作成していない。

接続：端末 → ALB → API → DB / S3 / 審査ゲートウェイ。APIとワーカーがRedisおよびDBを共有し、ワーカーがRust生成・FCM送信を担当。作品配信はCloudFront → 非公開S3。

BullMQはnoevictionと永続化が重要。マネージドRedisの保持・復旧特性を確認し、DBのgeneration_jobs/outboxから欠落キューを復旧する運用も必要。現在、この復旧運用は未実装。[BullMQ公式](https://docs.bullmq.io/guide/going-to-production)

OACはS3へのアクセス制限であり、閲覧者の認可を代替しない。写真原本を作品公開パスへ流さず、公開範囲に合わせて署名URL等を設計する。現在の保存キーを配信URLへ変える処理は残っている。[AWS公式](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)

## 概算の内訳

AWS公開価格データの東京リージョン、オンデマンド、730時間/月、USD、税別。無料枠・為替換算は含めない。2026-09-09取得。費用の一部の計算であり、請求合計や性能保証ではない。

| 項目 | 計算 | 月額 USD |
|---|---|---:|
| Fargate計4タスク | 合計3 vCPU・6GB × 730h。vCPU 0.05056/h、GB 0.00553/h | 134.95 |
| RDS Multi-AZ | 0.101/h × 730。待機系込みの単価 | 73.73 |
| RDS gp3 20GB | 0.276/GB月 × 20 | 5.52 |
| Redis 2ノード | 0.025/h × 2 × 730 | 36.50 |
| ALB本体 | 0.0243/h × 730 | 17.74 |
| ALB負荷の仮定 | 平均1 LCU × 0.008/h × 730 | 5.84 |
| 上記小計 | 丸め前の値から計算 | **274.28** |

価格根拠：[Fargate東京データ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonECS/current/ap-northeast-1/index.json)、[RDS東京データ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-northeast-1/index.json)、[Redis東京データ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonElastiCache/current/ap-northeast-1/index.json)、[ALB東京データ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSELB/current/ap-northeast-1/index.json)。current URLは将来変わる。延長サポート料は含めず、通常サポート内のエンジン版を選定する。

**小計に含まれないもの**：NAT本体・処理量、公開IPv4、AZ間通信、S3・CloudFront、審査とゲートウェイ、Firebase SMS、監視・ログ、秘密情報管理、ECR、超過バックアップ、DNS/ドメイン、CPUクレジット超過、増設、税金。月274.28 USDで運用全体を賄える意味ではない。作成前に全体見積もりを提示する。

可変費用：

- Rekognition標準Group2は最初の100万画像で0.0013 USD/画像。100人×30日×1回なら3.90 USD、1,000人なら39.00 USD。再試行・別画像APIは加算。Custom Moderationとは別料金。[東京データ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRekognition/current/ap-northeast-1/index.json)
- S3 Standardは最初の50TBで0.025 USD/GB月、PUT等は1,000回0.0047 USD、GET等は10,000回0.0037 USD。[東京データ](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/ap-northeast-1/index.json)
- 100人が毎日投稿、平均200KB、30日なら月3,000枚・原本約0.6GB増加。1,000人なら30,000枚・約6GB。サイズは仮定。作品6成果物・アトリエ数・再生成・バックアップ・閲覧通信を加算し、保存期間は勝手に短縮しない。
- Firebase電話認証はSMS送信ごとの課金。非電話認証には無償枠があるが、電話認証込みで無料とは見積もらない。[Firebase料金](https://firebase.google.com/pricing)

## 審査の未確定事項

[ASSUMPTION] Rekognition標準モデレーションを第一候補とする。AWSへ写真は未送信。独自学習モデルは当初不要と提案する。[機能説明](https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html)

仕様§10.4に従い、高い確信度のときだけ除外し、灰色判定は通す。閾値やラベルは評価用写真で誤除外を調べてから判断する。通信失敗は灰色判定ではなく503とする。

顔の存在から本人の同意は判定できない。顔検出だけでperson除外にしない。通常の不適切画像ラベルはotherへの対応を提案し、personの自動適用条件は未解決として残す。新しい日本語文言は追加しない。

## 公開前の進め方

1. 想定利用人数・月額予算・認証方式を決め、通信を含む全体見積もりとTerraform案をレビュー。
2. 有料リソース作成の承認後、ユーザーのAWS/Firebaseで設定。秘密鍵はチャットへ貼らずサーバー側の秘密情報管理へ入れる。
3. Linuxビルド、DB権限、マイグレーション、Redis、S3、審査、認証、端末通知を接続。実行用DBロールと移行用管理ロールを分ける。
4. 投稿・除外・生成・配信・通知を実サービスで確認。UTC 00:00から00:15の時間枠、重複防止、停止・復旧・バックアップ復元を測定。
5. 公開範囲・画像アクセス制御・削除要請対応・レート制限・監視を確認し公開可否を判断。M2終了だけで一般公開の準備完了とはしない。

今回確定したのは一般公開を目指す方針。個別構成・費用・審査閾値・有料リソース作成・PRマージは未承認。
