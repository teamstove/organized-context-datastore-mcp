/**
 * Read Tools
 * 
 * Knowledge Graph からの読み取り操作
 */

import type { IKnowledgeStore } from '../storage/IKnowledgeStore.js'
import type { 
  ContextNode, 
  ContextNodeSummary,
  GetContextsOptions,
  GetContextTreeOptions,
  ContextTreeResult,
  ContextTreeResults,
  ContextRootConfig
} from '../types/index.js'
import { parseMarkdown, toContextNode } from '../parser/MarkdownParser.js'
import { JqFilterEngine } from '../filter/JqFilterEngine.js'

/**
 * 読み取りツール
 */
export class ReadTools {
  private readonly store: IKnowledgeStore
  private readonly filterEngine: JqFilterEngine
  private readonly contextRoots: ContextRootConfig[]
  
  constructor(
    store: IKnowledgeStore, 
    contextRoots: ContextRootConfig[] = []
  ) {
    this.store = store
    this.filterEngine = new JqFilterEngine()
    this.contextRoots = contextRoots
  }
  
  // ==========================================================================
  // list_context_roots
  // ==========================================================================
  
  /**
   * 利用可能な Context Root 一覧を取得
   */
  async listContextRoots(): Promise<(ContextRootConfig & { rootPath: string })[]> {
    // rootPath フィールドを追加（他のツールで使用するパス = id）
    return this.contextRoots.map(root => ({
      ...root,
      rootPath: root.id
    }))
  }

  // ==========================================================================
  // パス解決ユーティリティ
  // ==========================================================================
  
  /**
   * rootPath を絶対パスに解決
   * 
   * 以下の順序でマッチングを行う：
   * 1. contextRoots の id に完全一致 → その path を返す
   * 2. contextRoots の path に完全一致 → そのまま返す
   * 3. contextRoots の path のプレフィックスに一致 → そのまま返す
   * 4. 一致しない場合 → そのまま返す（デフォルトストアで処理）
   * 
   * @param rootPath id または相対/絶対パス
   * @returns 解決された絶対パス
   */
  resolveRootPath(rootPath: string): string {
    // 1. id に完全一致する Context Root を探す
    const matchById = this.contextRoots.find(root => root.id === rootPath)
    if (matchById) {
      return matchById.path
    }
    
    // 2. path に完全一致する Context Root を探す
    const matchByPath = this.contextRoots.find(root => root.path === rootPath)
    if (matchByPath) {
      return matchByPath.path
    }
    
    // 3. path のプレフィックスに一致する Context Root を探す
    const matchByPrefix = this.contextRoots.find(root => 
      rootPath.startsWith(root.path + '/') || rootPath.startsWith(root.id + '/')
    )
    if (matchByPrefix) {
      // id プレフィックスの場合、id 部分を path に置換
      if (rootPath.startsWith(matchByPrefix.id + '/')) {
        return matchByPrefix.path + rootPath.slice(matchByPrefix.id.length)
      }
      return rootPath
    }
    
    // 4. マッチしない場合はそのまま返す
    return rootPath
  }
  
  /**
   * パターン配列内の id プレフィックスを絶対パスに変換
   * 
   * @param patterns パターン配列 (例: ['src/**', 'docs/*'])
   * @returns 変換されたパターン配列
   */
  resolvePatterns(patterns: string[]): string[] {
    return patterns.map(pattern => {
      // パターンのプレフィックス部分を抽出
      const firstSlash = pattern.indexOf('/')
      const prefix = firstSlash > 0 ? pattern.slice(0, firstSlash) : pattern.split('*')[0]
      
      // id に一致する Context Root を探す
      const matchById = this.contextRoots.find(root => root.id === prefix)
      if (matchById) {
        // id 部分を path に置換
        if (firstSlash > 0) {
          return matchById.path + pattern.slice(firstSlash)
        }
        return matchById.path + pattern.slice(prefix.length)
      }
      
      return pattern
    })
  }
  
  // ==========================================================================
  // get_contexts
  // ==========================================================================
  
