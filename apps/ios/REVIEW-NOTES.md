# App Review用メモ

2026-11-03。更新した操作説明をAppleへ保存し、build 6を審査提出済み。
現在は審査待ち。EU27か国は対象外、無料、承認後は手動公開。

## English review instructions

Schiild is a daily photo journal with shared pixel artworks and member-only group chat. No purchases, ads, trading, direct messages, likes or follower counts.

For review, tap the Schiild logo, then App Review on the sign-in screen. Use the supplied review_one credentials. App Review is visibly labelled. Its accounts, memberships, photos, works, queues and sessions are isolated from ordinary users. review_one is an operator only in this environment.

1. Create an atelier with a name, optional concept and visibility.
2. Open Record today's schiil, allow the camera and take a photo. Read and accept the posting rules and image-check disclosure, then confirm. Optionally select GLOBAL SCHIILD or another eligible atelier. Each destination is explicit.
3. New photos appear provisionally while Xserver checks sexual content and gore with a local ONNX model. Rejected images are removed from all recorded destinations; Settings > Image review updates explains the reason. Retakes replace only a rejected photo before its original UTC 00:00 daily deadline. Uncertain results request a different photo; model results do not verify copyright or consent. Settings > Automatic image review shows queue status to review_one. Older private pending submissions remain private until an allow verdict.
4. Members can preview the atelier work. The creator can generate the finished work, open the reveal and use the archive calendar. GLOBAL SCHIILD supports pinch/drag; tap your area to zoom in. New atelier works partition among contributors only.
5. Profile > Settings > Delete account: copy/select the ID, enter it and the supplied review password. Original photos, memberships, consents, review notices, chat messages and profile pictures are erased. Shared works remain anonymous. Review login again creates an empty test account.

Reports: below an atelier work or GLOBAL, choose Report or block, tap a contribution or enter 1-based X/Y coordinates, then send a reason. Reports alone do not remove content. Settings > Review reports lets review_one preview and remove the selected contribution or dismiss the report. Other contributions and the custodian remain. GLOBAL compacts; reports still identify the same contribution.

Blocking hides that person's contributions only from your own works, archives and GLOBAL zoom. Shared works and coordinates remain. Blocks persist across sign-ins; Settings > Blocked people offers Unblock. Account deletion erases the block list.

Chat is available on today's atelier screen, including unfinished works, and archived atelier works. Only current members can read/send. GLOBAL has no chat. Messages appear immediately with a limited phrase filter and rate limits. The three-dot menu offers report text/avatar and block author. Settings > Chat and image review lets review_one inspect reports and remove messages. There is no random or anonymous matching.

Profile > Profile picture selects an image. It appears provisionally and undergoes the same automatic image checks. Rejected pictures are removed with a private notice. Image reports and operator removal remain available.

For native Apple authentication, exit App Review and choose Sign up with Apple. No LINE/WhatsApp account or phone number is required. Deletion uses native Apple reauthentication. LINE and WhatsApp are optional alternatives.

Build 6 adds optional APNs notifications, enabled from Settings with separate preferences. Normal accounts receive generic alerts; detailed review reasons require signing in. App Review push delivery is intentionally disabled to keep review accounts isolated. Device tokens are erased on account deletion; logout stops delivery. No Expo Push Service is used.

The labelled one-week example is fictional and separate from the functional review environment. WKWebView is integrated with native Apple/LINE authentication, camera, clipboard, sharing and notifications. Internet is required.

## 以前の準備記録（最新状況はSUBMISSION-HANDOFF.md）

- Kapsoの実設定は確認済みでモデル改善はオフ。会話保存は期限なし。認証メッセージ等の第三者収集をApp Privacyへ追加し、Meta側の警告と実機のWhatsAppログインを確認する。
- 利用者ブロックの実機確認。本人の画面だけで非表示・再ログイン後の維持・設定からの解除を実装し、通常／隔離審査環境をローカル検証済み。作品からの通報とシール単位の運営除去も実装済み。
- 実機の撮影・投稿・削除の確認と、提出用iPad／iPhone画像を用意する。
- 投稿ルールとは別に、配信権の最終申告を本人が確認する。
- 完了前にこれらを対応済みと申告しない。


## 2026-10-28 Kapso確認

管理画面の確認結果は [KAPSO-REVIEW.md](./KAPSO-REVIEW.md) に記録。
モデル改善は確認時点ですでにオフだった。無期限の会話保存とは別の設定として扱う。
App Privacyへ認証メッセージとカスタマーサポートを追加し、合計7種類の下書きを保存した。追加した2種類もアプリの機能・ユーザーに関連付け・非トラッキングとして設定済み。ログの分類と公開前の最終照合は残る。
審査提出・App Privacyの公開、課金設定の変更はこの確認では行っていない。


## 2026-10-28 提出準備

全10言語の掲載原稿を準備し、Apple対応の9言語・11ロケールを保存。クメール語は原稿のみ。App Privacyは9種類の下書きへ更新。公開と審査提出は未実行。新しい完了事項と残作業は [SUBMISSION-HANDOFF.md](./SUBMISSION-HANDOFF.md) に集約。ブロックの公開先検証後、英語審査メモをAppleへ保存し、再取得して一致を確認した。
