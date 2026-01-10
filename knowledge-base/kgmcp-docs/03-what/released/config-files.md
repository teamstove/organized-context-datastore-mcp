---
title: Config Files
summary: グローバル設定とローカル設定ファイル
categories:
  - what
  - released
tags:
  - configuration
  - settings
---
# Config Files

OCD-MCP の設定ファイル体系。

## 設定ファイルの種類

| ファイル | 場所 | 用途 |
|---------|------|------|
| `~/.ocd/config.json` | ホームディレクトリ | グローバル設定（全 PJ 共有） |
| `.ocd.config.json` | プロジェクトディレクトリ | ローカル設定（PJ 固有） |

## グローバル設定

`~/.ocd/config.json`:

```json
{
  "globalContextRoots": [
    {
      "id": "company-docs",
      "name": "Company Documentation",
      "path": "/path/to/shared/company-docs",
      "description": "会社共通のドキュメント",
      "readOnly": true
    },
    {
      "id": "design-system",
      "name": "Design System",
      "path": "/path/to/design-system",
      "readOnly": true
    }
  ]
}
```

### プロパティ

| プロパティ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `id` | string | ✓ | Context Root ID |
| `name` | string | ✓ | 表示名 |
| `path` | string | ✓ | 絶対パス |
| `description` | string | - | 説明 |
| `readOnly` | boolean | - | 読み取り専用（デフォルト: true） |

## ローカル設定

`.ocd.config.json`:

```json
{
  "contextRoots": [
    { "path": "./organized-context" },
    { "path": "./CORE/docs", "name": "CORE Framework Docs", "readOnly": true },
    { "path": "./CORE/src", "name": "CORE Source", "readOnly": true }
  ],
  "inheritGlobal": true,
  "versionControlMode": "immediate"
}
```

### プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `contextRoots` | array | - | Context Roots 設定 |
| `inheritGlobal` | boolean | true | グローバル設定を継承するか |
| `versionControlMode` | string | "immediate" | バージョン管理モード |
| `writePermission` | object | unrestricted | 書き込み権限設定 |

### contextRoots 項目

| プロパティ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `path` | string | ✓ | パス（相対または絶対） |
| `id` | string | - | ID（省略時はパスから生成） |
| `name` | string | - | 表示名（省略時はパスから生成） |
| `description` | string | - | 説明 |
| `readOnly` | boolean | - | 読み取り専用 |

## 設定の探索とマージ

### 探索順序
1. cwd から上位に `.ocd.config.json` を探索
2. 見つかった場合はローカル設定を読み込み
3. `inheritGlobal: true` の場合、グローバル設定とマージ

### マージルール
- ローカル設定の Context Roots が先に追加
- グローバル設定の Context Roots は、同じ ID がなければ追加
- グローバル Context Roots はデフォルトで readonly

## 例: 複数 PJ での利用

```
~/
├── .ocd/
│   └── config.json          # 共有コンテキスト
├── projects/
│   ├── project-alpha/
│   │   ├── .ocd.config.json  # PJ Alpha 固有
│   │   └── ...
│   └── project-beta/
│       ├── .ocd.config.json  # PJ Beta 固有
│       └── ...
```

## 関連
- [server-modes](./server-modes) - サーバー起動モード