  /**
   * コンテキストを取得
   * 
   * @param options 取得オプション
   * - patterns: glob パターン配列 (例: ['gme-project/**'])
   * - filter: jq フィルタ式 (例: '.categories | contains(["feature-spec"])')
   * - includeContent: コンテンツを含めるか (default: true)
   * - depth: 子階層を含める深さ
   * 
   * @example
   * // カテゴリが feature-spec のもの
   * await getContexts({
   *   patterns: ['gme-project/**'],
   *   filter: '.categories | contains(["feature-spec"])'
   * })
   * 
   * @example
   * // お客様確認待ちの項目があるもの
   * await getContexts({
   *   patterns: ['gme-project/**'],
   *   filter: '.annotations | any(.attributes | any(startswith("要確認:お客様")))'
   * })
   */
  async getContexts(options: GetContextsOptions): Promise<ContextNode[]> {
    const { patterns, filter, includeContent = true } = options
    
    // 1. パターンでファイル一覧取得（CompositeStore が id でルーティング）
    const files = await this.store.listMultiple(patterns)
    
    // 2. 各ファイルをパース
    const contexts: ContextNode[] = []
    for (const file of files) {
      try {
        const context = await this.loadContextNode(file)
        contexts.push(context)
      } catch (error) {
        // パース失敗は警告のみでスキップ
        console.warn(`Failed to parse ${file}:`, error)
      }
    }
    
    // 3. Backlinks を計算
    this.computeBacklinks(contexts)
    
    // 4. jq フィルタ適用
    let filtered = contexts
    if (filter) {
      filtered = await this.filterEngine.filter(contexts, filter)
    }
    
    // 5. コンテンツを除外 (オプション)
    if (!includeContent) {
      filtered = filtered.map(ctx => ({
        ...ctx,
        content: ''
      }))
    }
    
    return filtered
  }
  
  // ==========================================================================
  // get_context_tree
  // ==========================================================================
  
  /**
   * コンテキストツリー (目次) を取得
   * 
   * @param options オプション
   * - rootPath: ルートパス
   * - depth: 深さ (default: 全階層)
   * - format: 'json' | 'tree-text' (default: 'tree-text')
   * - treeStyle: 'nested' | 'flat' (default: 'nested')
   * - includeSummary: summary を含めるか (default: true)
   * - includeCategories: categories を含めるか (default: true)
   * - includeTags: tags を含めるか (default: true)
   * - maxNodes: 返却ノード数上限 (default: 1000)
   */
  /**
   * コンテキストツリーを取得（配列対応）
   * 
   * @param options オプション
   * @returns rootPaths指定時は ContextTreeResults、それ以外は ContextTreeResult
   */
  async getContextTree(options: GetContextTreeOptions): Promise<ContextTreeResult | ContextTreeResults> {
    const { 
      rootPath: singleRootPath, 
      rootPaths,
      depth,
      format = 'tree-text',
      treeStyle = 'flat',
      // デフォルトフォーマット: "$path: $title" (includeSummary 等は false)
      includeSummary = false,
      includeCategories = false,
      includeTags = false,
      treeTextFormat = '$path: $title',
      maxNodes = 1000
    } = options
    
    // 複数パス指定の場合
    if (rootPaths && rootPaths.length > 0) {
      const results: ContextTreeResult[] = []
      let totalNodes = 0
      let truncated = false
      
      for (const rootPath of rootPaths) {
        // id はそのまま使用（CompositeStore が id でルーティング）
        const result = await this.getContextTreeSingle({
          rootPath,
          depth,
          format,
          treeStyle,
          includeSummary,
          includeCategories,
          includeTags,
          treeTextFormat,
          maxNodes
        })
        results.push(result)
        totalNodes += result.totalNodes
        if (result.truncated) truncated = true
      }
      
      return {
        results,
        totalNodes,
        truncated
      }
    }
    
    // 単一パス指定の場合（後方互換）
    if (!singleRootPath) {
      throw new Error('rootPath or rootPaths is required')
    }
    
    // id はそのまま使用（CompositeStore が id でルーティング）
    return this.getContextTreeSingle({
      rootPath: singleRootPath,
      depth,
      format,
      treeStyle,
      includeSummary,
      includeCategories,
      includeTags,
      treeTextFormat,
      maxNodes
    })
  }
  
