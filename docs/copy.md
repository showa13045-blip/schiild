# Schiild UI文言集 v1.2

要件定義書 v1.2 の §6.2（画面仕様）・§6.4（語彙ポリシー）・§6.6（不可逆性の重みづけ）に対応。
キーは i18n 用（`ja.json` にそのまま展開できる階層で記述）。

---

## 0. 書き方の原則

実装者・翻訳者・AIツールが文言を追加するときに従うこと。

| # | 原則 | 悪い例 | 良い例 |
|---|---|---|---|
| 1 | **「所有」ではなく「預かる」** | このシールトを所有しています | このシールトを預かっています |
| 2 | **空状態で謝罪しない** | まだアトリエがありません | 最初のアトリエをつくる |
| 3 | **失敗はまず事実、次に無事** | エラーが発生しました | 生成に失敗したため、やり直しています。シールは保存されています |
| 4 | **達成ではなく記録の書式** | 7人が投稿しました！ | 7 of 12 が今日を記録 |
| 5 | **個人を名指しで催促しない** | ゆきさんがまだ投稿していません | あと2人で全員が揃います |
| 6 | **不可逆は事実として告げる** | 本当に投稿しますか？ | 今日のシールは一度きりです |
| 7 | **行き止まりを作らない** | （何も置かない） | 明日の1枚から、また記録できます |
| 8 | **感嘆符を使わない** | おめでとうございます！ | あなたが預かります |
| 9 | **数値は等幅、単位は最小限** | 全12人中7人が参加 | 7 of 12 |
| 10 | **敬語は丁寧語まで。** 尊敬・謙譲を重ねない | ご投稿いただけます | 投稿できます |

### 使わない言葉

**所有 / オーナー / 売却 / 出品 / 投資 / 利回り / 値上がり / リターン / 資産 / レア度 / ランキング / 達成 / 未達 / 失敗しました（ユーザーの行為に対して） / 頑張り / お疲れさま / ぜひ / さあ**

---

## 1. 共通

```
common.ok                      OK
common.cancel                  やめる
common.back                    戻る
common.close                   閉じる
common.next                    次へ
common.done                    完了
common.retry                   もう一度試す
common.loading                 読み込んでいます
common.today                   今日
common.yesterday               昨日
common.of                      of              # 「7 of 12」の of。訳さない
common.people_count            {n}人
common.days_count              {n}日
```

**注**: `of` は等幅表記の一部として扱い、日本語化しない。台帳の書式を保つため。

---

## 2. オンボーディング

```
onboarding.1.title             1日に1枚だけ
onboarding.1.body              撮れるのは1日1枚。撮り直しも、あとからの差し替えもできません。

onboarding.2.title             ひとつの作品になる
onboarding.2.body              同じアトリエの人たちの1枚が集まって、毎朝ひとつの絵になります。

onboarding.3.title             記録しなかった日も残る
onboarding.3.body              誰かが撮らなかった日は、その区画が空いたまま作品になります。

onboarding.start               はじめる
```

**注**: 3枚目で欠落に先に触れておく。あとから「空白は失敗ではない」と説明するより、最初に世界の規則として提示するほうが受け入れられる。

---

## 3. S-01 ホーム（アトリエ一覧）

```
home.title                     アトリエ
home.card.recorded             {n} of {cap} が今日を記録
home.card.solo_label           SOLO
home.add.create                アトリエをつくる
home.add.join                  コードで参加する
```

---

## 4. S-02 アトリエ詳細（本日のキャンバス）

```
atelier.closes_in              CLOSES IN
atelier.window                 対象時間　{start} – {end} JST
atelier.recorded               {n} of {cap} が今日を記録
atelier.almost                 あと{n}人で全員が揃います
atelier.all_recorded           全員が今日を記録しました
atelier.past                   これまでのシールト
```

**注**:
- `atelier.almost` は残り1〜2人のときだけ表示する。それ以上残っている段階で出すと催促になる
- `atelier.all_recorded` に感嘆符や祝いの語を付けない。事実として置く
- `atelier.window` は必ず表示する。UTC境界により日本では朝9時が区切りになるため

