/**
 * REST API Routes
 *
 * MCP ツールをラップする REST API エンドポイント
 * フロントエンドから直接呼び出しやすい形式で提供
 */

import { Router, type Request, type Response } from 'express'
import type { KnowledgeGraphService } from '../../KnowledgeGraphService.js'
import type { ServerMode, ContextMutation } from '../../types/index.js'
import { resolveConfigFromCwd, resolvedConfigToMcpConfig } from '../../config/ConfigLoader.js'
import { KnowledgeGraphService as KGServiceClass } from '../../KnowledgeGraphService.js'

// =============================================================================
// サービスキャッシュ
// =============================================================================

/**
 * サービスキャッシュ (cwd -> service)
 */
const serviceCache = new Map<string, { service: KnowledgeGraphService; createdAt: Date }>()

/**
 * キャッシュのクリーンアップ (30分経過したエントリを削除)
 */
function cleanupServiceCache(): void {
  const now = Date.now()
  const maxAge = 30 * 60 * 1000 // 30分

  for (const [cwd, entry] of serviceCache) {
    if (now - entry.createdAt.getTime() > maxAge) {
      console.error(`[REST] Cleaning up cached service for: ${cwd}`)
      entry.service.close().catch(console.error)
      serviceCache.delete(cwd)
    }
  }
}

// 5分ごとにクリーンアップ
setInterval(cleanupServiceCache, 5 * 60 * 1000)

/**
 * cwd からサービスを解決
 */
async function resolveServiceFromCwd(cwd: string): Promise<KnowledgeGraphService> {
  // キャッシュをチェック
  const cached = serviceCache.get(cwd)
  if (cached) {
    return cached.service
  }

  // 設定を解決
  const resolvedConfig = await resolveConfigFromCwd(cwd)

  // ストレージパスを決定 (最初の Context Root のパス、または cwd)
  const storagePath = resolvedConfig.contextRoots[0]?.path || cwd

  // MCP 設定に変換
  const mcpConfig = resolvedConfigToMcpConfig(resolvedConfig, storagePath)

  // サービスを作成
  const service = new KGServiceClass(mcpConfig)
  await service.initialize()

  // キャッシュに保存
  serviceCache.set(cwd, { service, createdAt: new Date() })

  console.error(`[REST] Created service for cwd: ${cwd}`)
  console.error(`[REST] Context Roots: ${resolvedConfig.contextRoots.map((r) => r.name).join(', ')}`)

  return service
}

// =============================================================================
// REST API ルーター
// =============================================================================

/**
 * REST API ルーター作成
 *
 * エンドポイント:
 * - GET  /api/ocd/roots              - Context Root 一覧
 * - GET  /api/ocd/tree               - Context ツリー
 * - GET  /api/ocd/contexts           - Context 一覧（パターン指定）
 * - GET  /api/ocd/context/:path      - 単一 Context 取得
 * - GET  /api/ocd/search             - 検索
 * - POST /api/ocd/mutate             - 変更操作
 * - POST /api/ocd/commit             - コミット
 */
