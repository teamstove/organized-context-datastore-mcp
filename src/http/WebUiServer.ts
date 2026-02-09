/**
 * Web UI サーバー
 *
 * stdio モード時に併用する HTTP サーバー。
 * /api/ocd (REST API) と /viewer (Web UI) を提供。
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { createRestRoutes } from './routes/restRoutes.js'
import { isOcdListening } from './whoisCheck.js'
import type { ServerMode } from '../types/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * WebUI ポート競合エラー
 * 
 * stdio モードでは致命的ではなく、Web UI を起動しないだけで MCP は続行可能。
 * kind で「OCD が既に起動中」と「別プロセスが使用中」を区別する。
 */
export class WebUiPortConflictError extends Error {
  constructor(
    message: string,
    /** 'ocd-conflict': 同ポートで OCD が起動中 / 'other-conflict': 別プロセスが使用中 */
    public readonly kind: 'ocd-conflict' | 'other-conflict'
  ) {
    super(message)
    this.name = 'WebUiPortConflictError'
  }
}

export interface WebUiServerOptions {
  port: number
  serverMode: ServerMode
  /** パッケージルート（web-ui の親ディレクトリ） */
  packageRoot?: string
}

/**
 * Web UI 用 HTTP サーバー
 * stdio モード時に MCP と並行して起動する
 */
export class WebUiServer {
  private app: Express
  private server: ReturnType<Express['listen']> | null = null
  private serverMode: ServerMode
  private port: number
  private packageRoot: string

  constructor(options: WebUiServerOptions) {
    this.port = options.port
    this.serverMode = options.serverMode
    this.packageRoot = options.packageRoot ?? path.resolve(__dirname, '../..')
    this.app = express()

    this.setupMiddleware()
    this.setupRoutes()
  }

  private setupMiddleware(): void {
    this.app.use(
      cors({
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      })
    )
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now()
      const requestId = (req.headers['x-request-id'] as string) ?? crypto.randomUUID().substring(0, 8)
      res.on('finish', () => {
        const duration = Date.now() - start
        console.error(`[WebUI] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms) [${requestId}]`)
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
        mode: 'web-ui',
      })
    })
    // サーバー種別判定用（重複起動時の EADDRINUSE 対策で既存プロセスが OCD かどうか確認する）
    this.app.get('/whois', (_req: Request, res: Response) => {
      res.type('text/plain').send('OCD')
    })

    // REST API
    const restRoutes = createRestRoutes(this.serverMode)
    this.app.use('/api/ocd', restRoutes)

    // Web UI 静的配信
    const webUiDistPath = path.join(this.packageRoot, 'web-ui', 'dist')
    const indexHtmlPath = path.join(webUiDistPath, 'index.html')

    if (fs.existsSync(indexHtmlPath)) {
      this.app.use('/viewer', express.static(webUiDistPath, { index: false }))
      // SPA 用: 静的ファイルにマッチしなかったパスは index.html を返す
      this.app.get(/^\/viewer\/?/, (req: Request, res: Response) => {
        res.sendFile(path.join(webUiDistPath, 'index.html'))
      })
      console.error(`[WebUI] Serving static files from ${webUiDistPath}`)
    } else {
      this.app.get('/viewer', (req: Request, res: Response) => {
        res.status(503).send(`
          <h1>Web UI not built</h1>
          <p>Run <code>npm run build:web-ui</code> in the package root, then restart.</p>
          <p>Or use <code>cd web-ui && npm run dev</code> for development.</p>
        `)
      })
      this.app.get('/viewer/*', (req: Request, res: Response) => {
        res.redirect('/viewer')
      })
      console.error(`[WebUI] web-ui/dist not found. Run 'npm run build:web-ui' to enable Web UI.`)
    }

    // 404
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({ error: `Not found: ${req.path}` })
    })
  }

  /**
   * Web UI サーバーを起動
   * 
   * ポート競合時は process.exit() せず reject を返す。
   * 呼び出し元（stdio モードの cli.ts）が graceful に処理できるようにする。
   */
  async start(): Promise<void> {
    const hostname = '0.0.0.0'
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, hostname, () => {
        console.error(`[WebUI] Server: http://localhost:${this.port}/viewer`)
        console.error(`[WebUI] API: http://localhost:${this.port}/api/ocd`)
        resolve()
      })
      this.server.once('error', (err: NodeJS.ErrnoException) => {
        // サーバーインスタンスをクリア
        this.server = null

        if (err.code === 'EADDRINUSE') {
          isOcdListening(this.port).then((isOcd) => {
            if (isOcd) {
              reject(new WebUiPortConflictError(
                `すでに同じポート (${this.port}) で OCD が起動しています。`,
                'ocd-conflict'
              ))
            } else {
              reject(new WebUiPortConflictError(
                `ポート ${this.port} は別プロセスで使用中です。`,
                'other-conflict'
              ))
            }
          }).catch(() => {
            reject(new WebUiPortConflictError(
              `ポート ${this.port} の状態を確認できませんでした。`,
              'other-conflict'
            ))
          })
        } else {
          reject(new Error(`Web UI サーバー起動エラー: ${err.message}`))
        }
      })
    })
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => {
          console.error('[WebUI] Server stopped')
          resolve()
        })
      })
    }
  }
}
