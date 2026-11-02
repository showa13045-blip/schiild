# 提出画像と実機確認

2026-11-02。build 4は有効。ネイティブiOSシミュレーターで60枚を撮影し、検品した33枚をApp Store Connectへ登録済み。末尾の撮影記録を参照する。
Windows上のブラウザ画像をiPhone／iPadアプリの実機画像として提出しない。

## 最短の撮影セット

TestFlightのSchiild 1.0.0 (4)を使い、本人が撮った権利確認済みの写真と
自分のテスト用アトリエを使う。画面に電話番号、認証番号、招待コード、他人の個人情報を含めない。
App Review専用画面や架空の利用例を、通常利用の画面と偽って撮影しない。

各端末で次の3画面を撮る。審査用の最低枚数は各端末1枚だが、3画面で機能が伝わる。

1. アトリエの完成作品。撮影済み・承認済みの自分の写真を使った作品。
2. GLOBAL SCHIILDの全体。必要なら自分の区画へ近づいた状態を追加。
3. アーカイブのカレンダーと、日付から開いた作品。

カメラの許可ダイアログ、認証画面、確認待ち画面だけを提出用画像にしない。
アトリエ名・表示名は本人のテスト用の名前を用い、存在しない機能を合成しない。

## サイズとファイル

- iPhoneのDynamic Island搭載・中型画面: 1179×2556、または1206×2622 px。
- 13インチiPad: 2064×2752、または2048×2732 px。
- 横向きは縦横を入れ替えたサイズ。デバイスのセット内ではサイズと向きを揃える。
- PNG/JPEG、透過なし、各サイズ1〜10枚。まず日本語を主言語として登録する。
- 全10言語の原稿を準備し、Apple対応の9言語の説明は下書き保存済み。各言語の画像も同じ実機手順で撮る。クメール語のストア掲載欄はApple未対応。

例:

```text
captures/
  iphone/01-atelier.png
  iphone/02-global.png
  iphone/03-archive.png
  ipad/01-atelier.png
  ipad/02-global.png
  ipad/03-archive.png
```

```powershell
node apps/ios/scripts/check-store-screenshots.mjs <capturesの絶対パス>
```

言語別に撮る場合は `captures/ja/iphone`、`captures/es-ES/iphone` などに分け、
検査コマンドへ `captures/ja`、`captures/es-ES` を順に渡す。ストアの言語を
登録しただけで、その言語の画像までアップロード済みとは扱わない。

この検査は寸法・形式・透過・枚数を読み取るだけで画像を書き換えない。
画像の権利、個人情報、実機で撮った事実は別に人が確認する。

## 実機での短い確認

- Appleで新規登録→ログアウト→ログイン。本人のiPad登録成功は確認済み。
- 撮影許可→写真→確認と投稿先選択→運営確認待ち。元写真が他人に見えない。
- 運営者の承認後、元の日付のアトリエとGLOBALに反映される。
- GLOBALのピンチ・移動と自分の区画、カレンダーの月スワイプ。
- ネイティブの共有・IDコピー。拒否したカメラ許可から設定へ案内できる。
- 作品の通報→運営者の確認→対象シールだけが除去される。
- 自分のテストアカウントの削除→元写真とプロフィールが消える→再登録は空の状態。
- プライバシー、サポート、投稿ルールのリンク。オフライン時の再試行。

LINE／WhatsAppを審査用資格情報だけで動作済みと扱わない。
WhatsAppのMeta設定は本人の指定で後日に保留中。

## 一次資料

- [Appleの提出画像仕様](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

## 2026-11-02 撮影・登録完了

MacのiOSシミュレーターで全10言語、iPhoneとiPadの計60枚を撮影した。
寸法はiPhone 1206×2622、iPad 2064×2752。透過なし。XCTestは両端末で成功した。
通常アプリのコードは変えず、隔離されたCIで開始URLだけを一週間利用例へ指定した。
画面に架空の利用例であることを表示し、物理端末のTestFlight撮影とは区別する。

未完成作品だけが表示されたアトリエ画面と、通知の写り込み／作品の見切れがあるiPhoneカレンダーは提出対象外とした。
GLOBAL（iPhone・iPad）とカレンダー（iPad）を選び、Apple対応9言語・11ロケールで計33枚の登録を完了した。
AppleのCOMPLETE、画像寸法、ファイルのチェックサムを照合した。元画像の画素は変更していない。
クメール語も撮影・保存したが、Appleの掲載ロケールにはないためアップロードしていない。

撮影記録: outputs/schiild-ios-preparation/native-store-captures-20261102/provenance.json
検品・出所・画像一覧: outputs/schiild-ios-preparation/store-captures-20261102/
Apple登録記録: outputs/schiild-ios-preparation/store-screenshots-saved-20261102.json

隔離App Reviewの実配信APIでも、未投稿時の即時チャット、認可、通報の運営確認と除去、プロフィール画像の承認、退出後の拒否を検証した。
通常利用者のデータは対象外。新機能のTestFlight実機確認は本人より未確認と回答されており、未完了として残す。

残りはApp Privacy公開への本人同意、新機能の実機確認、本人が保留したWhatsAppのMeta設定・実機確認。
審査提出・一般公開はまだ行っていない。無料・EU27か国除外・承認後手動公開を維持する。