---

## 5. S-03 撮る（カメラ）

```
camera.date                    {date}
camera.confirm.title           今日のシールは一度きりです
camera.confirm.body            確定すると、この1枚が{ateliers}に描かれます。あとから差し替えることはできません。
camera.confirm.remaining       {date} ／ 残り {countdown}
camera.confirm.submit          確定する
camera.confirm.back            戻る

camera.select.title            投稿先を選ぶ
camera.select.caption_ph       ひとことを添える
camera.select.no_atelier       投稿できるアトリエがありません

camera.permission.title        カメラを使えるようにする
camera.permission.body         今日の1枚を撮るためにカメラを使います。写真は投稿するまで送信されません。
camera.permission.denied.title カメラが使えません
camera.permission.denied.body  Schiildで記録できるのは、この場で撮った1枚だけです。設定からカメラを許可してください。
camera.permission.settings     設定を開く
camera.capture_failed          うまく撮れませんでした。もう一度試してください。
camera.upload_retry            送信できませんでした。この端末に保存してあるので、もう一度試せます。
```

**注**:
- `camera.confirm.body` の `{ateliers}` は「「あさ」と「やまのぼり」」のように鉤括弧付きで名前を読み上げる。どこに残るかを具体的に示すため
- 拒否メッセージは「できません」で終える。理由を責める書き方にしない
- ★**アプリ内カメラが唯一の入口である**（要件定義書 §4.9）。アルバムに関する文言を追加しないこと
- ★`camera.upload_retry` は「端末に保存してある」ことを必ず伝える。1日1枚で取り返しがつかないため、送信失敗が記録の喪失に直結すると誤解されると強い不安を招く

---

## 6. S-09 本日投稿済み

```
posted.title                   今日のシールは
posted.title2                  もう描かれています
posted.time                    {time} に記録
posted.section.posted          POSTED TO
posted.section.add             ADD TO
posted.add_button              追加する
posted.add_none                追加できるアトリエはありません
posted.added                   {n}つのアトリエに追加しました
```

---

## 7. S-04 シールト詳細

```
schiild.label                  SCHIILD {index}
schiild.meta.index             通算
schiild.meta.void_rate         欠落率
schiild.meta.palette           パレット
schiild.meta.tier              階層
schiild.custody.other          {name}さんが預かっています
schiild.custody.self           あなたが預かっています
schiild.custody.none           このアトリエで保管しています
schiild.action.regions         領域を見る
schiild.action.export          書き出す
schiild.action.lottery         抽選を検証
schiild.action.decline         預かりを辞退する

schiild.regions.title          誰がどこを描いたか
schiild.regions.mine           ここがあなたの区画です
schiild.regions.void           この区画は空いたままです

schiild.decline.title          預かりを次の人へ渡します
schiild.decline.body           辞退すると、抽選の次の順位の人がこのシールトを預かります。取り消すことはできません。
schiild.decline.submit         辞退する
schiild.decline.back           やめる

schiild.lottery.title          抽選のしくみ
schiild.lottery.body           このシールトの預かり手は、生成時に確定した順列で決まります。順列はシードから誰でも再計算できます。
schiild.lottery.seed           SEED
schiild.lottery.order          ORDER
```

**注**:
- `schiild.custody.self` は祝わない。「おめでとうございます」を付けない。運で決まったものを称賛すると、外れた人に対する含意が生じる
- 辞退の確認は**代替不能**（§6.6）なのでモーダルを出す

---

## 8. S-07 全生命シールト

```
global.label                   GLOBAL SCHIILD
global.your_pixel              あなたのシールは、この作品の{n}番目のピクセルです
global.your_pixel_none         今日はまだ記録していません
global.coords                  x {x} ／ y {y}
global.stat.posts              総投稿
global.stat.ateliers           アトリエ
global.stat.cumulative         累計
global.not_for_sale            現在このシールトは販売していません
```

**注**: `global.not_for_sale` は Phase 1 で常時表示する。将来の販売を示唆する文言を置かない（§6.4）。

---