  /**
   * 単一ルートパスのコンテキストツリーを取得
   */
  private async getContextTreeSingle(options: {
    rootPath: string
    depth?: number
    format?: 'json' | 'tree-text'
    treeStyle?: 'nested' | 'flat'
    includeSummary?: boolean
    includeCategories?: boolean
    includeTags?: boolean
    treeTextFormat?: string
    maxNodes?: number
  }): Promise<ContextTreeResult> {
    const { 
      rootPath, 
      depth,
      format = 'tree-text',
      treeStyle = 'flat',
      includeSummary = false,
      includeCategories = false,
      includeTags = false,
      treeTextFormat = '$path: $title',
      maxNodes = 1000
    } = options
    
    // パターンを構築
    const patterns = depth !== undefined
      ? this.buildDepthPatterns(rootPath, depth)
      : [`${rootPath}/**/*.md`]
    
    // ファイル一覧取得
    const files = await this.store.listMultiple(patterns)
    
    // サマリを生成
    const summaries: ContextNodeSummary[] = []
    
    for (const file of files) {
      try {
        const summary = await this.loadContextNodeSummary(file, files)
        summaries.push(summary)
      } catch (error) {
        console.warn(`Failed to parse ${file}:`, error)
      }
    }
    
    // パスでソート (深さ優先、同階層はアルファベット順)
    summaries.sort((a, b) => a.path.localeCompare(b.path))
    
    const totalNodes = summaries.length
    const truncated = totalNodes > maxNodes
    const limitedSummaries = truncated ? summaries.slice(0, maxNodes) : summaries
    
    // フォーマットに応じて出力
    if (format === 'json') {
      return {
        tree: limitedSummaries,
        format: 'json',
        totalNodes,
        truncated,
        rootPath
      }
    }
    
    // tree-text 形式
    const treeText = this.renderTreeText(
      rootPath,
      limitedSummaries,
      { treeStyle, includeSummary, includeCategories, includeTags, treeTextFormat }
    )
    
    return {
      tree: treeText,
      format: 'tree-text',
      totalNodes,
      truncated,
      rootPath
    }
  }
  
  /**
   * 中間ディレクトリノードを確保
   * 
   * ファイルパスから中間ディレクトリを抽出し、
   * 対応するノード（index.md）がない場合は仮想ノードを生成
   */
  private ensureIntermediateDirectories(
    rootPath: string,
    summaries: ContextNodeSummary[]
  ): ContextNodeSummary[] {
    // 正規化パス → summary のマップ
    const normalizedPathMap = new Map<string, ContextNodeSummary>()
    
    for (const summary of summaries) {
      const normalized = this.normalizePathForTree(summary.path)
      normalizedPathMap.set(normalized, summary)
    }
    
    // すべてのパスから中間ディレクトリを抽出
    const allDirPaths = new Set<string>()
    
    for (const summary of summaries) {
      const normalized = this.normalizePathForTree(summary.path)
      
      // ルートパスからの相対パスを分解
      const relativePath = normalized.replace(new RegExp(`^${rootPath}/?`), '')
      const parts = relativePath.split('/')
      
      // 中間ディレクトリをすべて追加
      let currentPath = rootPath
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = `${currentPath}/${parts[i]}`
        allDirPaths.add(currentPath)
      }
    }
    
    // 中間ディレクトリに対応するノードがない場合は仮想ノードを生成
    const result = [...summaries]
    
