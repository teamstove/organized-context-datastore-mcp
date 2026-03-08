# OCD - Organized Context Datastore (MCP)

階層構造を持つコンテキストを **LLM と人間** が共同で読み書きできる MCP サーバー。

---

## なぜ OCD か — UX の考え方

OCD は **LLM UX** と **Human UX** の両方を最適化しています。

### LLM UX — AI にとっての使いやすさ

| 課題 | OCD のアプローチ |
|------|---------------------|
| **コンテキスト消失** | プロジェクト知識を永続ストアに保存。セッションをまたいで一貫したコンテキストを維持 |
| **Token 消費の非効率** | `ocd_get_context_tree` で必要なノードだけ取得。`tree-text` 形式で Token 効率を最大化 |
| **知識の散逸** | 階層構造とパターン検索で、関連するコンテキストをまとめて取得 |
| **整合性** | 単一のデータソース。LLM と人間が同じ Markdown を参照・編集 |

LLM は MCP ツール経由で、検索・取得・更新・コミットを自然なワークフローで行えます。

### Human UX — 人間にとっての使いやすさ

| ニーズ | OCD のアプローチ |
|--------|---------------------|
| **可読性** | Markdown ベース。普段使いのエディタや GitHub でそのまま編集可能 |
| **可視化** | Web UI (`/viewer`) でツリー表示・検索・編集。ブラウザからすぐ確認 |
| **履歴管理** | Git 連携。変更の追跡とレビューが可能 |
| **協調** | LLM が書いたコンテキストを人間がレビュー・修正。逆も同様 |

stdio モードでは **Cursor から stdio**、**人間はブラウザ** で同時にアクセスでき、ワンライナー設定で両方に対応します。

---

## クイックスタート

### ワンライナー（stdio + Web UI デフォルト ON）

```bash
# Cursor から stdio 接続 + 人間はブラウザで http://localhost:38291/viewer
npx github:teamstove/organized-context-datastore-mcp

# readonly モード
npx github:teamstove/organized-context-datastore-mcp --readonly
```

### HTTP サーバーモード

```bash
# Local Dev モード（Web UI 付き）
npx github:teamstove/organized-context-datastore-mcp --http --port 38291

# Remote Server モード
npx github:teamstove/organized-context-datastore-mcp --http --mode remote-server --config ./config.json
```

---

## 起動オプション

| オプション | 説明 |
|-----------|------|
| (なし) | stdio モード（デフォルト）+ Web UI を port 38291 で起動 |
| `--http` | HTTP サーバーモード |
| `--readonly` | 書き込みツールを無効化 |
| `--port <port>` | HTTP ポート番号（デフォルト: 38291） |
| `--web-ui-port <port>` | stdio モード時の Web UI ポート（デフォルト: 38291） |
| `--disable-web-ui` | Web UI を無効化 |
| `--mode <mode>` | HTTP のみ: local-dev / remote-server |
| `--config <path>` | remote-server モード用の設定ファイル |

**重複起動時**: 同じポートで既に OCD が動いている場合、2 回目以降の起動は「すでに同じポートで OCD が起動しています」とログして正常終了（exit 0）します。ポートが別プロセスで使用中のときのみエラー終了します。サーバー種別の判定には **GET /whois** を使用しており、応答が `OCD` であれば自サーバーとみなします。

---

## Cursor / IDE 設定

### ワンライナー（stdio + Web UI）

```json
{
  "mcpServers": {
    "ocd-mcp": {
      "command": "npx",
      "args": [
        "--package", "github:teamstove/organized-context-datastore-mcp",
        "tsx", "src/cli.ts"
      ]
    }
  }
}
```

- **Cursor** → stdio で MCP 接続
- **人間** → ブラウザで `http://localhost:38291/viewer`

### stdio のみ（Web UI 無効）

```json
"args": [
  "--package", "github:teamstove/organized-context-datastore-mcp",
  "tsx", "src/cli.ts",
  "--disable-web-ui"
]
```

