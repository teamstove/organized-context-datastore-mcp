/**
 * ContextService - Context データ管理サービス
 *
 * 責務:
 * - Context Roots の取得
 * - Context ツリーの取得・キャッシュ
 * - Context 詳細の取得
 * - 検索機能
 *
 * ツリー構築ロジックは TreeBuilder に委譲
 */
import { reactive, readonly, type InjectionKey, type DeepReadonly } from 'vue'
import type {
  ContextRootConfig,
  ContextNode,
  ContextNodeSummary,
  TreeSortMode,
  CreateContextParams,
  UpdateContextParams,
  ContextMutation,
} from '@/types'
import type { ApiClient } from './ApiClient'
import type { ProjectService } from './ProjectService'
import type { UIService } from './UIService'
import {
  buildNestedTree,
  collectAllExpandablePaths,
  getAncestorPaths,
} from '@/utils/TreeBuilder'

// =============================================================================
// State 型定義
// =============================================================================

export interface ContextServiceState {
  /** Context Root 一覧 */
  roots: ContextRootConfig[]
  /** 現在選択中の Context Root */
  currentRoot: ContextRootConfig | null
  /** ツリーデータ (JSON 形式の場合) */
  tree: ContextNodeSummary[]
  /** ツリーデータ (tree-text 形式の場合) */
  treeText: string | null
  /** 選択中の Context */
  selectedContext: ContextNode | null
  /** 選択中の Context パス（URLと同期用、コンテンツ読み込み前でも保持） */
  selectedPath: string | null
  /** 展開中のノードパス */
  expandedPaths: Set<string>
  /** ツリー読み込み中フラグ（ツリー表示にのみ影響） */
  isTreeLoading: boolean
  /** コンテンツ読み込み中フラグ（詳細表示にのみ影響） */
  isContentLoading: boolean
  /** エラーメッセージ */
  error: string | null
  /** 検索クエリ（空文字列の場合はフィルタなし） */
  searchQuery: string

  // =========================================================================
  // 編集関連の状態
  // =========================================================================

  /** 編集中フラグ */
  isEditing: boolean
  /** 編集対象の Context（編集開始時のスナップショット） */
  editingContext: ContextNode | null
  /** 保存中フラグ */
  isSaving: boolean
}

// =============================================================================
// ContextService クラス
// =============================================================================

export class ContextService {
  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _state = reactive<ContextServiceState>({
    roots: [],
    currentRoot: null,
    tree: [],
    treeText: null,
    selectedContext: null,
    selectedPath: null,
    expandedPaths: new Set<string>(),
    isTreeLoading: false,
    isContentLoading: false,
    error: null,
    searchQuery: '',
    // 編集関連
    isEditing: false,
    editingContext: null,
    isSaving: false,
  })

  private apiClient: ApiClient
  private projectService: ProjectService
  private uiService: UIService

  /** ツリーキャッシュの TTL（ミリ秒）。データ鮮度優先のため 30 秒 */
  private static readonly TREE_CACHE_TTL_MS = 30 * 1000

  // ツリーキャッシュ (key -> { data, expiresAt })
  private treeCache = new Map<string, { data: ContextNodeSummary[]; expiresAt: number }>()

  // ソートモード変更時の再ソート用にフラットなノードをキャッシュ (key -> { data, expiresAt })
  private flatNodesCache = new Map<string, { data: ContextNodeSummary[]; expiresAt: number }>()

  // ---------------------------------------------------------------------------
  // Public State (readonly)
  // ---------------------------------------------------------------------------

  readonly state: DeepReadonly<ContextServiceState> = readonly(this._state)

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(apiClient: ApiClient, projectService: ProjectService, uiService: UIService) {
    this.apiClient = apiClient
    this.projectService = projectService
    this.uiService = uiService
  }

  // ---------------------------------------------------------------------------
  // Actions - Roots
  // ---------------------------------------------------------------------------

