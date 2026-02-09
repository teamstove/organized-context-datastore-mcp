---
title: Organized Context Datastore MCP
summary: LLM向けに最適化されたMarkdownベースのコンテキスト管理システム
categories:
  - overview
tags:
  - root
---
# Organized Context Datastore MCP

LLM向けに最適化されたMarkdownベースのコンテキスト管理システム。

## クイックスタート

```bash
# stdio モード（デフォルト）
npx organized-context-datastore-mcp

# HTTP モード
npx organized-context-datastore-mcp --http --port 38291
```

### MCP ツール

| ツール | 説明 |
|------|------|
| `ocd_list_context_roots` | Context Root 一覧取得 |
| `ocd_get_context_tree` | ツリー（目次）取得 |
| `ocd_get_contexts` | コンテキスト取得 |
| `ocd_search_contexts` | 検索 |
| `ocd_mutate_context` | 作成/更新/削除/移動 |
| `ocd_commit` | Git コミット |

### Tree 表示フォーマット

デフォルト: `$path: $title`

変数: `$path`, `$title`, `$summary`, `$categories`, `$tags`

## Cursor / Claude Desktop 設定

```json
{
  "mcpServers": {
    "ocd-mcp": {
      "command": "npx",
      "args": ["github:teamstove/organized-context-datastore-mcp"]
    }
  }
}
```

設定を追加するだけで OK！

## ツール一覧 (6個)

| ツール | 説明 |
|--------|------|
| `ocd_list_context_roots` | Context Root 一覧 |
| `ocd_get_contexts` | パターン + フィルタで取得 |
| `ocd_get_context_tree` | ツリー表示 (tree-text/json) |
| `ocd_search_contexts` | キーワード検索 |
| **`ocd_mutate_context`** | **統合書き込み (create/update/delete/move)** |
| `ocd_commit` | draft_commit モード用 |

## ドキュメント構造

- [01-why](./01-why/) - なぜ必要か
- [02-how](./02-how/) - 実装とアーキテクチャ
- [03-what](./03-what/) - 機能と使い方
- [90-decisions](./90-decisions/) - ADR
- [99-future](./99-future/) - 将来の検討事項
