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
| ConfigLoader | `src/config/ConfigLoader.ts` | 設定ファイル探索・マージ |
| ToolRegistry | `src/tools/ToolRegistry.ts` | ツール登録（モード別） |
| JqFilterEngine | `src/filter/JqFilterEngine.ts` | jqフィルタ実行 |
| HttpMcpServer | `src/http/HttpMcpServer.ts` | HTTP サーバー実装 |

## ソースコード参照

詳細はソースコードを直接参照:
`packages/organized-context-datastore-mcp/src/`
