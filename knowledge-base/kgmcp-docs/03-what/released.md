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

## クイックスタート

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

Cursor / Claude Desktop の MCP 設定に追加するだけ！

## サーバー機能

| ドキュメント | 内容 |
|------------|------|
| [server-modes](./released/server-modes) | stdio / HTTP トランスポート、readonly オプション |
| [config-files](./released/config-files) | `.ocd.config.json` と `~/.ocd/config.json` |
| [context-roots-filter](./released/context-roots-filter) | URL パラメータでフィルタ（HTTP モード） |

## ツール一覧 (6個)

### 読み取り系
| ツール | 説明 |
|--------|------|
| `list_context_roots` | Context Root 一覧 |
| `get_contexts` | パターン + フィルタで取得 |
| `get_context_tree` | ツリー表示 ([tree-text-output-format](./released/tree-text-output-format)) |
| `search_contexts` | キーワード検索 ([pattern-based-search](./released/pattern-based-search)) |

### 書き込み系
| ツール | 説明 |
|--------|------|
| **`mutate_context`** | 統合書き込み ([mutate-context-unified-tool](./released/mutate-context-unified-tool)) |
| `commit` | draft_commit モード用 |

## ストレージ
- [file-git-storage](./released/file-git-storage) - ファイルベース + Git
