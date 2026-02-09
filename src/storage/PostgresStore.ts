/**
 * PostgresStore
 * 
 * PostgreSQL ベースの Knowledge Store 実装
 * Knex クエリビルダーを使用
 */

import type { Knex } from 'knex'
import knex from 'knex'
import type { IKnowledgeStore } from './IKnowledgeStore.js'
import { KnowledgeStoreError } from './IKnowledgeStore.js'
import type { FileMetadata, VersionEntry } from '../types/index.js'
import { MigrationRunner } from './migrations/index.js'

/**
 * PostgresStore 設定
 */
export interface PostgresStoreConfig {
  /** PostgreSQL接続文字列 */
  connectionString: string
  
  /** プロジェクトID */
  projectId: string
  
  /** 自動マイグレーション実行 */
  autoMigrate?: boolean
  
  /** コネクションプール設定 */
  pool?: {
    min?: number
    max?: number
  }
}

/**
 * コンテキストノードのDBレコード型
 */
interface ContextNodeRecord {
  id: string
  project_id: string
  path: string
  title: string
  summary: string | null
  content: string | null
  categories: string[]
  tags: string[]
  frontmatter: Record<string, unknown>
  links: { to: string[], from: string[] }
  annotations: unknown[]
  todos: unknown[]
  sections: unknown[]
  version: number
  created_at: Date
  updated_at: Date
}

/**
 * バージョン履歴のDBレコード型
 */
interface VersionRecord {
  id: string
  node_id: string
  version: number
  content: string | null
  frontmatter: Record<string, unknown>
  message: string | null
  author: string | null
  created_at: Date
}

/**
 * PostgreSQL ベースの Knowledge Store
 */
export class PostgresStore implements IKnowledgeStore {
  private db: Knex | null = null
  private readonly connectionString: string
  private readonly projectId: string
  private readonly autoMigrate: boolean
  private readonly poolConfig: { min: number, max: number }
  
