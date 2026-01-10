# O.C.D. - Organized Context Datastore (MCP)

階層構造を持つコンテキストを LLM と人間が共同で読み書きできる MCP サーバー。

## 🚀 クイックスタート

### stdio モード（Cursor / Claude Desktop 用）

```bash
# デフォルト
npx github:teamstove/organized-context-datastore-mcp

# readonly モード
npx github:teamstove/organized-context-datastore-mcp --readonly
```

### HTTP サーバーモード

```bash
# Local Dev モード
npx github:teamstove/organized-context-datastore-mcp --http --port 3100

# Remote Server モード
npx github:teamstove/organized-context-datastore-mcp --http --mode remote-server --config ./config.json
```

## 🔧 起動オプション

| オプション | 説明 |
|-----------|------|
| (なし) | stdio モード（デフォルト、Cursor/Claude Desktop 用） |
| `--http` | HTTP サーバーモード |
| `--readonly` | 書き込みツールを無効化 |
| `--port <port>` | HTTP ポート番号（デフォルト: 3100） |
| `--mode <mode>` | HTTP のみ: local-dev / remote-server |
| `--config <path>` | remote-server モード用の設定ファイル |

## 📋 Cursor / IDE 設定

### stdio モード（推奨）

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

### HTTP モード

```json
{
  "mcpServers": {
    "ocd-mcp": {
      "url": "http://localhost:3100/api/mcp"
    }
  }
}
```

※ HTTP モードは別途サーバーを起動しておく必要があります。

### Context Roots フィルタリング（HTTP モード）

特定の Context Roots のみを対象にしたい場合：

```json
{
  "mcpServers": {
    "ocd-pj-alpha": {
      "url": "http://localhost:3100/api/mcp?roots=project-alpha,core-docs"
    },
    "ocd-pj-beta-readonly": {
      "url": "http://localhost:3100/api/mcp?roots=project-beta,shared&readonly=shared"
    }
  }
}
```

#### クエリパラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `roots` | 含める Context Root IDs（カンマ区切り） | `?roots=A,B,C` |
| `readonly` | readonly にする Context Root IDs | `?readonly=C` |
| `config` | JSON 形式（URL エンコード） | `?config={"roots":["A"],...}` |

## 📁 設定ファイル

### グローバル設定 (`~/.ocd/config.js`)

全プロジェクトで共有する Context Roots：

```javascript
/**
 * グローバル設定（全 PJ で共有）
 */
export default {
  globalContextRoots: [
    {
      id: 'company-docs',
      name: 'Company Documentation',
      path: '/path/to/shared/docs',
      readOnly: true
    }
  ]
}
```

### ローカル設定 (`.ocd.config.js`)

プロジェクト固有の設定（cwd から上位に探索）：

```javascript
/**
 * OCD-MCP 設定ファイル
 * 
 * contextRoots: Context Root の配列
 *   - path: string (必須)
 *   - name?: string
 *   - readOnly?: boolean
 *   - git?: 'auto-commit' | 'manual' | 'none'
 *   - ignorePatterns?: string[]
 *   - defaultExtension?: string
 * 
 * inheritGlobal?: boolean (デフォルト: true)
 */
export default {
  contextRoots: [
    {
      // プロジェクトのコンテキスト
      path: './organized-context',
      git: 'auto-commit'
    },
    {
      // CORE Framework ドキュメント（読み取り専用）
      path: './CORE/docs',
      name: 'CORE Docs',
      readOnly: true
    }
  ],
  
  inheritGlobal: true
}
```

### git 設定

Context Root 毎に Git コミットの挙動を設定：

| 値 | 説明 |
|----|------|
| `'auto-commit'` | 各操作後に自動コミット |
| `'manual'` | `commit` ツールで明示的にコミット（**デフォルト**） |
| `'none'` | Git を使用しない |

> **Note**: `readOnly: true` の Context Root は書き込みしないため `git` 設定は無視されます。

## 📖 特徴

- **Markdown ベース** - 人間が読み書きしやすいフォーマット
- **階層構造** - ネストしたコンテキストノード
- **LLM + 人間 協調** - 両者が同じデータストアを読み書き
- **MCP プロトコル** - Cursor, Claude Desktop などから接続可能
- **Git 連携** - 変更履歴の自動管理
- **マルチプロジェクト** - 複数 PJ の同時利用をサポート
- **動的設定探索** - cwd から `.ocd.config.json` を自動検出
- **Context Roots フィルタ** - URL パラメータで対象を絞り込み

## 🔧 MCP ツール一覧

全ツールに `ocd_` プレフィックス（Organized Context Datastore）が付いています。

| ツール | 説明 |
|--------|------|
| `ocd_list_context_roots` | Context Root 一覧を取得 |
| `ocd_get_contexts` | パターンとフィルタでコンテキストを取得 |
| `ocd_get_context_tree` | コンテキストツリー（目次）を取得 |
| `ocd_search_contexts` | キーワードでコンテキストを検索 |
| `ocd_mutate_context` | コンテキストを変更（create/update/delete/move） |
| `ocd_commit` | 変更をコミット（git: 'manual' モード用） |

## 📁 ディレクトリ構造

```
my-context-store/
├── .ocd.config.json      # ローカル設定ファイル
├── project-a/
│   ├── index.md          # プロジェクト概要
│   ├── features/
│   │   ├── feature-1.md
│   │   └── feature-2.md
│   └── decisions/
│       └── adr-001.md
└── project-b/
    └── ...
```

## 📝 Markdown フォーマット

```markdown
---
title: 機能仕様
summary: ユーザー認証機能の詳細仕様
categories:
  - feature-spec
tags:
  - authentication
  - security
---

# ユーザー認証機能

## 概要

ユーザー認証機能の実装について...
```

## 📦 インストール

```bash
# npm
npm install @stove-ai/organized-context-datastore-mcp

# または GitHub から
git clone https://github.com/teamstove/organized-context-datastore-mcp.git
cd organized-context-datastore-mcp
npm install
npm run build
```

## 🛠 開発

```bash
# Local Dev モードで起動
npm run dev -- --mode local-dev --port 3100

# テスト実行
npm test

# ビルド
npm run build
```

## 📄 ライセンス

MIT
