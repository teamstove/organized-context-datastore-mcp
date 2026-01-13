/**
 * Project Registry
 * 
 * マルチテナント対応のプロジェクト管理
 * 各プロジェクトのKnowledgeGraphServiceインスタンスをキャッシュ
 */

import type { KnowledgeGraphMCPConfig, ContextRootConfig, WritePermissionConfig } from '../types/index.js'
import { KnowledgeGraphService } from '../KnowledgeGraphService.js'
import { FileGitStore } from '../storage/FileGitStore.js'
import { PostgresStore } from '../storage/PostgresStore.js'

/**
 * プロジェクト設定
 */
export interface ProjectConfig {
  /** プロジェクトID */
  id: string
  
  /** 表示名 */
  name: string
  
  /** ストレージタイプ */
  storageType: 'file-git' | 'postgres'
  
  /** file-git の場合のストレージパス */
  storagePath?: string
  
  /** postgres の場合の接続文字列 */
  connectionString?: string
  
  /** Context Roots 設定 */
  contextRoots?: ContextRootConfig[]
  
  /** 書き込み権限設定 */
  writePermission?: WritePermissionConfig
}

/**
 * HTTPサーバー設定
 */
export interface HttpServerConfig {
  /** ポート番号 */
  port: number
  
  /** ホスト */
  host?: string
  
  /** 登録プロジェクト */
  projects: ProjectConfig[]
  
  /** 動的ストレージを許可するか */
  allowDynamicStorage?: boolean
  
  /** 許可されたストレージパス (glob) */
  allowedStoragePaths?: string[]
}

/**
 * キャッシュされたサービスエントリ
 */
interface ServiceEntry {
  service: KnowledgeGraphService
  config: ProjectConfig
  createdAt: Date
  lastAccess: Date
}

/**
 * Project Registry
 * 
 * プロジェクト別のKnowledgeGraphServiceを管理
 */
export class ProjectRegistry {
  private services: Map<string, ServiceEntry> = new Map()
  private config: HttpServerConfig
  private dynamicServices: Map<string, ServiceEntry> = new Map()
  
  constructor(config: HttpServerConfig) {
    this.config = config
  }
  
  /**
   * 登録済みプロジェクトを初期化
   */
  async initialize(): Promise<void> {
    for (const projectConfig of this.config.projects) {
      await this.registerProject(projectConfig)
    }
  }
  
  /**
   * プロジェクトを登録
   */
  async registerProject(projectConfig: ProjectConfig): Promise<void> {
    const service = await this.createService(projectConfig)
    
    this.services.set(projectConfig.id, {
      service,
      config: projectConfig,
      createdAt: new Date(),
      lastAccess: new Date()
    })
    
    console.log(`[ProjectRegistry] プロジェクト登録: ${projectConfig.id}`)
  }
  
  /**
   * プロジェクトIDでサービスを取得
   */
  async get(projectId: string): Promise<KnowledgeGraphService | undefined> {
    const entry = this.services.get(projectId)
    
    if (entry) {
      entry.lastAccess = new Date()
      return entry.service
    }
    
    return undefined
  }
  
  /**
   * ストレージパスから動的にサービスを取得/作成
   */
  async getOrCreateFromPath(storagePath: string): Promise<KnowledgeGraphService> {
    // 既存の動的サービスを確認
    const existing = this.dynamicServices.get(storagePath)
    if (existing) {
      existing.lastAccess = new Date()
      return existing.service
    }
    
    // 動的ストレージが許可されているか確認
    if (!this.config.allowDynamicStorage) {
      throw new Error('Dynamic storage is not allowed')
    }
    
    // パスが許可リストに含まれるか確認
    if (!this.isPathAllowed(storagePath)) {
      throw new Error(`Storage path is not allowed: ${storagePath}`)
    }
    
    // 動的プロジェクト設定を作成
    const projectConfig: ProjectConfig = {
      id: `dynamic-${crypto.randomUUID().substring(0, 8)}`,
      name: storagePath.split('/').pop() || 'Dynamic Project',
      storageType: 'file-git',
      storagePath
    }
    
    const service = await this.createService(projectConfig)
    
    this.dynamicServices.set(storagePath, {
      service,
      config: projectConfig,
      createdAt: new Date(),
      lastAccess: new Date()
    })
    
    console.log(`[ProjectRegistry] 動的プロジェクト作成: ${storagePath}`)
    
    return service
  }
  