  /**
   * Context Root 一覧を読み込み
   */
  async loadRoots(): Promise<void> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) {
      this._state.error = 'プロジェクトが選択されていません'
      return
    }

    try {
      this._state.isTreeLoading = true
      this._state.error = null

      const roots = await this.apiClient.listRoots(cwd)
      this._state.roots = roots

      // 最初の Root を自動選択（URL で指定されている場合はスキップ）
      if (roots.length > 0 && !this._state.currentRoot) {
        await this.selectRoot(roots[0].id)
      }
    } catch (error) {
      console.error('[ContextService] Failed to load roots:', error)
      this._state.error = `Context Root の読み込みに失敗しました: ${(error as Error).message}`
    } finally {
      this._state.isTreeLoading = false
    }
  }

  /**
   * Context Root を選択
   */
  async selectRoot(id: string): Promise<void> {
    const root = this._state.roots.find((r) => r.id === id)
    if (!root) {
      this._state.error = 'Context Root が見つかりません'
      return
    }

    this._state.currentRoot = root
    this._state.selectedContext = null

    // ツリーを読み込み (id でルーティング)
    await this.loadTree(root.id)
  }

  /**
   * 指定した Root を直接選択（URL 復元用）
   */
  async selectRootById(id: string): Promise<boolean> {
    const root = this._state.roots.find((r) => r.id === id)
    if (root) {
      this._state.currentRoot = root
      await this.loadTree(root.id)
      return true
    }
    return false
  }

  // ---------------------------------------------------------------------------
  // Actions - Tree
  // ---------------------------------------------------------------------------

  /**
   * 現在のソートモードを取得
   */
  private getSortMode(): TreeSortMode {
    return this.uiService.state.treeSettings.sortMode
  }

  /**
   * ツリーを読み込み
   * 
   * @param rootId Context Root の ID（list_context_roots で取得した id を使用）
   * @param depth 深さ制限（省略時は全階層）
   */
  async loadTree(rootId: string, depth?: number): Promise<void> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) return

    const sortMode = this.getSortMode()

    // キャッシュをチェック（ソートモード込み、TTL 30秒）
    const cacheKey = `${rootId}:${depth || 'all'}:${sortMode}`
    const cached = this.treeCache.get(cacheKey)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      this._state.tree = cached.data
      this.expandAll()
      return
    }

    try {
      this._state.isTreeLoading = true
      this._state.error = null

      const result = await this.apiClient.getTree(cwd, {
        rootIds: [rootId],
        depth,
        format: 'json',
      })

      if (result.format === 'json' && Array.isArray(result.tree)) {
        const expiresAt = Date.now() + ContextService.TREE_CACHE_TTL_MS
        // フラットノードをキャッシュ（ソートモード変更時の再構築用）
        const flatCacheKey = `${rootId}:${depth || 'all'}:flat`
        this.flatNodesCache.set(flatCacheKey, { data: result.tree, expiresAt })

        // TreeBuilder を使用してフラットなリストを階層構造に変換
        const nestedTree = buildNestedTree(result.tree, rootId, sortMode)
        this._state.tree = nestedTree
        this._state.treeText = null
        this.treeCache.set(cacheKey, { data: nestedTree, expiresAt })
        // デフォルトですべて展開
        this.expandAll()
      } else if (result.format === 'tree-text' && typeof result.tree === 'string') {
        this._state.tree = []
        this._state.treeText = result.tree
      }
    } catch (error) {
      console.error('[ContextService] Failed to load tree:', error)
      this._state.error = `ツリーの読み込みに失敗しました: ${(error as Error).message}`
    } finally {
      this._state.isTreeLoading = false
    }
  }

  /**
   * ソートモード変更時にツリーを再ソート
   * フラットノードのキャッシュを使用してツリーを再構築
   */
  resortTree(): void {
    const currentRoot = this._state.currentRoot
    if (!currentRoot) return

    const sortMode = this.getSortMode()
    const flatCacheKey = `${currentRoot.id}:all:flat`
    const flatEntry = this.flatNodesCache.get(flatCacheKey)
    const now = Date.now()

    if (!flatEntry || flatEntry.expiresAt <= now) {
      // フラットノードがないか TTL 切れの場合は再読み込み
      this.loadTree(currentRoot.id)
      return
    }

    const flatNodes = flatEntry.data

    // ソート済みツリーキャッシュを確認（TTL チェック付き）
    const cacheKey = `${currentRoot.id}:all:${sortMode}`
    const cached = this.treeCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      this._state.tree = cached.data
      return
    }

    // フラットノードから再構築
    const expiresAt = now + ContextService.TREE_CACHE_TTL_MS
    const nestedTree = buildNestedTree(flatNodes, currentRoot.id, sortMode)
    this._state.tree = nestedTree
    this.treeCache.set(cacheKey, { data: nestedTree, expiresAt })
  }

  // ---------------------------------------------------------------------------
  // Actions - Node Expansion
  // ---------------------------------------------------------------------------

  /**
   * ノードを展開
   */
  expandNode(path: string): void {
    this._state.expandedPaths.add(path)
  }

  /**
   * ノードを折りたたむ
   */
  collapseNode(path: string): void {
    this._state.expandedPaths.delete(path)
  }

  /**
   * ノードの展開/折りたたみを切り替え
   */
  toggleNode(path: string): void {
    if (this._state.expandedPaths.has(path)) {
      this.collapseNode(path)
    } else {
      this.expandNode(path)
    }
  }

  /**
   * すべてのノードを展開
   */
  expandAll(): void {
    const paths = collectAllExpandablePaths(this._state.tree)
    for (const path of paths) {
      this._state.expandedPaths.add(path)
    }
  }

  /**
   * すべてのノードを折りたたむ
   */
  collapseAll(): void {
    this._state.expandedPaths.clear()
  }

  /**
   * ノードが展開されているか
   */
  isExpanded(path: string): boolean {
    return this._state.expandedPaths.has(path)
  }

  /**
   * ノードへのパスを展開（親ディレクトリをすべて展開）
   */
  expandToPath(path: string): void {
    const ancestors = getAncestorPaths(path)
    for (const ancestorPath of ancestors) {
      this._state.expandedPaths.add(ancestorPath)
    }
  }

  // ---------------------------------------------------------------------------
  // Actions - Context
  // ---------------------------------------------------------------------------

  /**
   * Context を選択して詳細を読み込み
   * 注意: isTreeLoading ではなく isContentLoading を使用し、ツリーの再レンダリングを防ぐ
   */
  async selectContext(path: string): Promise<void> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) return

    // 選択パスを即座に更新（URL同期用）
    this._state.selectedPath = path

    try {
      // コンテンツ読み込み中フラグを設定（ツリーには影響しない）
      this._state.isContentLoading = true
      this._state.error = null

      const context = await this.apiClient.getContext(cwd, path)
      if (context) {
        this._state.selectedContext = context
      } else {
        this._state.error = 'コンテキストが見つかりません'
      }
    } catch (error) {
      console.error('[ContextService] Failed to load context:', error)
      this._state.error = `コンテキストの読み込みに失敗しました: ${(error as Error).message}`
    } finally {
      this._state.isContentLoading = false
    }
  }

  /**
   * 選択をクリア
   */
  clearSelection(): void {
    this._state.selectedContext = null
    this._state.selectedPath = null
  }

  // ---------------------------------------------------------------------------
  // Actions - Search
  // ---------------------------------------------------------------------------

  /**
   * 検索 (API 経由)
   */
  async search(query: string, scope?: string[]): Promise<ContextNode[]> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) return []

    try {
      this._state.isContentLoading = true
      this._state.error = null

      const result = await this.apiClient.search(cwd, query, scope)
      return result.contexts
    } catch (error) {
      console.error('[ContextService] Failed to search:', error)
      this._state.error = `検索に失敗しました: ${(error as Error).message}`
      return []
    } finally {
      this._state.isContentLoading = false
    }
  }

  /**
   * 検索クエリを設定（クライアントサイドフィルタリング用）
   */
  setSearchQuery(query: string): void {
    this._state.searchQuery = query.trim().toLowerCase()
  }

  /**
   * 検索クエリをクリア
   */
  clearSearchQuery(): void {
    this._state.searchQuery = ''
  }

  /**
   * フィルタリングされたツリーを取得
   * 検索クエリが設定されている場合、タイトル・summary・パスにマッチするノードのみを返す
   */
  getFilteredTree(): ContextNodeSummary[] {
    const query = this._state.searchQuery
    if (!query) {
      return this._state.tree
    }

    // ツリーを再帰的にフィルタリング
    return this.filterTreeNodes(this._state.tree, query)
  }

  /**
   * ツリーノードを再帰的にフィルタリング
   * マッチするノードと、マッチするノードを子に持つ親ノードを含める
   */
  private filterTreeNodes(nodes: ContextNodeSummary[], query: string): ContextNodeSummary[] {
    const result: ContextNodeSummary[] = []

    for (const node of nodes) {
      // このノードがマッチするかチェック
      const nodeMatches = this.nodeMatchesQuery(node, query)

      // 子ノードをフィルタリング
      const filteredChildren = node.children
        ? this.filterTreeNodes(node.children, query)
        : []

      // このノードがマッチするか、マッチする子を持つ場合は含める
      if (nodeMatches || filteredChildren.length > 0) {
        result.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
          // マッチする子がある場合は展開状態にする
          hasChildren: filteredChildren.length > 0 || node.hasChildren,
        })

        // マッチする子がある場合は展開する
        if (filteredChildren.length > 0 && node.children && node.children.length > 0) {
          this._state.expandedPaths.add(node.path)
        }
      }
    }

    return result
  }

  /**
   * ノードが検索クエリにマッチするかチェック
   */
  private nodeMatchesQuery(node: ContextNodeSummary, query: string): boolean {
    // タイトルでマッチ
    if (node.title.toLowerCase().includes(query)) {
      return true
    }
    // summary でマッチ
    if (node.summary && node.summary.toLowerCase().includes(query)) {
      return true
    }
    // パスでマッチ
    if (node.path.toLowerCase().includes(query)) {
      return true
    }
    return false
  }

  // ---------------------------------------------------------------------------
  // Actions - Cache & Error
  // ---------------------------------------------------------------------------

  /**
   * キャッシュをクリア
   * treeCache と flatNodesCache の両方をクリア（mutate 後の即時反映のため）
   */
  clearCache(): void {
    this.treeCache.clear()
    this.flatNodesCache.clear()
  }

  /**
   * エラーをクリア
   */
  clearError(): void {
    this._state.error = null
  }

  // ---------------------------------------------------------------------------
  // Actions - Editing (編集状態管理)
  // ---------------------------------------------------------------------------

  /**
   * 編集モードを開始
   * 選択中の Context を編集対象として設定
   */
  startEditing(): void {
    if (!this._state.selectedContext) {
      console.warn('[ContextService] No context selected for editing')
      return
    }

    // 選択中の Context のスナップショットを保持
    this._state.editingContext = { ...this._state.selectedContext }
    this._state.isEditing = true
    this._state.error = null
  }

  /**
   * 編集モードをキャンセル
   */
  cancelEditing(): void {
    this._state.editingContext = null
    this._state.isEditing = false
  }

  // ---------------------------------------------------------------------------
  // Actions - CRUD Operations (書き込み操作)
  // ---------------------------------------------------------------------------

  /**
   * 新規 Context を作成
   *
   * @param params 作成パラメータ
   * @returns 成功した場合 true
   */
  async createContext(params: CreateContextParams): Promise<boolean> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) {
      this._state.error = 'プロジェクトが選択されていません'
      return false
    }

    try {
      this._state.isSaving = true
      this._state.error = null

      // ContextMutation を構築
      const operation: ContextMutation = {
        type: 'create',
        path: params.path,
        title: params.title,
        summary: params.summary,
        content: params.content,
        attrs: params.attrs,
      }

      const result = await this.apiClient.mutate(cwd, [operation])

      if (result.errors > 0) {
        const errorResult = result.results.find((r) => !r.success)
        this._state.error = errorResult?.error || '作成に失敗しました'
        return false
      }

      // キャッシュをクリアしてツリーを再読み込み
      this.clearCache()
      if (this._state.currentRoot) {
        await this.loadTree(this._state.currentRoot.id)
      }

      // 作成した Context を選択
      await this.selectContext(params.path)

      return true
    } catch (error) {
      console.error('[ContextService] Failed to create context:', error)
      this._state.error = `作成に失敗しました: ${(error as Error).message}`
      return false
    } finally {
      this._state.isSaving = false
    }
  }

  /**
   * Context を更新
   *
   * @param path 対象パス
   * @param params 更新パラメータ
   * @returns 成功した場合 true
   */
  async updateContext(path: string, params: UpdateContextParams): Promise<boolean> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) {
      this._state.error = 'プロジェクトが選択されていません'
      return false
    }

    try {
      this._state.isSaving = true
      this._state.error = null

      // ContextMutation を構築
      const operation: ContextMutation = {
        type: 'update',
        path,
        title: params.title,
        summary: params.summary,
        attrs: params.attrs,
      }

      // コンテンツが指定されている場合は whole_replace で更新
      if (params.content !== undefined) {
        operation.contentUpdates = [
          { type: 'whole_replace', content: params.content },
        ]
      }

      const result = await this.apiClient.mutate(cwd, [operation])

      if (result.errors > 0) {
        const errorResult = result.results.find((r) => !r.success)
        this._state.error = errorResult?.error || '更新に失敗しました'
        return false
      }

      // 編集モードを終了
      this._state.isEditing = false
      this._state.editingContext = null

      // キャッシュをクリアしてツリーを再読み込み
      this.clearCache()
      if (this._state.currentRoot) {
        await this.loadTree(this._state.currentRoot.id)
      }

      // 更新した Context を再読み込み
      await this.selectContext(path)

      return true
    } catch (error) {
      console.error('[ContextService] Failed to update context:', error)
      this._state.error = `更新に失敗しました: ${(error as Error).message}`
      return false
    } finally {
      this._state.isSaving = false
    }
  }

  /**
   * Context を削除
   *
   * @param path 対象パス
   * @returns 成功した場合 true
   */
  async deleteContext(path: string): Promise<boolean> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) {
      this._state.error = 'プロジェクトが選択されていません'
      return false
    }

    try {
      this._state.isSaving = true
      this._state.error = null

      const operation: ContextMutation = {
        type: 'delete',
        path,
      }

      const result = await this.apiClient.mutate(cwd, [operation])

      if (result.errors > 0) {
        const errorResult = result.results.find((r) => !r.success)
        this._state.error = errorResult?.error || '削除に失敗しました'
        return false
      }

      // 選択をクリア
      this.clearSelection()

      // キャッシュをクリアしてツリーを再読み込み
      this.clearCache()
      if (this._state.currentRoot) {
        await this.loadTree(this._state.currentRoot.id)
      }

      return true
    } catch (error) {
      console.error('[ContextService] Failed to delete context:', error)
      this._state.error = `削除に失敗しました: ${(error as Error).message}`
      return false
    } finally {
      this._state.isSaving = false
    }
  }

  /**
   * Context を移動（パス変更）
   *
   * @param fromPath 移動元パス
   * @param toPath 移動先パス
   * @returns 成功した場合 true
   */
  async moveContext(fromPath: string, toPath: string): Promise<boolean> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) {
      this._state.error = 'プロジェクトが選択されていません'
      return false
    }

    if (fromPath === toPath) {
      // パスが同じ場合は何もしない
      return true
    }

    try {
      this._state.isSaving = true
      this._state.error = null

      const operation: ContextMutation = {
        type: 'move',
        path: fromPath,
        to: toPath,
      }

      const result = await this.apiClient.mutate(cwd, [operation])

      if (result.errors > 0) {
        const errorResult = result.results.find((r) => !r.success)
        this._state.error = errorResult?.error || '移動に失敗しました'
        return false
      }

      // キャッシュをクリアしてツリーを再読み込み
      this.clearCache()
      if (this._state.currentRoot) {
        await this.loadTree(this._state.currentRoot.id)
      }

      // 移動先の Context を選択
      await this.selectContext(toPath)

      return true
    } catch (error) {
      console.error('[ContextService] Failed to move context:', error)
      this._state.error = `移動に失敗しました: ${(error as Error).message}`
      return false
    } finally {
      this._state.isSaving = false
    }
  }

  /**
   * Context を移動してから更新（パス変更 + 内容更新）
   *
   * @param fromPath 移動元パス
   * @param toPath 移動先パス
   * @param params 更新パラメータ
   * @returns 成功した場合 true
   */
  async moveAndUpdateContext(
    fromPath: string,
    toPath: string,
    params: UpdateContextParams
  ): Promise<boolean> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) {
      this._state.error = 'プロジェクトが選択されていません'
      return false
    }

    try {
      this._state.isSaving = true
      this._state.error = null

      // 操作を配列で構築（move → update の順序）
      const operations: ContextMutation[] = []

      // パスが変更されている場合は move 操作を追加
      const pathChanged = fromPath !== toPath
      if (pathChanged) {
        operations.push({
          type: 'move',
          path: fromPath,
          to: toPath,
        })
      }

      // update 操作を構築（移動後のパスに対して）
      const updateOperation: ContextMutation = {
        type: 'update',
        path: toPath, // 移動後のパス
        title: params.title,
        summary: params.summary,
        attrs: params.attrs,
      }

      // コンテンツが指定されている場合は whole_replace で更新
      if (params.content !== undefined) {
        updateOperation.contentUpdates = [
          { type: 'whole_replace', content: params.content },
        ]
      }

      operations.push(updateOperation)

      // 一括で実行
      const result = await this.apiClient.mutate(cwd, operations)

      if (result.errors > 0) {
        const errorResult = result.results.find((r) => !r.success)
        this._state.error = errorResult?.error || '更新に失敗しました'
        return false
      }

      // 編集モードを終了
      this._state.isEditing = false
      this._state.editingContext = null

      // キャッシュをクリアしてツリーを再読み込み
      this.clearCache()
      if (this._state.currentRoot) {
        await this.loadTree(this._state.currentRoot.id)
      }

      // 更新した Context を再読み込み（移動後のパス）
      await this.selectContext(toPath)

      return true
    } catch (error) {
      console.error('[ContextService] Failed to move and update context:', error)
      this._state.error = `更新に失敗しました: ${(error as Error).message}`
      return false
    } finally {
      this._state.isSaving = false
    }
  }

  /**
   * 変更をコミット
   *
   * @param message コミットメッセージ
   * @param paths 対象パス（省略時は全変更）
   * @returns コミットハッシュ、失敗時は null
   */
  async commitChanges(message: string, paths?: string[]): Promise<string | null> {
    const cwd = this.projectService.getCurrentCwd()
    if (!cwd) {
      this._state.error = 'プロジェクトが選択されていません'
      return null
    }

    try {
      this._state.isSaving = true
      this._state.error = null

      const commitHash = await this.apiClient.commit(cwd, message, paths)
      return commitHash
    } catch (error) {
      console.error('[ContextService] Failed to commit:', error)
      this._state.error = `コミットに失敗しました: ${(error as Error).message}`
      return null
    } finally {
      this._state.isSaving = false
    }
  }
}

// =============================================================================
// Injection Key
// =============================================================================

export const contextServiceKey: InjectionKey<ContextService> = Symbol('ContextService')