export function createRestRoutes(serverMode: ServerMode): Router {
  const router = Router()

  // ==========================================================================
  // GET /api/ocd/roots - Context Root 一覧
  // ==========================================================================
  router.get('/roots', async (req: Request, res: Response) => {
    try {
      const cwd = req.query.cwd as string
      if (!cwd) {
        res.status(400).json({ error: 'cwd query parameter is required' })
        return
      }

      const service = await resolveServiceFromCwd(cwd)
      const roots = await service.listContextRoots()

      res.json({ roots })
    } catch (error) {
      console.error('[REST] Error in /roots:', error)
      res.status(500).json({ error: (error as Error).message })
    }
  })

  // ==========================================================================
  // GET /api/ocd/tree - Context ツリー
  // ==========================================================================
  router.get('/tree', async (req: Request, res: Response) => {
    try {
      const cwd = req.query.cwd as string
      if (!cwd) {
        res.status(400).json({ error: 'cwd query parameter is required' })
        return
      }

      // rootIds パラメータ（カンマ区切りまたは配列）
      const rootIdsParam = req.query.rootIds as string | undefined
      const rootIds = rootIdsParam ? rootIdsParam.split(',') : []
      
      if (rootIds.length === 0) {
        res.status(400).json({ error: 'rootIds query parameter is required (例: rootIds=tairikut-docs)' })
        return
      }
      
      const depth = req.query.depth ? parseInt(req.query.depth as string, 10) : undefined
      const format = (req.query.format as 'json' | 'tree-text') || 'json'
      const maxNodes = req.query.maxNodes
        ? parseInt(req.query.maxNodes as string, 10)
        : undefined

      const service = await resolveServiceFromCwd(cwd)
      const result = await service.getContextTree({
        rootIds,
        depth,
        format,
        maxNodes,
      })

      res.json(result)
    } catch (error) {
      console.error('[REST] Error in /tree:', error)
      res.status(500).json({ error: (error as Error).message })
    }
  })

  // ==========================================================================
  // GET /api/ocd/contexts - Context 一覧（パターン指定）
  // ==========================================================================
  router.get('/contexts', async (req: Request, res: Response) => {
    try {
      const cwd = req.query.cwd as string
      if (!cwd) {
        res.status(400).json({ error: 'cwd query parameter is required' })
        return
      }

      const patterns = req.query.patterns
        ? (req.query.patterns as string).split(',')
        : ['**/*']
      const filter = req.query.filter as string | undefined
      const includeContent = req.query.includeContent !== 'false'

      const service = await resolveServiceFromCwd(cwd)
      const contexts = await service.getContexts({
        patterns,
        filter,
        includeContent,
      })

      res.json({ contexts })
    } catch (error) {
      console.error('[REST] Error in /contexts:', error)
      res.status(500).json({ error: (error as Error).message })
    }
  })

  // ==========================================================================
  // GET /api/ocd/context/:path - 単一 Context 取得
  // ==========================================================================
  router.get('/context/*', async (req: Request, res: Response) => {
    try {
      const cwd = req.query.cwd as string
      if (!cwd) {
        res.status(400).json({ error: 'cwd query parameter is required' })
        return
      }

      // パスパラメータを取得 (/context/foo/bar/baz → foo/bar/baz)
      const contextPath = req.params[0]
      if (!contextPath) {
        res.status(400).json({ error: 'Context path is required' })
        return
      }

      // パスに .md 拡張子がない場合は追加
      const pathWithExt = contextPath.endsWith('.md') ? contextPath : `${contextPath}.md`

      const service = await resolveServiceFromCwd(cwd)
      const contexts = await service.getContexts({
        patterns: [pathWithExt],
        includeContent: true,
      })

      if (contexts.length === 0) {
        res.status(404).json({ error: `Context not found: ${contextPath}` })
        return
      }

      res.json({ context: contexts[0] })
    } catch (error) {
      console.error('[REST] Error in /context:', error)
      res.status(500).json({ error: (error as Error).message })
    }
  })

  // ==========================================================================
  // GET /api/ocd/search - 検索
  // ==========================================================================
  router.get('/search', async (req: Request, res: Response) => {
    try {
      const cwd = req.query.cwd as string
      if (!cwd) {
        res.status(400).json({ error: 'cwd query parameter is required' })
        return
      }

      const query = req.query.q as string
      if (!query) {
        res.status(400).json({ error: 'q (query) parameter is required' })
        return
      }

      const scope = req.query.scope ? (req.query.scope as string).split(',') : undefined

      const service = await resolveServiceFromCwd(cwd)
      const contexts = await service.searchContexts(query, scope)

      res.json({
        contexts,
        query,
        total: contexts.length,
      })
    } catch (error) {
      console.error('[REST] Error in /search:', error)
      res.status(500).json({ error: (error as Error).message })
    }
  })

  // ==========================================================================
  // POST /api/ocd/mutate - 変更操作
  // ==========================================================================
  router.post('/mutate', async (req: Request, res: Response) => {
    try {
      // readonly モードでは拒否
      if (serverMode.readonly) {
        res.status(403).json({ error: 'Server is in readonly mode' })
        return
      }

      const cwd = req.body.cwd as string
      if (!cwd) {
        res.status(400).json({ error: 'cwd is required in request body' })
        return
      }

      const operations = req.body.operations as ContextMutation[]
      if (!operations || !Array.isArray(operations)) {
        res.status(400).json({ error: 'operations array is required in request body' })
        return
      }

      const service = await resolveServiceFromCwd(cwd)
      const result = await service.mutateContext(operations)

      res.json(result)
    } catch (error) {
      console.error('[REST] Error in /mutate:', error)
      res.status(500).json({ error: (error as Error).message })
    }
  })

  // ==========================================================================
  // POST /api/ocd/commit - コミット
  // ==========================================================================
  router.post('/commit', async (req: Request, res: Response) => {
    try {
      // readonly モードでは拒否
      if (serverMode.readonly) {
        res.status(403).json({ error: 'Server is in readonly mode' })
        return
      }

      const cwd = req.body.cwd as string
      if (!cwd) {
        res.status(400).json({ error: 'cwd is required in request body' })
        return
      }

      const message = req.body.message as string
      if (!message) {
        res.status(400).json({ error: 'message is required in request body' })
        return
      }

      const paths = req.body.paths as string[] | undefined

      const service = await resolveServiceFromCwd(cwd)
      const commitHash = await service.commit(message, paths)

      res.json({ commitHash })
    } catch (error) {
      console.error('[REST] Error in /commit:', error)
      res.status(500).json({ error: (error as Error).message })
    }
  })

  return router
}