## 9. S-08 空状態

```
empty.atelier.title            最初のアトリエをつくる
empty.atelier.body             アトリエは、誰かと一緒に1日1枚を残す場所です。毎朝ひとつの作品が生まれます。
empty.atelier.solo_hint        ひとりでも始められます
empty.archive.title            まだ作品がありません
empty.archive.body             最初のシールを投稿すると、明日の朝に最初のシールトが生まれます。
empty.custody.title            預かっているシールトはありません
empty.custody.body             毎朝の抽選で選ばれると、その日の作品を預かります。
```

---

## 10. S-10 生成失敗

```
fail.status                    REGENERATING
fail.title                     {date}のシールトは\nまだ焼き上がっていません
fail.body                      生成に失敗したため、やり直しています。{n}人分のシールは保存されているので、記録が失われることはありません。
fail.retry_count               再試行
fail.next_attempt              次の試行
fail.past                      PAST
fail.gave_up                   このシールトは生成できませんでした。シールは保存されています。
```

**注**: `fail.gave_up` は3回の再試行がすべて失敗した場合。ここでも「申し訳ありません」を置かない。事実と、記録が無事であることだけを伝える。

---

## 11. S-11 モデレーション除外の通知

```
excluded.label                 NOTICE ／ {date}
excluded.title                 今日のシールを\n作品に含められませんでした
excluded.reason.person         写っている方の同意が確認できない可能性があるため、{date}のシールトからは外れています。
excluded.reason.other          審査の基準に照らして、{date}のシールトからは外れています。
excluded.kept                  あなたのシールは削除されていません。マイページからいつでも見られます。
excluded.effect                {ateliers}では、あなたの区画は空いたままになります。
excluded.final                 Schiildでは、一度確定した作品を描き直すことはありません。明日の1枚から、また記録できます。
excluded.meta.review           審査
excluded.meta.review_auto      自動 ／ {time}
excluded.meta.category         区分
excluded.action.view           シールを見る
```

**注**:
- ★**判定の可謬性に言及しない。** 異議申立が存在しないため、誤りうると認めながら手段を与えないのは、認めない場合より不誠実になる（§10.4）
- 区分は「写り込み」など短い名詞で示す。詳細な判定根拠は開示しない

---

## 12. S-12 マイページ / S-13 アーカイブ

```
me.title                       わたし
me.since                       SINCE {date}
me.stat.streak                 連続
me.stat.joined                 参加
me.stat.custody                預かり
me.section.custody             IN CUSTODY
me.link.archive                アーカイブ
me.link.settings               設定

archive.title                  アーカイブ
archive.month_stat             今月
archive.total                  通算
archive.longest                最長
archive.note                   記録しなかった日も、そのまま残ります。
```

**注**: `archive.note` はこの画面の設計思想そのもの。削らないこと。

---

## 13. S-14 アトリエ作成

```
create.title                   アトリエをつくる
create.name_label              NAME
create.name_ph                 アトリエの名前
create.capacity_label          CAPACITY
create.capacity_explain        人数がそのまま構図になります。{n}人なら{n}の区画に分かれます。
create.capacity_avg            1人あたり 平均 {px}px
create.fixed.title             定員はあとから変えられません。
create.fixed.body              過去の作品と構図を揃えるため、作成時に固定されます。人数が増えても定員は動きません。
create.submit                  このアトリエをつくる

created.title                  アトリエができました
created.body                   このコードを渡すと、参加してもらえます。
created.code_label             INVITE CODE
created.copy                   コードをコピーする
created.share                  コードを共有する
created.first_hint             最初のシールトは、明日の朝に生まれます。
```

---

## 14. S-15 コード参加

```
join.title                     コードで参加する
join.code_ph                   8文字のコード
join.preview.stats             定員 {cap} ／ 現在 {n}人 ／ 通算 {total}枚
join.tomorrow                  参加すると、明日からあなたの区画が加わります。今日のシールトには反映されません。
join.submit                    参加する

join.error.not_found           このコードのアトリエは見つかりませんでした。
join.error.full                このアトリエは定員に達しています。
join.error.already             すでに参加しています。
```

