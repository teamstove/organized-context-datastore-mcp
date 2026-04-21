/**
 * OCD Web UI - 型定義
 *
 * organized-context-datastore-mcp の型定義を参照しつつ、
 * UI 固有の型を定義
 */

// =============================================================================
// プロジェクト関連
// =============================================================================

/**
 * OCD プロジェクト
 *
 * LocalStorage に保存されるプロジェクト情報
 */
export interface OcdProject {
  /** 一意の識別子 */
  id: string

  /** プロジェクト名（表示用） */
  name: string

  /** 接続モード */
  mode: 'local' | 'remote'

  /** LocalFilesystem モード時の basePath */
  basePath?: string

  /** RemoteServer モード時の サーバー URL */
  serverUrl?: string

  /** 最終アクセス日時 (ISO 8601) */
  lastAccessed: string
}

// =============================================================================
// Context 関連 (MCP 側の型を再定義)
// =============================================================================

/**
 * Context Root 設定
 */
export interface ContextRootConfig {
  id: string
  name: string
  path: string
  description?: string
  readOnly?: boolean
}

/**
 * Context Node (軽量版)
 */
export interface ContextNodeSummary {
  path: string
  title: string
  /** 要約（frontmatter の summary フィールド） */
  summary?: string
  attrs: Record<string, unknown>
  updatedAt?: string
  hasChildren?: boolean
  childCount: number
  isVirtual?: boolean
  /** 子ノード（フロントエンドで構築） */
  children?: ContextNodeSummary[]
}

/**
 * Context Node (フル)
 */
export interface ContextNode {
  path: string
  title: string
  attrs: Record<string, unknown>
  createdAt: string
  updatedAt: string
  links: {
    to: string[]
    from: string[]
  }
  content: string
  annotations: Annotation[]
  todos: Todo[]
  sections: Section[]
  children?: ContextNode[]
}

/**
 * アノテーション
 */
export interface Annotation {
  location: string
  type: 'section' | 'todo' | 'inline'
  attributes: string[]
  text: string
  line: number
}

/**
 * TODO 項目
 */
export interface Todo {
  text: string
  completed: boolean
  attributes: string[]
  location: string
  line: number
}

/**
 * セクション
 */
export interface Section {
  level: number
  title: string
  attributes: string[]
  startLine: number
  endLine: number
}

// =============================================================================
// UI 関連
// =============================================================================

/**
 * 表示モード
 */
export type ViewMode = 'tree' | 'list' | 'card'

/**
 * テーマ
 */
export type Theme = 'light' | 'dark' | 'system'

/**
 * コードブロックのシンタックスハイライトテーマ
 * highlight.js のダーク系テーマから選択
 */
export type CodeTheme =
  | 'monokai'
  | 'github-dark'
  | 'atom-one-dark'
  | 'dracula'
  | 'nord'
  | 'tokyo-night-dark'
  | 'vs2015'
  | 'night-owl'

/**
 * コードテーマの表示名マッピング
 */
export const CODE_THEME_LABELS: Record<CodeTheme, string> = {
  'monokai': 'Monokai',
  'github-dark': 'GitHub Dark',
  'atom-one-dark': 'Atom One Dark',
  'dracula': 'Dracula',
  'nord': 'Nord',
  'tokyo-night-dark': 'Tokyo Night',
  'vs2015': 'VS 2015',
  'night-owl': 'Night Owl',
}

/**
 * メインコンテンツエリアの幅モード
 * - normal: 最大幅 56rem (max-w-4xl) で中央寄せ
 * - wide: 幅制限なし (max-w-full) で広く表示
 */
export type ContentWidthMode = 'normal' | 'wide'

/** フォントサイズの最小値 (px) */
export const FONT_SIZE_MIN = 10
/** フォントサイズの最大値 (px) */
export const FONT_SIZE_MAX = 28

/**
 * フォントサイズを有効範囲にクランプ
 */
export function clampFontSize(px: number): number {
  return Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, Math.round(px)))
}

/**
 * UI 設定
 */
export interface UISettings {
  viewMode: ViewMode
  sidebarOpen: boolean
  theme: Theme
  /** コードブロックのシンタックスハイライトテーマ */
  codeTheme: CodeTheme
  /** メインコンテンツエリアの幅（通常 / 幅広） */
  contentWidthMode: ContentWidthMode
  /** 目次（Table of Contents）を表示するか */
  showToc: boolean
  /** 目次を右カラムで Sticky 固定表示するか（false のときは本文上に表示） */
  tocStickyRight: boolean
  /** ツリー（左ペイン）の基本フォントサイズ (px) */
  treeFontSize: number
  /** コンテンツ（右ペイン）の基本フォントサイズ (px) */
  contentFontSize: number
}

/**
 * ソートモード
 * - 'name-only': 完全に名前順（Dir/File 区別なし）
 * - 'folders-first': フォルダを先に表示（従来のデフォルト）
 */
export type TreeSortMode = 'name-only' | 'folders-first'

/**
 * ツリー表示設定
 */
export interface TreeSettings {
  /** ディレクトリ名を sticky 表示するか */
  stickyDirs: boolean
  /** ファイルタイトルを折り返し表示するか */
  wrapTitles: boolean
  /** ソートモード */
  sortMode: TreeSortMode
  /** ファイル名を表示するか（タイトルの前に表示） */
  showFileName: boolean
  /** summary を表示するか（タイトルの下に表示） */
  showSummary: boolean
}

// =============================================================================
// API 関連
// =============================================================================

/**
 * Context Tree 結果
 */
export interface ContextTreeResult {
  tree: ContextNodeSummary[] | string
  format: 'json' | 'tree-text'
  totalNodes: number
  truncated: boolean
  /** Context Root の ID */
  rootId: string
}

/**
 * 検索結果
 */
export interface SearchResult {
  contexts: ContextNode[]
  query: string
  total: number
}

// =============================================================================
// 変更操作関連
// =============================================================================

/**
 * コンテンツ更新操作
 */
export type ContentUpdate =
  | { type: 'whole_replace'; content: string }
  | {
      type: 'replace'
      search: string
      replacement: string
      isRegex?: boolean
      flags?: string
    }

// =============================================================================
// 編集操作パラメータ
// =============================================================================

/**
 * 新規作成パラメータ
 *
 * ContextService.createContext() で使用
 */
export interface CreateContextParams {
  /** パス（拡張子なし、例: "docs/features/new-feature"） */
  path: string
  /** タイトル（10-50文字） */
  title: string
  /** サマリ（50-300文字） */
  summary: string
  /** Markdown 本文 */
  content: string
  /** カスタム属性（オプション） */
  attrs?: Record<string, unknown>
}

/**
 * 更新パラメータ
 *
 * ContextService.updateContext() で使用
 */
export interface UpdateContextParams {
  /** タイトル（変更する場合） */
  title?: string
  /** サマリ（変更する場合） */
  summary?: string
  /** Markdown 本文（変更する場合、全置換） */
  content?: string
  /** カスタム属性（変更する場合、マージされる） */
  attrs?: Record<string, unknown>
}

/**
 * Context 変更操作
 */
export interface ContextMutation {
  /** 操作タイプ */
  type: 'create' | 'update' | 'delete' | 'move'
  /** 対象パス */
  path: string
  /** タイトル（create/update 時） */
  title?: string
  /** コンテンツ（create 時必須） */
  content?: string
  /** 属性 */
  attrs?: Record<string, unknown>
  /** コンテンツ更新（update 時） */
  contentUpdates?: ContentUpdate[]
  /** 移動先パス（move 時） */
  to?: string
}
