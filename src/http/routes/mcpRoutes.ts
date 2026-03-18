/**
 * MCP Routes
 * 
 * MCPプロトコルのHTTPエンドポイント定義
 * 
 * Streamable HTTP Transport (MCP 2025-03-26 仕様準拠)
 * - SSE は deprecated のため使用しない
 * - 単一 POST エンドポイントで JSON-RPC を処理
 * - local-dev / remote-server モード対応
 */

import { Router, type Request, type Response } from 'express'
import { ProjectRegistry } from '../ProjectRegistry.js'
import type { KnowledgeGraphService } from '../../KnowledgeGraphService.js'
import { KnowledgeGraphService as KGServiceClass } from '../../KnowledgeGraphService.js'
import { z } from 'zod'
import type { ServerMode } from '../../types/index.js'
import { resolveConfigFromCwd, resolvedConfigToMcpConfig } from '../../config/ConfigLoader.js'
import { normalizeOcdToolName, runOcdTool } from '../../ocd/runOcdTool.js'

/**
 * MCPリクエストスキーマ (JSON-RPC 2.0)
 */
const McpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional()
})

// =============================================================================
// Context Roots Filter (Query Parameters)
// =============================================================================

/**
 * Context Roots フィルタ設定
 */
export interface ContextRootsFilter {
  /** 含める Context Root IDs (未指定時は全て) */
  roots?: string[]
  
  /** readonly にする Context Root IDs */
  readonly?: string[]
}

/**
 * クエリパラメータから Context Roots フィルタを解析
 * 
 * サポート形式:
 * - シンプル: ?roots=A,B,C&readonly=C
 * - JSON: ?config={"roots":["A","B"],"readonly":["C"]}
 */
export function parseContextRootsFilter(query: Record<string, unknown>): ContextRootsFilter {
  // JSON config 形式
  if (query.config) {
    try {
      const configStr = String(query.config)
      const parsed = JSON.parse(configStr) as ContextRootsFilter
      return {
        roots: parsed.roots,
        readonly: parsed.readonly
      }
    } catch (e) {
      console.error('[MCP] Failed to parse config query parameter:', e)
    }
  }
  
  // シンプル形式
  const filter: ContextRootsFilter = {}
  
  if (query.roots) {
    const rootsStr = String(query.roots)
    filter.roots = rootsStr.split(',').map(s => s.trim()).filter(Boolean)
  }
  
  if (query.readonly) {
    const readonlyStr = String(query.readonly)
    filter.readonly = readonlyStr.split(',').map(s => s.trim()).filter(Boolean)
  }
  
  return filter
}

/**
 * フィルタを適用したサービスのラッパーを作成
 * 
 * Context Roots をフィルタリングし、readonly 設定を適用
 */
export function applyContextRootsFilter(
  service: KnowledgeGraphService,
  filter: ContextRootsFilter
): KnowledgeGraphService {
  // フィルタがない場合はそのまま返す
  if (!filter.roots && !filter.readonly) {
    return service
  }
  
  // Proxy を使ってサービスをラップ
  return new Proxy(service, {
    get(target, prop) {
      // listContextRoots をオーバーライド
      if (prop === 'listContextRoots') {
        return async () => {
          const allRoots = await target.listContextRoots()
          
          // roots フィルタを適用
          let filtered = allRoots
          if (filter.roots && filter.roots.length > 0) {
            filtered = allRoots.filter(r => filter.roots!.includes(r.id))
          }
          
          // readonly フラグを適用
          if (filter.readonly && filter.readonly.length > 0) {
            filtered = filtered.map(r => ({
              ...r,
              readOnly: filter.readonly!.includes(r.id) ? true : r.readOnly
            }))
          }
          
          return filtered
        }
      }
      
      // getToolDefinitions をオーバーライド（readonly の場合は書き込みツールを除外）
      if (prop === 'getToolDefinitions') {
        return () => {
          const tools = target.getToolDefinitions()
          
          // 全ての roots が readonly の場合は書き込みツールを除外
          if (filter.roots && filter.readonly) {
            const allReadonly = filter.roots.every(r => filter.readonly!.includes(r))
            if (allReadonly) {
              return tools.filter(t => !['mutate_context', 'commit'].includes(t.name))
            }
          }
          
          return tools
        }
      }
      
      // その他のプロパティ/メソッドはそのまま返す
      const value = Reflect.get(target, prop)
      if (typeof value === 'function') {
        return value.bind(target)
      }
      return value
    }
  })
}

