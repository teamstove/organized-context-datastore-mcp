---
title: released
summary: リリース済み・利用可能な機能
categories:
  - what
  - released
tags:
  - stable
  - production-ready
---
# Released - リリース済み機能

本番利用可能な安定機能。

## サーバー機能

- [server-modes](./released/server-modes) - local-dev / remote-server モード
- [config-files](./released/config-files) - グローバル設定とローカル設定
- [context-roots-filter](./released/context-roots-filter) - URL パラメータでフィルタリング

## ツール一覧 (6個)

### 読み取り系
- `list_context_roots` - Context Root 一覧
- `get_contexts` - パターン + フィルタで取得
- `get_context_tree` - ツリー表示 ([tree-text-output-format](./released/tree-text-output-format))
- `search_contexts` - キーワード検索 ([pattern-based-search](./released/pattern-based-search))

### 書き込み系
- **`mutate_context`** - 統合書き込みツール ([mutate-context-unified-tool](./released/mutate-context-unified-tool))
- `commit` - draft_commit モード用

## ストレージ
- [file-git-storage](./released/file-git-storage) - ファイルベース + Git

