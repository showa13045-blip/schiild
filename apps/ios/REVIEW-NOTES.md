# App Review用メモ

2026-10-27。審査用資格情報と操作説明をApp Store Connectの下書きへ保存する。
提出は未実行。EU27か国は対象外、無料、承認後は手動公開。

## English review instructions

Schiild is a daily photo journal with shared pixel artworks. There are no purchases,
advertisements, trading, direct messages, comments, likes or follower counts.

For review access, tap the Schiild logo, then App Review on the sign-in screen.
Use the supplied review_one username and password. The screen is visibly labelled
App Review. Its accounts, memberships, original photos, artworks, queue and sessions
are isolated from ordinary users. Review credentials cannot access ordinary data.

1. Create an atelier, choose its name, optional concept and visibility.
2. Open Record today's schiil, allow the camera and take a photo. Read and accept
   the posting rules on the existing confirmation screen, then confirm.
3. Optionally select GLOBAL SCHIILD or another eligible atelier as a destination.
   Each destination is explicit. Photos are private while awaiting review.
4. In Profile > Settings > Review photos, open the submitted image and approve it
   for the atelier and, if selected, GLOBAL SCHIILD. review_one is an operator only
   inside this isolated environment. Ordinary operators are separately configured.
5. Return to the atelier. Its creator can generate the artwork after approval.
   Open it to see the reveal, and browse it from the archive calendar.
6. In GLOBAL SCHIILD, pinch and drag to explore; tap your area to zoom in.
7. Profile > Settings > Delete account offers a selectable account ID and Copy ID.
   Enter the displayed ID and the supplied review password to delete this test account.
   Original photos, memberships, consent and queue records are removed. Shared artworks
   remain anonymous. Signing in again creates a new empty test account.

To test content reports, open Report below an atelier artwork or GLOBAL SCHIILD.
Select the schiil by tapping it or entering its 1-based X/Y coordinates, choose a
reason and send. Reports alone do not remove content. In Profile > Settings >
Review reports, open the selected contribution, enter an internal decision note
and remove that schiil or dismiss the report. Only the selected destination is
affected. Other contributions and the custodian remain. GLOBAL is compacted from
the remaining schiils, and reports continue to identify the same schiil if its
coordinates later change. These actions use isolated review data and the supplied
review_one account. Blocking abusive users is not yet implemented.

To test ordinary Sign in with Apple, exit App Review and choose Sign up with Apple
in the normal sign-in screen. It opens the native authentication sheet; no LINE or
WhatsApp account or phone number is needed. Normal Apple-account deletion requires
native Apple reauthentication. LINE and WhatsApp are optional alternatives.

Late operator approvals update the original day's artwork, without moving photos
into another day, changing an already selected custodian or altering other rendered
contributions. The one-week example is separately labelled fictional and read-only;
it is not the full-function review environment.

The app uses WKWebView plus native Apple authentication, LINE authentication sessions,
camera permissions, clipboard and sharing. Internet access is required. Native push
notifications are not currently implemented.

## 残作業

- Kapsoの実設定を確認してモデル改善利用を無効化し、第三者収集を含むプライバシー申告を確定する。
- 悪質な利用者のブロックを完成させる。作品からの通報と、選択した公開先のシールだけを除去する運営対応は実装済み。
- 実機の撮影・投稿・削除の確認と、提出用iPad／iPhone画像を用意する。
- 投稿ルールとは別に、配信権の最終申告を本人が確認する。
- 完了前にこれらを対応済みと申告しない。
