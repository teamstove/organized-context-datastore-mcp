/**
 * FileGitStore
 * 
 * ファイルシステム + Git ベースの Knowledge Store 実装
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { glob } from 'glob'
import { simpleGit, type SimpleGit } from 'simple-git'
import type { IKnowledgeStore } from './IKnowledgeStore.js'
import { KnowledgeStoreError } from './IKnowledgeStore.js'
import type { FileMetadata, VersionEntry } from '../types/index.js'

/**
 * デフォルトの除外パターン
 * 
 * これらは明示的に指定しなくても常に除外される。
 * 除外を解除したい場合は ignorePatterns に `!node_modules` のように指定する。
 */
export const DEFAULT_IGNORE_PATTERNS = [
  // バージョン管理
  '.git/**',
  '.svn/**',
  '.hg/**',
  
  // パッケージマネージャー
  'node_modules/**',
  'bower_components/**',
  '.pnpm/**',
  
  // ビルド出力
  'dist/**',
  'build/**',
  'out/**',
  '.next/**',
  '.nuxt/**',
  
  // キャッシュ・一時ファイル
  '.cache/**',
  '.tmp/**',
  '.temp/**',
  '*.log',
  
  // IDE・エディタ
  '.idea/**',
  '.vscode/**',
  '*.swp',
  '*.swo',
  '.DS_Store',
  
  // テスト・カバレッジ
  'coverage/**',
  '.nyc_output/**',
]

/**
 * Git コミット設定
 */
export type GitMode = 'auto-commit' | 'manual' | 'none'

/**
 * FileGitStore 設定
 */
export interface FileGitStoreConfig {
  /** ルートディレクトリ */
  rootPath: string
  
  /**
   * Git コミット設定
   * - 'auto-commit': 各操作後に自動コミット
   * - 'manual': commit ツールで明示的にコミット（デフォルト）
   * - 'none': Git を使用しない
   */
  git?: GitMode
  
  /** コミット著者名 */
  authorName?: string
  
  /** コミット著者メール */
  authorEmail?: string
  
  /**
   * 除外パターン (glob 形式)
   * 
   * 例: ['node_modules/**', 'dist/**', '*.test.md']
   */
  ignorePatterns?: string[]
  
  /**
   * 対象ファイルパターン (glob 形式)
   * 
   * デフォルト: **\/*.md
   */
  includePatterns?: string[]
  
  // ==========================================================================
  // 後方互換性のための旧フィールド（非推奨）
  // ==========================================================================
  
  /** @deprecated git: 'none' を使用してください */
  useGit?: boolean
  
  /** @deprecated git: 'auto-commit' を使用してください */
  autoCommit?: boolean
}

/**
 * ファイルシステム + Git ベースの Knowledge Store
 */
export class FileGitStore implements IKnowledgeStore {
  private readonly rootPath: string
  private readonly gitMode: GitMode
  private git: SimpleGit | null = null
  private readonly authorName: string
  private readonly authorEmail: string
  private readonly ignorePatterns: string[]
  private readonly includePatterns: string[]
  
  constructor(config: FileGitStoreConfig) {
    this.rootPath = path.resolve(config.rootPath)
    this.authorName = config.authorName ?? 'Knowledge Graph MCP'
    this.authorEmail = config.authorEmail ?? 'kg-mcp@localhost'
    this.includePatterns = config.includePatterns ?? ['**/*.md']
    
    // Git モードの決定（新しい git フィールドを優先、旧フィールドは後方互換）
    if (config.git) {
      this.gitMode = config.git
    } else if (config.useGit === false) {
      // 旧 useGit: false は git: 'none' と同等
      this.gitMode = 'none'
    } else if (config.autoCommit === true) {
      // 旧 autoCommit: true は git: 'auto-commit' と同等
      this.gitMode = 'auto-commit'
    } else {
      // デフォルトは 'manual'（手動コミット）
      this.gitMode = 'manual'
    }
    
    // ignorePatterns の処理:
    // 1. デフォルトパターンをベースにする
    // 2. ユーザー指定のパターンを追加
    // 3. `!pattern` 形式で除外解除が可能
    this.ignorePatterns = this.resolveIgnorePatterns(config.ignorePatterns ?? [])
  }
  
  /** Git を使用するか */
  private get useGit(): boolean {
    return this.gitMode !== 'none'
  }
  
  /** 自動コミットを行うか */
  private get autoCommit(): boolean {
    return this.gitMode === 'auto-commit'
  }
  
