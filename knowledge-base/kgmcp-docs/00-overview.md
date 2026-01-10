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

### Cursor / Claude Desktop 設定

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
| `list_context_roots` | Context Root 一覧 |
| `get_contexts` | パターン + フィルタで取得 |
| `get_context_tree` | ツリー表示 (tree-text/json) |
| `search_contexts` | キーワード検索 |
| **`mutate_context`** | **統合書き込み (create/update/delete/move)** |
| `commit` | draft_commit モード用 |

## ドキュメント構造

- [01-why](./01-why/) - なぜ必要か
- [02-how](./02-how/) - 実装とアーキテクチャ
- [03-what](./03-what/) - 機能と使い方
- [90-decisions](./90-decisions/) - ADR
- [99-future](./99-future/) - 将来の検討事項
