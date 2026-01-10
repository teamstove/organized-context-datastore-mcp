/**
 * HTTP MCP Server
 * 
 * Express.jsベースのHTTP MCPサーバー
 * 
 * Streamable HTTP Transport (MCP 2025-03-26 仕様準拠)
 * - SSE は deprecated のため使用しない
 * - 単一 POST エンドポイントで JSON-RPC を処理
 * - マルチテナント対応
 * - local-dev / remote-server モード対応
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { ProjectRegistry, type HttpServerConfig, type ProjectConfig } from './ProjectRegistry.js'
import { createMcpRoutes, createLocalDevMcpRoutes } from './routes/mcpRoutes.js'
import type { ServerMode } from '../types/index.js'

/**
 * HTTP MCPサーバークラス
 */
export class HttpMcpServer {
  private app: Express
  private server: ReturnType<Express['listen']> | null = null
  private registry: ProjectRegistry
  private config: HttpServerConfig
  
  constructor(config: HttpServerConfig) {
    this.config = config
    this.app = express()
    this.registry = new ProjectRegistry(config)
    
    this.setupMiddleware()
    this.setupRoutes()
  }
  
  /**
   * ミドルウェアのセットアップ
   */
  private setupMiddleware(): void {
    // CORS
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
    }))
    
    // JSON パーサー
    this.app.use(express.json({ limit: '10mb' }))
    
    // リクエストログ
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now()
      const requestId = req.headers['x-request-id'] || crypto.randomUUID().substring(0, 8)
      
      res.on('finish', () => {
        const duration = Date.now() - start
        console.log(`[HTTP] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) [${requestId}]`)
      })
      
      next()
    })
  }
  
  /**
   * ルートのセットアップ
   */
  private setupRoutes(): void {
    // ヘルスチェック
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.2.0',
        transport: 'streamable-http'
      })
    })
    
    // サーバー情報
    this.app.get('/info', (req: Request, res: Response) => {
      res.json({
        name: 'knowledge-graph-mcp',
        version: '0.2.0',
        protocolVersion: '2025-03-26',
        transport: 'streamable-http',
        projects: this.registry.listProjects().map(p => ({
          id: p.id,
          name: p.name,
          storageType: p.storageType
        }))
      })
    })
    
    // プロジェクト一覧
    this.app.get('/api/projects', (req: Request, res: Response) => {
      const projects = this.registry.listProjects()
      res.json({
        projects: projects.map(p => ({
          id: p.id,
          name: p.name,
          storageType: p.storageType
        }))
      })
    })
    
    // MCPルート (Streamable HTTP)
    const mcpRoutes = createMcpRoutes(this.registry)
    this.app.use('/api/mcp', mcpRoutes)
    
    // エラーハンドラー
    this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error(`[HTTP] エラー:`, err)
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: err.message
        }
      })
    })
    
    // 404
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32001,
          message: `Not found: ${req.path}`
        }
      })
    })
  }
  
  /**
   * サーバーを起動
   */
  async start(): Promise<void> {
    // プロジェクトの初期化
    await this.registry.initialize()
    
    // HTTPサーバーの起動
    const { port, host } = this.config
    const hostname = host || '0.0.0.0'
    
    return new Promise((resolve) => {
      this.server = this.app.listen(port, hostname, () => {
        console.log(`[HttpMcpServer] サーバー起動: http://${hostname}:${port}`)
        console.log(`[HttpMcpServer] Transport: Streamable HTTP (MCP 2025-03-26)`)
        console.log(`[HttpMcpServer] 登録プロジェクト: ${this.registry.listProjects().length}件`)
        resolve()
      })
    })
  }
  
  /**
   * サーバーを停止
   */
  async stop(): Promise<void> {
    // プロジェクトをクローズ
    await this.registry.closeAll()
    
    // HTTPサーバーを停止
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.log('[HttpMcpServer] サーバー停止')
          resolve()
        })
      })
    }
  }
  
  /**
   * Expressアプリケーションを取得 (テスト用)
   */
  getApp(): Express {
    return this.app
  }
  
  /**
   * ProjectRegistryを取得
   */
  getRegistry(): ProjectRegistry {
    return this.registry
  }
}

/**
 * サーバー設定ファイルを読み込み
 */
