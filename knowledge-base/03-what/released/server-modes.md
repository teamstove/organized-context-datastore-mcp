---
title: Server Modes
summary: local-dev / remote-server モードと readonly オプション
categories:
  - what
  - released
tags:
  - server
  - configuration
  - http
---
# Server Modes

OCD-MCP サーバーは複数の起動モードをサポート。

## トランスポート

| トランスポート | 用途 | コマンド |
|---------------|------|----------|
| **stdio** | Cursor / Claude Desktop 用 | `ocd-mcp` |
| **HTTP** | サーバー常駐 | `ocd-mcp --http --port 38291` |

## 起動コマンド

```bash
# stdio モード（デフォルト、推奨）
ocd-mcp
ocd-mcp --readonly

# HTTP モード
ocd-mcp --http --port 38291
ocd-mcp --http --port 38291 --mode remote-server --config /path/to/config.json
```

## stdio モード（Cursor / Claude Desktop 用）

### 特徴
- デフォルトのトランスポート
- 自動的に local-dev モード（cwd ベースの動的設定探索）
- 各ツール呼び出しに `cwd` パラメータを含める
- Cursor / Claude Desktop の設定に入れるだけで使える

### Cursor 設定例

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

## HTTP モード

### local-dev モード（デフォルト）

```bash
ocd-mcp --http --port 38291
```

- 各リクエストに `cwd` パラメータを含める
- cwd から上位に `.ocd.config.json` を探索
- グローバル設定 (`~/.ocd/config.json`) とマージ

### remote-server モード

```bash
ocd-mcp --http --port 38291 --mode remote-server --config /path/to/config.json
```

- 設定ファイルで Context Roots を固定
- cwd パラメータ不要
- 複数クライアントで共有可能

### 設定ファイル例

```json
{
  "port": 38291,
  "projects": [
    {
      "id": "main",
      "name": "Main Project",
      "storageType": "file-git",
      "storagePath": "/path/to/context-store",
      "contextRoots": [
        { "id": "docs", "name": "Documentation", "path": "docs" }
      ]
    }
  ]
}
```

## Readonly Mode

`--readonly` フラグを追加すると、書き込み系ツール (`ocd_mutate_context`, `ocd_commit`) が無効化される。

```bash
# stdio
ocd-mcp --readonly

# HTTP
ocd-mcp --http --port 38291 --readonly
```

## 関連
- [config-files](./config-files) - 設定ファイルの詳細
- [context-roots-filter](./context-roots-filter) - URL パラメータでの動的フィルタ（HTTP モード）