  /**
   * ignore patterns を解決
   * 
   * - デフォルトパターンをベースに
   * - ユーザー指定の `!pattern` で除外解除
   * - ユーザー指定の通常パターンを追加
   */
  private resolveIgnorePatterns(userPatterns: string[]): string[] {
    // 除外解除パターン（!で始まるもの）を抽出
    const negations = userPatterns
      .filter(p => p.startsWith('!'))
      .map(p => p.slice(1)) // ! を除去
    
    // 追加パターン（!で始まらないもの）を抽出
    const additions = userPatterns.filter(p => !p.startsWith('!'))
    
    // デフォルトから除外解除パターンを除く
    const effectiveDefaults = DEFAULT_IGNORE_PATTERNS.filter(defaultPattern => {
      // negations に含まれるパターンは除外しない
      return !negations.some(neg => {
        // 完全一致または前方一致（例: !node_modules で node_modules/** も解除）
        return defaultPattern === neg || 
               defaultPattern.startsWith(neg + '/') ||
               defaultPattern.startsWith(neg + '/**')
      })
    })
    
    // デフォルト + ユーザー追加パターン
    return [...effectiveDefaults, ...additions]
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  async initialize(): Promise<void> {
    // ルートディレクトリの存在確認
    try {
      await fs.access(this.rootPath)
    } catch {
      // ディレクトリが存在しない場合は作成
      await fs.mkdir(this.rootPath, { recursive: true })
    }
    
    // Git 初期化
    if (this.useGit) {
      this.git = simpleGit(this.rootPath)
      
      // Git リポジトリかどうか確認
      const isRepo = await this.git.checkIsRepo()
      if (!isRepo) {
        // 新規 Git リポジトリを初期化
        await this.git.init()
      }
    }
  }
  
  async close(): Promise<void> {
    // 特に必要な処理なし
    this.git = null
  }
  
  // ==========================================================================
  // Read Operations
  // ==========================================================================
  
  async exists(relativePath: string): Promise<boolean> {
    const fullPath = this.toFullPath(relativePath)
    try {
      await fs.access(fullPath)
      return true
    } catch {
      return false
    }
  }
  
  async read(relativePath: string): Promise<string> {
    const fullPath = this.toFullPath(relativePath)
    try {
      return await fs.readFile(fullPath, 'utf-8')
    } catch (error) {
      throw new KnowledgeStoreError(
        `Failed to read: ${relativePath}`,
        'NOT_FOUND',
        relativePath,
        error as Error
      )
    }
  }
  
  async list(pattern: string): Promise<string[]> {
    // 具体的なパス（* を含まない、.md で終わらない）の場合は
    // 複数のパターンでマッチを試みる
    const expandedPatterns = this.expandPattern(pattern)
    
    const allFiles: Set<string> = new Set()
    
    for (const p of expandedPatterns) {
      const files = await glob(p, {
        cwd: this.rootPath,
        nodir: true,
        ignore: this.ignorePatterns
      })
      for (const file of files) {
        allFiles.add(file)
      }
    }
    
    return [...allFiles].sort()
  }
  
  /**
   * includePatterns を考慮したファイル一覧を取得
   * 
   * @param subPath サブパス（ルートからの相対）
   * @returns ファイルパス一覧
   */
  async listWithIncludePatterns(subPath: string = ''): Promise<string[]> {
    const allFiles: Set<string> = new Set()
    
    // 各 includePattern に対して検索
    for (const includePattern of this.includePatterns) {
      // subPath と includePattern を組み合わせる
      const fullPattern = subPath 
        ? `${subPath}/${includePattern.replace(/^\*\*\//, '')}` 
        : includePattern
      
      const files = await this.list(fullPattern)
      for (const file of files) {
        allFiles.add(file)
      }
    }
    
    return [...allFiles].sort()
  }
  
  async listMultiple(patterns: string[]): Promise<string[]> {
    const allFiles: Set<string> = new Set()
    
    for (const pattern of patterns) {
      const files = await this.list(pattern)
      for (const file of files) {
        allFiles.add(file)
      }
    }
    
    return [...allFiles].sort()
  }
  
  /**
   * パターンを拡張
   * 
   * 具体的なパス（* を含まない、.md で終わらない）の場合、
   * 複数のパターンに展開してファイルを見つけやすくする
   * 
   * 例: "docs/feature" → ["docs/feature", "docs/feature.md", "docs/feature/**\/*.md"]
   */
  private expandPattern(pattern: string): string[] {
    // 既にワイルドカードを含む場合はそのまま
    if (pattern.includes('*')) {
      return [pattern]
    }
    
    // .md で終わる場合はそのまま
    if (pattern.endsWith('.md')) {
      return [pattern]
    }
    
    // 空の場合は全ファイル
    if (pattern === '' || pattern === '.') {
      return ['**/*.md']
    }
    
    // 具体的なパスの場合は複数パターンに展開
    return [
      pattern,                        // そのままのパス（ディレクトリの場合）
      `${pattern}.md`,                // 拡張子を追加
      `${pattern}/**/*.md`            // ディレクトリ配下の全ファイル
    ]
  }
  
  async getMetadata(relativePath: string): Promise<FileMetadata> {
    const fullPath = this.toFullPath(relativePath)
    try {
      const stats = await fs.stat(fullPath)
      return {
        path: relativePath,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
        size: stats.size
      }
    } catch (error) {
      throw new KnowledgeStoreError(
        `Failed to get metadata: ${relativePath}`,
        'NOT_FOUND',
        relativePath,
        error as Error
      )
    }
  }
  
  // ==========================================================================
  // Write Operations
  // ==========================================================================
  
  async write(relativePath: string, content: string): Promise<void> {
    const fullPath = this.toFullPath(relativePath)
    const gitPath = this.toGitPath(relativePath)
    
    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(fullPath)
    await fs.mkdir(dir, { recursive: true })
    
    // ファイルに書き込み
    await fs.writeFile(fullPath, content, 'utf-8')
    
    // 自動コミット
    if (this.autoCommit && this.git) {
      await this.git.add(gitPath)
      await this.git.commit(`Update ${relativePath}`, [gitPath], {
        '--author': `${this.authorName} <${this.authorEmail}>`
      })
    }
  }
  
  async delete(relativePath: string): Promise<void> {
    // ファイルかディレクトリかを判定
    const isDir = await this.isDirectory(relativePath)
    
    if (isDir) {
      await this.deleteDirectory(relativePath)
    } else {
      await this.deleteFile(relativePath)
    }
  }
  
  /**
   * ファイルを削除
   */
  private async deleteFile(relativePath: string): Promise<void> {
    const fullPath = this.toFullPath(relativePath)
    const gitPath = this.toGitPath(relativePath)
    try {
      await fs.unlink(fullPath)
      
      // 自動コミット
      if (this.autoCommit && this.git) {
        await this.git.rm(gitPath)
        await this.git.commit(`Delete ${relativePath}`, {
          '--author': `${this.authorName} <${this.authorEmail}>`
        })
      }
    } catch (error) {
      throw new KnowledgeStoreError(
        `Failed to delete: ${relativePath}`,
        'NOT_FOUND',
        relativePath,
        error as Error
      )
    }
  }
  
  /**
   * ディレクトリを削除（配下の全ファイル含む）
   */
  private async deleteDirectory(relativePath: string): Promise<void> {
    const fullPath = path.join(this.rootPath, relativePath)
    
    try {
      // 配下のファイル一覧を取得（Git用）
      const files = await this.list(`${relativePath}/**/*.md`)
      
      // ディレクトリを削除
      await fs.rm(fullPath, { recursive: true, force: true })
      
      // 自動コミット
      if (this.autoCommit && this.git && files.length > 0) {
        for (const file of files) {
          await this.git.rm(file)
        }
        await this.git.commit(`Delete directory ${relativePath}`, {
          '--author': `${this.authorName} <${this.authorEmail}>`
        })
      }
    } catch (error) {
      throw new KnowledgeStoreError(
        `Failed to delete directory: ${relativePath}`,
        'STORAGE_ERROR',
        relativePath,
        error as Error
      )
    }
  }
  
  async move(fromPath: string, toPath: string): Promise<void> {
    // ファイルかディレクトリかを判定
    const isDir = await this.isDirectory(fromPath)
    
    if (isDir) {
      await this.moveDirectory(fromPath, toPath)
    } else {
      await this.moveFile(fromPath, toPath)
    }
  }
  
  /**
   * ファイルを移動
   */
  private async moveFile(fromPath: string, toPath: string): Promise<void> {
    const fromFull = this.toFullPath(fromPath)
    const toFull = this.toFullPath(toPath)
    const fromGit = this.toGitPath(fromPath)
    const toGit = this.toGitPath(toPath)
    
    // 移動先ディレクトリを作成
    const toDir = path.dirname(toFull)
    await fs.mkdir(toDir, { recursive: true })
    
    // ファイルを移動
    await fs.rename(fromFull, toFull)
    
    // 自動コミット (Git mv)
    if (this.autoCommit && this.git) {
      await this.git.add(toGit)
      await this.git.rm(fromGit)
      await this.git.commit(`Move ${fromPath} to ${toPath}`, {
        '--author': `${this.authorName} <${this.authorEmail}>`
      })
    }
  }
  
  /**
   * ディレクトリを移動（配下の全ファイル含む）
   */
  private async moveDirectory(fromPath: string, toPath: string): Promise<void> {
    const fromFull = path.join(this.rootPath, fromPath)
    const toFull = path.join(this.rootPath, toPath)
    
    // 移動先の親ディレクトリを作成
    const toDir = path.dirname(toFull)
    await fs.mkdir(toDir, { recursive: true })
    
    // 配下のファイル一覧を取得（Git用）
    const files = await this.list(`${fromPath}/**/*.md`)
    
    // ディレクトリを移動
    await fs.rename(fromFull, toFull)
    
    // 自動コミット
    if (this.autoCommit && this.git && files.length > 0) {
      // 新しいファイルパスを追加
      for (const file of files) {
        const newPath = file.replace(fromPath, toPath)
        await this.git.add(newPath)
      }
      // 古いファイルを削除
      for (const file of files) {
        await this.git.rm(file)
      }
      await this.git.commit(`Move directory ${fromPath} to ${toPath}`, {
        '--author': `${this.authorName} <${this.authorEmail}>`
      })
    }
  }
  
  /**
   * パスがディレクトリかどうかを判定
   */
  private async isDirectory(relativePath: string): Promise<boolean> {
    // まずディレクトリとして存在するか確認
    const dirPath = path.join(this.rootPath, relativePath)
    try {
      const stat = await fs.stat(dirPath)
      return stat.isDirectory()
    } catch {
      // ディレクトリとして存在しない場合はファイルとして扱う
      return false
    }
  }
  
  async mkdir(relativePath: string): Promise<void> {
    const fullPath = this.toFullPath(relativePath)
    await fs.mkdir(fullPath, { recursive: true })
  }
  
  // ==========================================================================
  // Version Control Operations
  // ==========================================================================
  
  async commit(message: string, paths?: string[]): Promise<string> {
    if (!this.git) {
      // Git が有効でない場合はスキップ（エラーにしない）
      console.error(`[FileGitStore] Git not enabled, skipping commit: ${message}`)
      return ''
    }
    
    // ステージング
    if (paths && paths.length > 0) {
      await this.git.add(paths)
    } else {
      await this.git.add('.')
    }
    
    // コミット
    const result = await this.git.commit(message, {
      '--author': `${this.authorName} <${this.authorEmail}>`
    })
    
    return result.commit
  }
  
  async getHistory(relativePath: string, limit?: number): Promise<VersionEntry[]> {
    if (!this.git) {
      return []
    }
    
    try {
      const log = await this.git.log({
        file: relativePath,
        maxCount: limit ?? 50
      })
      
      return log.all.map(entry => ({
        version: entry.hash,
        message: entry.message,
        author: entry.author_name,
        timestamp: entry.date
      }))
    } catch {
      return []
    }
  }
  
  async revert(relativePath: string, version: string): Promise<void> {
    if (!this.git) {
      throw new KnowledgeStoreError(
        'Git is not enabled',
        'COMMIT_FAILED'
      )
    }
    
    // 特定バージョンの内容を取得
    const content = await this.readVersion(relativePath, version)
    
    // 現在のファイルに書き込み
    await this.write(relativePath, content)
    
    // コミット
    await this.commit(`Revert ${relativePath} to ${version.substring(0, 7)}`)
  }
  
  async readVersion(relativePath: string, version: string): Promise<string> {
    if (!this.git) {
      throw new KnowledgeStoreError(
        'Git is not enabled',
        'VERSION_NOT_FOUND'
      )
    }
    
    try {
      const content = await this.git.show([`${version}:${relativePath}`])
      return content
    } catch (error) {
      throw new KnowledgeStoreError(
        `Version not found: ${version}`,
        'VERSION_NOT_FOUND',
        relativePath,
        error as Error
      )
    }
  }
  
  // ==========================================================================
  // Utility
  // ==========================================================================
  
  /**
   * 相対パスをフルパスに変換
   */
  private toFullPath(relativePath: string): string {
    // .md 拡張子がなければ追加
    const normalized = this.toGitPath(relativePath)
    return path.join(this.rootPath, normalized)
  }
  
  /**
   * Git用のパスに変換（.md拡張子を追加）
   */
  private toGitPath(relativePath: string): string {
    if (!relativePath.endsWith('.md')) {
      return `${relativePath}.md`
    }
    return relativePath
  }
}
