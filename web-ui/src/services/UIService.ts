/**
 * UIService - UI 状態管理サービス
 *
 * 責務:
 * - 表示モード (tree / list / card) の管理
 * - サイドバー開閉状態の管理
 * - テーマ (light / dark / system) の管理
 * - ツリー表示設定の管理
 *
 * LocalStorage 操作は StorageHelper に委譲
 */
import { reactive, readonly, type InjectionKey, type DeepReadonly } from 'vue'
import type { ViewMode, Theme, UISettings, TreeSettings, TreeSortMode, CodeTheme, ContentWidthMode } from '@/types'
import { createStorage } from '@/utils/StorageHelper'

// =============================================================================
// 定数
// =============================================================================

const STORAGE_KEY = 'ocd-ui-settings'
const TREE_SETTINGS_KEY = 'ocd-tree-settings'

// =============================================================================
// ストレージインスタンス
// =============================================================================

const uiStorage = createStorage<UISettings>(STORAGE_KEY, '[UIService]')
const treeStorage = createStorage<TreeSettings>(TREE_SETTINGS_KEY, '[UIService:Tree]')

// =============================================================================
// デフォルト値
// =============================================================================

const DEFAULT_UI_SETTINGS: UISettings = {
  viewMode: 'tree',
  sidebarOpen: true,
  theme: 'system',
  codeTheme: 'monokai', // デフォルトは Monokai
  contentWidthMode: 'normal', // メインコンテンツ幅: 通常
  showToc: true, // 目次を表示（デフォルトオン）
  tocStickyRight: false, // 目次は本文上に表示（右カラム Sticky はオフ）
}

const DEFAULT_TREE_SETTINGS: TreeSettings = {
  stickyDirs: false,
  wrapTitles: false,
  sortMode: 'name-only',
  showFileName: true, // デフォルトでファイル名を表示
  showSummary: false, // デフォルトで summary は非表示
}

// =============================================================================
// State 型定義
// =============================================================================

export interface UIServiceState {
  /** 表示モード */
  viewMode: ViewMode
  /** サイドバー開閉状態 */
  sidebarOpen: boolean
  /** テーマ */
  theme: Theme
  /** コードブロックのシンタックスハイライトテーマ */
  codeTheme: CodeTheme
  /** メインコンテンツエリアの幅モード（通常 / 幅広） */
  contentWidthMode: ContentWidthMode
  /** 目次を表示するか */
  showToc: boolean
  /** 目次を右カラムで Sticky 固定表示するか */
  tocStickyRight: boolean
  /** ツリー表示設定 */
  treeSettings: TreeSettings
  /** 設定ダイアログ表示状態 */
  settingsDialogOpen: boolean

  // =========================================================================
  // 編集機能関連のダイアログ状態
  // =========================================================================

  /** 編集ダイアログ表示状態 */
  editorDialogOpen: boolean
  /** 新規作成ダイアログ表示状態 */
  createDialogOpen: boolean
  /** 削除確認ダイアログ表示状態 */
  deleteDialogOpen: boolean
  /** 削除対象のパス */
  deleteTargetPath: string | null
}

// =============================================================================
// UIService クラス
// =============================================================================

export class UIService {
  // ---------------------------------------------------------------------------
  // Private State
  // ---------------------------------------------------------------------------

  private _state: UIServiceState

  // ---------------------------------------------------------------------------
  // Public State (readonly)
  // ---------------------------------------------------------------------------

  readonly state: DeepReadonly<UIServiceState>

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    // LocalStorage から設定を復元
    const uiSettings = uiStorage.load(DEFAULT_UI_SETTINGS)
    const treeSettings = treeStorage.load(DEFAULT_TREE_SETTINGS)

    this._state = reactive<UIServiceState>({
      viewMode: uiSettings.viewMode,
      sidebarOpen: uiSettings.sidebarOpen,
      theme: uiSettings.theme,
      codeTheme: uiSettings.codeTheme ?? DEFAULT_UI_SETTINGS.codeTheme,
      contentWidthMode: uiSettings.contentWidthMode ?? DEFAULT_UI_SETTINGS.contentWidthMode,
      showToc: uiSettings.showToc ?? DEFAULT_UI_SETTINGS.showToc,
      tocStickyRight: uiSettings.tocStickyRight ?? DEFAULT_UI_SETTINGS.tocStickyRight,
      treeSettings,
      settingsDialogOpen: false,
      // 編集機能関連
      editorDialogOpen: false,
      createDialogOpen: false,
      deleteDialogOpen: false,
      deleteTargetPath: null,
    })