/**
 * MCP ルーター作成
 * 
 * Streamable HTTP Transport:
 * - POST /api/mcp/dynamic?storage=... - 動的ストレージ (先に定義)
 * - POST /api/mcp/:projectId - MCP メッセージ処理
 */
export function createMcpRoutes(registry: ProjectRegistry): Router {
  const router = Router()
  
  // ==========================================================================
  // 動的設定形式: POST /api/mcp/dynamic?storage=...
  // ※ /:projectId より先に定義する必要がある
  // ==========================================================================
  
  /**
   * 動的ストレージ MCP エンドポイント
   * 
   * POST /api/mcp/dynamic?storage=/path/to/kb
   */
  router.post('/dynamic', async (req: Request, res: Response) => {
    const storagePath = req.query.storage as string | undefined
    
    if (!storagePath) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32600, message: 'storage query parameter is required' }
      })
      return
    }
    
    try {
      // 動的サービスを取得または作成
      let service = await registry.getOrCreateFromPath(storagePath)
      
      // Context Roots フィルタを適用
      const filter = parseContextRootsFilter(req.query as Record<string, unknown>)
      if (filter.roots || filter.readonly) {
        service = applyContextRootsFilter(service, filter)
      }
      
      // リクエストのパース
      const parseResult = McpRequestSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Invalid JSON-RPC request' }
        })
        return
      }
      
      const mcpRequest = parseResult.data
      
      // MCPメソッドを実行
      const result = await handleMcpMethod(service, mcpRequest.method, mcpRequest.params || {})
      
      res.json({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        result
      })
      
    } catch (error) {
      console.error(`[MCP] 動的リクエスト処理エラー:`, error)
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: (error as Error).message }
      })
    }
  })
  
  // ==========================================================================
  // マルチテナント形式: POST /api/mcp/:projectId
  // ==========================================================================
  
  /**
   * MCP エンドポイント (Streamable HTTP)
   * 
   * POST /api/mcp/:projectId
   * 
   * JSON-RPC 2.0 リクエストを受け取り、レスポンスを返す
   * 必要に応じてストリーミングレスポンス (Transfer-Encoding: chunked) も対応可能
   */
  router.post('/:projectId', async (req: Request, res: Response) => {
    const { projectId } = req.params
    
    try {
      // プロジェクトの存在確認
      let service = await registry.get(projectId)
      if (!service) {
        res.status(404).json({
          jsonrpc: '2.0',
          id: req.body?.id ?? null,
          error: { code: -32001, message: `Project not found: ${projectId}` }
        })
        return
      }
      
      // Context Roots フィルタを適用
      const filter = parseContextRootsFilter(req.query as Record<string, unknown>)
      if (filter.roots || filter.readonly) {
        service = applyContextRootsFilter(service, filter)
        console.log(`[MCP] Applied filter: roots=${filter.roots?.join(',') || 'all'}, readonly=${filter.readonly?.join(',') || 'none'}`)
      }
      
      // リクエストのパース
      const parseResult = McpRequestSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Invalid JSON-RPC request', data: parseResult.error }
        })
        return
      }
      
      const mcpRequest = parseResult.data
      
      // MCPメソッドを実行
      const result = await handleMcpMethod(service, mcpRequest.method, mcpRequest.params || {})
      
      // レスポンスを返す
      res.json({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        result
      })
      
    } catch (error) {
      console.error(`[MCP] リクエスト処理エラー:`, error)
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: (error as Error).message }
      })
    }
  })
  
  return router
}

/**
 * MCPメソッドハンドラー
 * 
 * KnowledgeGraphServiceのツールをMCPメソッドにマッピング
 */
