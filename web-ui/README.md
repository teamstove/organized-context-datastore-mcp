# Organized Context Datastore Web UI

OCD (Organized Context Datastore) のドキュメントを閲覧・操作できる Vue 3 Web アプリケーション。

## 機能

- **プロジェクト管理**: LocalStorage にプロジェクト設定を保存
- **LocalFilesystem / RemoteServer モード**: ローカルファイルシステムまたはリモートサーバーに接続
- **Context ツリー表示**: 階層構造でドキュメントをナビゲート
- **表示モード切替**: ツリー / リスト / カード
- **Markdown レンダリング**: シンタックスハイライト付き
- **ダークモード対応**: システム設定 / 手動切替

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| Framework | Vue 3 + TypeScript |
| UI | TailwindCSS + Radix Vue |
| State | Service クラス + `reactive()` + provide/inject |
| HTTP | axios |
| Markdown | markdown-it + highlight.js |
| Icons | lucide-vue-next |

## アーキテクチャ

### Service クラス + provide/inject パターン

Vue コンポーネントには**最小限の実装**のみを配置し、ビジネスロジック・状態管理・API呼び出しは**Service クラス**に集約。

```
main.ts
├─ new ProjectService()  → provide(projectServiceKey)
├─ new ContextService()  → provide(contextServiceKey)
└─ new UIService()       → provide(uiServiceKey)
                              ↓
Vue Components (inject のみ)
├─ inject(projectServiceKey) → テンプレートで使用
└─ ロジックは一切書かない
```

### Service 一覧

| Service | 責務 |
|---------|------|
| `ApiClient` | REST API / MCP 呼び出しの抽象化 |
| `ProjectService` | プロジェクト管理 (LocalStorage, 接続設定) |
| `ContextService` | Context データ取得・更新 (API呼び出し, キャッシュ) |
| `UIService` | UI状態管理 (表示モード, テーマ, サイドバー開閉) |

## 開発

```bash
# 依存関係のインストール
pnpm install

# 開発サーバー起動
pnpm dev

# ビルド
pnpm build
```

## 使用方法

### 1. OCD MCP サーバーを起動

```bash
cd ../organized-context-datastore-mcp
pnpm tsx src/http-server.ts --port 3000
```

### 2. Web UI を起動

```bash
pnpm dev
```

### 3. プロジェクトを追加

1. `http://localhost:5174` にアクセス
2. 「新規プロジェクト」をクリック
3. Local モード: `.ocd.config.js` があるディレクトリのパスを入力
4. Remote モード: OCD MCP サーバーの URL を入力

## ファイル構成

```
src/
├── main.ts                    # Service の provide
├── App.vue                    # ルートレイアウト (最小限)
├── router/
│   └── index.ts
├── services/                  # ★ Service クラス層
│   ├── index.ts               # エクスポート + injection keys
│   ├── ProjectService.ts      # プロジェクト管理
│   ├── ContextService.ts      # Context データ管理
│   ├── UIService.ts           # UI 状態管理
│   └── ApiClient.ts           # REST API クライアント
├── views/
│   ├── HomeView.vue           # プロジェクト選択画面
│   └── BrowserView.vue        # メインブラウザ画面
├── components/
│   ├── layout/
│   │   ├── AppHeader.vue
│   │   └── AppSidebar.vue
│   ├── project/
│   │   ├── ProjectSelector.vue
│   │   └── ProjectDialog.vue
│   ├── tree/
│   │   ├── ContextTree.vue
│   │   └── ContextTreeNode.vue
│   ├── content/
│   │   ├── ContextDetail.vue
│   │   └── MarkdownViewer.vue
│   └── common/
│       ├── ViewModeToggle.vue
│       └── SearchInput.vue
├── types/
│   └── index.ts
└── styles/
    └── index.css
```

## REST API エンドポイント

OCD MCP サーバーに追加された REST API:

| メソッド | エンドポイント | 説明 |
|----------|----------------|------|
| GET | `/api/ocd/roots` | Context Root 一覧 |
| GET | `/api/ocd/tree` | Context ツリー |
| GET | `/api/ocd/contexts` | Context 一覧（パターン指定） |
| GET | `/api/ocd/context/:path` | 単一 Context 取得 |
| GET | `/api/ocd/search` | 検索 |
| POST | `/api/ocd/mutate` | 変更操作 |
| POST | `/api/ocd/commit` | コミット |

## ライセンス

MIT
