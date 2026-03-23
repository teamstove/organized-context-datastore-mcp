/**
 * Knowledge Graph MCP - Type Definitions
 * 
 * ネストした知識グラフをLLMと人間が共同で読み書きするための型定義
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * コンテキストノード - Knowledge Graphの基本単位
 */
export interface ContextNode {
  /** ノードのパス (例: 'gme-project/features/product-master') */
  path: string
  
  /** タイトル (Frontmatterのtitleまたはファイル名) */
  title: string
  
  /** カスタム属性 (frontmatter の title 以外のフィールド) */
  attrs: Record<string, unknown>
  
  /** 作成日時 (ISO 8601) */
  createdAt: string
  
  /** 更新日時 (ISO 8601) */
  updatedAt: string
  
  /** リンク情報 */
  links: {
    /** このコンテキストからのリンク先 */
    to: string[]
    /** このコンテキストへのリンク元 (backlinks) */
    from: string[]
  }
  
  /** 生のMarkdownコンテンツ */
  content: string
  
  /** [[属性]] アノテーション */
  annotations: Annotation[]
  
  /** TODO項目 */
  todos: Todo[]
  
  /** 子コンテキスト (depth指定時) */
  children?: ContextNode[]
}

/**
 * コンテキストノードのサマリ (軽量版)
 * ツリー表示用に content を含まない
 */
export interface ContextNodeSummary {
  path: string
  
  /** 
   * サマリの見出し部分（10-50文字）
   * summary と連結して「ひとつづきのサマリ」として機能する
   */
  title: string
  
  /**
   * サマリの詳細部分（50-300文字）
   * LLM向けに圧縮された内容説明
   * title と連結して「ひとつづきのサマリ」として機能する
   */
  summary?: string
  
  /** カスタム属性 */
  attrs: Record<string, unknown>
  updatedAt?: string  // 仮想ノードには存在しない場合がある
  hasChildren?: boolean
  childCount: number
  /** 仮想ノード（index.md がないディレクトリ） */
  isVirtual?: boolean
}

/**
 * [[属性]] アノテーション
 */
export interface Annotation {
  /** 位置 (セクションパス: "## ユースケース") */
  location: string
  
  /** 種類 */
  type: 'section' | 'todo' | 'inline'
  
  /** 属性リスト (例: ["要確認:お客様"]) */
  attributes: string[]
  
  /** テキスト内容 */
  text: string
  
  /** 行番号 */
  line: number
}

/**
 * TODO項目
 */
export interface Todo {
  /** TODOテキスト */
  text: string
  
  /** 完了フラグ */
  completed: boolean
  
  /** 属性リスト */
  attributes: string[]
  
  /** 所属セクション */
  location: string
  
  /** 行番号 */
  line: number
}

/**
 * セクション情報
 */
export interface Section {
  /** 見出しレベル (1-6) */
  level: number
  
  /** 見出しタイトル */
  title: string
  
  /** セクションの [[属性]] */
  attributes: string[]
  
  /** 開始行 */
  startLine: number
  
  /** 終了行 */
  endLine: number
}

// =============================================================================
// API Types
// =============================================================================

/**
 * get_contexts オプション
 */
export interface GetContextsOptions {
  /** glob パターン (例: ['gme-project/**', 'core-framework/plugins/*']) */
  patterns: string[]
  
  /** jq 式によるフィルタ (例: '.categories | contains(["feature-spec"])') */
  filter?: string
  
  /** コンテンツを含めるか (default: true) */
  includeContent?: boolean
  
  /** 子階層を含める深さ (0 = 本ノードのみ) */
  depth?: number
}

/**
 * get_context_tree オプション
 * 
 * 注意: list_context_roots で取得した id をそのまま使用してください。
 * 例: ["tairikut-docs"], ["tairikut-docs", "CORE-docs-for-ai"]
 */
