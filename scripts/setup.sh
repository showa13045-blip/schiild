#!/usr/bin/env bash
# Codex 環境セットアップスクリプト
#
# Codex のクラウド実行はタスク実行時にネットワークが無効になる。
# 依存はすべてこの段階で取得しておくこと。
# このファイルの中身を Codex の environment 設定の setup script 欄に貼る。

set -euo pipefail

# --- Node / pnpm ---
corepack enable
corepack prepare pnpm@latest --activate
pnpm install --frozen-lockfile

# --- Rust ---
if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  . "$HOME/.cargo/env"
fi
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked || true
cargo fetch --manifest-path services/gen/Cargo.toml

# --- PostgreSQL クライアント（マイグレーション検証用）---
if ! command -v psql >/dev/null 2>&1; then
  apt-get update && apt-get install -y --no-install-recommends postgresql-client
fi

# --- 事前ビルドしてキャッシュを温める ---
cargo build -p gen --offline || cargo build -p gen
pnpm -r build || true

echo "setup complete"
