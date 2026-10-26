# App Review用メモ（提出準備中）

この文書は未提出。安全対策・連絡先の確認後、実装済みの内容だけをApp Store Connectへ転記する。
EU27か国は配信対象外。無料、承認後は手動公開。

## English review instructions

Schiild is a daily photo journal with shared pixel artworks. The app has no purchases,
advertising, trading, direct messaging, comments, likes, or follower counts.

Public ateliers and GLOBAL SCHIILD can be viewed without an account. To test account
features on iPhone or iPad, select Sign up with Apple. This opens the native Apple
authentication sheet. Sign in with Apple is also available for an existing Schiild
account. Creating an account through LINE or WhatsApp is optional; Apple registration
does not require either app or a phone number.

1. Register with Apple, open Profile, and set a display name.
2. Create an atelier. Name it and optionally set its concept and visibility.
3. Select Record today's schiil, allow the camera, take a photo, and confirm it.
4. On the destination page, optionally select GLOBAL SCHIILD or another eligible atelier.
5. The normal artwork cycle follows the UTC day boundary. The one-week example
   contains fictional records to demonstrate the calendar and artwork explorer.
   This example is read-only and is labelled as fictional. It does not provide a
   substitute for testing account creation, real posting, or deletion.
6. Open GLOBAL SCHIILD and pinch to zoom or drag to move around the image.
7. Profile > Settings > Delete account displays a selectable account ID and a Copy ID
   action. Enter that ID and confirm. Apple authentication is required again before
   revoking the authorization and deleting the account and its original photos.
   Generated shared artworks remain as anonymous records. Old memberships and profile
   details are not restored if a new account is explicitly registered later.

The installed app uses a WKWebView for its interface, with native Sign in with Apple,
system authentication sessions for LINE, camera permission, sharing, and clipboard
integration. It requires internet access. Native push notifications are not currently
implemented. There is no unrestricted browser in the app.

## 転記前に解消する項目

- 審査連絡先（氏名・電話・メール）。本人指定を待つ。
- 審査側の全機能アクセス方法を確認。架空の週表示を全機能デモと申告しない。
- Appleの入力チェックで審査用ユーザー名・パスワードが要求された。以下のApple登録手順は説明案であり、これだけで提出可能・承認済みと扱わない。通常の連携必須認証を無断で緩めず、隔離したレビューアクセス等の方針を本人に確認する。
- 投稿前審査・通報・ブロックは未実装。完成・検証するまで対応済みと書かない。
- サポート・プライバシーの公開ページを更新し、アプリ内からアクセス可能にする。
- ストア画像が必要な場合は実機の画面を使う。ブラウザ画像を実機撮影と扱わない。
