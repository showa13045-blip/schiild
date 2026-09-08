# Phase 1 ER

```mermaid
erDiagram
    users ||--o{ ateliers : creates
    users ||--o{ atelier_members : joins
    ateliers ||--o{ atelier_members : contains
    users ||--o{ schiils : records
    schiils ||--o{ schiil_posts : posts
    atelier_members ||--o{ schiil_posts : participates
    ateliers o|--o{ schiilds : generates
    schiilds ||--o| schiild_custody : custody
    users o|--o{ schiild_custody : custodian
    schiilds ||--o{ schiild_custody_events : history
    users o|--o{ schiild_custody_events : participant
    schiilds ||--o{ schiild_revisions : revisions
    schiild_revisions ||--o{ schiild_revision_removals : removes
    schiils ||--o{ schiild_revision_removals : referenced
```

全生命作品はatelier_idがNULL。同じ日付のNULL同士もUNIQUEで重複を拒否する。
カバーは作品IDとアトリエIDの複合FKで同一アトリエの作品に制限する。
写真の1人1日制約、投稿の1アトリエ1人1日制約、生成の1アトリエ1日制約をDBに置く。
履歴行の物理削除は禁止。退会時の画像・区画の扱いは別の仕様判断であり、本スキーマから削除を推測して実装しない。
