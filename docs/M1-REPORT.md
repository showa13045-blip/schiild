# M1 実装・検証状況

M0 PR #1はマージ済み（fc2aa2a）。M1はm1-generationブランチ、PR #2でレビューする。M2/M3には着手していない。

## 現在の実装

- Rust BSP、ChaCha20、凍結シード、Oklab量子化、タイル内誤差拡散、VoidCell、3描画階層。
- JPEG入力と、PNG・サムネイル・領域・メタデータ・シード・再生成stateの出力。
- 承認済みの前版成果物による部分再生成。対象座標以外の画素と初回メタデータを保持する。
- BSPのWASM書き出しとTypeScript呼び出し。TypeScriptに分割ロジックなし。
- 暫定32色パレット構築、参加人数・充足率・ガター・描画パラメータの比較資料。
- 承認済みのバケット前処理分離。`--prepare-image`は投稿1枚、`--prepare-bucket`は評価用一括処理、`--prepared-bucket`は前処理済み平均色による日次生成。

## 受け入れ条件と検証

- [x] 同一入力のPNGバイト一致。入力順序の逆転、1/4ワーカー比較、8人数を検証。
- [x] 凍結シードで除去領域以外の画素が一致。BSP・バケット・連続除去・実JPEG CLI・前処理済みCLIを検証。
- [x] 承認されたバケット日次処理の範囲で2000人・200ms以内。異なるJPEG2000枚からの平均色を使い、入力読込から成果物保存まで5回約101〜121ms。
- [x] RustとTypeScriptの実WASM呼び出しで矩形リスト一致（8人数×3variance）。
- [x] 決定性テスト成功。

実装コミットa0dace5のローカル検証: lint、typecheck、既存17テスト、Rust単体1件・通常結合9件・compile-fail1件、release性能1件、実WASM2件、JPEG CLI、前処理CLI、rustfmt、clippy成功。
[同コミットのCI](https://github.com/showa13045-blip/schiild/actions/runs/34195911635)も全チェック成功。CIの前処理済みCLI性能試験は、2000種類の合成レコードを用いる3回中央値200ms未満の回帰試験。

## 性能の境界

バケットの投稿時前処理と日次生成を分離する設計・計測範囲は2026-09-08にユーザー承認済み。JPEG2000枚の前処理は約9秒、日次生成は約101〜121ms。日次入力ディレクトリにJPEGを置かず、デコード0回と従来の6成果物との完全一致を確認した。
JPEG前処理込み全処理200msを達成したとは扱わない。BSPの形状依存の画像準備は今回の分離対象外。M2の投稿API・保存基盤は未実装。
測定条件、改善前との比較、信頼境界はM1-PERFORMANCE.mdとservices/gen/README.mdに記録。

## レビュー対象

MILESTONES.mdは写真コーパス未提供時の解析的な暫定パレットを明示的に認めている。本番パレットや実写真によるG-4判定をM1の追加の完了条件とはしない。ガターは0〜3の比較資料を提出済みで、本番値は未決。
仕様に算式のない補間・署名・指標等の実装規約はM1-REVIEW.mdへ集約。承認済み事項と未確定事項を区別する。元のrequirements.md / copy.md / legal.md、共有tokens.ts / copy.tsは変更していない。

## 比較資料

- `m1-evaluation/participation.png`: 8人数×4充足率。
- `m1-evaluation/gutters.png`: ガター0〜3px。
- `m1-evaluation/parameters.png`: 解像度96/128×ディザ0/0.6/1×posterize4/8。
- `m1-evaluation/timings.json`: 初期のJPEG全処理計測。8種類の合成JPEGを再利用。
- `m1-evaluation/optimization-timings.json`: 重複処理削減・並列化後の計測。
- `m1-evaluation/prepared-timings.json`: 異なる合成JPEG2000枚の前処理と、分離後の日次CLI計測。

合成画像は実写真でのG-4の合格判定を代替しない。
