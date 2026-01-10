/**
 * HTTP MCP Server
 * 
 * Express.jsベースのHTTP MCPサーバー
 * 
 * Streamable HTTP Transport (MCP 2025-03-26 仕様準拠)
 * - SSE は deprecated のため使用しない
 * - 単一 POST エンドポイントで JSON-RPC を処理
 * - マルチテナント対応
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import { ProjectRegistry, type HttpServerConfig, type ProjectConfig } from './ProjectRegistry.js'
import { createMcpRoutes } from './routes/mcpRoutes.js'

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

// Re-export types
export type { HttpServerConfig, ProjectConfig }
