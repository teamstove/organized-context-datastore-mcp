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

### グローバル Context Root プロパティ

| プロパティ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `id` | string | ✓ | Context Root ID |
| `name` | string | ✓ | 表示名 |
| `path` | string | ✓ | 絶対パス |
| `description` | string | - | 説明 |
| `readOnly` | boolean | - | 読み取り専用（デフォルト: true） |
| `git` | string | - | Git 設定 (`'auto-commit'` / `'manual'` / `'none'`) |
| `ignorePatterns` | string[] | - | 除外パターン |
| `includePatterns` | string[] | - | 対象パターン |

## ローカル設定

`.ocd.config.json`:

```json
{
  "contextRoots": [
    { "path": "./organized-context" },
    { "path": "./CORE/docs", "name": "CORE Docs", "readOnly": true },
    { "path": "./CORE/src", "name": "CORE Source", "readOnly": true, "git": "none" }
  ],
  "inheritGlobal": true
}
```

### ルートプロパティ

| プロパティ | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `contextRoots` | array | - | Context Roots 設定 |
| `inheritGlobal` | boolean | true | グローバル設定を継承するか |
| `writePermission` | object | unrestricted | 書き込み権限設定 |

### contextRoots 項目

| プロパティ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|----------|------|
| `path` | string | ✓ | - | パス（相対または絶対） |
| `id` | string | - | (パスから生成) | ID |
| `name` | string | - | (パスから生成) | 表示名 |
| `description` | string | - | - | 説明 |
| `readOnly` | boolean | - | false | 読み取り専用 |
| `git` | string | - | `'manual'` | Git 設定 |
| `ignorePatterns` | string[] | - | - | 除外パターン |
| `includePatterns` | string[] | - | `['**/*.md']` | 対象パターン |
| `defaultExtension` | string | - | `'.md'` | 新規作成時の拡張子 |

## git 設定

Context Root 毎に Git コミットの挙動を設定できます。

| 値 | 説明 |
|----|------|
| `'auto-commit'` | 各操作後に自動コミット |
| `'manual'` | `commit` ツールで明示的にコミット（**デフォルト**） |
| `'none'` | Git を使用しない |

### 例: Context Root 毎の git 設定

```json
{
  "contextRoots": [
    {
      "path": "./docs",
      "git": "auto-commit"
    },
    {
      "path": "./shared-context",
      "git": "manual"
    },
    {
      "path": "./external-lib",
      "readOnly": true
    }
  ]
}
```

> **Note**: `readOnly: true` の Context Root は書き込みしないため `git` 設定は無視されます。

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
- [file-patterns](./file-patterns) - ファイルパターン設定