export interface GetContextTreeOptions {
  /** 
   * Context Root の ID 配列
   * list_context_roots で取得した id をそのまま指定
   * 
   * 例:
   * - 単一: ["tairikut-docs"]
   * - 複数: ["tairikut-docs", "CORE-docs-for-ai"]
   */
  rootIds: string[]
  
  /** 深さ制限 (default: undefined = 全階層) */
  depth?: number
  
  /**
   * 出力形式
   * - 'json': 従来のJSON配列形式
   * - 'tree-text': Token効率の良いテキストツリー形式
   * 
   * default: 'tree-text'
   */
  format?: 'json' | 'tree-text'
  
  /**
   * tree-text 形式の表示フォーマット
   * 
   * 使用可能な変数:
   * - $path: 相対パス
   * - $title: タイトル
   * 
   * @example "$path: $title $summary"
   * @default "$path: $title $summary"
   */
  treeTextFormat?: string
  
  /** 返却ノード数上限 (default: 1000) */
  maxNodes?: number
}

/**
 * get_context_tree の結果（単一）
 */
export interface ContextTreeResult {
  /** 
   * ツリーデータ
   * - format='json' の場合: ContextNodeSummary[]
   * - format='tree-text' の場合: string (テキスト形式のツリー)
   */
  tree: ContextNodeSummary[] | string
  
  /** 出力形式 */
  format: 'json' | 'tree-text'
  
  /** 総ノード数 */
  totalNodes: number
  
  /** 結果が切り詰められたか */
  truncated: boolean
  
  /** Context Root の ID */
  rootId: string
}

/**
 * get_context_tree の結果（複数 rootIds 指定時）
 */
export interface ContextTreeResults {
  /** 各 Context Root の結果 */
  results: ContextTreeResult[]
  
  /** 合計ノード数 */
  totalNodes: number
  
  /** いずれかが切り詰められたか */
  truncated: boolean
}

/**
 * create_context パラメータ
 */
export interface CreateContextParams {
  /** 
   * コンテキストのパス（完全なパス）
   * 
   * 例: "docs/features/new-feature"
   * 
   * 注: 拡張子 (.md) は自動付与されるため省略
   */
  path: string
  
  /** 
   * Markdown コンテンツ
   * 
   * フロントマターは自動生成されるため、本文のみを指定
   */
  content: string
  
  /** 
   * サマリの見出し部分（10-50文字）
   * 
   * - path から想像できる以上の情報を含める
   * - summary と連結して読んだときに自然なフレーズになる
   * - summary との内容重複は禁止
   */
  title: string
  
  /**
   * サマリの詳細部分（50-300文字）
   * 
   * - LLM向けに圧縮された内容説明
   * - 具体的キーワードの羅列でもOK
   * - title と連結して「ひとつづきのサマリ」として機能する
   * - title との内容重複は禁止
   */
  summary: string
  
  /** カスタム属性 (オプション) */
  attrs?: Record<string, unknown>
  
  /**
   * ファイル拡張子 (オプション)
   * 
   * 例: ".md", ".context.md"
   * 省略時は Context Root の defaultExtension → システムデフォルト (.md)
   */
  extension?: string
}

// =============================================================================
// Update Context Types (統合版)
// =============================================================================

/**
 * コンテンツ更新操作
 * 
 * - whole_replace: コンテンツ全体を置換
 * - regexp_replace: 正規表現で部分置換 (append, prepend, セクション操作も実現可能)
 */
export type ContentUpdate = 
  | ContentUpdateWholeReplace
  | ContentUpdateRegexpReplace

/**
 * コンテンツ全置換
 */
export interface ContentUpdateWholeReplace {
  type: 'whole_replace'
  /** 新しいコンテンツ */
  content: string
}

/**
 * 正規表現置換
 * 
 * ## 典型的なパターン
 * 
 * ### 末尾追記
 * pattern: '$', replacement: '\n\n追記内容', flags: 'm'
 * 
 * ### 先頭追記
 * pattern: '^', replacement: '先頭内容\n\n', flags: ''
 * 
 * ### セクション末尾に追記
 * pattern: '(## セクション名.*?)(\n## |$)', replacement: '$1\n- 追記$2', flags: 's'
 * 
 * ### セクション置換
 * pattern: '## セクション名\n.*?(?=\n## |$)', replacement: '## セクション名\n新内容', flags: 's'
 * 
 * ### TODO完了マーク
 * pattern: '- \\[\\s*\\] (対象タスク)', replacement: '- [x] $1'
 */
