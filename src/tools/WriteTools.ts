/**
 * Write Tools
 * 
 * Knowledge Graph への書き込み操作
 * 
 * すべての書き込みツールは配列入力に対応し、複数パスへの一括操作が可能
 */

import matter from 'gray-matter'
import type { IKnowledgeStore } from '../storage/IKnowledgeStore.js'
import type { 
  ContextNode,
  CreateContextParams,
  UpdateContextOperation,
  ContentUpdate,
  WritePermissionConfig,
  ContextMutation,
  MutationResult,
  MutationOperationResult,
  ContextRootConfig
} from '../types/index.js'
import { parseMarkdown, toContextNode } from '../parser/MarkdownParser.js'

/** システムデフォルトの拡張子 */
const SYSTEM_DEFAULT_EXTENSION = '.md'

/**
 * 書き込みツール設定
 */
export interface WriteToolsConfig {
  /** 書き込み権限 */
  writePermission: WritePermissionConfig
  
  /** Context Roots 設定 (defaultExtension 取得用) */
  contextRoots?: ContextRootConfig[]
}

/**
 * 書き込み結果
 */
export interface WriteResult<T> {
  success: boolean
  path: string
  result?: T
  error?: string
}

/**
 * 書き込みツール
 */
export class WriteTools {
  private readonly store: IKnowledgeStore
  private readonly config: WriteToolsConfig
  
  constructor(store: IKnowledgeStore, config: WriteToolsConfig) {
    this.store = store
    this.config = config
  }
  
  // ==========================================================================
  // mutate_context (統合版)
  // ==========================================================================
  
  /**
   * コンテキストを変更 (統合版)
   * 
   * create, update, delete, move を単一のツールで実行可能。
   * 複数の操作を一括で実行し、全て成功した場合にまとめてコミット。
   * 
   * @param operations 変更操作の配列
   * @returns 変更結果
   * 
   * @example
   * await mutateContext([
   *   { type: 'create', path: 'docs/features', title: '新機能', summary: '...' },
   *   { type: 'update', path: 'docs/existing', summary: '更新' },
   *   { type: 'move', path: 'old/path', to: 'new/path' },
   *   { type: 'delete', path: 'docs/obsolete' }
   * ])
   */
  async mutateContext(operations: ContextMutation[]): Promise<MutationResult> {
    const results: MutationOperationResult[] = []
    const affectedPaths: string[] = []
    let successCount = 0
    let errorCount = 0
    
    for (const op of operations) {
      try {
        switch (op.type) {
          case 'create': {
            // バリデーション
            if (!op.title) throw new WriteError('create requires title', 'INVALID_OPERATION', op.path)
            if (!op.summary) throw new WriteError('create requires summary', 'INVALID_OPERATION', op.path)
            
            const createResult = await this.createContextSingle({
              parentPath: op.path,
              title: op.title,
              summary: op.summary,
              content: op.content,
              categories: op.categories,
              tags: op.tags,
              extension: op.extension
            })
            
            results.push({
              type: 'create',
              path: createResult.path,
              success: true
              // result は Token 効率のため省略
            })
            affectedPaths.push(createResult.path + '.md')
            successCount++
            break
          }
          
          case 'update': {
            const updateResult = await this.updateContextSingle({
              path: op.path,
              title: op.title,
              summary: op.summary,
              categories: op.categories,
              tags: op.tags,
              contentUpdates: op.contentUpdates
            })
            
            results.push({
              type: 'update',
              path: op.path,
              success: true
              // result は Token 効率のため省略
            })
            affectedPaths.push(op.path + '.md')
            successCount++
            break
          }
          
          case 'delete': {
            await this.deleteContextSingle(op.path)
            
            results.push({
              type: 'delete',
              path: op.path,
              success: true
            })
            affectedPaths.push(op.path)
            successCount++
            break
          }
          
          case 'move': {
            // バリデーション
            if (!op.to) throw new WriteError('move requires to', 'INVALID_OPERATION', op.path)
            
            const moveResult = await this.moveContextSingle(op.path, op.to)
            
            results.push({
              type: 'move',
              path: op.to,
              success: true
              // result は Token 効率のため省略
            })
            affectedPaths.push(op.path, op.to)
            successCount++
            break
          }
          
          default:
            throw new WriteError(`Unknown operation type: ${(op as ContextMutation).type}`, 'INVALID_OPERATION')
        }
        
      } catch (error) {
        results.push({
          type: op.type,
          path: op.path,
          success: false,
          error: (error as Error).message
        })
        errorCount++
      }
    }
    
    // 注: 自動コミットは各 Context Root の git 設定に従って FileGitStore.write で行われる
    
    return {
      success: successCount,
      errors: errorCount,
      results
    }
  }
  
  // ==========================================================================
  // Single Operation Methods (内部用)
  // ==========================================================================
  
