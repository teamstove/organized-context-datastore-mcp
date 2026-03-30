/**
 * CompositeStore
 * 
 * Context Root ごとに異なるストレージを透過的にルーティングする複合ストア
 * 
 * 使用例:
 * - docs/ → FileGitStore (Git リポジトリ)
 * - dynamic-data/ → PostgresStore (データベース)
 * 
 * 上位レイヤー (ReadTools, WriteTools) からは単一の IKnowledgeStore として見える
 */

import type { IKnowledgeStore } from './IKnowledgeStore.js'
import { KnowledgeStoreError } from './IKnowledgeStore.js'
import type { FileMetadata, VersionEntry, ContextRootConfig } from '../types/index.js'
import { FileGitStore, type FileGitStoreConfig, type GitMode } from './FileGitStore.js'
import { PostgresStore, type PostgresStoreConfig } from './PostgresStore.js'

/**
 * CompositeStore 設定
 */
export interface CompositeStoreConfig {
  /** Context Root 設定 (個別ストレージ設定を含む) */
  contextRoots: ContextRootConfig[]
  
  /** デフォルトストレージタイプ (Context Root にストレージ設定がない場合) */
  defaultStorageType: 'file-git' | 'postgres'
  
  /** デフォルト file-git パス */
  defaultStoragePath?: string
  
  /** デフォルト postgres 接続文字列 */
  defaultConnectionString?: string
  
  /**
   * デフォルト Git モード（Context Root で指定がない場合に使用）
   * デフォルト: 'manual'
   */
  defaultGitMode?: GitMode
  
  /**
   * @deprecated git: 'auto-commit' を使用してください
   */
  autoCommit?: boolean
}

/**
 * ルーティングエントリ
 */
interface RouteEntry {
  /** Context Root パス (プレフィックス) */
  prefix: string
  
  /** 対応するストア */
  store: IKnowledgeStore
  
  /** Context Root 設定 */
  config: ContextRootConfig
}

/**
 * 複合ストア
 * 
 * パスに基づいて適切なストアにルーティング
 */
export class CompositeStore implements IKnowledgeStore {
  private readonly routes: RouteEntry[] = []
  private readonly defaultStore: IKnowledgeStore | null = null
  private readonly config: CompositeStoreConfig
  private initialized = false
  
  constructor(config: CompositeStoreConfig) {
    this.config = config
    
    // デフォルトストアを作成 (必要な場合)
    if (config.defaultStorageType === 'file-git' && config.defaultStoragePath) {
      this.defaultStore = new FileGitStore({
        rootPath: config.defaultStoragePath,
        useGit: true,
        autoCommit: config.autoCommit ?? false
      })
    } else if (config.defaultStorageType === 'postgres' && config.defaultConnectionString) {
      this.defaultStore = new PostgresStore({
        connectionString: config.defaultConnectionString,
        projectId: 'default',
        autoMigrate: true
      })
    }
    
    // 各 Context Root のストアを作成
    // prefix には id を使用し、ユーザーは id でパスを指定できる
    for (const contextRoot of config.contextRoots) {
      const store = this.createStoreForContextRoot(contextRoot)
      if (store) {
        this.routes.push({
          prefix: contextRoot.id,  // ← id でルーティング
          store,
          config: contextRoot
        })
      }
    }
    
    // プレフィックスの長い順にソート (より具体的なマッチを優先)
    this.routes.sort((a, b) => b.prefix.length - a.prefix.length)
  }
  
  /**
   * Git モードを解決
   * 
   * readOnly なら 'none'、そうでなければ contextRoot の設定 → デフォルト設定 → 'manual'
   */
  private resolveGitMode(contextRoot: ContextRootConfig): GitMode {
    // readOnly な Context Root は Git 操作しない
    if (contextRoot.readOnly) {
      return 'none'
    }
    
    // 優先順位: contextRoot.git → config.defaultGitMode → config.autoCommit (後方互換) → 'manual'
    if (contextRoot.git) {
      return contextRoot.git
    }
    
    if (this.config.defaultGitMode) {
      return this.config.defaultGitMode
    }
    
    // 後方互換: autoCommit が設定されていれば変換
    if (this.config.autoCommit === true) {
      return 'auto-commit'
    }
    
    // デフォルトは 'manual'
    return 'manual'
  }
  