### bin 経由（パッケージ取得後）

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

```bash
# ターミナルで起動
npx github:teamstove/organized-context-datastore-mcp --http --port 38291
```

```json
{
  "mcpServers": {
    "ocd-mcp": {
      "url": "http://localhost:38291/api/mcp"
    }
  }
}
```

`http://localhost:38291/viewer` で Web UI にアクセス可能。

### Context Roots フィルタリング（HTTP モード）

```json
{
  "mcpServers": {
    "ocd-pj-alpha": {
      "url": "http://localhost:38291/api/mcp?roots=project-alpha,core-docs"
    },
    "ocd-pj-beta-readonly": {
      "url": "http://localhost:38291/api/mcp?roots=project-beta,shared&readonly=shared"
    }
  }
}
```

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `roots` | 含める Context Root IDs（カンマ区切り） | `?roots=A,B,C` |
| `readonly` | readonly にする Context Root IDs | `?readonly=C` |

---

## 設定ファイル

### ローカル設定 (`.ocd.config.js`)

プロジェクトルートに配置。cwd から上位に自動探索されます。

```javascript
export default {
  contextRoots: [
    {
      path: './organized-context',
      git: 'auto-commit'
    },
    {
      path: './CORE/docs',
      name: 'CORE Docs',
      readOnly: true
    }
  ],
  inheritGlobal: true
}
```

### グローバル設定 (`~/.ocd/config.js`)

全プロジェクトで共有する Context Roots を定義。

### git 設定

| 値 | 説明 |
|----|------|
| `'auto-commit'` | 各操作後に自動コミット |
| `'manual'` | `commit` ツールで明示的にコミット（**デフォルト**） |
| `'none'` | Git を使用しない |

---

## MCP ツール一覧

| ツール | 説明 |
|--------|------|
| `ocd_list_context_roots` | Context Root 一覧を取得 |
| `ocd_get_contexts` | パターンとフィルタでコンテキストを取得 |
| `ocd_get_context_tree` | コンテキストツリー（目次）を取得 |
| `ocd_search_contexts` | キーワードでコンテキストを検索 |
| `ocd_mutate_context` | コンテキストを変更（create/update/delete/move） |
| `ocd_commit` | 変更をコミット（git: 'manual' モード用） |

### ocd_mutate_context のパフォーマンス・注意

- **直列化**: 同一の Context Root（同一 cwd）に対して、`ocd_mutate_context` と `ocd_commit` は **同時に 1 件ずつ** 実行されます。連続で呼ぶと 2 件目以降は前の完了を待つため、フリーズではなく「待ち」になります。これにより Git 操作の競合を防いでいます。
- **move の重さ**: `move` 操作では、同じ Context Root 内の被リンク（リンク切れ防止）を更新するため、ルート配下の全 `.md` をスキャンすることがあります。ファイル数が多いと 1 回の move でも時間がかかることがあります。

---

## ディレクトリ構造例

```
my-context-store/
├── .ocd.config.js
├── project-a/
│   ├── index.md
│   ├── features/
│   │   ├── feature-1.md
│   │   └── feature-2.md
│   └── decisions/
│       └── adr-001.md
└── project-b/
    └── ...
```

---

## Markdown フォーマット

```markdown
---
title: 機能仕様
status: draft
priority: high
---

# ユーザー認証機能

## 概要

ユーザー認証機能の実装について...
```

`title` 以外の frontmatter フィールドは `attrs` として扱われます。

---

## インストール

```bash
git clone https://github.com/teamstove/organized-context-datastore-mcp.git
cd organized-context-datastore-mcp
npm install
```

Web UI は初回起動時に自動ビルドされます。手動ビルドは `npm run build:web-ui`。

---

## 開発者向け

ローカル開発・テスト・ビルドの手順は [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) を参照してください。

---

## ライセンス

MIT