  constructor(config: PostgresStoreConfig) {
    this.connectionString = config.connectionString
    this.projectId = config.projectId
    this.autoMigrate = config.autoMigrate ?? true
    this.poolConfig = {
      min: config.pool?.min ?? 2,
      max: config.pool?.max ?? 10
    }
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  /**
   * ストレージを初期化（DB接続とマイグレーション）
   */
  async initialize(): Promise<void> {
    // Knex接続の作成
    this.db = knex({
      client: 'pg',
      connection: this.connectionString,
      pool: this.poolConfig
    })
    
    // 接続テスト
    try {
      await this.db.raw('SELECT 1')
    } catch (error) {
      throw new KnowledgeStoreError(
        `Failed to connect to PostgreSQL: ${(error as Error).message}`,
        'STORAGE_ERROR',
        undefined,
        error as Error
      )
    }
    
    // 自動マイグレーション
    if (this.autoMigrate) {
      const runner = new MigrationRunner(this.db)
      await runner.runAll()
    }
    
    // プロジェクトが存在しない場合は作成
    await this.ensureProject()
  }
  
  /**
   * ストレージ接続を閉じる
   */
  async close(): Promise<void> {
    if (this.db) {
      await this.db.destroy()
      this.db = null
    }
  }
  
  /**
   * プロジェクトの存在を確認し、なければ作成
   */
  private async ensureProject(): Promise<void> {
    const db = this.getDb()
    
    const existing = await db('projects')
      .where({ id: this.projectId })
      .first()
    
    if (!existing) {
      await db('projects').insert({
        id: this.projectId,
        name: this.projectId,
        storage_type: 'postgres'
      })
    }
  }
  
  /**
   * DB接続を取得（初期化チェック付き）
   */
  private getDb(): Knex {
    if (!this.db) {
      throw new KnowledgeStoreError(
        'PostgresStore is not initialized. Call initialize() first.',
        'STORAGE_ERROR'
      )
    }
    return this.db
  }
  
  // ==========================================================================
  // Read Operations
  // ==========================================================================
  
  /**
   * パスが存在するか確認
   */
  async exists(path: string): Promise<boolean> {
    const db = this.getDb()
    const normalizedPath = this.normalizePath(path)
    
    const result = await db('context_nodes')
      .where({ project_id: this.projectId, path: normalizedPath })
      .first()
    
    return !!result
  }
  
  /**
   * コンテキストノードの内容を読み取り
   * Markdownフォーマットで返す（frontmatter + content）
   */
  async read(path: string): Promise<string> {
    const db = this.getDb()
    const normalizedPath = this.normalizePath(path)
    
    const record = await db<ContextNodeRecord>('context_nodes')
      .where({ project_id: this.projectId, path: normalizedPath })
      .first()
    
    if (!record) {
      throw new KnowledgeStoreError(
        `Not found: ${path}`,
        'NOT_FOUND',
        path
      )
    }
    
    // Markdownフォーマットに変換
    return this.toMarkdown(record)
  }
  
  /**
   * globパターンでパス一覧を取得
   * 
   * PostgreSQLのLIKE句でパターンマッチングを行う
   * - `*` → `%` (任意文字列)
   * - `**` → `%` (ディレクトリ横断)
   */
  async list(pattern: string): Promise<string[]> {
    const db = this.getDb()
    
    // globパターンをSQLパターンに変換
    const sqlPattern = this.globToSqlPattern(pattern)
    
    const records = await db('context_nodes')
      .select('path')
      .where('project_id', this.projectId)
      .whereRaw('path LIKE ?', [sqlPattern])
      .orderBy('path', 'asc')
    
    return records.map(r => r.path)
  }
  
  /**
   * 複数のglobパターンでパス一覧を取得
   */
  async listMultiple(patterns: string[]): Promise<string[]> {
    const allPaths: Set<string> = new Set()
    
    for (const pattern of patterns) {
      const paths = await this.list(pattern)
      paths.forEach(p => allPaths.add(p))
    }
    
    return [...allPaths].sort()
  }
  
  /**
   * メタデータを取得
   */
  async getMetadata(path: string): Promise<FileMetadata> {
    const db = this.getDb()
    const normalizedPath = this.normalizePath(path)
    
    const record = await db<ContextNodeRecord>('context_nodes')
      .select('path', 'created_at', 'updated_at', 'content')
      .where({ project_id: this.projectId, path: normalizedPath })
      .first()
    
    if (!record) {
      throw new KnowledgeStoreError(
        `Not found: ${path}`,
        'NOT_FOUND',
        path
      )
    }
    
    return {
      path: record.path,
      createdAt: record.created_at.toISOString(),
      updatedAt: record.updated_at.toISOString(),
      size: record.content?.length ?? 0
    }
  }
  
  // ==========================================================================
  // Write Operations
  // ==========================================================================
  
  /**
   * コンテキストノードを書き込み（作成または更新）
   * Markdownフォーマットの内容をパースして保存
   */
  async write(path: string, content: string): Promise<void> {
    const db = this.getDb()
    const normalizedPath = this.normalizePath(path)
    
    // Markdownをパースしてレコードに変換
    const record = this.parseMarkdown(content, normalizedPath)
    
    // UPSERT
    await db('context_nodes')
      .insert({
        ...record,
        project_id: this.projectId
      })
      .onConflict(['project_id', 'path'])
      .merge({
        ...record,
        version: db.raw('context_nodes.version + 1'),
        updated_at: db.fn.now()
      })
  }
  
  /**
   * コンテキストノードを削除
   */
  async delete(path: string): Promise<void> {
    const db = this.getDb()
    const normalizedPath = this.normalizePath(path)
    
    // パスがディレクトリかどうかを判定（子ノードがあるか）
    const children = await db('context_nodes')
      .where('project_id', this.projectId)
      .whereRaw('path LIKE ?', [`${normalizedPath}/%`])
      .count('id as count')
      .first()
    
    const hasChildren = Number(children?.count ?? 0) > 0
    
    if (hasChildren) {
      // ディレクトリとして削除（子ノードも含む）
      await db('context_nodes')
        .where('project_id', this.projectId)
        .where(function() {
          this.where('path', normalizedPath)
            .orWhereRaw('path LIKE ?', [`${normalizedPath}/%`])
        })
        .delete()
    } else {
      // 単一ノードを削除
      const result = await db('context_nodes')
        .where({ project_id: this.projectId, path: normalizedPath })
        .delete()
      
      if (result === 0) {
        throw new KnowledgeStoreError(
          `Not found: ${path}`,
          'NOT_FOUND',
          path
        )
      }
    }
  }
  
  /**
   * コンテキストノードを移動/リネーム
   */
  async move(fromPath: string, toPath: string): Promise<void> {
    const db = this.getDb()
    const normalizedFrom = this.normalizePath(fromPath)
    const normalizedTo = this.normalizePath(toPath)
    
    // 移動元が存在するか確認
    const exists = await this.exists(normalizedFrom)
    if (!exists) {
      throw new KnowledgeStoreError(
        `Not found: ${fromPath}`,
        'NOT_FOUND',
        fromPath
      )
    }
    
    // 子ノードも含めて移動
    await db('context_nodes')
      .where('project_id', this.projectId)
      .where(function() {
        this.where('path', normalizedFrom)
          .orWhereRaw('path LIKE ?', [`${normalizedFrom}/%`])
      })
      .update({
        path: db.raw(`REPLACE(path, ?, ?)`, [normalizedFrom, normalizedTo]),
        updated_at: db.fn.now()
      })
  }
  
  /**
   * ディレクトリを作成（PostgreSQLでは暗黙的）
   * 
   * PostgreSQLではディレクトリ構造は path で表現されるため、
   * 明示的なディレクトリ作成は不要。
   * index.md を作成することでディレクトリを表現。
   */
  async mkdir(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path)
    
    // ディレクトリを表すindex.mdが存在しなければ作成
    const indexPath = `${normalizedPath}/index`
    const exists = await this.exists(indexPath)
    
    if (!exists) {
      const content = `---
title: ${path.split('/').pop() || path}
summary: ""
---

# ${path.split('/').pop() || path}
`
      await this.write(indexPath, content)
    }
  }
  
