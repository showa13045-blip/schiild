# App Review用メモ

2026-11-02。審査用資格情報と操作説明をApp Store Connectの下書きへ保存する。
提出は未実行。EU27か国は対象外、無料、承認後は手動公開。

## English review instructions

Schiild is a daily photo journal with shared pixel artworks and member-only group
chat. No purchases, ads, trading, one-to-one messages, likes or follower counts.

For review, tap the Schiild logo, then App Review on the sign-in screen. Use the
supplied review_one credentials. App Review is visibly labelled; its accounts,
memberships, photos, works, queues and sessions are isolated from ordinary users.
review_one is an operator only in this environment.

1. Create an atelier; choose a name, optional concept and visibility.
2. Open Record today's schiil, allow the camera and take a photo. Read and accept
   the posting rules, then confirm. Optionally select GLOBAL SCHIILD or another
   eligible atelier. Each destination is explicit. Photos stay private pending review.
3. Profile > Settings > Review photos: preview and approve the photo for each selected
   destination. Return to the atelier. Members can preview after approval; the creator
   can generate the finished work. Open the reveal and archive calendar.
4. GLOBAL SCHIILD: pinch and drag; tap your area to zoom in.
5. Profile > Settings > Delete account: Copy ID or select the displayed ID, enter it
   and the supplied review password. Original photos, memberships, consent, pending
   reviews, chat messages and profile pictures are erased; shared works remain
   anonymous. Signing in again creates an empty test account.

Reports: below an atelier work or GLOBAL, choose Report or block. Tap a contribution
or enter its 1-based X/Y coordinates, select a reason and send. A report alone does
not remove content. Settings > Review reports: preview the contribution, enter a
decision note, then remove that schiil from the selected destination or dismiss.
Other contributions and the custodian remain. GLOBAL compacts after removal;
reports identify the same contribution even when coordinates change.

Blocking: select a contribution in Report or block, then Block this person. Their
contributions are hidden only from your view in works, archives and GLOBAL zoom.
Shared works and coordinates remain intact. Blocks persist across sign-ins;
Settings > Blocked people offers Unblock. Deletion erases your block list.

Chat: use Chat on today's atelier screen, including unfinished works, or an archived
work. Only current members can read/send. GLOBAL has no chat. Messages appear
immediately with a limited phrase filter and rate limits. The three-dot message
menu offers report text/avatar and block author. Blocked messages disappear only
for the viewer. Settings > Chat and image review lets review_one inspect reports
and remove messages or dismiss reports. There is no random or anonymous matching.

Profile > Profile picture: select an image. Pending pictures are visible only to
the uploader; approve them in Chat and image review to show them to other members.

For native Apple authentication, exit App Review and use Sign up with Apple on the
normal sign-in screen. No LINE/WhatsApp account or phone number is required. Normal
Apple-account deletion uses native Apple reauthentication. LINE and WhatsApp are
optional alternatives.

Late approval updates the original day's work and can repartition it for approved
contributors; its day and selected custodian remain. The one-week example is
labelled fictional and is separate from the full-function review environment.

WKWebView is used with native Apple sign-in, LINE authentication sessions, camera,
clipboard and sharing. Internet is required. Native push is not implemented.

## 残作業

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
