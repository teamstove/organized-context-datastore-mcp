# OCD - Organized Context Datastore (MCP)

> **[English version (README.md)](./README.md)**

**AI に永続的で構造化されたメモリを与え、人間もそれを見られるようにする。**

OCD は [MCP](https://modelcontextprotocol.io/) サーバーです。プロジェクト知識を Markdown ファイルの階層ツリーとして保存し、LLM は MCP ツール経由で、人間は内蔵の Web UI や任意のテキストエディタで読み書きできます。両者が同じデータソースを共有します。

### なぜ OCD か？

- **コンテキスト消失ゼロ** — プロジェクト知識を Git バックアップ付きストアに永続化。セッションをまたいでも失われない
- **Token 効率** — `tree-text` 形式で必要なブランチだけ取得。ドキュメント全体を読み込む必要なし
- **人間にやさしい** — 素の Markdown + frontmatter。VS Code で編集、GitHub でレビュー、内蔵 Web UI で閲覧
- **ワンコマンド** — `npx github:teamstove/organized-context-datastore-mcp` で MCP サーバーと Web UI が同時に起動

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

## 仕組み

```
┌──────────────┐   MCP (stdio / HTTP)   ┌─────────────────┐
│  LLM / IDE   │ ◄───────────────────► │   OCD Server    │
│  (Cursor…)   │                        │                 │
└──────────────┘                        │  Markdown files │
                                        │  + frontmatter  │
┌──────────────┐   HTTP + Web UI        │  + Git history  │
│    人間      │ ◄───────────────────► │                 │
│  (ブラウザ)   │                        └─────────────────┘
└──────────────┘
```

| LLM にとって | 人間にとって |
|-------------|-------------|
| セッションをまたぐ永続メモリ | 素の Markdown — どこでも編集可能 |
| 階層ツリーとパターン検索 | 内蔵 Web UI でツリー表示・検索 |
| Token 効率の高い `tree-text` 取得 | Git による履歴管理・差分レビュー |
| 6つの MCP ツール: list, get, tree, search, mutate, commit | AI が書いた内容を人間がレビュー・修正 |

---

## 起動オプション

| オプション | 説明 |
|-----------|------|
| *(なし)* | stdio モード（デフォルト）+ Web UI を port 38291 で起動 |
| `--http` | HTTP サーバーモード |
| `--readonly` | 書き込みツールを無効化 |
| `--port <port>` | HTTP ポート番号（デフォルト: 38291） |
| `--web-ui-port <port>` | stdio モード時の Web UI ポート（デフォルト: 38291） |
| `--disable-web-ui` | Web UI を無効化 |
| `--mode <mode>` | HTTP のみ: `local-dev` / `remote-server` |
| `--config <path>` | `remote-server` モード用の設定ファイル |

**重複起動時**: 同じポートで既に OCD が動いている場合、2 回目以降の起動は「すでに同じポートで OCD が起動しています」とログして正常終了（exit 0）します。ポートが別プロセスで使用中のときのみエラー終了します。サーバー種別の判定には **GET /whois** を使用しており、応答が `OCD` であれば自サーバーとみなします。

### CLI `tool` サブコマンド（MCP ツールと同等の処理）

MCP サーバーを起動せず、読み取り・更新を **ワンショット**で実行します。結果は **stdout に JSON**（`jq` などにパイプ可能）。

```bash
ocd-mcp tool --help
ocd-mcp tool --cwd . list-roots
ocd-mcp tool --cwd . get-contexts --patterns 'docs/**'
ocd-mcp tool --cwd . search --query "認証"
```

| 用途 | フラグ | 意味 |
|------|--------|------|
| 通常のプロジェクト | `--cwd <dir>` | このディレクトリから `.ocd.config.js` を上位探索（MCP の `cwd` と同様）。 |
| 固定ストレージ | `--storage <dir>` | `loadConfig` のルート。**HTTP の remote-server 用 JSON（`--config`）とは別物**。 |

- **`--readonly`**: `mutate` / `commit` を拒否します。
- **注意**: stdio の MCP サーバーが同じ Git ルートに書いている最中に CLI で `mutate` / `commit` しないでください（ロック・競合の恐れ）。
- **`get-contexts --include-content`**: 出力が非常に大きくなり得ます。

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
| `'manual'` | `ocd_commit` ツールで明示的にコミット（**デフォルト**） |
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
| `ocd_commit` | 変更をコミット（`git: 'manual'` モード用） |

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