export interface ContentUpdateRegexpReplace {
  type: 'regexp_replace'
  /** 正規表現パターン */
  pattern: string
  /** 置換文字列 ($1, $2 等のグループ参照可) */
  replacement: string
  /** 正規表現フラグ (g, i, m, s) */
  flags?: string
}

/**
 * update_context 操作 (配列の要素)
 */
export interface UpdateContextOperation {
  /** 対象パス */
  path: string
  
  /** サマリの見出し部分（変更する場合） */
  title?: string
  
  /** サマリの詳細部分（変更する場合） */
  summary?: string
  
  /** カスタム属性 (変更する場合、マージされる) */
  attrs?: Record<string, unknown>
  
  /** コンテンツ操作 (複数指定可、順番に適用) */
  contentUpdates?: ContentUpdate[]
}

/**
 * delete_context 操作 (配列の要素)
 */
export interface DeleteContextOperation {
  /** 削除対象パス */
  path: string
}

/**
 * move_context 操作 (配列の要素)
 */
export interface MoveContextOperation {
  /** 移動元パス */
  fromPath: string
  /** 移動先パス */
  toPath: string
}

// =============================================================================
// Unified Mutation Types (統合版 mutate_context)
// =============================================================================

/**
 * コンテキスト変更操作（統合版）
 * 
 * 全ての書き込み操作を単一のツールで実行可能。
 * type によって必須フィールドが変わる:
 * 
 * | type   | 必須             | オプション                  |
 * |--------|------------------|---------------------------|
 * | create | path, title      | attrs, content            |
 * | update | path             | title, attrs, contentUpdates |
 * | delete | path             | -                          |
 * | move   | path, to         | -                          |
 * 
 * ## 使用例
 * 
 * ```json
 * {
 *   "operations": [
 *     { "type": "create", "path": "docs/features", "title": "新機能" },
 *     { "type": "update", "path": "docs/existing", "title": "更新" },
 *     { "type": "move", "path": "old/path", "to": "new/path" },
 *     { "type": "delete", "path": "docs/obsolete" }
 *   ]
 * }
 * ```
 */
export interface ContextMutation {
  /**
   * 操作タイプ
   * - create: 新規作成
   * - update: メタデータ/コンテンツ更新
   * - delete: 削除
   * - move: 移動/リネーム
   */
  type: 'create' | 'update' | 'delete' | 'move'
  
  /**
   * 対象パス（全操作で一貫した意味）
   * 
   * - create: 作成するコンテキストのパス (例: "docs/features/new-feature")
   * - update/delete: 対象パス
   * - move: 移動元パス
   * 
   * 注: 拡張子 (.md) は自動付与されるため省略
   */
  path: string
  
  /**
   * 移動先パス (move 時のみ)
   */
  to?: string
  
  // ==========================================================================
  // メタデータ (create/update)
  // ==========================================================================
  
  /**
   * サマリの見出し部分（10-50文字）
   * 
   * - create: 必須
   * - update: 変更する場合のみ
   * 
   * path から想像できる以上の情報を含め、
   * summary と連結して読んだときに自然なフレーズになるようにする。
   * summary との内容重複は禁止。
   */
  title?: string
  
  /**
   * サマリの詳細部分（50-300文字）
   * 
   * - create: 必須
   * - update: 変更する場合のみ
   * 
   * LLM向けに圧縮された内容説明。
   * 具体的キーワードの羅列でもOK。
   * title と連結して「ひとつづきのサマリ」として機能する。
   * title との内容重複は禁止。
   */
  summary?: string
  
  /**
   * カスタム属性 (create/update で使用)
   * 
   * frontmatter に任意のキー・値を保存できる
   */
  attrs?: Record<string, unknown>
  
