/**
 * Config Loader
 * 
 * Knowledge Graph MCP の設定ファイル読み込みと自動検出
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { 
  KnowledgeGraphMCPConfig, 
  ContextRootConfig,
  VersionControlMode,
  WritePermissionConfig
} from '../types/index.js'

/**
 * 設定ファイル名
 */
export const CONFIG_FILE_NAME = 'kgmcp.config.json'

/**
 * 設定ファイルの形式
 */
export interface ConfigFile {
  /** Context Roots 設定 */
  contextRoots?: ContextRootConfigInput[]
  
  /** Context Roots を自動検出するか (default: true) */
  autoDetectRoots?: boolean
  
  /** バージョン管理モード (default: immediate) */
  versionControlMode?: VersionControlMode
  
  /** 書き込み権限設定 */
  writePermission?: WritePermissionConfig
  
  /** 読み取り専用パス (denylist に追加) */
  readOnlyPaths?: string[]
}

/**
 * Context Root 設定の入力形式
 */
export interface ContextRootConfigInput {
  /** ID (省略時はパスから生成) */
  id?: string
  
  /** 表示名 (省略時はパスから生成) */
  name?: string
  
  /** パス */
  path: string
  
  /** 説明 */
  description?: string
  
  /** 読み取り専用フラグ */
  readOnly?: boolean
}

/**
 * 設定ローダー
 */
export class ConfigLoader {
  private readonly storagePath: string
  
  constructor(storagePath: string) {
    this.storagePath = storagePath
  }
  
  /**
   * 設定を読み込み
   * 
   * 1. 設定ファイルがあれば読み込む
   * 2. autoDetectRoots が true (デフォルト) ならサブディレクトリを検出
   * 3. 設定をマージして返す
   */
  async load(): Promise<KnowledgeGraphMCPConfig> {
    // 設定ファイルを読み込み
    const configFile = await this.loadConfigFile()
    
    // Context Roots を決定
    let contextRoots: ContextRootConfig[] = []
    
    // 設定ファイルで指定された Context Roots
    if (configFile.contextRoots) {
      contextRoots = configFile.contextRoots.map(r => this.normalizeContextRoot(r))
    }
    
    // 自動検出
    if (configFile.autoDetectRoots !== false) {
      const detected = await this.detectContextRoots()
      
      // 既存の設定とマージ（設定ファイル優先）
      for (const root of detected) {
        if (!contextRoots.some(r => r.path === root.path)) {
          contextRoots.push(root)
        }
      }
    }
    
    // 書き込み権限を構築
    const writePermission = this.buildWritePermission(configFile, contextRoots)
    
    return {
      storagePath: this.storagePath,
      storageType: 'file-git',
      versionControlMode: configFile.versionControlMode ?? 'immediate',
      writePermission,
      contextRoots
    }
  }
  
  /**
   * 設定ファイルを読み込み
   */
  private async loadConfigFile(): Promise<ConfigFile> {
    const configPath = path.join(this.storagePath, CONFIG_FILE_NAME)
    
    try {
      const content = await fs.readFile(configPath, 'utf-8')
      return JSON.parse(content) as ConfigFile
    } catch {
      // 設定ファイルがなければデフォルト
      return {
        autoDetectRoots: true
      }
    }
  }
  
