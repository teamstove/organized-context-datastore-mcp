# O.C.D. MCP — 開発者向けガイド

このドキュメントは O.C.D. MCP の開発・ビルド・テスト方法を説明します。

---

## プロジェクト構造

```
organized-context-datastore-mcp/
├── bin/run.mjs          # bin ラッパー（tsx で src/cli.ts を実行）
├── src/
│   ├── cli.ts           # CLI エントリポイント
│   ├── mcp-server.ts    # MCP サーバー（stdio）
│   ├── http/            # HTTP サーバー、REST API、Web UI
│   ├── config/          # 設定ローダー
│   ├── tools/           # MCP ツール実装
│   ├── storage/         # ストレージアダプター
│   └── ...
├── web-ui/              # Vue 3 Web UI
│   ├── src/
│   └── vite.config.ts
├── knowledge-base/      # ドキュメント・ADR
└── package.json
```

---

## 開発環境セットアップ

### 依存関係のインストール

```bash
npm install
cd web-ui && npm install  # Web UI 開発時
```

### ローカルで MCP を起動

```bash
# stdio モード + Web UI（推奨）
tsx src/cli.ts

# stdio モードのみ（MCP サーバーのみ）
npm run dev

# HTTP モード
npm run dev:http
# または
tsx src/http-server.ts --port 38291
```

---

## Cursor / IDE 設定（ローカル開発用）

`npx github:...` で Permission denied や ENOTEMPTY が出る場合、またはリポジトリをクローンして開発している場合は、**tsx で TypeScript ソースを直接実行**する設定が確実です。

```json
{
  "mcpServers": {
    "organized-context-datastore": {
      "command": "npx",
      "args": [
        "tsx",
        "/path/to/organized-context-datastore-mcp/src/cli.ts"
      ]
    }
  }
}
```

`/path/to/` は自分の環境のリポジトリ配置に合わせて書き換えてください。

オプション（`--readonly` など）を付けたい場合は、`args` の末尾に追加します。

```json
"args": ["tsx", "/path/to/.../src/cli.ts", "--readonly", "--disable-web-ui"]
```

---

## スクリプト一覧

| コマンド | 説明 |
|----------|------|
| `npm run dev` | stdio モード（MCP サーバーのみ） |
| `tsx src/cli.ts` | フル CLI（stdio + Web UI） |
| `npm run dev:http` | HTTP モード（tsx watch） |
| `npm run build` | TypeScript をビルド（dist/） |
| `npm run build:web-ui` | Web UI をビルド（web-ui/dist/） |
| `npm test` | テスト実行 |
| `npm run test:watch` | テストをウォッチモードで実行 |

---

## テスト

```bash
npm test
```

Vitest を使用。`src/tests/` にテストファイルを配置。

---

## Web UI 開発

```bash
cd web-ui
npm install
npm run dev
```

Vite が `http://localhost:5174` で起動。API は `VITE_OCD_API_URL` またはデフォルトで `http://localhost:38291` にプロキシされます。

メインサーバーを別ターミナルで起動しておく必要があります。

---

## ビルド

```bash
# TypeScript（bin/run.mjs はビルド不要で tsx を使用）
npm run build

# Web UI
npm run build:web-ui
```

---

## トラブルシューティング

### npx github:... が動かない

- `npx --package github:teamstove/organized-context-datastore-mcp tsx src/cli.ts` の形式を使用
- またはローカル開発用に tsx で `src/cli.ts` を直接指定（上記参照）

### Web UI が表示されない

- `npm run build:web-ui` を実行
- 初回起動時に自動ビルドが走るが、失敗する場合は手動ビルド

### ポート競合

- デフォルトは 38291。`--port` または `--web-ui-port` で変更可能