async function handleMcpMethod(
  service: KnowledgeGraphService,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  // MCP標準メソッド
  if (method === 'initialize') {
    return {
      protocolVersion: '2025-03-26',
      serverInfo: {
        name: 'knowledge-graph-mcp',
        version: '0.2.0'
      },
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false }
      }
    }
  }
  
  if (method === 'ping') {
    return {}
  }
  
  if (method === 'tools/list') {
    const tools = service.getToolDefinitions()
    return { tools }
  }
  
  if (method === 'tools/call') {
    const toolName = params.name as string
    const toolArgs = params.arguments as Record<string, unknown>
    
    return await executeToolCall(service, toolName, toolArgs)
  }
  
  if (method === 'resources/list') {
    const roots = await service.listContextRoots()
    return {
      resources: roots.map(root => ({
        uri: `kg://${root.id}`,
        name: root.name,
        description: root.description,
        mimeType: 'application/json'
      }))
    }
  }
  
  if (method === 'resources/read') {
    // リソース読み取り (Context Root のコンテンツ)
    const uri = params.uri as string
    const rootId = uri.replace('kg://', '')
    
    const contexts = await service.getContexts({
      patterns: [`${rootId}/**/*.md`],
      includeContent: true
    })
    
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(contexts, null, 2)
      }]
    }
  }
  
  throw new Error(`Unknown method: ${method}`)
}

/**
 * ツール呼び出しを実行（readonly は呼び出し元で既に検証済みのため blockWrites は false）
 */
async function executeToolCall(
  service: KnowledgeGraphService,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return runOcdTool(service, toolName, args, { blockWrites: false })
}

// =============================================================================
// Local Dev Mode Routes
// =============================================================================

/**
 * サービスキャッシュ (cwd -> service)
 */
const serviceCache = new Map<string, { service: KnowledgeGraphService, createdAt: Date }>()

/**
 * キャッシュのクリーンアップ (5分経過したエントリを削除)
 * 設定ファイル変更の即時反映を優先するため 30分 → 5分 に短縮
 */