  // ==========================================================================
  // Version Control Operations
  // ==========================================================================
  
  /**
   * 変更をコミット（バージョン履歴を作成）
   */
  async commit(message: string, paths?: string[]): Promise<string> {
    const db = this.getDb()
    const versionId = crypto.randomUUID()
    
    // 対象ノードを取得
    let query = db<ContextNodeRecord>('context_nodes')
      .where('project_id', this.projectId)
    
    if (paths && paths.length > 0) {
      query = query.whereIn('path', paths.map(p => this.normalizePath(p)))
    }
    
    const nodes = await query
    
    // 各ノードのバージョン履歴を作成
    for (const node of nodes) {
      await db('context_versions').insert({
        id: crypto.randomUUID(),
        node_id: node.id,
        version: node.version,
        content: node.content,
        frontmatter: node.frontmatter,
        message: message,
        author: 'Knowledge Graph MCP'
      })
    }
    
    return versionId
  }
  
  /**
   * バージョン履歴を取得
   */
  async getHistory(path: string, limit?: number): Promise<VersionEntry[]> {
    const db = this.getDb()
    const normalizedPath = this.normalizePath(path)
    
    const versions = await db('context_versions as v')
      .select('v.id', 'v.version', 'v.message', 'v.author', 'v.created_at')
      .join('context_nodes as n', 'v.node_id', 'n.id')
      .where('n.project_id', this.projectId)
      .where('n.path', normalizedPath)
      .orderBy('v.created_at', 'desc')
      .limit(limit ?? 50)
    
    return versions.map((v: VersionRecord) => ({
      version: v.id,
      message: v.message || '',
      author: v.author || 'Unknown',
      timestamp: v.created_at.toISOString()
    }))
  }
  
  /**
   * 特定バージョンに戻す
   */
  async revert(path: string, version: string): Promise<void> {
    const content = await this.readVersion(path, version)
    await this.write(path, content)
  }
  
  /**
   * 特定バージョンの内容を取得
   */
  async readVersion(path: string, version: string): Promise<string> {
    const db = this.getDb()
    const normalizedPath = this.normalizePath(path)
    
    const versionRecord = await db('context_versions as v')
      .select('v.content', 'v.frontmatter', 'n.title', 'n.summary', 'n.categories', 'n.tags')
      .join('context_nodes as n', 'v.node_id', 'n.id')
      .where('n.project_id', this.projectId)
      .where('n.path', normalizedPath)
      .where('v.id', version)
      .first()
    
    if (!versionRecord) {
      throw new KnowledgeStoreError(
        `Version not found: ${version}`,
        'VERSION_NOT_FOUND',
        path
      )
    }
    
    // Markdown形式で返す
    const frontmatter = {
      ...versionRecord.frontmatter,
      title: versionRecord.title,
      summary: versionRecord.summary,
      categories: versionRecord.categories,
      tags: versionRecord.tags
    }
    
    return this.formatFrontmatter(frontmatter) + '\n\n' + (versionRecord.content || '')
  }
  
