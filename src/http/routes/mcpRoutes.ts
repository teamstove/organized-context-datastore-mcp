/**
 * MCP Routes
 * 
 * MCPプロトコルのHTTPエンドポイント定義
 * 
 * Streamable HTTP Transport (MCP 2025-03-26 仕様準拠)
 * - SSE は deprecated のため使用しない
 * - 単一 POST エンドポイントで JSON-RPC を処理
 */

import { Router, type Request, type Response } from 'express'
import { ProjectRegistry } from '../ProjectRegistry.js'
import type { KnowledgeGraphService } from '../../KnowledgeGraphService.js'
import { z } from 'zod'

/**
 * MCPリクエストスキーマ (JSON-RPC 2.0)
 */
const McpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional()
})

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
      const service = await registry.getOrCreateFromPath(storagePath)
      
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
      const service = await registry.get(projectId)
      if (!service) {
        res.status(404).json({
          jsonrpc: '2.0',
          id: req.body?.id ?? null,
          error: { code: -32001, message: `Project not found: ${projectId}` }
        })
        return
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
 * ツール呼び出しを実行
 */
async function executeToolCall(
  service: KnowledgeGraphService,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (toolName) {
    case 'list_context_roots':
      return await service.listContextRoots()
    
    case 'get_contexts':
      return await service.getContexts({
        patterns: args.patterns as string[],
        filter: args.filter as string | undefined,
        includeContent: args.includeContent as boolean | undefined
      })
    
    case 'get_context_tree':
      return await service.getContextTree({
        rootPath: args.rootPath as string | undefined,
        rootPaths: args.rootPaths as string[] | undefined,
        depth: args.depth as number | undefined,
        format: args.format as 'json' | 'tree-text' | undefined,
        treeStyle: args.treeStyle as 'nested' | 'flat' | undefined,
        includeSummary: args.includeSummary as boolean | undefined,
        includeCategories: args.includeCategories as boolean | undefined,
        includeTags: args.includeTags as boolean | undefined,
        maxNodes: args.maxNodes as number | undefined
      })
    
    case 'search_contexts':
      return await service.searchContexts(
        args.query as string,
        args.scope as string[] | undefined
      )
    
    case 'mutate_context':
      return await service.mutateContext(
        args.operations as Parameters<typeof service.mutateContext>[0]
      )
    
    case 'commit':
      return await service.commit(
        args.message as string,
        args.paths as string[] | undefined
      )
    
    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