  /**
   * Context Root 用のストアを作成
   */
  private createStoreForContextRoot(contextRoot: ContextRootConfig): IKnowledgeStore | null {
    const storageType = contextRoot.storageType || this.config.defaultStorageType || 'file-git'
    
    if (storageType === 'file-git') {
      // storagePath がない場合は contextRoot.path を使用
      // （ほとんどのケースでは path がそのままストレージ場所になる）
      const storagePath = contextRoot.storagePath || contextRoot.path || this.config.defaultStoragePath
      if (!storagePath) {
        console.warn(`[CompositeStore] Context Root "${contextRoot.id}" has no storagePath or path, skipping`)
        return null
      }
      
      const gitMode = this.resolveGitMode(contextRoot)
      
      return new FileGitStore({
        rootPath: storagePath,
        git: gitMode,
        ignorePatterns: contextRoot.ignorePatterns,
        includePatterns: contextRoot.includePatterns
      })
    }
    
    if (storageType === 'postgres') {
      const connectionString = contextRoot.connectionString || this.config.defaultConnectionString
      if (!connectionString) {
        console.warn(`[CompositeStore] Context Root "${contextRoot.id}" has no connectionString, skipping`)
        return null
      }
      
      return new PostgresStore({
        connectionString,
        projectId: contextRoot.id,
        autoMigrate: true
      })
    }
    
    return null
  }
  
  // ==========================================================================
  // Routing
  // ==========================================================================
  
  /**
   * パスから適切なストアを選択
   * 
   * @param path ファイルパス
   * @returns 対応するストアと、ストア内での相対パス
   */
  private route(path: string): { store: IKnowledgeStore, relativePath: string, contextRoot?: ContextRootConfig } {
    // 各ルートをチェック (長い prefix から順に)
    for (const route of this.routes) {
      if (path === route.prefix || path.startsWith(route.prefix + '/')) {
        // id プレフィックスを除去して相対パスに変換
        let relativePath = path
        if (path.startsWith(route.prefix + '/')) {
          relativePath = path.slice(route.prefix.length + 1)
        } else if (path === route.prefix) {
          relativePath = ''
        }
        
        return {
          store: route.store,
          relativePath,
          contextRoot: route.config
        }
      }
    }
    
    // デフォルトストアを使用
    if (this.defaultStore) {
      return {
        store: this.defaultStore,
        relativePath: path
      }
    }
    
    // 利用可能な Context Root id をエラーメッセージに含める
    const availableIds = this.routes.map(r => r.prefix).join(', ')
    throw new KnowledgeStoreError(
      `Invalid path: "${path}". Path must start with a Context Root id. Available ids: ${availableIds}`,
      'INVALID_PATH',
      path
    )
  }
  