  // ==========================================================================
  // コンテンツ (create/update)
  // ==========================================================================
  
  /**
   * コンテンツ (create 時必須)
   * 
   * - create: Markdown 本文 (フロントマターは自動生成)
   * - update: contentUpdates を使用
   */
  content?: string
  
  /**
   * コンテンツ更新操作 (update 時のみ)
   * 
   * 複数指定可、順番に適用される
   */
  contentUpdates?: ContentUpdate[]
  
  // ==========================================================================
  // ファイル設定 (create)
  // ==========================================================================
  
  /**
   * ファイル拡張子 (create 時のみ)
   * 
   * 例: ".md", ".context.md"
   * 
   * 省略時は Context Root の defaultExtension → システムデフォルト (.md) が使用される
   */
  extension?: string
}

/**
 * mutate_context の結果
 */
export interface MutationResult {
  /** 成功した操作数 */
  success: number
  
  /** 失敗した操作数 */
  errors: number
  
  /** 各操作の結果 */
  results: MutationOperationResult[]
  
  /** 調査用: 処理にかかった秒数 (tool response のみ) */
  took?: number
}

/**
 * 個別操作の結果
 */
export interface MutationOperationResult {
  /** 操作タイプ */
  type: 'create' | 'update' | 'delete' | 'move'
  
  /** 対象パス */
  path: string
  
  /** 成功したか */
  success: boolean
  
  /** エラーメッセージ (失敗時) */
  error?: string
  
  /** 結果ノード (create/update/move 成功時) */
  result?: ContextNode
  
  /** 更新された被リンク数 (move 操作時のみ、0件の場合は省略) */
  backlinksUpdated?: number
}

// =============================================================================
// Legacy Types (後方互換性のため残す)
// =============================================================================

/**
 * @deprecated UpdateContextOperation を使用してください
 */
export interface UpdateContextParams {
  /** 対象パス */
  path: string
  
  /** タイトル (変更する場合) */
  title?: string
  
  /** コンテンツ (変更する場合) */
  content?: string
  
  /** カスタム属性 (変更する場合) */
  attrs?: Record<string, unknown>
}

/**
 * @deprecated UpdateContextOperation + regexp_replace を使用してください
 */
export interface AppendToContextParams {
  /** 対象パス */
  path: string
  
  /** 追記内容 */
  content: string
  
  /** 追記先セクション (オプション、指定なしは末尾) */
  section?: string
}

// =============================================================================
// Storage Types
// =============================================================================

/**
 * ストレージアダプターのインターフェース
 */
export interface IKnowledgeStore {
  // Read operations
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  list(pattern: string): Promise<string[]>
  getMetadata(path: string): Promise<FileMetadata>
  
  // Write operations
  write(path: string, content: string): Promise<void>
  delete(path: string): Promise<void>
  move(fromPath: string, toPath: string): Promise<void>
  
  // Version control
  commit(message: string, paths?: string[]): Promise<string>
  getHistory(path: string, limit?: number): Promise<VersionEntry[]>
  revert(path: string, version: string): Promise<void>
}

/**
 * ファイルメタデータ
 */
export interface FileMetadata {
  path: string
  createdAt: string
  updatedAt: string
  size: number
}

/**
 * バージョン履歴エントリ
 */
export interface VersionEntry {
  version: string  // Git commit hash or DB version ID
  message: string
  author: string
  timestamp: string
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * 書き込み権限設定
 */
export interface WritePermissionConfig {
  /** モード */
  mode: 'unrestricted' | 'allowlist' | 'denylist'
  
  /** 許可パス (allowlistモード) */
  allowedPaths?: string[]
  
  /** 拒否パス (denylistモード) */
  deniedPaths?: string[]
  
  /** 書き込み可能なContext Root (指定時はこれらのみ) */
  writableContextRoots?: string[]
}

/**
 * MCPサーバー設定
 */
export interface KnowledgeGraphMCPConfig {
  /** ストレージルートパス (file-git の場合) */
  storagePath: string
  