    this.state = readonly(this._state)
  }

  // ---------------------------------------------------------------------------
  // Actions - View Mode
  // ---------------------------------------------------------------------------

  /**
   * 表示モードを設定
   */
  setViewMode(mode: ViewMode): void {
    this._state.viewMode = mode
    this.saveUISettings()
  }

  // ---------------------------------------------------------------------------
  // Actions - Sidebar
  // ---------------------------------------------------------------------------

  /**
   * サイドバーを開閉
   */
  toggleSidebar(): void {
    this._state.sidebarOpen = !this._state.sidebarOpen
    this.saveUISettings()
  }

  /**
   * サイドバーを開く
   */
  openSidebar(): void {
    this._state.sidebarOpen = true
    this.saveUISettings()
  }

  /**
   * サイドバーを閉じる
   */
  closeSidebar(): void {
    this._state.sidebarOpen = false
    this.saveUISettings()
  }

  // ---------------------------------------------------------------------------
  // Actions - Theme
  // ---------------------------------------------------------------------------

  /**
   * テーマを設定
   */
  setTheme(theme: Theme): void {
    this._state.theme = theme
    this.saveUISettings()
  }

  /**
   * コードテーマを設定
   */
  setCodeTheme(codeTheme: CodeTheme): void {
    this._state.codeTheme = codeTheme
    this.saveUISettings()
  }

  /**
   * メインコンテンツ幅モードを設定（通常 / 幅広）
   */
  setContentWidthMode(mode: ContentWidthMode): void {
    this._state.contentWidthMode = mode
    this.saveUISettings()
  }

  /**
   * 目次表示のオン/オフを設定
   */
  setShowToc(show: boolean): void {
    this._state.showToc = show
    this.saveUISettings()
  }

  /**
   * 目次を右カラム Sticky 表示にするか設定
   */
  setTocStickyRight(sticky: boolean): void {
    this._state.tocStickyRight = sticky
    this.saveUISettings()
  }

  // ---------------------------------------------------------------------------
  // Actions - Tree Settings
  // ---------------------------------------------------------------------------

  /**
   * ツリー設定を更新
   */
  updateTreeSettings(settings: Partial<TreeSettings>): void {
    Object.assign(this._state.treeSettings, settings)
    this.saveTreeSettings()
  }

  /**
   * sticky ディレクトリ表示を切り替え
   */
  toggleStickyDirs(): void {
    this._state.treeSettings.stickyDirs = !this._state.treeSettings.stickyDirs
    this.saveTreeSettings()
  }

  /**
   * タイトル折り返しを切り替え
   */
  toggleWrapTitles(): void {
    this._state.treeSettings.wrapTitles = !this._state.treeSettings.wrapTitles
    this.saveTreeSettings()
  }

  /**
   * ファイル名表示を切り替え
   */
  toggleShowFileName(): void {
    this._state.treeSettings.showFileName = !this._state.treeSettings.showFileName
    this.saveTreeSettings()
  }

  /**
   * summary 表示を切り替え
   */
  toggleShowSummary(): void {
    this._state.treeSettings.showSummary = !this._state.treeSettings.showSummary
    this.saveTreeSettings()
  }

  /**
   * ソートモードを設定
   */
  setSortMode(mode: TreeSortMode): void {
    this._state.treeSettings.sortMode = mode
    this.saveTreeSettings()
  }

  // ---------------------------------------------------------------------------
  // Actions - Dialog
  // ---------------------------------------------------------------------------

  /**
   * 設定ダイアログを開く
   */
  openSettingsDialog(): void {
    this._state.settingsDialogOpen = true
  }

  /**
   * 設定ダイアログを閉じる
   */
  closeSettingsDialog(): void {
    this._state.settingsDialogOpen = false
  }

  // ---------------------------------------------------------------------------
  // Actions - Editor Dialog (編集ダイアログ)
  // ---------------------------------------------------------------------------

  /**
   * 編集ダイアログを開く
   */
  openEditorDialog(): void {
    this._state.editorDialogOpen = true
  }

  /**
   * 編集ダイアログを閉じる
   */
  closeEditorDialog(): void {
    this._state.editorDialogOpen = false
  }

  // ---------------------------------------------------------------------------
  // Actions - Create Dialog (新規作成ダイアログ)
  // ---------------------------------------------------------------------------

  /**
   * 新規作成ダイアログを開く
   */
  openCreateDialog(): void {
    this._state.createDialogOpen = true
  }

  /**
   * 新規作成ダイアログを閉じる
   */
  closeCreateDialog(): void {
    this._state.createDialogOpen = false
  }

  // ---------------------------------------------------------------------------
  // Actions - Delete Dialog (削除確認ダイアログ)
  // ---------------------------------------------------------------------------

  /**
   * 削除確認ダイアログを開く
   *
   * @param path 削除対象のパス
   */
  openDeleteDialog(path: string): void {
    this._state.deleteTargetPath = path
    this._state.deleteDialogOpen = true
  }

  /**
   * 削除確認ダイアログを閉じる
   */
  closeDeleteDialog(): void {
    this._state.deleteDialogOpen = false
    this._state.deleteTargetPath = null
  }

  // ---------------------------------------------------------------------------
  // Private - Storage
  // ---------------------------------------------------------------------------

  /**
   * UI設定を保存
   */
  private saveUISettings(): void {
    uiStorage.save({
      viewMode: this._state.viewMode,
      sidebarOpen: this._state.sidebarOpen,
      theme: this._state.theme,
      codeTheme: this._state.codeTheme,
      contentWidthMode: this._state.contentWidthMode,
      showToc: this._state.showToc,
      tocStickyRight: this._state.tocStickyRight,
    })
  }

  /**
   * ツリー設定を保存
   */
  private saveTreeSettings(): void {
    treeStorage.save(this._state.treeSettings)
  }
}

// =============================================================================
// Injection Key
// =============================================================================

export const uiServiceKey: InjectionKey<UIService> = Symbol('UIService')
