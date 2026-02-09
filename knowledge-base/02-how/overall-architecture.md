---
title: overall-architecture
summary: システム全体のアーキテクチャ図とデータフロー
categories:
  - how
  - architecture
tags:
  - system-design
  - data-flow
---
# システム全体アーキテクチャ

## レイヤー構成

```
┌─────────────────────────────────────────────┐
│             MCP Client (Cursor / Claude)        │
└──────────────────────┬──────────────────────┘
                       │ MCP Protocol
           ┌──────────┴──────────┐
           │                     │
     stdio (default)        HTTP (--http)
           │                     │
┌──────────┴──────────┬─────┴─────────────┐
│             MCP Server Layer                    │
│  ─ cli.ts + mcp-server.ts                      │
│  ─ ToolRegistry (モード別ツール登録)               │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────┴──────────────────────┐
│          KnowledgeGraphService                  │
│  ─ ビジネスロジックの中心                           │
│  → src/KnowledgeGraphService.ts                │
└──────────┬─────────────────────┬────────────┘
           │                     │
┌──────────┴───────────┐   ┌───┴────────────┐
│   ConfigLoader      │   │   FileGitStore   │
│ → config/           │   │ → storage/       │
└──────────────────────┘   └──────────────────┘
```

## データフロー

1. **読み取りフロー**: Client → MCP Server → Service → Store → Markdown解析
2. **書き込みフロー**: Client → MCP Server → Service → Store → Git commit

## 主要ファイル

| ファイル | 役割 |
|--------|------|
| `src/cli.ts` | CLI エントリポイント |
| `src/mcp-server.ts` | MCP サーバーファクトリ |
| `src/KnowledgeGraphService.ts` | メインサービス |
| `src/tools/ToolRegistry.ts` | ツール登録 |
| `src/config/ConfigLoader.ts` | 設定探索・マージ |
| `src/storage/FileGitStore.ts` | ストレージ実装 |
| `src/http/HttpMcpServer.ts` | HTTP サーバー |