  /** ストレージタイプ */
  storageType: 'file-git' | 'postgres'
  
  /**
   * PostgreSQL 接続文字列 (postgres の場合)
   * 
   * 形式: postgresql://user:password@host:port/database
   * 
   * 環境変数の参照もサポート:
   * - "${KGMCP_PG_CONNECTION_STRING}" -> 環境変数を展開
   */
  connectionString?: string
  
  /** 書き込み権限 */
  writePermission: WritePermissionConfig
  
  /** Context Roots 設定 */
  contextRoots: ContextRootConfig[]
  
  /** tree-text 形式の表示フォーマット (default: "$path: $title $summary") */
  treeTextFormat?: string
}

/**
 * Context Root 設定
 * 
 * Context Root ごとに異なるストレージタイプを指定可能。
 * storageType を省略した場合は、親プロジェクトの設定を継承する。
 */
export interface ContextRootConfig {
  /** ID */
  id: string
  
  /** 表示名 */
  name: string
  
  /** パス (ストレージルートからの相対パス) */
  path: string
  
  /** 説明 */
  description?: string
  
  /** 読み取り専用フラグ */
  readOnly?: boolean
  
  // ==========================================================================
  // ファイルフィルタリング
  // ==========================================================================
  
  /**
   * 除外パターン (glob 形式)
   * 
   * デフォルトで以下が除外される:
   * - .git, node_modules, dist, build, .cache, coverage など
   * 
   * 追加パターン例: ['*.test.md', 'drafts/**']
   * 
   * デフォルト除外を解除する場合: ['!node_modules'] で node_modules を対象に含める
   */
  ignorePatterns?: string[]
  
  /**
   * 対象ファイルパターン (glob 形式)
   * 
   * 例: "**\/*.context.md" または "**\/*.md"
   * 
   * デフォルト: "**\/*.md"
   * 指定した場合、このパターンにマッチするファイルのみが Context として認識される
   */
  includePatterns?: string[]
  
  /**
   * 新規作成時のデフォルト拡張子
   * 
   * 例: ".md", ".context.md"
   * 
   * デフォルト: ".md"
   * mutate_context で create する際、明示的に extension を指定しなければこの値が使われる
   */
  defaultExtension?: string
  
  /**
   * LLM 向け tree preload（例: `ocd_get_context_tree`）時の行表示フォーマット。
   *
   * 省略時は `undefined`（呼び出し側がプロジェクトの `treeTextFormat` 等で解決する）。
   *
   * 使用可能な変数: `$path`, `$title`, `$summary`
   *
   * @example '$path: $title $summary'
   * @example '$path: $title' // summary を省きたい場合
   */
  treePreviewFormat?: string
  
  // ==========================================================================
  // Git 設定
  // ==========================================================================
  
  /**
   * Git コミット設定
   * 
   * - 'auto-commit': 各操作後に自動コミット
   * - 'manual': commit ツールで明示的にコミット（デフォルト）
   * - 'none': Git を使用しない
   * 
   * readOnly: true の場合はこの設定は無視される（書き込みしないため）
   */
  git?: 'auto-commit' | 'manual' | 'none'
  
  // ==========================================================================
  // 個別ストレージ設定 (省略時は親プロジェクトの設定を継承)
  // ==========================================================================
  
  /**
   * ストレージタイプ
   * 
   * 省略時は親プロジェクトの storageType を継承
   */
  storageType?: 'file-git' | 'postgres'
  
  /**
   * file-git の場合のストレージパス
   * 
   * この Context Root 専用の Git リポジトリパスを指定
   */
  storagePath?: string
  