    for (const dirPath of allDirPaths) {
      if (!normalizedPathMap.has(dirPath)) {
        // 仮想ノードを生成
        const dirName = dirPath.split('/').pop() || dirPath
        const virtualSummary: ContextNodeSummary = {
          path: dirPath,
          title: this.dirNameToTitle(dirName),
          summary: `${this.dirNameToTitle(dirName)} ディレクトリ`,
          categories: ['directory'],
          tags: [],
          childCount: 0,  // 後で更新される
          isVirtual: true  // 仮想ノードフラグ
        }
        result.push(virtualSummary)
        normalizedPathMap.set(dirPath, virtualSummary)
      }
    }
    
    return result
  }
  
  /**
   * ディレクトリ名をタイトルに変換
   * 例: "01-why" → "Why"
   */
  private dirNameToTitle(dirName: string): string {
    // 数字プレフィックスを削除
    const withoutPrefix = dirName.replace(/^\d+-/, '')
    // ハイフン/アンダースコアをスペースに
    const withSpaces = withoutPrefix.replace(/[-_]/g, ' ')
    // 先頭大文字
    return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1)
  }
  
  // ==========================================================================
  // Tree Text Rendering
  // ==========================================================================
  
  /**
   * パスを正規化 (xxx/index → xxx として扱う)
   */
  private normalizePathForTree(path: string): string {
    // xxx/index → xxx に正規化
    if (path.endsWith('/index')) {
      return path.slice(0, -6)  // '/index' の長さ = 6
    }
    return path
  }
  
  /**
   * 正規化されたパスから表示用ノード名を取得
   */
  private getDisplayNodeName(path: string): string {
    const normalized = this.normalizePathForTree(path)
    return normalized.split('/').pop() || normalized
  }
  
  /**
   * ツリー構造をテキスト形式でレンダリング
   * 
   * @example nested 出力例:
   * [kgmcp-docs] (18 nodes)
   * ├ 01-why: なぜ必要か [chi:2]
   * │ ├ problems-we-solve: 解決する課題
   * │ └ vision-and-goals: ビジョンと目標
   * └ 02-how: 実装とアーキテクチャ [chi:2]
   * 
   * @example flat 出力例:
   * [kgmcp-docs] (18 nodes)
   * 01-why: なぜ必要か
   * 01-why/problems-we-solve: 解決する課題
   * 01-why/vision-and-goals: ビジョンと目標
   * 02-how: 実装とアーキテクチャ
   */
  private renderTreeText(
    rootPath: string,
    summaries: ContextNodeSummary[],
    options: {
      treeStyle: 'nested' | 'flat'
      includeSummary: boolean
      includeCategories: boolean
      includeTags: boolean
      treeTextFormat: string
    }
  ): string {
    const { treeStyle, includeSummary, includeCategories, includeTags, treeTextFormat } = options
    
    // フラット形式の場合
    if (treeStyle === 'flat') {
      return this.renderTreeTextFlat(rootPath, summaries, { includeSummary, includeCategories, includeTags, treeTextFormat })
    }
    
    // ネスト形式
    return this.renderTreeTextNested(rootPath, summaries, { includeSummary, includeCategories, includeTags, treeTextFormat })
  }
  
  /**
   * フラット形式でレンダリング
   * 
   * treeTextFormat が指定されている場合はフォーマット文字列を使用
   * 使用可能な変数: $path, $title, $summary, $categories, $tags
   */
  private renderTreeTextFlat(
    rootPath: string,
    summaries: ContextNodeSummary[],
    options: {
      includeSummary: boolean
      includeCategories: boolean
      includeTags: boolean
      treeTextFormat: string
    }
  ): string {
    const { treeTextFormat } = options
    const lines: string[] = []
    lines.push(`[${rootPath}] (${summaries.length} nodes)`)
    
    for (const summary of summaries) {
      // ルートパスからの相対パス（正規化済み）
      const relativePath = this.normalizePathForTree(summary.path)
        .replace(new RegExp(`^${rootPath}/`), '')
      
      // フォーマット文字列を使ってレンダリング
      const line = this.formatTreeLine(relativePath, summary, treeTextFormat)
      lines.push(line)
    }
    
    return lines.join('\n')
  }
  
  /**
   * フォーマット文字列を使って1行をレンダリング
   * 
   * @param relativePath 相対パス
   * @param summary サマリー
   * @param format フォーマット文字列 (例: "$path: $title")
   */
  private formatTreeLine(
    relativePath: string,
    summary: ContextNodeSummary,
    format: string
  ): string {
    return format
      .replace(/\$path/g, relativePath)
      .replace(/\$title/g, summary.title)
      .replace(/\$summary/g, summary.summary)
      .replace(/\$categories/g, summary.categories.join(','))
      .replace(/\$tags/g, summary.tags.join(','))
  }
  
  /**
   * ネスト形式でレンダリング
   */
  private renderTreeTextNested(
    rootPath: string,
    summaries: ContextNodeSummary[],
    options: {
      includeSummary: boolean
      includeCategories: boolean
      includeTags: boolean
      treeTextFormat: string
    }
  ): string {
    const { treeTextFormat } = options
    
    // ツリー構造を構築
    interface TreeNode {
      summary: ContextNodeSummary
      normalizedPath: string
      displayName: string
      children: TreeNode[]
    }
    
    // 正規化されたパスでマップを作成
    const nodeMap = new Map<string, TreeNode>()
    
    // まず全ノードを作成（正規化パス付き）
    for (const summary of summaries) {
      const normalizedPath = this.normalizePathForTree(summary.path)
      const displayName = this.getDisplayNodeName(summary.path)
      const isIndexMd = summary.path.endsWith('/index')
      
      // 同じ正規化パスのノードが既にある場合の優先順位:
      // why/index.md > why.md (index.md がディレクトリの代表)
      if (nodeMap.has(normalizedPath)) {
        const existing = nodeMap.get(normalizedPath)!
        const existingIsIndex = existing.summary.path.endsWith('/index')
        
        if (isIndexMd && !existingIsIndex) {
          // 新しい方が index.md → 置き換え
          console.warn(`[get_context_tree] Conflict: ${summary.path} replaces ${existing.summary.path}`)
          nodeMap.set(normalizedPath, { 
            summary, 
            normalizedPath,
            displayName,
            children: existing.children  // 既存の子ノードを維持
          })
        } else if (!isIndexMd && existingIsIndex) {
          // 既存が index.md → 維持（新しい方をスキップ）
          console.warn(`[get_context_tree] Conflict: ${summary.path} skipped (${existing.summary.path} takes priority)`)
        } else {
          // 両方同じ種類 → 先勝ち
          console.warn(`[get_context_tree] Duplicate: ${summary.path} skipped`)
        }
      } else {
        nodeMap.set(normalizedPath, { 
          summary, 
          normalizedPath,
          displayName,
          children: [] 
        })
      }
    }
    
    // 親子関係を構築
    const rootNodes: TreeNode[] = []
    
    for (const [normalizedPath, node] of nodeMap) {
      const parentPath = this.getParentPath(normalizedPath)
      
      if (parentPath && nodeMap.has(parentPath)) {
        // 親がある場合は親の children に追加
        nodeMap.get(parentPath)!.children.push(node)
      } else {
        // 親がない場合はルートノード
        rootNodes.push(node)
      }
    }
    
    // 子ノードをソート
    const sortChildren = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.normalizedPath.localeCompare(b.normalizedPath))
      for (const node of nodes) {
        sortChildren(node.children)
      }
    }
    sortChildren(rootNodes)
    
    // テキストをレンダリング
    const lines: string[] = []
    lines.push(`[${rootPath}] (${summaries.length} nodes)`)
    
    const renderNode = (node: TreeNode, prefix: string, isLast: boolean) => {
      const { summary, displayName, children } = node
      
      // ブランチ記号
      const branch = isLast ? '└' : '├'
      
      // フォーマット文字列を使ってレンダリング ($path を displayName に置換)
      const formattedContent = this.formatTreeLine(displayName, summary, treeTextFormat)
      
      // 行を構築
      lines.push(`${prefix}${branch} ${formattedContent}`)
      
      // 子ノードをレンダリング
      const childPrefix = prefix + (isLast ? '  ' : '│ ')
      children.forEach((child, index) => {
        const isChildLast = index === children.length - 1
        renderNode(child, childPrefix, isChildLast)
      })
    }
    
    // ルートノードをレンダリング
    rootNodes.forEach((node, index) => {
      const isLast = index === rootNodes.length - 1
      renderNode(node, '', isLast)
    })
    
    return lines.join('\n')
  }
  
  /**
   * パスから親パスを取得
   */
  private getParentPath(path: string): string | null {
    const parts = path.split('/')
    if (parts.length <= 1) return null
    return parts.slice(0, -1).join('/')
  }
  
  // ==========================================================================
  // search_contexts
  // ==========================================================================
  
  /**
   * コンテキストを検索 (キーワードベース)
   * 
   * @param query 検索クエリ
   * @param scope 検索スコープ (glob パターン)
   */
  async searchContexts(
    query: string, 
    scope?: string[]
  ): Promise<ContextNode[]> {
    const patterns = scope ?? ['**/*.md']
    
    // まず全コンテキストを取得
    const contexts = await this.getContexts({
      patterns,
      includeContent: true
    })
    
    // キーワードでフィルタ
    const keywords = query.toLowerCase().split(/\s+/)
    
    return contexts.filter(ctx => {
      const searchText = [
        ctx.title,
        ctx.summary,
        ctx.content,
        ...ctx.tags,
        ...ctx.categories
      ].join(' ').toLowerCase()
      
      return keywords.every(kw => searchText.includes(kw))
    })
  }
  
  // ==========================================================================
  // Internal Methods
  // ==========================================================================
  
  /**
   * 単一コンテキストノードをロード
   */
  private async loadContextNode(filePath: string): Promise<ContextNode> {
    const content = await this.store.read(filePath)
    const metadata = await this.store.getMetadata(filePath)
    
    const parsed = parseMarkdown(content, filePath)
    
    // .md 拡張子を除去したパス
    const path = filePath.replace(/\.md$/, '')
    
    return toContextNode(path, parsed, {
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt
    })
  }
  
  /**
   * コンテキストノードのサマリをロード
   */
  private async loadContextNodeSummary(
    filePath: string,
    allFiles: string[]
  ): Promise<ContextNodeSummary> {
    const context = await this.loadContextNode(filePath)
    
    // 子ノードをカウント
    const pathWithoutExt = filePath.replace(/\.md$/, '')
    const childFiles = allFiles.filter(f => 
      f.startsWith(pathWithoutExt + '/') && 
      f !== filePath
    )
    
    return {
      path: context.path,
      title: context.title,
      summary: context.summary,
      categories: context.categories,
      tags: context.tags,
      updatedAt: context.updatedAt,
      hasChildren: childFiles.length > 0,
      childCount: childFiles.length
    }
  }
  
  /**
   * 深さに応じた glob パターンを構築
   */
  private buildDepthPatterns(rootPath: string, depth: number): string[] {
    const patterns: string[] = []
    
    for (let d = 0; d <= depth; d++) {
      const stars = Array(d).fill('*').join('/')
      const pattern = stars 
        ? `${rootPath}/${stars}/*.md`
        : `${rootPath}/*.md`
      patterns.push(pattern)
    }
    
    return patterns
  }
  
  /**
   * Backlinks を計算
   */
  private computeBacklinks(contexts: ContextNode[]): void {
    // パスからコンテキストへのマップを作成
    const pathMap = new Map<string, ContextNode>()
    for (const ctx of contexts) {
      pathMap.set(ctx.path, ctx)
    }
    
    // 各コンテキストのリンク先を走査し、backlink を追加
    for (const ctx of contexts) {
      for (const targetPath of ctx.links.to) {
        const target = pathMap.get(targetPath)
        if (target && !target.links.from.includes(ctx.path)) {
          target.links.from.push(ctx.path)
        }
      }
    }
  }
}