  /**
   * Context Roots を自動検出
   * 
   * ストレージパス直下のディレクトリで、
   * index.md または README.md があるものを Context Root とする
   */
  private async detectContextRoots(): Promise<ContextRootConfig[]> {
    const roots: ContextRootConfig[] = []
    
    try {
      const entries = await fs.readdir(this.storagePath, { withFileTypes: true })
      
      for (const entry of entries) {
        // ディレクトリのみ
        if (!entry.isDirectory()) continue
        
        // 隠しディレクトリはスキップ
        if (entry.name.startsWith('.')) continue
        
        // node_modules などはスキップ
        if (entry.name === 'node_modules') continue
        
        const dirPath = path.join(this.storagePath, entry.name)
        
        // index.md または README.md があるか確認
        const hasIndex = await this.hasIndexFile(dirPath)
        
        if (hasIndex) {
          // index.md から情報を抽出
          const info = await this.extractRootInfo(dirPath, entry.name)
          roots.push(info)
        } else {
          // .md ファイルが1つ以上あればContext Rootとして扱う
          const hasMdFiles = await this.hasMdFiles(dirPath)
          if (hasMdFiles) {
            roots.push({
              id: this.slugify(entry.name),
              name: entry.name,
              path: entry.name,
              description: undefined
            })
          }
        }
      }
    } catch (error) {
      console.warn('Failed to detect context roots:', error)
    }
    
    return roots
  }
  
  /**
   * index.md または README.md があるか確認
   */
  private async hasIndexFile(dirPath: string): Promise<boolean> {
    const candidates = ['index.md', 'README.md']
    
    for (const file of candidates) {
      try {
        await fs.access(path.join(dirPath, file))
        return true
      } catch {
        // ファイルなし
      }
    }
    
    return false
  }
  
  /**
   * .md ファイルがあるか確認
   */
  private async hasMdFiles(dirPath: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dirPath)
      return entries.some(e => e.endsWith('.md'))
    } catch {
      return false
    }
  }
  
  /**
   * index.md から Context Root 情報を抽出
   */
  private async extractRootInfo(dirPath: string, dirName: string): Promise<ContextRootConfig> {
    const indexPath = path.join(dirPath, 'index.md')
    
    try {
      const content = await fs.readFile(indexPath, 'utf-8')
      
      // Frontmatter から title と summary を抽出
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
      
      if (frontmatterMatch) {
        const frontmatter = frontmatterMatch[1]
        
        const titleMatch = frontmatter.match(/^title:\s*(.+)$/m)
        const summaryMatch = frontmatter.match(/^summary:\s*(.+)$/m)
        
        return {
          id: this.slugify(dirName),
          name: titleMatch?.[1] ?? dirName,
          path: dirName,
          description: summaryMatch?.[1]
        }
      }
    } catch {
      // ファイル読み込み失敗
    }
    
    return {
      id: this.slugify(dirName),
      name: dirName,
      path: dirName,
      description: undefined
    }
  }
  
  /**
   * Context Root 設定を正規化
   */
  private normalizeContextRoot(input: ContextRootConfigInput): ContextRootConfig {
    return {
      id: input.id ?? this.slugify(input.path),
      name: input.name ?? input.path,
      path: input.path,
      description: input.description,
      readOnly: input.readOnly
    }
  }
  
  /**
   * 書き込み権限を構築
   */
  private buildWritePermission(
    config: ConfigFile, 
    roots: ContextRootConfig[]
  ): WritePermissionConfig {
    // readOnly な roots と readOnlyPaths をマージ
    const deniedPaths: string[] = []
    
    for (const root of roots) {
      if (root.readOnly) {
        deniedPaths.push(`${root.path}/**`)
      }
    }
    
    if (config.readOnlyPaths) {
      deniedPaths.push(...config.readOnlyPaths)
    }
    
    if (config.writePermission) {
      return {
        ...config.writePermission,
        deniedPaths: [
          ...(config.writePermission.deniedPaths ?? []),
          ...deniedPaths
        ]
      }
    }
    
    if (deniedPaths.length > 0) {
      return {
        mode: 'denylist',
        deniedPaths
      }
    }
    
    return { mode: 'unrestricted' }
  }
  
  /**
   * 文字列をスラッグ化
   */
  private slugify(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }
}

/**
 * 設定を読み込んで KnowledgeGraphMCPConfig を返す
 */
export async function loadConfig(storagePath: string): Promise<KnowledgeGraphMCPConfig> {
  const loader = new ConfigLoader(storagePath)
  return loader.load()
}
