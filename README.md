# Organized Context Datastore MCP

階層構造を持つコンテキストを LLM と人間が共同で読み書きできる MCP サーバー。

## 🚀 クイックスタート

### npx で実行（GitHub から直接）

```bash
npx github:teamstove/organized-context-datastore-mcp --storage ./my-context-store
```

### Cursor / Claude Desktop での設定

`~/.cursor/mcp.json` または `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-store": {
      "command": "npx",
      "args": [
        "github:teamstove/organized-context-datastore-mcp",
        "--storage",
        "/path/to/your/context-store"
      ]
    }
  }
}
```

## 📖 特徴

- **Markdown ベース** - 人間が読み書きしやすいフォーマット
- **階層構造** - ネストしたコンテキストノード
- **LLM + 人間 協調** - 両者が同じデータストアを読み書き
- **MCP プロトコル** - Cursor, Claude Desktop などから接続可能
- **Git 連携** - 変更履歴の自動管理

## 🔧 MCP ツール一覧

| ツール | 説明 |
|--------|------|
| `list_context_roots` | Context Root 一覧を取得 |
| `get_contexts` | パターンとフィルタでコンテキストを取得 |
| `get_context_tree` | コンテキストツリー（目次）を取得 |
| `search_contexts` | キーワードでコンテキストを検索 |
| `mutate_context` | コンテキストを変更（create/update/delete/move） |
| `commit` | 変更をコミット（draft_commit モード用） |

## 📁 ディレクトリ構造

```
my-context-store/
├── ocd.config.json       # 設定ファイル（オプション）
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

## 🔧 設定ファイル（オプション）

`ocd.config.json`:

```json
{
  "contextRoots": [
    {
      "name": "my-project",
      "path": "./",
      "storage": {
        "type": "file-git"
      }
    }
  ],
  "versionControlMode": "immediate"
}
```

## 📦 ローカルインストール

```bash
# npm
npm install organized-context-datastore-mcp

# または
git clone https://github.com/teamstove/organized-context-datastore-mcp.git
cd organized-context-datastore-mcp
npm install
npm run build
```

## 🛠 開発

```bash
# 開発サーバー起動
npm run dev -- --storage ./test-store

# テスト実行
npm test

# ビルド
npm run build
```

## 📄 ライセンス

MIT