export async function loadServerConfig(configPath: string): Promise<HttpServerConfig> {
  const fs = await import('node:fs/promises')
  const content = await fs.readFile(configPath, 'utf-8')
  const config = JSON.parse(content) as HttpServerConfig
  
  // バリデーション
  if (!config.port) {
    throw new Error('port is required in config')
  }
  
  if (!config.projects || !Array.isArray(config.projects)) {
    throw new Error('projects array is required in config')
  }
  
  return config
}

/**
 * CLIエントリポイント用のサーバー起動関数
 */
export async function startHttpServer(config: HttpServerConfig): Promise<HttpMcpServer> {
  const server = new HttpMcpServer(config)
  await server.start()
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[HttpMcpServer] シャットダウン開始...')
    await server.stop()
    process.exit(0)
  }
  
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  
  return server
}

// =============================================================================
// New API with ServerMode support
// =============================================================================

/**
 * HTTP MCP サーバー起動オプション
 */
export interface HttpMcpServerOptions {
  /** ポート番号 */
  port: number
  
  /** 設定ファイルパス (remote-server モード用) */
  configPath?: string
  
  /** サーバーモード */
  serverMode: ServerMode
}

/**
 * local-dev モード用の軽量 HTTP サーバー
 */
class LocalDevHttpServer {
  private app: Express
  private server: ReturnType<Express['listen']> | null = null
  private serverMode: ServerMode
  
  constructor(serverMode: ServerMode) {
    this.serverMode = serverMode
    this.app = express()
    
    this.setupMiddleware()
    this.setupRoutes()
  }
  
  private setupMiddleware(): void {
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id']
    }))
    
    this.app.use(express.json({ limit: '10mb' }))
    
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now()
      const requestId = req.headers['x-request-id'] || crypto.randomUUID().substring(0, 8)
      
      res.on('finish', () => {
        const duration = Date.now() - start
        console.error(`[HTTP] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) [${requestId}]`)
      })
      
      next()
    })
  }
  
  private setupRoutes(): void {
    // ヘルスチェック
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.2.0',
        transport: 'streamable-http',
        mode: 'local-dev'
      })
    })
    
    // サーバー情報
    this.app.get('/info', (req: Request, res: Response) => {
      res.json({
        name: 'organized-context-datastore-mcp',
        version: '0.2.0',
        protocolVersion: '2025-03-26',
        transport: 'streamable-http',
        serverMode: this.serverMode
      })
    })
    
    // MCP ルート (local-dev モード)
    const mcpRoutes = createLocalDevMcpRoutes(this.serverMode)
    this.app.use('/api/mcp', mcpRoutes)
    
    // エラーハンドラー
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      console.error(`[HTTP] エラー:`, err)
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: err.message
        }
      })
    })
    
    // 404
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32001,
          message: `Not found: ${req.path}`
        }
      })
    })
  }
  
  async start(port: number): Promise<void> {
    const hostname = '0.0.0.0'
    
    return new Promise((resolve) => {
      this.server = this.app.listen(port, hostname, () => {
        console.error(`[OCD-MCP] HTTP Server started: http://${hostname}:${port}`)
        console.error(`[OCD-MCP] Mode: local-dev (cwd-based config discovery)`)
        console.error(`[OCD-MCP] Readonly: ${this.serverMode.readonly}`)
        resolve()
      })
    })
  }
  
  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.error('[OCD-MCP] Server stopped')
          resolve()
        })
      })
    }
  }
}

/**
 * ServerMode 対応の HTTP MCP サーバー起動関数
 * 
 * CLI から呼び出される
 */
export async function startHttpMcpServer(options: HttpMcpServerOptions): Promise<void> {
  const { port, configPath, serverMode } = options
  
  if (serverMode.type === 'local-dev') {
    // local-dev モード: cwd ベースの動的設定解決
    const server = new LocalDevHttpServer(serverMode)
    await server.start(port)
    
    // Graceful shutdown
    const shutdown = async () => {
      console.error('\n[OCD-MCP] Shutting down...')
      await server.stop()
      process.exit(0)
    }
    
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
    
  } else {
    // remote-server モード: 設定ファイルから固定設定
    if (!configPath) {
      throw new Error('--config is required for remote-server mode')
    }
    
    const config = await loadServerConfig(configPath)
    config.port = port
    
    const server = new HttpMcpServer(config)
    await server.start()
    
    // Graceful shutdown
    const shutdown = async () => {
      console.error('\n[OCD-MCP] Shutting down...')
      await server.stop()
      process.exit(0)
    }
    
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  }
}

// Re-export types
export type { HttpServerConfig, ProjectConfig }
