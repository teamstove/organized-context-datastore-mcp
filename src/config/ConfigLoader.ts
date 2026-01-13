/**
 * Config Loader
 * 
 * Organized Context Datastore MCP の設定ファイル読み込みと自動検出
 * 
 * ## 設定ファイル
 * - グローバル設定: ~/.ocd/config.js
 * - ローカル設定: .ocd.config.js (cwd から上位に探索)
 * - レガシー設定: .ocd.config.json, kgmcp.config.json (後方互換性)
 * 
 * ## JS 形式の利点
 * - コメントが書ける
 * - 環境変数の参照が可能
 * - 条件分岐が可能
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { pathToFileURL } from 'node:url'
import type { 
  KnowledgeGraphMCPConfig, 
  ContextRootConfig,
  WritePermissionConfig,
  GlobalConfig,
  LocalConfig,
  ResolvedConfig,
  GlobalContextRootConfig,
  LocalContextRootConfig
} from '../types/index.js'

// =============================================================================
// Constants
// =============================================================================

/**
 * 設定ファイル名（レガシー）
 */
export const CONFIG_FILE_NAME = 'kgmcp.config.json'

/**
 * ローカル設定ファイル名
 */
export const LOCAL_CONFIG_FILE_NAME = '.ocd.config.js'

/**
 * グローバル設定ディレクトリ
 */
export const GLOBAL_CONFIG_DIR = '.ocd'

/**
 * グローバル設定ファイル名
 */
export const GLOBAL_CONFIG_FILE_NAME = 'config.js'

/**
 * 設定ファイルの形式
 */
export interface ConfigFile {
  /** Context Roots 設定 */
  contextRoots?: ContextRootConfigInput[]
  
