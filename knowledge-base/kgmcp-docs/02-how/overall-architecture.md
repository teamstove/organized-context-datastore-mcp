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
│             MCP Client (LLM)                │
└──────────────────────┬──────────────────────┘
                       │ MCP Protocol (stdio / HTTP)
┌──────────────────────┼──────────────────────┐
│             MCP Server Layer                │
│  ─ mcp-server.ts                            │
│  ─ ツール定義とルーティング                   │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────┼──────────────────────┐
│          KnowledgeGraphService              │
│  ─ ビジネスロジックの中心                       │
│  → src/KnowledgeGraphService.ts            │
└───────┬───────────────┴───────────┬───────────┘
        │                       │
┌───────┴───────────┐   ┌───────┴───────────┐
│   ReadTools      │   │   WriteTools      │
│ → tools/         │   │ → tools/         │
└───────┬───────────┘   └───────┬───────────┘
        │                       │
        └───────────┬───────────┘
                    │
┌───────────────────┼───────────────────┐
│     IKnowledgeStore (Interface)       │
│ → storage/IKnowledgeStore.ts          │
└───────┬───────────┬───────┬───────────┘
        │           │       │
    ┌───┴───┐  ┌───┴───┐  ┌───┴──────┐
    │FileGit│  │Postgres│  │Composite │
    │Store  │  │Store   │  │Store     │
    └───────┘  └────────┘  └──────────┘
```

## データフロー

1. **読み取りフロー**: Client → MCP Server → ReadTools → Store → Markdown解析
2. **書き込みフロー**: Client → MCP Server → WriteTools → Store → Git commit / DB insert

## 主要ファイル
- `src/KnowledgeGraphService.ts` - メインサービス
- `src/mcp-server.ts` - MCPプロトコル実装
- `src/tools/ReadTools.ts` - 読み取り操作
- `src/tools/WriteTools.ts` - 書き込み操作
- `src/storage/` - ストレージ実装