---

## 15. 開封演出

```
reveal.ready                   {date}のシールトが焼き上がりました
reveal.date                    {date}
reveal.open                    ひらく
reveal.custody_label           CUSTODY
reveal.custody.other           {name}さんが預かります
reveal.custody.self            あなたが預かります
```

**注**:
- 三拍構成（§6.5）の拍3で `reveal.custody.*` を出す。ここでも祝わない
- ★`reveal.ready` に「昨日の」を使わない。開封通知は UTC 00:15 の一斉配信であり、日本のユーザーにとってその作品は9/7 09:00〜9/8 09:00 を含むため「昨日」は正確ではない。必ず日付で呼ぶ

---

## 16. プッシュ通知

```
push.reveal.title              シールトが焼き上がりました
push.reveal.body               {atelier}の{date}の作品ができています。

push.custody.title             あなたが預かります
push.custody.body              {atelier}の{date}のシールトを預かることになりました。

push.almost.title              あと{n}人です
push.almost.body               {atelier}で、あと{n}人が記録すると全員が揃います。

push.self_reminder.title       今日のシールはまだです
push.self_reminder.body        あと{countdown}で今日が閉じます。

push.excluded.title            今日のシールについて
push.excluded.body             作品に含められませんでした。詳しくはアプリで確認できます。

push.fail.title                生成をやり直しています
push.fail.body                 {atelier}の{date}のシールトは、まもなくできあがります。
```

**注**:
- ★**`push.reveal` は UTC 00:15 に全ユーザーへ一斉配信する**（要件定義書 §2.1）。ユーザーごとの時刻に予約しない
- ★`push.almost` は**残り1〜2人のときだけ**、かつ**個人名を含めずに**送る（§2.2）
- ★`push.self_reminder` は自分に対してのみ。他人の投稿状況を通知に含めない。設定でオフにできること
- `push.excluded` の本文は具体的な理由を含めない。ロック画面に判定区分を出さないため

---

## 17. 設定

```
settings.title                 設定
settings.account               アカウント
settings.notifications         通知
settings.notif.reveal          シールトができたとき
settings.notif.custody         預かり手に選ばれたとき
settings.notif.almost          全員が揃いそうなとき
settings.notif.reminder        今日のシールの前に
settings.privacy               プライバシー
settings.terms                 利用規約
settings.policy                プライバシーポリシー
settings.logout                ログアウト
settings.delete_account        アカウントを削除する

delete.title                   アカウントを削除します
delete.body                    投稿したシールは削除されます。すでに生成されたシールトはアトリエに残り、あなたの区画も残ります。作品を描き直すことはできないためです。
delete.confirm                 削除する
delete.cancel                  やめる
```

**注**: `delete.body` は正直に書く。過去のシールトから自分の痕跡が消えないことを、削除前に明示しなければならない。規約とも整合させること（§10.2）。

---

## 18. 共通エラー

```
error.network.title            つながりませんでした
error.network.body             通信を確認して、もう一度試してください。
error.server.title             うまくいきませんでした
error.server.body              しばらくしてから、もう一度試してください。
error.already_posted           今日のシールはもう描かれています。
error.window_closed            今日の受付は終了しました。明日の1枚から記録できます。
error.upload_failed            シールを送れませんでした。もう一度試してください。
error.image_too_large          この画像は大きすぎます。
```

**注**: `error.window_closed` は締切を過ぎた瞬間に起こる。ここで責める書き方をすると、不可逆性が罰に見える。次に接続する一文を必ず付ける。

---

## 19. 実装時の確認事項

- [ ] `{n}` `{date}` 等のプレースホルダはすべて i18n の補間で扱い、文字列連結で組み立てないこと
- [ ] 数値を含む文言は等幅で表示されるか（§6.3のタイプスケール）
- [ ] `\n` を含む文言（`fail.title` `excluded.title`）は改行位置が意図通りか
- [ ] 禁止語リスト（§0）を lint で機械的に検出できるようにすること
- [ ] 感嘆符が1つも含まれていないことを確認すること
