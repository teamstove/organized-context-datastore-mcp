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
  
  /** サマリ (Frontmatterのsummaryまたは最初の段落) */
  summary: string
  
  /** カテゴリ (例: ['feature-spec', 'phase1']) */
  categories: string[]
  
  /** タグ (例: ['商品管理', 'priority-high']) */
  tags: string[]
  
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
  
  /** セクション構造 */
  sections: Section[]
  
  /** 子コンテキスト (depth指定時) */
  children?: ContextNode[]
}

/**
 * コンテキストノードのサマリ (軽量版)
 * ツリー表示用に content を含まない
 */
export interface ContextNodeSummary {
  path: string
  title: string
  summary: string
  categories: string[]
  tags: string[]
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
 * get_context_tree オプション（配列対応）
 * 
 * - rootPath: 単一のルートパス
 * - rootPaths: 複数のルートパス（一括取得）
 * 
 * どちらか一方を指定。両方指定した場合は rootPaths が優先。
 */
export interface GetContextTreeOptions {
  /** ルートパス（単一） */
  rootPath?: string
  
  /** ルートパス配列（複数一括取得） */
  rootPaths?: string[]
  
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
   * ツリー表示スタイル (tree-text のみ有効)
   * - 'flat': フルパス表記（階層なし）
   * - 'nested': ネスト形式（ツリー記号で階層表示）
   * 
   * default: 'flat'
   */
  treeStyle?: 'nested' | 'flat'
  
  /** summary を含めるか (tree-text のみ有効, default: true) */
  includeSummary?: boolean
  
  /** categories を含めるか (tree-text のみ有効, default: true) */
  includeCategories?: boolean
  
  /** tags を含めるか (tree-text のみ有効, default: true) */
  includeTags?: boolean
  
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
  
  /** ルートパス */
  rootPath: string
}

/**
 * get_context_tree の結果（複数）
 * 
 * rootPaths を指定した場合の戻り値
 */
export interface ContextTreeResults {
  /** 各ルートパスの結果 */
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
  /** 親ノードのパス */
  parentPath: string
  
  /** タイトル */
  title: string
  
  /** サマリ */
  summary: string
  
  /** 本文コンテンツ (オプション) */
  content?: string
  
  /** カテゴリ (オプション) */
  categories?: string[]
  
  /** タグ (オプション) */
  tags?: string[]
  
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
  
  /** タイトル (変更する場合) */
  title?: string
  
  /** サマリ (変更する場合) */
  summary?: string
  
  /** カテゴリ (変更する場合) */
  categories?: string[]
  
  /** タグ (変更する場合) */
  tags?: string[]
  
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
 * | type   | 必須                        | オプション                                        |
 * |--------|-----------------------------|-------------------------------------------------|
 * | create | path, title, summary        | categories, tags, content                        |
 * | update | path                        | title, summary, categories, tags, contentUpdates |
 * | delete | path                        | -                                                |
 * | move   | path, to                    | -                                                |
 * 
 * ## 使用例
 * 
 * ```json
 * {
 *   "operations": [
 *     { "type": "create", "path": "docs/features", "title": "新機能", "summary": "..." },
 *     { "type": "update", "path": "docs/existing", "summary": "更新" },
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
   * 対象パス
   * - create: 親パス (title からスラッグ生成して子パス作成)
   * - update/delete: 対象パス
   * - move: 移動元パス
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
   * タイトル
   * - create: 必須 (スラッグ化してパス生成 + 表示名)
   * - update: 変更する場合のみ
   */
  title?: string
  
  /**
   * サマリ
   * - create: 必須
   * - update: 変更する場合のみ
   */
  summary?: string
  
  /** カテゴリ (create/update で使用) */
  categories?: string[]
  
  /** タグ (create/update で使用) */
  tags?: string[]
  
  // ==========================================================================
  // コンテンツ (create/update)
  // ==========================================================================
  
  /**
   * 初期コンテンツ (create 時のみ)
   * 
   * update 時は contentUpdates を使用
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
  
  /** サマリ (変更する場合) */
  summary?: string
  
  /** コンテンツ (変更する場合) */
  content?: string
  
  /** カテゴリ (変更する場合) */
  categories?: string[]
  
  /** タグ (変更する場合) */
  tags?: string[]
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
 * バージョン管理モード
 */
export type VersionControlMode = 
  | 'immediate'      // 即時反映
  | 'draft_commit'   // DRAFT → commit
  | 'approval_flow'  // edit → commit → approve → merge

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
  
  /** バージョン管理モード */
  versionControlMode: VersionControlMode
  
  /** 書き込み権限 */
  writePermission: WritePermissionConfig
  
  /** Context Roots 設定 */
  contextRoots: ContextRootConfig[]
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
export type ServerModeType = 'local-dev' | 'remote-server'

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
  
  /** バージョン管理モード */
  versionControlMode?: VersionControlMode
  
  /** 書き込み権限設定 */
  writePermission?: WritePermissionConfig
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
}

/**
 * 解決済み設定（cwd からの探索 + グローバルマージ後）
 */
export interface ResolvedConfig {
  /** 設定ファイルのパス（見つかった場合） */
  configPath?: string
  
  /** 解決済み Context Roots */
  contextRoots: ContextRootConfig[]
  
  /** バージョン管理モード */
  versionControlMode: VersionControlMode
  
  /** 書き込み権限設定 */
  writePermission: WritePermissionConfig
}
