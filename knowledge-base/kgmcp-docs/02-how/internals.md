---
title: internals
summary: 内部コンポーネントの実装詳細
categories:
  - how
  - internals
tags:
  - implementation
  - deep-dive
---
# Internals - 内部実装詳細

各コンポーネントの実装詳細。

## 主要コンポーネント

| コンポーネント | ファイル | 説明 |
|-------------|------|------|
| MarkdownParser | `src/parser/MarkdownParser.ts` | Markdown解析とメタデータ抽出 |
| FileGitStore | `src/storage/FileGitStore.ts` | ファイル+Gitストレージ |
| PostgresStore | `src/storage/PostgresStore.ts` | PostgreSQLストレージ |
| CompositeStore | `src/storage/CompositeStore.ts` | 複数ストアルーター |
| ReadTools | `src/tools/ReadTools.ts` | 読み取り操作 |
| WriteTools | `src/tools/WriteTools.ts` | 書き込み操作 |
| JqFilterEngine | `src/filter/JqFilterEngine.ts` | jqフィルタ実行 |

## ソースコード参照

詳細はソースコードを直接参照:
`packages/knowledge-graph-mcp/src/`