function cleanupServiceCache(): void {
  const now = Date.now()
  const maxAge = 5 * 60 * 1000 // 5分
  
  for (const [cwd, entry] of serviceCache) {
    if (now - entry.createdAt.getTime() > maxAge) {
      console.error(`[MCP] Cleaning up cached service for: ${cwd}`)
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
  
  console.error(`[MCP] Created service for cwd: ${cwd}`)
  console.error(`[MCP] Context Roots: ${resolvedConfig.contextRoots.map(r => r.name).join(', ')}`)
  
  return service
}

/**
 * local-dev モード用 MCP ルーター作成
 * 
 * 各リクエストに cwd パラメータを含め、動的に設定を解決
 */
export function createLocalDevMcpRoutes(serverMode: ServerMode): Router {
  const router = Router()
  
  /**
   * MCP エンドポイント (local-dev モード)
   * 
   * POST /api/mcp
   * Body: { jsonrpc: '2.0', method: '...', params: { cwd: '...', ... } }
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      // リクエストのパース
      const parseResult = McpRequestSchema.safeParse(req.body)
      if (!parseResult.success) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Invalid JSON-RPC request', data: parseResult.error }
        })
        return
      }
      
      const mcpRequest = parseResult.data
      const params = mcpRequest.params || {}
      
      // MCP 標準メソッド (cwd 不要)
      if (mcpRequest.method === 'initialize') {
        res.json({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result: {
            protocolVersion: '2025-03-26',
            serverInfo: {
              name: 'organized-context-datastore-mcp',
              version: '0.2.0',
              mode: 'local-dev'
            },
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false }
            }
          }
        })
        return
      }
      
      if (mcpRequest.method === 'ping') {
        res.json({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result: {}
        })
        return
      }
      
      // tools/list は cwd 不要で、ツール定義を返す
      if (mcpRequest.method === 'tools/list') {
        const tools = getLocalDevToolDefinitions(serverMode)
        res.json({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result: { tools }
        })
        return
      }
      
      // tools/call は cwd が必要
      if (mcpRequest.method === 'tools/call') {
        const toolName = params.name as string
        const toolArgs = params.arguments as Record<string, unknown>
        const cwd = toolArgs?.cwd as string
        
        if (!cwd) {
          res.status(400).json({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: { code: -32602, message: 'cwd parameter is required in local-dev mode' }
          })
          return
        }
        
        // readonly モードで書き込みツールを呼び出そうとした場合はエラー
        if (serverMode.readonly && isWriteTool(toolName)) {
          res.status(403).json({
            jsonrpc: '2.0',
            id: mcpRequest.id,
            error: { code: -32001, message: `Tool "${toolName}" is not available in readonly mode` }
          })
          return
        }
        
        // cwd からサービスを解決
        let service = await resolveServiceFromCwd(cwd)
        
        // Context Roots フィルタを適用（URL クエリパラメータから）
        const filter = parseContextRootsFilter(req.query as Record<string, unknown>)
        if (filter.roots || filter.readonly) {
          service = applyContextRootsFilter(service, filter)
        }
        
        // ツールを実行 (cwd を除いた引数を渡す)
        const { cwd: _, ...restArgs } = toolArgs
        const result = await executeToolCall(service, toolName, restArgs)
        
        res.json({
          jsonrpc: '2.0',
          id: mcpRequest.id,
          result: {
            content: [{
              type: 'text',
              text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
            }]
          }
        })
        return
      }
      
      res.status(400).json({
        jsonrpc: '2.0',
        id: mcpRequest.id,
        error: { code: -32601, message: `Unknown method: ${mcpRequest.method}` }
      })
      
    } catch (error) {
      console.error(`[MCP] Request error:`, error)
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: (error as Error).message }
      })
    }
  })
  
  return router
}

/**
 * 書き込みツールかどうかを判定
 */
function isWriteTool(toolName: string): boolean {
  const n = normalizeOcdToolName(toolName)
  return n === 'mutate_context' || n === 'commit'
}

/**
 * local-dev モード用のツール定義を取得
 */
function getLocalDevToolDefinitions(serverMode: ServerMode): Array<{
  name: string
  description: string
  inputSchema: Record<string, unknown>
}> {
  const readTools = [
    {
      name: 'list_context_roots',
      description: 'Context Root一覧を取得します（cwd から設定を探索）',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '作業ディレクトリ（設定探索の起点）' }
        },
        required: ['cwd']
      }
    },
    {
      name: 'get_contexts',
      description: 'パターンとフィルタでコンテキストを取得します',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '作業ディレクトリ' },
          patterns: { type: 'array', items: { type: 'string' }, description: 'glob パターン配列' },
          filter: { type: 'string', description: 'jq フィルタ式' },
          includeContent: { type: 'boolean', description: 'コンテンツを含めるか' }
        },
        required: ['cwd', 'patterns']
      }
    },
    {
      name: 'get_context_tree',
      description: 'コンテキストツリー(目次)を取得します。rootIds には list_context_roots で取得した id を使用してください。',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '作業ディレクトリ' },
          rootIds: { 
            type: 'array', 
            items: { type: 'string' }, 
            description: 'Context Root の id 配列（例: ["tairikut-docs"]）。list_context_roots で取得した id を使用'
          },
          depth: { type: 'number', description: '深さ制限' },
          format: { type: 'string', enum: ['tree-text', 'json'], description: '出力形式' },
          treeTextFormat: { type: 'string', description: '表示フォーマット (default: $path: $title $summary)' },
          maxNodes: { type: 'number', description: '返却ノード数上限' }
        },
        required: ['cwd', 'rootIds']
      }
    },
    {
      name: 'search_contexts',
      description: 'キーワードでコンテキストを検索します',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '作業ディレクトリ' },
          query: { type: 'string', description: '検索クエリ' },
          scope: { type: 'array', items: { type: 'string' }, description: '検索スコープ' }
        },
        required: ['cwd', 'query']
      }
    }
  ]
  
  const writeTools = [
    {
      name: 'mutate_context',
      description: 'コンテキストを変更します (create/update/delete/move)',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '作業ディレクトリ' },
          operations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['create', 'update', 'delete', 'move'] },
                path: { type: 'string' },
                to: { type: 'string' },
                title: { type: 'string' },
                attrs: { type: 'object', description: 'カスタム属性' },
                content: { type: 'string' },
                contentUpdates: { type: 'array' }
              },
              required: ['type', 'path']
            },
            description: '変更操作の配列'
          }
        },
        required: ['cwd', 'operations']
      }
    },
    {
      name: 'commit',
      description: '変更をコミットします (draft_commitモード用)',
      inputSchema: {
        type: 'object',
        properties: {
          cwd: { type: 'string', description: '作業ディレクトリ' },
          message: { type: 'string', description: 'コミットメッセージ' },
          paths: { type: 'array', items: { type: 'string' }, description: '対象パス' }
        },
        required: ['cwd', 'message']
      }
    }
  ]
  
  // readonly モードでは書き込みツールを除外
  if (serverMode.readonly) {
    return readTools
  }
  
  return [...readTools, ...writeTools]
}