  /**
   * 単一コンテキスト作成 (コミットなし)
   */
  private async createContextSingle(params: CreateContextParams): Promise<{ path: string; node: ContextNode }> {
    const { parentPath, title, summary, content = '', categories = [], tags = [], extension } = params
    
    const slug = this.slugify(title)
    
    // 拡張子を決定: 明示指定 > Context Root のデフォルト > システムデフォルト
    const resolvedExtension = this.resolveExtension(parentPath, extension)
    
    // スラッグに拡張子を付与してパスを構成
    // 注: store.write は内部で .md を付与するので、ここでは拡張子なしのパスを使用
    // ただし、.context.md のような複合拡張子の場合は .md を除いた部分をスラッグに含める
    const slugWithExtension = this.buildSlugWithExtension(slug, resolvedExtension)
    const path = `${parentPath}/${slugWithExtension}`
    
    this.checkWritePermission(path)
    
    if (await this.store.exists(path)) {
      throw new WriteError(`Context already exists: ${path}`, 'ALREADY_EXISTS', path)
    }
    
    const markdown = this.generateMarkdown({ title, summary, categories, tags, content })
    await this.store.write(path, markdown)
    
    const node = await this.loadContextNode(path)
    return { path, node }
  }
  
  /**
   * 拡張子を決定
   * 
   * 優先順位:
   * 1. 明示的に指定された extension
   * 2. Context Root の defaultExtension
   * 3. システムデフォルト (.md)
   */
  private resolveExtension(parentPath: string, explicitExtension?: string): string {
    // 1. 明示的に指定されていればそれを使用
    if (explicitExtension) {
      return explicitExtension.startsWith('.') ? explicitExtension : `.${explicitExtension}`
    }
    
    // 2. Context Root の defaultExtension を探す
    const contextRoots = this.config.contextRoots ?? []
    for (const root of contextRoots) {
      // parentPath がこの Context Root 配下かどうか
      if (parentPath === root.path || parentPath.startsWith(root.path + '/')) {
        if (root.defaultExtension) {
          return root.defaultExtension.startsWith('.') 
            ? root.defaultExtension 
            : `.${root.defaultExtension}`
        }
      }
    }
    
    // 3. システムデフォルト
    return SYSTEM_DEFAULT_EXTENSION
  }
  
  /**
   * スラッグに拡張子情報を付与
   * 
   * - .md の場合: slug のまま（store.write が .md を付与）
   * - .context.md の場合: slug.context（store.write が .md を付与して slug.context.md になる）
   */
  private buildSlugWithExtension(slug: string, extension: string): string {
    if (extension === '.md') {
      return slug
    }
    
    // .context.md → .context 部分を抽出してスラッグに付与
    if (extension.endsWith('.md')) {
      const prefix = extension.slice(0, -3) // ".context.md" → ".context"
      return `${slug}${prefix}`
    }
    
    // .md 以外の拡張子は現在未サポート（将来対応）
    console.warn(`[WriteTools] Unsupported extension: ${extension}, using .md`)
    return slug
  }
  
  /**
   * 単一コンテキスト更新 (コミットなし)
   */
  private async updateContextSingle(op: UpdateContextOperation): Promise<ContextNode> {
    const { path, title, summary, categories, tags, contentUpdates } = op
    
    this.checkWritePermission(path)
    
    const existing = await this.store.read(path)
    const { data: frontmatter, content: existingContent } = matter(existing)
    
    const newFrontmatter = {
      ...frontmatter,
      ...(title !== undefined && { title }),
      ...(summary !== undefined && { summary }),
      ...(categories !== undefined && { categories }),
      ...(tags !== undefined && { tags })
    }
    
    let newContent = existingContent
    if (contentUpdates && contentUpdates.length > 0) {
      for (const update of contentUpdates) {
        newContent = this.applyContentUpdate(newContent, update)
      }
    }
    
    const markdown = matter.stringify(newContent, newFrontmatter)
    await this.store.write(path, markdown)
    
    return this.loadContextNode(path)
  }
  
  /**
   * 単一コンテキスト削除 (コミットなし)
   */
  private async deleteContextSingle(path: string): Promise<void> {
    this.checkWritePermission(path)
    await this.store.delete(path)
  }
  
  /**
   * 単一コンテキスト移動 (コミットなし)
   */
  private async moveContextSingle(fromPath: string, toPath: string): Promise<ContextNode | undefined> {
    this.checkWritePermission(fromPath)
    this.checkWritePermission(toPath)
    
    await this.store.move(fromPath, toPath)
    
    // 移動後のノードを返す
    try {
      return await this.loadContextNode(toPath)
    } catch {
      try {
        return await this.loadContextNode(`${toPath}/index`)
      } catch {
        return undefined
      }
    }
  }
  
