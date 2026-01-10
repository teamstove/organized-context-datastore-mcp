---
title: 'ADR-003: stdio をデフォルトトランスポートに'
summary: 'ADR-003: stdio モードをデフォルトに、HTTP は明示的な --http フラグで'
categories:
  - adr
  - decisions
tags:
  - stdio
  - http
  - transport
  - accepted
---
# ADR-003: stdio をデフォルトトランスポートに

## Status
**accepted** (2026-01-10)

## Context

### 問題
従来の実装では:
1. `--storage <path>` パラメータが必須で、固定パスのみサポート
2. HTTP モードと stdio モードの切り替えが不明確
3. 「Cursor に追加するだけで使える」体験ができない

### 要件
- 最小限の設定で使い始められる
- `cwd` ベースの動的設定探索を stdio でもサポート
- HTTP モードは明示的に選択

## Decision

### 1. stdio をデフォルトに
```bash
# stdio モード（デフォルト）
ocd-mcp

# HTTP モード
ocd-mcp --http --port 3100
```

### 2. stdio は自動的に local-dev モード
stdio トランスポートは各クライアントが個別プロセスを起動するため、
必然的に local-dev モード（cwd ベースの動的設定探索）となる。

### 3. --storage パラメータの廃止
cwd からの動的設定探索に置き換え。

## Consequences

### Positive
- **ゼロ設定起動**: `ocd-mcp` だけで動作
- **シンプルな Cursor 設定**: args 不要
- **機能の統一**: stdio と HTTP で同じ local-dev 機能が利用可能

### Negative
- **後方互換性の破壊**: `--storage` に依存する設定は変更が必要

## Cursor 設定例

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

## 関連
- [server-modes](../03-what/released/server-modes)
- [config-files](../03-what/released/config-files)