  /**
   * postgres の場合の接続文字列
   * 
   * 環境変数の参照もサポート:
   * - "${KGMCP_PG_CONNECTION_STRING}" -> 環境変数を展開
   */
  connectionString?: string
}

// =============================================================================
// Server Mode Types
// =============================================================================

/**
 * サーバー起動モード
 * 
 * - local-dev: 開発者のPC上で起動、cwd パラメータで動的に設定を探索
 * - remote-server: サーバー上で常駐、設定ファイルで固定された Context Root を提供
 */
export type ServerModeType = 'local-dev' | 'remote-server' | 'dynamic-storage'

/**
 * サーバーモード設定
 */
export interface ServerMode {
  /** モードタイプ */
  type: ServerModeType
  
  /** 読み取り専用モード（書き込みツールを無効化） */
  readonly: boolean
}

/**
 * グローバル設定ファイル (~/.ocd/config.json)
 */
export interface GlobalConfig {
  /** グローバル Context Roots（全プロジェクトで共有） */
  globalContextRoots?: GlobalContextRootConfig[]
}

/**
 * グローバル Context Root 設定
 */
export interface GlobalContextRootConfig {
  /** ID */
  id: string
  
  /** 表示名 */
  name: string
  
  /** 絶対パス */
  path: string
  
  /** 説明 */
  description?: string
  
  /** 読み取り専用フラグ（デフォルト: true） */
  readOnly?: boolean
  
  /** 除外パターン (glob 形式) */
  ignorePatterns?: string[]
  
  /** 対象ファイルパターン (glob 形式, デフォルト: **\/*.md) */
  includePatterns?: string[]
  
  /** Git コミット設定 ('auto-commit' | 'manual' | 'none') */
  git?: 'auto-commit' | 'manual' | 'none'
}

/**
 * ローカル設定ファイル (.ocd.config.json)
 */
export interface LocalConfig {
  /** Context Roots（相対パスまたは絶対パス） */
  contextRoots?: LocalContextRootConfig[]
  
  /** グローバル設定を継承するか（デフォルト: true） */
  inheritGlobal?: boolean
  
  /** 書き込み権限設定 */
  writePermission?: WritePermissionConfig
  
  /**
   * tree-text 形式の表示フォーマット
   * 
   * 使用可能な変数:
   * - $path: 相対パス
   * - $title: タイトル
   * 
   * @example "$path: $title $summary"
   * @default "$path: $title $summary"
   */
  treeTextFormat?: string
}

/**
 * ローカル Context Root 設定
 */
export interface LocalContextRootConfig {
  /** ID（省略時はパスから生成） */
  id?: string
  
  /** 表示名（省略時はパスから生成） */
  name?: string
  
  /** パス（相対パスまたは絶対パス） */
  path: string
  
  /** 説明 */
  description?: string
  
  /** 読み取り専用フラグ */
  readOnly?: boolean
  
  /** 除外パターン (glob 形式) */
  ignorePatterns?: string[]
  
  /** 対象ファイルパターン (glob 形式, デフォルト: **\/*.md) */
  includePatterns?: string[]
  
  /** Git コミット設定 ('auto-commit' | 'manual' | 'none') */
  git?: 'auto-commit' | 'manual' | 'none'
  
  /** 新規作成時のデフォルト拡張子 (例: ".md", ".context.md") */
  defaultExtension?: string
  
  /**
   * LLM 向け tree preload 時の表示フォーマット（この Context Root 専用）。
   *
   * 省略時はプロジェクトレベルの `treeTextFormat` を継承する想定で、値は `undefined` のまま返す（デフォルト文字列の解決は Engine 等の呼び出し側の責務）。
   *
   * 使用可能な変数: `$path`, `$title`, `$summary`
   *
   * @example '$path: $title $summary'
   * @example '$path: $title' // summary 不要な場合
   */
  treePreviewFormat?: string
}

/**
 * 解決済み設定（cwd からの探索 + グローバルマージ後）
 */
export interface ResolvedConfig {
  /** 設定ファイルのパス（見つかった場合） */
  configPath?: string
  
  /** 解決済み Context Roots */
  contextRoots: ContextRootConfig[]
  
  /** 書き込み権限設定 */
  writePermission: WritePermissionConfig
  
  /** tree-text 形式の表示フォーマット */
  treeTextFormat?: string
}