  /**
   * 登録プロジェクト一覧を取得
   */
  listProjects(): ProjectConfig[] {
    return [...this.services.values()].map(entry => entry.config)
  }
  
  /**
   * サービスを作成
   */
  private async createService(projectConfig: ProjectConfig): Promise<KnowledgeGraphService> {
    const mcpConfig = this.toMcpConfig(projectConfig)
    const service = new KnowledgeGraphService(mcpConfig)
    await service.initialize()
    return service
  }
  
  /**
   * ProjectConfig を KnowledgeGraphMCPConfig に変換
   */
  private toMcpConfig(projectConfig: ProjectConfig): KnowledgeGraphMCPConfig {
    // プロジェクトレベルの connectionString の環境変数展開
    let connectionString = projectConfig.connectionString
    if (connectionString) {
      connectionString = this.expandEnvVars(connectionString)
    }
    
    // Context Root 内の connectionString も環境変数展開
    const contextRoots = (projectConfig.contextRoots || []).map(root => {
      if (root.connectionString) {
        return {
          ...root,
          connectionString: this.expandEnvVars(root.connectionString)
        }
      }
      return root
    })
    
    return {
      storagePath: projectConfig.storagePath || '',
      storageType: projectConfig.storageType,
      connectionString,
      writePermission: projectConfig.writePermission || {
        mode: 'unrestricted'
      },
      contextRoots
    }
  }
  
  /**
   * 環境変数を展開
   * 
   * "${VAR_NAME}" -> process.env.VAR_NAME
   */
  private expandEnvVars(value: string): string {
    return value.replace(/\$\{(\w+)\}/g, (_, varName) => {
      return process.env[varName] || ''
    })
  }
  
  /**
   * パスが許可されているか確認
   */
  private isPathAllowed(storagePath: string): boolean {
    if (!this.config.allowedStoragePaths || this.config.allowedStoragePaths.length === 0) {
      return true
    }
    
    // 簡易的なglobマッチング
    for (const pattern of this.config.allowedStoragePaths) {
      const regex = this.globToRegex(pattern)
      if (regex.test(storagePath)) {
        return true
      }
    }
    
    return false
  }
  
  /**
   * Globパターンを正規表現に変換
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    
    return new RegExp(`^${escaped}$`)
  }
  
  /**
   * 全サービスをクローズ
   */
  async closeAll(): Promise<void> {
    // 登録サービスをクローズ
    for (const entry of this.services.values()) {
      await entry.service.close()
    }
    this.services.clear()
    
    // 動的サービスをクローズ
    for (const entry of this.dynamicServices.values()) {
      await entry.service.close()
    }
    this.dynamicServices.clear()
    
    console.log('[ProjectRegistry] 全サービスをクローズしました')
  }
  
  /**
   * 未使用の動的サービスをクリーンアップ
   * 
   * @param maxAge 最大アイドル時間 (ミリ秒)
   */
  async cleanupDynamicServices(maxAge: number = 30 * 60 * 1000): Promise<void> {
    const now = Date.now()
    
    for (const [path, entry] of this.dynamicServices) {
      if (now - entry.lastAccess.getTime() > maxAge) {
        console.log(`[ProjectRegistry] 動的サービスをクリーンアップ: ${path}`)
        await entry.service.close()
        this.dynamicServices.delete(path)
      }
    }
  }
}