  /** Context Roots を自動検出するか (default: true) */
  autoDetectRoots?: boolean
  
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

// =============================================================================
// CWD-based Config Resolution (for local-dev mode)
// =============================================================================

/**
 * 設定ファイルを読み込む（JS または JSON）
 * 
 * @param filePath ファイルパス
 * @returns 設定オブジェクト
 */
async function loadConfigFile<T>(filePath: string): Promise<T | null> {
  try {
    await fs.access(filePath)
  } catch {
    return null
  }
  
  if (filePath.endsWith('.js') || filePath.endsWith('.cjs') || filePath.endsWith('.mjs')) {
    // JS ファイルは動的 import
    // キャッシュを回避するためにタイムスタンプを追加
    const fileUrl = pathToFileURL(filePath).href
    const module = await import(`${fileUrl}?t=${Date.now()}`)
    
    // ESModule (export default) と CommonJS (module.exports) の両方に対応
    // module.default が存在すれば ESModule
    // そうでなければ CommonJS (module 自体がエクスポート)
    if (module.default !== undefined) {
      return module.default as T
    }
    
    // CommonJS の場合、module には named exports が含まれる
    // 空でないオブジェクトであればそれを返す
    const keys = Object.keys(module).filter(k => k !== '__esModule')
    if (keys.length > 0) {
      // named exports がある場合は module 自体を返す
      const result: Record<string, unknown> = {}
      for (const key of keys) {
        result[key] = module[key]
      }
      return result as T
    }
    
    return null
  } else {
    // JSON ファイル
    const content = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(content) as T
  }
}

/**
 * グローバル設定を読み込む
 * 
 * @returns グローバル設定（見つからない場合は空オブジェクト）
 */
export async function loadGlobalConfig(): Promise<GlobalConfig> {
  const configPath = path.join(os.homedir(), GLOBAL_CONFIG_DIR, GLOBAL_CONFIG_FILE_NAME)
  const config = await loadConfigFile<GlobalConfig>(configPath)
  return config ?? {}
}

/**
 * cwd から上位に向かって設定ファイルを探索
 * 
 * @param cwd 作業ディレクトリ
 * @returns ローカル設定と設定ファイルのパス（見つからない場合は undefined）
 */
export async function findLocalConfig(cwd: string): Promise<{ config: LocalConfig; configPath: string } | undefined> {
  let currentDir = path.resolve(cwd)
  const root = path.parse(currentDir).root
  
  while (currentDir !== root) {
    const configPath = path.join(currentDir, LOCAL_CONFIG_FILE_NAME)
    const config = await loadConfigFile<LocalConfig>(configPath)
    
    if (config) {
      return { config, configPath }
    }
    
    currentDir = path.dirname(currentDir)
  }
  
  return undefined
}

/**
 * cwd から設定を解決
 * 
 * 1. cwd から上位に .ocd.config.json を探索
 * 2. 見つかった場合: ローカル設定を読み込み
 * 3. inheritGlobal が true (デフォルト) の場合: グローバル設定とマージ
 * 4. 見つからない場合: cwd を Context Root として使用
 * 
 * @param cwd 作業ディレクトリ
 * @returns 解決済み設定
 */
export async function resolveConfigFromCwd(cwd: string): Promise<ResolvedConfig> {
  // ローカル設定を探索
  const localResult = await findLocalConfig(cwd)
  
  // グローバル設定を読み込み
  const globalConfig = await loadGlobalConfig()
  
  if (localResult) {
    // ローカル設定が見つかった
    const { config: localConfig, configPath } = localResult
    const projectDir = path.dirname(configPath)
    
    // Context Roots を解決
    const contextRoots: ContextRootConfig[] = []
    
    // ローカル Context Roots（重複検出付き）
    if (localConfig.contextRoots) {
      const seenIds = new Set<string>()
      for (const root of localConfig.contextRoots) {
        const resolved = resolveLocalContextRoot(root, projectDir)
        if (seenIds.has(resolved.id)) {
          console.error(`[OCD-MCP] Warning: Duplicate id "${resolved.id}" in contextRoots. Consider adding explicit id to avoid conflicts.`)
        }
        seenIds.add(resolved.id)
        contextRoots.push(resolved)
      }
    }
    
    // グローバル Context Roots をマージ
    if (localConfig.inheritGlobal !== false && globalConfig.globalContextRoots) {
      for (const root of globalConfig.globalContextRoots) {
        // 既存の ID と重複しない場合のみ追加
        if (!contextRoots.some(r => r.id === root.id)) {
          contextRoots.push(resolveGlobalContextRoot(root))
        }
      }
    }
    
    return {
      configPath,
      contextRoots,
      writePermission: localConfig.writePermission ?? { mode: 'unrestricted' }
    }
  }
  
  // ローカル設定が見つからない場合: cwd を Context Root として使用
  const cwdContextRoot: ContextRootConfig = {
    id: slugify(path.basename(cwd)),
    name: path.basename(cwd),
    path: cwd,
    description: `Auto-detected from cwd: ${cwd}`
  }
  
  // グローバル Context Roots も追加
  const contextRoots: ContextRootConfig[] = [cwdContextRoot]
  
  if (globalConfig.globalContextRoots) {
    for (const root of globalConfig.globalContextRoots) {
      contextRoots.push(resolveGlobalContextRoot(root))
    }
  }
  
  return {
    contextRoots,
    writePermission: { mode: 'unrestricted' }
  }
}

/**
 * ローカル Context Root 設定を解決
 */
function resolveLocalContextRoot(root: LocalContextRootConfig, projectDir: string): ContextRootConfig {
  // 相対パスを絶対パスに解決
  const absolutePath = path.isAbsolute(root.path)
    ? root.path
    : path.resolve(projectDir, root.path)
  
  return {
    id: root.id ?? slugify(path.basename(root.path)),
    name: root.name ?? path.basename(root.path),
    path: absolutePath,
    description: root.description,
    readOnly: root.readOnly,
    git: root.git,
    ignorePatterns: root.ignorePatterns,
    includePatterns: root.includePatterns,
    defaultExtension: root.defaultExtension
  }
}

/**
 * グローバル Context Root 設定を解決
 */
function resolveGlobalContextRoot(root: GlobalContextRootConfig): ContextRootConfig {
  return {
    id: root.id,
    name: root.name,
    path: root.path,
    description: root.description,
    readOnly: root.readOnly ?? true, // グローバルはデフォルトで読み取り専用
    git: root.git,
    ignorePatterns: root.ignorePatterns,
    includePatterns: root.includePatterns
  }
}

/**
 * 文字列をスラッグ化（スタンドアロン関数）
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * 解決済み設定から KnowledgeGraphMCPConfig を生成
 */
export function resolvedConfigToMcpConfig(resolved: ResolvedConfig, storagePath: string): KnowledgeGraphMCPConfig {
  return {
    storagePath,
    storageType: 'file-git',
    writePermission: resolved.writePermission,
    contextRoots: resolved.contextRoots
  }
}