  // ==========================================================================
  // Utility Methods
  // ==========================================================================
  
  /**
   * パスを正規化（.md拡張子を除去）
   */
  private normalizePath(path: string): string {
    return path.replace(/\.md$/, '')
  }
  
  /**
   * globパターンをSQLパターンに変換
   */
  private globToSqlPattern(pattern: string): string {
    return pattern
      .replace(/\*\*/g, '%')  // ** → %
      .replace(/\*/g, '%')    // *  → %
      .replace(/\?/g, '_')    // ?  → _
      .replace(/\.md$/, '')   // .md を除去
  }
  
  /**
   * DBレコードをMarkdown形式に変換
   */
  private toMarkdown(record: ContextNodeRecord): string {
    const frontmatter = {
      title: record.title,
      summary: record.summary || '',
      categories: record.categories || [],
      tags: record.tags || [],
      ...record.frontmatter
    }
    
    return this.formatFrontmatter(frontmatter) + '\n\n' + (record.content || '')
  }
  
  /**
   * フロントマターをYAML形式に変換
   */
  private formatFrontmatter(data: Record<string, unknown>): string {
    const lines = ['---']
    
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue
      
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`)
        } else {
          lines.push(`${key}:`)
          value.forEach(item => lines.push(`  - "${item}"`))
        }
      } else if (typeof value === 'string') {
        lines.push(`${key}: "${value}"`)
      } else {
        lines.push(`${key}: ${JSON.stringify(value)}`)
      }
    }
    
    lines.push('---')
    return lines.join('\n')
  }
  
  /**
   * MarkdownをパースしてDBレコードに変換
   */
  private parseMarkdown(content: string, path: string): Partial<ContextNodeRecord> {
    // フロントマターの抽出（簡易パーサー）
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n/)
    let frontmatter: Record<string, unknown> = {}
    let bodyContent = content
    
    if (frontmatterMatch) {
      frontmatter = this.parseFrontmatter(frontmatterMatch[1])
      bodyContent = content.slice(frontmatterMatch[0].length)
    }
    
    // 基本フィールドの抽出
    const title = (frontmatter.title as string) || path.split('/').pop() || 'Untitled'
    const summary = (frontmatter.summary as string) || ''
    const categories = (frontmatter.categories as string[]) || []
    const tags = (frontmatter.tags as string[]) || []
    
    // フロントマターから標準フィールドを除外
    const extraFrontmatter = { ...frontmatter }
    delete extraFrontmatter.title
    delete extraFrontmatter.summary
    delete extraFrontmatter.categories
    delete extraFrontmatter.tags
    
    return {
      path,
      title,
      summary,
      content: bodyContent.trim(),
      categories,
      tags,
      frontmatter: extraFrontmatter,
      links: { to: [], from: [] },
      annotations: [],
      todos: []
    }
  }
  
  /**
   * YAMLフロントマターをパース（簡易版）
   */
  private parseFrontmatter(yaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const lines = yaml.split('\n')
    let currentKey: string | null = null
    let currentArray: string[] | null = null
    
    for (const line of lines) {
      // 配列の要素
      if (line.match(/^\s+-\s+/)) {
        if (currentKey && currentArray) {
          const value = line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '')
          currentArray.push(value)
        }
        continue
      }
      
      // 配列の終了チェック
      if (currentKey && currentArray && !line.match(/^\s/)) {
        result[currentKey] = currentArray
        currentKey = null
        currentArray = null
      }
      
      // キー:値 のパース
      const match = line.match(/^(\w+):\s*(.*)$/)
      if (match) {
        const [, key, value] = match
        
        if (value === '' || value === undefined) {
          // 配列の開始
          currentKey = key
          currentArray = []
        } else if (value === '[]') {
          // 空配列
          result[key] = []
        } else {
          // 値を処理
          result[key] = value.replace(/^["']|["']$/g, '')
        }
      }
    }
    
    // 最後の配列を保存
    if (currentKey && currentArray) {
      result[currentKey] = currentArray
    }
    
    return result
  }
}