  /**
   * コミットメッセージを生成
   */
  private generateCommitMessage(successResults: MutationOperationResult[]): string {
    if (successResults.length === 0) return 'No changes'
    if (successResults.length === 1) {
      const r = successResults[0]
      switch (r.type) {
        case 'create': return `Create ${r.path}`
        case 'update': return `Update ${r.path}`
        case 'delete': return `Delete ${r.path}`
        case 'move': return `Move to ${r.path}`
      }
    }
    
    // 複数操作: 種類ごとにカウント
    const counts = { create: 0, update: 0, delete: 0, move: 0 }
    for (const r of successResults) {
      counts[r.type]++
    }
    
    const parts: string[] = []
    if (counts.create > 0) parts.push(`create ${counts.create}`)
    if (counts.update > 0) parts.push(`update ${counts.update}`)
    if (counts.delete > 0) parts.push(`delete ${counts.delete}`)
    if (counts.move > 0) parts.push(`move ${counts.move}`)
    
    return `Mutate contexts: ${parts.join(', ')}`
  }
  
  // ==========================================================================
  // commit (draft_commit モード用)
  // ==========================================================================
  
  /**
   * 変更をコミット (draft_commit モード用)
   * 
   * @param message コミットメッセージ
   * @param paths 対象パス (省略時は全変更)
   * @returns コミットハッシュ
   */
  async commit(message: string, paths?: string[]): Promise<string> {
    return this.store.commit(message, paths)
  }
  
  // ==========================================================================
  // Internal Methods
  // ==========================================================================
  
  /**
   * ContentUpdate を適用
   */
  private applyContentUpdate(content: string, update: ContentUpdate): string {
    switch (update.type) {
      case 'whole_replace':
        return update.content
        
      case 'regexp_replace': {
        // フラグをパース
        let flags = update.flags || ''
        
        // 's' フラグ (DOTALL) は JavaScript では対応していないので手動処理
        const dotAll = flags.includes('s')
        flags = flags.replace('s', '')
        
        // パターンを調整 (DOTALL対応)
        let pattern = update.pattern
        if (dotAll) {
          // . を [\s\S] に置換 (ただし文字クラス内は除く)
          pattern = pattern.replace(/\.(?![*+?]?\])/g, '[\\s\\S]')
        }
        
        const regex = new RegExp(pattern, flags)
        return content.replace(regex, update.replacement)
      }
        
      default:
        throw new WriteError(
          `Unknown content update type: ${(update as ContentUpdate).type}`,
          'INVALID_OPERATION'
        )
    }
  }
  
  /**
   * 書き込み権限をチェック
   */
  private checkWritePermission(path: string): void {
    const { mode, allowedPaths, deniedPaths, writableContextRoots } = this.config.writePermission
    
    switch (mode) {
      case 'unrestricted':
        return
        
      case 'allowlist':
        if (!allowedPaths?.some(pattern => this.matchPath(path, pattern))) {
          throw new WriteError(
            `Write permission denied: ${path} is not in allowlist`,
            'PERMISSION_DENIED',
            path
          )
        }
        break
        
      case 'denylist':
        if (deniedPaths?.some(pattern => this.matchPath(path, pattern))) {
          throw new WriteError(
            `Write permission denied: ${path} is in denylist`,
            'PERMISSION_DENIED',
            path
          )
        }
        break
    }
    
    // Context Root 制限
    if (writableContextRoots && writableContextRoots.length > 0) {
      const isWritable = writableContextRoots.some(root => 
        path.startsWith(root + '/') || path === root
      )
      if (!isWritable) {
        throw new WriteError(
          `Write permission denied: ${path} is not in writable context roots`,
          'PERMISSION_DENIED',
          path
        )
      }
    }
  }
  
  /**
   * パスパターンマッチ
   */
  private matchPath(path: string, pattern: string): boolean {
    // シンプルなワイルドカードマッチ
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3)
      return path.startsWith(prefix + '/') || path === prefix
    }
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -2)
      const remaining = path.slice(prefix.length + 1)
      return path.startsWith(prefix + '/') && !remaining.includes('/')
    }
    return path === pattern
  }
  
  /**
   * タイトルをスラッグ化
   */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
  
  /**
   * Markdown を生成
   */
  private generateMarkdown(params: {
    title: string
    summary: string
    categories: string[]
    tags: string[]
    content: string
  }): string {
    const frontmatter = {
      title: params.title,
      summary: params.summary,
      categories: params.categories,
      tags: params.tags
    }
    
    const content = params.content || `# ${params.title}\n\n${params.summary}`
    
    return matter.stringify(content, frontmatter)
  }
  
  /**
   * コンテキストノードをロード
   */
  private async loadContextNode(path: string): Promise<ContextNode> {
    const content = await this.store.read(path)
    const metadata = await this.store.getMetadata(path)
    
    const parsed = parseMarkdown(content, path)
    
    return toContextNode(path, parsed, {
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt
    })
  }
}

/**
 * 書き込みエラー
 */
export class WriteError extends Error {
  constructor(
    message: string,
    public readonly code: WriteErrorCode,
    public readonly path?: string
  ) {
    super(message)
    this.name = 'WriteError'
  }
}

export type WriteErrorCode = 
  | 'ALREADY_EXISTS'
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_OPERATION'
  | 'WRITE_FAILED'
