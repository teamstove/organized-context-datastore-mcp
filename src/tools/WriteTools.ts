/**
 * Write Tools
 * 
 * Knowledge Graph への書き込み操作
 * 
 * すべての書き込みツールは配列入力に対応し、複数パスへの一括操作が可能
 */

import path from 'path'
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

/** Markdown リンクパターン: [text](path) または [[path]] */
const LINK_PATTERN = /(?:\[([^\]]*)\]\(([^)]+)\)|\[\[([^\]]+)\]\])/g

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
            // バリデーション: content は必須
            if (!op.content) throw new WriteError('create requires content', 'INVALID_OPERATION', op.path)
            
            // title と summary は create 時必須だが、型上はオプションなのでデフォルト値を設定
            const createResult = await this.createContextSingle({
              path: op.path,
              content: op.content,
              title: op.title || this.extractTitleFromPath(op.path),
              summary: op.summary || '',
              attrs: op.attrs,
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
              attrs: op.attrs,
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
            
            // 結果を構築（backlinksUpdated は 0 より大きい場合のみ含める）
            const moveResultEntry: MutationOperationResult = {
              type: 'move',
              path: op.to,
              success: true
            }
            
            // 被リンクが更新された場合のみ追加
            if (moveResult.backlinksUpdated && moveResult.backlinksUpdated > 0) {
              moveResultEntry.backlinksUpdated = moveResult.backlinksUpdated
            }
            
            results.push(moveResultEntry)
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
   * 
   * path は完全なパス（拡張子なし）を受け取る
   * 例: "docs/features/new-feature"
   */
  private async createContextSingle(params: CreateContextParams): Promise<{ path: string; node: ContextNode }> {
    const { path, content, title, summary, attrs = {}, extension } = params
    
    // 拡張子を決定: 明示指定 > Context Root のデフォルト > システムデフォルト
    const resolvedExtension = this.resolveExtension(path, extension)
    
    // パスに拡張子情報を付与（.context.md の場合は .context を付与）
    // 注: store.write は内部で .md を付与するので、ここでは拡張子なしのパスを使用
    const finalPath = this.applyExtensionToPath(path, resolvedExtension)
    
    this.checkWritePermission(finalPath)
    
    if (await this.store.exists(finalPath)) {
      throw new WriteError(`Context already exists: ${finalPath}`, 'ALREADY_EXISTS', finalPath)
    }
    
    // summary を attrs に含めて frontmatter に書き込む
    const attrsWithSummary = summary ? { ...attrs, summary } : attrs
    
    const markdown = this.generateMarkdown({ title, attrs: attrsWithSummary, content })
    await this.store.write(finalPath, markdown)
    
    const node = await this.loadContextNode(finalPath)
    return { path: finalPath, node }
  }
  
  /**
   * パスからタイトルを推測
   * 
   * 例: "docs/features/new-feature" → "new-feature"
   */
  private extractTitleFromPath(path: string): string {
    const parts = path.split('/')
    return parts[parts.length - 1]
  }
  
  /**
   * パスに拡張子情報を付与
   * 
   * - .md の場合: path のまま（store.write が .md を付与）
   * - .context.md の場合: path.context（store.write が .md を付与して path.context.md になる）
   */
  private applyExtensionToPath(path: string, extension: string): string {
    if (extension === '.md') {
      return path
    }
    
    // .context.md → .context 部分を抽出してパスに付与
    if (extension.endsWith('.md')) {
      const prefix = extension.slice(0, -3) // ".context.md" → ".context"
      return `${path}${prefix}`
    }
    
    // .md 以外の拡張子は現在未サポート（将来対応）
    console.error(`[WriteTools] Unsupported extension: ${extension}, using .md`)
    return path
  }
  
  /**
   * 拡張子を決定
   * 
   * 優先順位:
   * 1. 明示的に指定された extension
   * 2. Context Root の defaultExtension
   * 3. システムデフォルト (.md)
   */
  private resolveExtension(path: string, explicitExtension?: string): string {
    // 1. 明示的に指定されていればそれを使用
    if (explicitExtension) {
      return explicitExtension.startsWith('.') ? explicitExtension : `.${explicitExtension}`
    }
    
    // 2. Context Root の defaultExtension を探す
    const contextRoots = this.config.contextRoots ?? []
    for (const root of contextRoots) {
      // path がこの Context Root 配下かどうか（id または path でマッチ）
      if (path === root.id || path.startsWith(root.id + '/') ||
          path === root.path || path.startsWith(root.path + '/')) {
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
    const { path, title, summary, attrs, contentUpdates } = op
    
    this.checkWritePermission(path)
    
    const existing = await this.store.read(path)
    const { data: frontmatter, content: existingContent } = matter(existing)
    
    const newFrontmatter = {
      ...frontmatter,
      ...(title !== undefined && { title }),
      ...(summary !== undefined && { summary }),
      ...(attrs !== undefined && attrs) // attrs はマージ
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
   * 
   * 移動後、同じ Context Root 内の被リンクを自動的に更新する
   * 
   * @param fromPath 移動元パス
   * @param toPath 移動先パス
   * @returns 移動後のノードと更新された被リンク数
   */
  private async moveContextSingle(
    fromPath: string, 
    toPath: string
  ): Promise<{ node?: ContextNode; backlinksUpdated?: number }> {
    this.checkWritePermission(fromPath)
    this.checkWritePermission(toPath)
    
    // 1. 被リンクを先に更新（移動前に実行）
    //    移動後だとリンク先が変わってしまい、マッチしなくなる
    const contextRootId = this.extractContextRootId(fromPath)
    let backlinksUpdated = 0
    
    if (contextRootId) {
      try {
        backlinksUpdated = await this.updateBacklinks(contextRootId, fromPath, toPath)
      } catch (error) {
        // 被リンク更新に失敗しても移動は続行
        console.error(`[WriteTools] Failed to update backlinks:`, error)
      }
    }
    
    // 2. ファイル/ディレクトリを移動
    await this.store.move(fromPath, toPath)
    
    // 3. 移動後のノードを返す
    let node: ContextNode | undefined
    try {
      node = await this.loadContextNode(toPath)
    } catch {
      try {
        node = await this.loadContextNode(`${toPath}/index`)
      } catch {
        node = undefined
      }
    }
    
    return {
      node,
      backlinksUpdated: backlinksUpdated > 0 ? backlinksUpdated : undefined
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
   * タイトルをスラッグ化（大文字は維持）
   */
  private slugify(title: string): string {
    return title
      .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
  
  /**
   * Markdown を生成
   */
  private generateMarkdown(params: {
    title: string
    attrs: Record<string, unknown>
    content: string
  }): string {
    const frontmatter = {
      title: params.title,
      ...params.attrs
    }
    
    const content = params.content || `# ${params.title}`
    
    return matter.stringify(content, frontmatter)
  }
  
  /**
   * コンテキストノードをロード
   */
  private async loadContextNode(nodePath: string): Promise<ContextNode> {
    const content = await this.store.read(nodePath)
    const metadata = await this.store.getMetadata(nodePath)
    
    const parsed = parseMarkdown(content, nodePath)
    
    return toContextNode(nodePath, parsed, {
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt
    })
  }
  
  // ==========================================================================
  // Backlink Update Helpers (move 操作時の被リンク更新)
  // ==========================================================================
  
  /**
   * 同じ Context Root 内の被リンクを更新
   * 
   * 移動元パスを参照しているリンクを、移動先パスに更新する
   * 
   * @param contextRootId Context Root の ID
   * @param fromPath 移動元パス (Context Root ID を含む)
   * @param toPath 移動先パス (Context Root ID を含む)
   * @returns 更新されたファイル数
   */
  private async updateBacklinks(
    contextRootId: string,
    fromPath: string,
    toPath: string
  ): Promise<number> {
    // 同じ Context Root 内の全 .md ファイルを取得
    const pattern = `${contextRootId}/**/*.md`
    const files = await this.store.list(pattern)
    
    let updatedCount = 0
    
    // Context Root ID を除いた相対パスを計算
    const fromRelative = fromPath.startsWith(contextRootId + '/') 
      ? fromPath.slice(contextRootId.length + 1) 
      : fromPath
    const toRelative = toPath.startsWith(contextRootId + '/') 
      ? toPath.slice(contextRootId.length + 1) 
      : toPath
    
    for (const file of files) {
      // 移動するファイル自体はスキップ
      if (file === fromPath || file === `${fromPath}.md` || 
          file.startsWith(fromPath + '/')) {
        continue
      }
      
      try {
        const content = await this.store.read(file)
        
        // ファイルの相対パス (Context Root ID を除く)
        const fileRelative = file.startsWith(contextRootId + '/') 
          ? file.slice(contextRootId.length + 1) 
          : file
        
        const { content: updatedContent, updated } = this.updateLinksInContent(
          content,
          fileRelative,
          fromRelative,
          toRelative
        )
        
        if (updated) {
          await this.store.write(file, updatedContent)
          updatedCount++
        }
      } catch (error) {
        // 読み取りエラーは警告のみでスキップ
        console.error(`[WriteTools] Failed to update backlinks in ${file}:`, error)
      }
    }
    
    return updatedCount
  }
  
  /**
   * コンテンツ内のリンクを更新
   * 
   * @param content Markdown コンテンツ
   * @param sourceFilePath ソースファイルのパス（相対パス計算用）
   * @param fromPath 移動元パス
   * @param toPath 移動先パス
   * @returns 更新後のコンテンツと更新フラグ
   */
  private updateLinksInContent(
    content: string,
    sourceFilePath: string,
    fromPath: string,
    toPath: string
  ): { content: string; updated: boolean } {
    let updated = false
    
    // ソースファイルのディレクトリを取得
    const sourceDir = path.dirname(sourceFilePath)
    
    // fromPath にマッチする可能性のあるパターンを生成
    // - 相対パス: ./feature.md, ../docs/feature.md
    // - 拡張子なし: ./feature, ../docs/feature
    // - 絶対パス形式: /docs/feature.md
    const fromWithExt = fromPath.endsWith('.md') ? fromPath : `${fromPath}.md`
    const fromWithoutExt = fromPath.endsWith('.md') ? fromPath.slice(0, -3) : fromPath
    
    const toWithExt = toPath.endsWith('.md') ? toPath : `${toPath}.md`
    const toWithoutExt = toPath.endsWith('.md') ? toPath.slice(0, -3) : toPath
    
    // 正規表現でリンクを検出・置換
    const updatedContent = content.replace(LINK_PATTERN, (match, text, linkPath, wikiPath) => {
      // [text](path) 形式
      if (linkPath) {
        const newLink = this.updateSingleLink(
          linkPath, sourceDir, fromWithExt, fromWithoutExt, toWithExt, toWithoutExt
        )
        if (newLink !== linkPath) {
          updated = true
          return `[${text}](${newLink})`
        }
      }
      
      // [[path]] 形式
      if (wikiPath) {
        const newLink = this.updateSingleLink(
          wikiPath, sourceDir, fromWithExt, fromWithoutExt, toWithExt, toWithoutExt
        )
        if (newLink !== wikiPath) {
          updated = true
          return `[[${newLink}]]`
        }
      }
      
      return match
    })
    
    return { content: updatedContent, updated }
  }
  
  /**
   * 単一のリンクを更新
   * 
   * @param linkPath 現在のリンクパス
   * @param sourceDir ソースファイルのディレクトリ
   * @param fromWithExt 移動元パス（拡張子あり）
   * @param fromWithoutExt 移動元パス（拡張子なし）
   * @param toWithExt 移動先パス（拡張子あり）
   * @param toWithoutExt 移動先パス（拡張子なし）
   * @returns 更新後のリンクパス（変更なしの場合は元のパス）
   */
  private updateSingleLink(
    linkPath: string,
    sourceDir: string,
    fromWithExt: string,
    fromWithoutExt: string,
    toWithExt: string,
    toWithoutExt: string
  ): string {
    // 外部リンクはスキップ
    if (linkPath.startsWith('http://') || linkPath.startsWith('https://')) {
      return linkPath
    }
    
    // リンクの絶対パスを計算
    const absoluteLinkPath = linkPath.startsWith('/')
      ? linkPath.slice(1) // 先頭の / を除去
      : path.join(sourceDir, linkPath)
    
    // 正規化（.. や . を解決）
    const normalizedPath = path.normalize(absoluteLinkPath)
    
    // 拡張子あり/なしの両方でマッチを確認
    const hasExtension = linkPath.endsWith('.md')
    
    // マッチするかチェック
    const matchesWithExt = normalizedPath === fromWithExt || normalizedPath === fromWithoutExt + '.md'
    const matchesWithoutExt = normalizedPath === fromWithoutExt
    const matchesDir = normalizedPath.startsWith(fromWithoutExt + '/')
    
    if (matchesWithExt || matchesWithoutExt || matchesDir) {
      // 新しいパスを計算
      let newTargetPath: string
      
      if (matchesDir) {
        // ディレクトリ配下のファイルへのリンク
        const relativePart = normalizedPath.slice(fromWithoutExt.length)
        newTargetPath = toWithoutExt + relativePart
      } else {
        // ファイルへの直接リンク
        newTargetPath = hasExtension ? toWithExt : toWithoutExt
      }
      
      // ソースファイルからの相対パスを計算
      if (linkPath.startsWith('/')) {
        // 元が絶対パス形式なら絶対パス形式で返す
        return '/' + newTargetPath
      } else {
        // 相対パスを計算
        let relativePath = path.relative(sourceDir, newTargetPath)
        
        // ./ で始まらない場合は追加（可読性のため）
        if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
          relativePath = './' + relativePath
        }
        
        return relativePath
      }
    }
    
    return linkPath
  }
  
  /**
   * パスから Context Root ID を抽出
   */
  private extractContextRootId(targetPath: string): string | null {
    const parts = targetPath.split('/')
    if (parts.length === 0) return null
    
    // 最初の部分が Context Root ID
    const potentialId = parts[0]
    
    // 設定された Context Root と照合
    const contextRoots = this.config.contextRoots ?? []
    for (const root of contextRoots) {
      if (root.id === potentialId) {
        return potentialId
      }
    }
    
    // 見つからない場合は最初の部分をそのまま返す
    return potentialId
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