  /**
   * 複数パターンに対応するストアを取得
   * 
   * @param patterns glob パターン配列
   * @returns ストアとそのパターンのマップ
   */
  private routePatterns(patterns: string[]): Map<IKnowledgeStore, string[]> {
    const storePatterns = new Map<IKnowledgeStore, string[]>()
    
    for (const pattern of patterns) {
      // パターンのプレフィックスを抽出 (最初の * より前の部分)
      const prefix = pattern.split('*')[0].replace(/\/$/, '')
      
      // マッチする Context Root を探す
      let matched = false
      for (const route of this.routes) {
        if (prefix === route.prefix || prefix.startsWith(route.prefix + '/') || route.prefix.startsWith(prefix)) {
          // このストアにパターンを追加
          const existing = storePatterns.get(route.store) || []
          existing.push(pattern)
          storePatterns.set(route.store, existing)
          matched = true
        }
      }
      
      // マッチしなかった場合はデフォルトストアへ
      if (!matched && this.defaultStore) {
        const existing = storePatterns.get(this.defaultStore) || []
        existing.push(pattern)
        storePatterns.set(this.defaultStore, existing)
      }
    }
    
    return storePatterns
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  async initialize(): Promise<void> {
    if (this.initialized) return
    
    // 全ストアを初期化
    const initPromises: Promise<void>[] = []
    
    if (this.defaultStore) {
      initPromises.push(this.defaultStore.initialize())
    }
    
    for (const route of this.routes) {
      initPromises.push(route.store.initialize())
    }
    
    await Promise.all(initPromises)
    this.initialized = true
    
    console.error(`[CompositeStore] 初期化完了: ${this.routes.length} ルート`)
  }
  
  async close(): Promise<void> {
    // 全ストアをクローズ
    const closePromises: Promise<void>[] = []
    
    if (this.defaultStore) {
      closePromises.push(this.defaultStore.close())
    }
    
    for (const route of this.routes) {
      closePromises.push(route.store.close())
    }
    
    await Promise.all(closePromises)
    this.initialized = false
    
    console.error(`[CompositeStore] クローズ完了`)
  }
  
  // ==========================================================================
  // Read Operations
  // ==========================================================================
  
  async exists(path: string): Promise<boolean> {
    const { store, relativePath } = this.route(path)
    return store.exists(relativePath)
  }
  
  async read(path: string): Promise<string> {
    const { store, relativePath } = this.route(path)
    return store.read(relativePath)
  }
  
  async list(pattern: string, exclude?: string[]): Promise<string[]> {
    return this.listMultiple([pattern], exclude)
  }
  
  /**
   * Context Root id 付きの exclude パターンを、各ストア内の相対 glob に変換する
   */
  private relativeExcludeForStore(
    routePrefix: string,
    exclude: string[] | undefined
  ): string[] | undefined {
    if (!exclude?.length) return undefined
    const rel: string[] = []
    for (const e of exclude) {
      if (e === routePrefix) {
        rel.push('**/*')
      } else if (e.startsWith(routePrefix + '/')) {
        rel.push(e.slice(routePrefix.length + 1))
      }
    }
    return rel.length ? rel : undefined
  }
  
  /**
   * 複数パターンでファイル一覧を取得 (クロスストア対応)
   */
  async listMultiple(patterns: string[], exclude?: string[]): Promise<string[]> {
    const storePatterns = this.routePatterns(patterns)
    const results: string[] = []
    
    // 各ストアに並列でクエリ
    const listPromises: Promise<{ prefix: string, files: string[] }[]>[] = []
    
    for (const [store, storePatternList] of storePatterns) {
      // このストアに対応するルートを探す
      const route = this.routes.find(r => r.store === store)
      
      if (route) {
        // パターンから id プレフィックスを除去して相対パスに変換
        const relativePatterns = storePatternList.map(pattern => {
          if (pattern.startsWith(route.prefix + '/')) {
            return pattern.slice(route.prefix.length + 1)
          } else if (pattern === route.prefix) {
            return '**/*.md'
          }
          return pattern
        })
        
        const relativeExclude = this.relativeExcludeForStore(route.prefix, exclude)
        
        // クエリを実行し、結果に id プレフィックスを追加
        listPromises.push(
          store.listMultiple(relativePatterns, relativeExclude).then(files => 
            [{ prefix: route.prefix, files }]
          )
        )
      } else if (this.defaultStore && store === this.defaultStore) {
        // デフォルトストアの場合はパターンをそのまま使用
        listPromises.push(
          store.listMultiple(storePatternList, exclude).then(files => 
            [{ prefix: '', files }]
          )
        )
      }
    }
    
    const allResults = await Promise.all(listPromises)
    
    // 結果をマージ (重複除去、id プレフィックスを追加)
    const seen = new Set<string>()
    for (const resultGroup of allResults) {
      for (const { prefix, files } of resultGroup) {
        for (const file of files) {
          // id プレフィックスを追加
          const fullPath = prefix ? `${prefix}/${file}` : file
          if (!seen.has(fullPath)) {
            seen.add(fullPath)
            results.push(fullPath)
          }
        }
      }
    }
    
    return results
  }
  
  async getMetadata(path: string): Promise<FileMetadata> {
    const { store, relativePath } = this.route(path)
    return store.getMetadata(relativePath)
  }
  
  // ==========================================================================
  // Write Operations
  // ==========================================================================
  
  async write(path: string, content: string): Promise<void> {
    const { store, relativePath, contextRoot } = this.route(path)
    
    // 読み取り専用チェック
    if (contextRoot?.readOnly) {
      throw new KnowledgeStoreError(
        `Context Root "${contextRoot.id}" is read-only`,
        'PERMISSION_DENIED',
        path
      )
    }
    
    await store.write(relativePath, content)
  }
  
  async delete(path: string): Promise<void> {
    const { store, relativePath, contextRoot } = this.route(path)
    
    if (contextRoot?.readOnly) {
      throw new KnowledgeStoreError(
        `Context Root "${contextRoot.id}" is read-only`,
        'PERMISSION_DENIED',
        path
      )
    }
    
    await store.delete(relativePath)
  }
  
  /**
   * ファイル/ノードを移動
   * 
   * 同一ストア内: 直接 move
   * 異なるストア間: コピー + 削除
   */
  async move(fromPath: string, toPath: string): Promise<void> {
    const fromRoute = this.route(fromPath)
    const toRoute = this.route(toPath)
    
    // 読み取り専用チェック
    if (fromRoute.contextRoot?.readOnly) {
      throw new KnowledgeStoreError(
        `Source Context Root "${fromRoute.contextRoot.id}" is read-only`,
        'PERMISSION_DENIED',
        fromPath
      )
    }
    
    if (toRoute.contextRoot?.readOnly) {
      throw new KnowledgeStoreError(
        `Destination Context Root "${toRoute.contextRoot.id}" is read-only`,
        'PERMISSION_DENIED',
        toPath
      )
    }
    
    // 同一ストア内の移動
    if (fromRoute.store === toRoute.store) {
      await fromRoute.store.move(fromRoute.relativePath, toRoute.relativePath)
      return
    }
    
    // 異なるストア間の移動 (コピー + 削除)
    console.error(`[CompositeStore] クロスストア移動: ${fromPath} -> ${toPath}`)
    
    // コンテンツを読み取り
    const content = await fromRoute.store.read(fromRoute.relativePath)
    
    // 移動先に書き込み
    await toRoute.store.write(toRoute.relativePath, content)
    
    // 元ファイルを削除
    await fromRoute.store.delete(fromRoute.relativePath)
  }
  
  async mkdir(path: string): Promise<void> {
    const { store, relativePath } = this.route(path)
    await store.mkdir(relativePath)
  }
  
  // ==========================================================================
  // Version Control Operations
  // ==========================================================================
  
  /**
   * 変更をコミット
   * 
   * 各ストアに対して個別にコミット
   */
  async commit(message: string, paths?: string[]): Promise<string> {
    if (!paths || paths.length === 0) {
      // 全ストアに対してコミット
      const results: string[] = []
      
      if (this.defaultStore) {
        const hash = await this.defaultStore.commit(message)
        results.push(`default:${hash}`)
      }
      
      for (const route of this.routes) {
        const hash = await route.store.commit(message)
        results.push(`${route.prefix}:${hash}`)
      }
      
      return results.join(', ')
    }
    
    // パスをストアごとにグループ化
    const storePathsMap = new Map<IKnowledgeStore, string[]>()
    
    for (const path of paths) {
      const { store, relativePath } = this.route(path)
      const existing = storePathsMap.get(store) || []
      existing.push(relativePath)
      storePathsMap.set(store, existing)
    }
    
    // 各ストアでコミット
    const results: string[] = []
    
    for (const [store, storePaths] of storePathsMap) {
      const hash = await store.commit(message, storePaths)
      results.push(hash)
    }
    
    return results.join(', ')
  }
  
  async getHistory(path: string, limit?: number): Promise<VersionEntry[]> {
    const { store, relativePath } = this.route(path)
    return store.getHistory(relativePath, limit)
  }
  
  async revert(path: string, version: string): Promise<void> {
    const { store, relativePath, contextRoot } = this.route(path)
    
    if (contextRoot?.readOnly) {
      throw new KnowledgeStoreError(
        `Context Root "${contextRoot.id}" is read-only`,
        'PERMISSION_DENIED',
        path
      )
    }
    
    await store.revert(relativePath, version)
  }
  
  async readVersion(path: string, version: string): Promise<string> {
    const { store, relativePath } = this.route(path)
    return store.readVersion(relativePath, version)
  }
  
  // ==========================================================================
  // Utility
  // ==========================================================================
  
  /**
   * 登録されているルート一覧を取得 (デバッグ用)
   */
  getRoutes(): { prefix: string, storageType: string }[] {
    return this.routes.map(route => ({
      prefix: route.prefix,
      storageType: route.config.storageType || 'inherited'
    }))
  }
  
  /**
   * デフォルトストアが設定されているか
   */
  hasDefaultStore(): boolean {
    return this.defaultStore !== null
  }
}
