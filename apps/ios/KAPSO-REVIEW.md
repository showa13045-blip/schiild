# Kapso設定の確認

2026-10-28 JST。利用者がログインしたSchiildプロジェクトの管理画面で確認。
個人のメッセージ本文、APIキー、電話番号はこの記録へ転載しない。

## 確認した設定

| 項目 | 実際の表示 |
| --- | --- |
| プロジェクト | Schiild |
| プラン | Free |
| Model and product improvement | オフ。確認時点ですでに無効で、今回オン／オフの切り替えは行っていない。 |
| Audio transcription | Off |
| Log ingestion | オン。新しいログの保存が有効。保存日数はこの画面では確認できない。 |
| Conversation retention | Keep everything。Freeでは期間指定の選択欄が無効。 |

モデル改善オフは、メッセージを保持しないという意味ではない。
Kapsoの公式ポリシーでは、この設定は将来の利用に適用され、機能提供・安全性確保・法的対応等の処理は続く。
過去データの削除や、過去にモデル改善へ使われなかったことを確認したとは扱わない。

## 接続の確認

- 受信Webhookは `https://schiild.app/api/auth/whatsapp`。有効で、イベントはMessage received。
- 管理画面に直近の配信成功記録あり。今回の作業ではテストメッセージを送っていない。
- HealthのRun checkを実行し、Checked just nowとCONNECTEDを確認。
- 番号のAutomationsには、この番号を使う自動処理はないと表示。認証メッセージをAIへ自動送信する設定はこの番号では確認されなかった。
- 診断のVerified nameはSchiild。番号一覧の古い表示名は別の名称のままだが、変更操作は行っていない。
- 最新の診断に、表示名の承認待ちと、WhatsApp Business Accountの支払設定の警告が残る。
- 警告の説明は一部の事業者発信メッセージが配信されない可能性を示す。すべての受信・ログインが停止しているとは判定しない。
- 実際の利用者によるWhatsApp登録・ログインの完了は、この設定診断とは別に実機で確認する。

有料プランへの変更、支払方法の入力、請求の承認、新しい番号の追加、プロジェクトの削除、
メッセージや履歴の削除、ログ保存の無効化は行っていない。

## 審査と公開説明への反映

- 認証メッセージと送信元情報がKapsoに保存される構成として申告を進める。
- AppleのEmails or Text Messages（送信元・宛先・本文等）を、既存5種類の下書きに追加した。
- 通報・問い合わせのCustomer Supportも追加し、合計7種類の下書きを保存。新しい2種類はアプリの機能、ユーザーに関連付け、非トラッキングで設定した。実際の技術ログの分類は別途照合する。
- 「他社にメッセージを保持しない」「全サービスから退会時に即時消去する」「学習利用は過去分も一切ない」とは説明しない。
- App Privacyはまだ公開していない。これまでの下書き保存・審査未提出の状態を維持。

一次資料:

- [Kapso Privacy Policy](https://app.kapso.ai/privacy)（2026-09-17版、§4・§9）
- [Apple App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)（第三者の収集とデータ種類）
