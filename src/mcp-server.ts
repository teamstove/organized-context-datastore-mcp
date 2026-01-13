/**
 * Organized Context Datastore MCP Server
 * 
 * MCP (Model Context Protocol) サーバーとして動作
 * Cursor, Claude Desktop などのMCPクライアントから接続可能
 * 
 * 起動方法:
 *   # stdio モード（推奨）
 *   ocd-mcp
 * 
 *   # HTTP モード
 *   ocd-mcp --http --port 3100
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { KnowledgeGraphService } from './index.js'
import { loadConfig, resolveConfigFromCwd, resolvedConfigToMcpConfig } from './config/ConfigLoader.js'
import { registerTools, type ServiceResolver } from './tools/ToolRegistry.js'
import type { ServerMode } from './types/index.js'

// =============================================================================
// Service Cache (for local-dev mode)
// =============================================================================

const serviceCache = new Map<string, { service: KnowledgeGraphService; createdAt: Date }>()

/**
 * キャッシュのクリーンアップ (30分経過したエントリを削除)
 */
function cleanupServiceCache(): void {
  const now = Date.now()
  const maxAge = 30 * 60 * 1000 // 30分
  
  for (const [cwd, entry] of serviceCache) {
    if (now - entry.createdAt.getTime() > maxAge) {
      console.error(`[OCD-MCP] Cleaning up cached service for: ${cwd}`)
      entry.service.close().catch(console.error)
      serviceCache.delete(cwd)
    }
  }
}

// 5分ごとにクリーンアップ
setInterval(cleanupServiceCache, 5 * 60 * 1000)

/**
 * cwd からサービスを解決（キャッシュ付き）
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
  const service = new KnowledgeGraphService(mcpConfig)
  await service.initialize()
  
  // キャッシュに保存
  serviceCache.set(cwd, { service, createdAt: new Date() })
  
  console.error(`[OCD-MCP] Created service for cwd: ${cwd}`)
  console.error(`[OCD-MCP] Context Roots: ${resolvedConfig.contextRoots.map(r => r.name).join(', ')}`)
  
  return service
}

// =============================================================================
// Local Dev Mode Server (stdio)
// =============================================================================

/**
 * local-dev モード用の MCP サーバーを作成
 * 
 * 各ツール呼び出し時に cwd パラメータで動的にサービスを解決
 * 
 * @param serverMode サーバーモード設定
 */
export async function createLocalDevMcpServer(serverMode: ServerMode): Promise<McpServer> {
  // MCP Server 作成
  const server = new McpServer({
    name: 'organized-context-datastore-mcp',
    version: '0.2.0',
  })
  
  // サービス解決関数（cwd から動的に解決）
  const resolveService: ServiceResolver = async (cwd?: string) => {
    if (!cwd) {
      throw new Error('cwd parameter is required in local-dev mode')
    }
    return resolveServiceFromCwd(cwd)
  }
  
  // ツールを登録（local-dev モード）
  registerTools(server, { type: 'local-dev', readonly: serverMode.readonly }, resolveService)
  
  return server
}

// =============================================================================
// Remote Server Mode (for HTTP or fixed storage)
// =============================================================================

/**
 * remote-server モード用の MCP サーバーを作成
 * 
 * 固定のストレージパスでサービスを初期化
 * 
 * @param storagePath ストレージパス
 * @param serverMode サーバーモード設定
 */
export async function createMcpServer(
  storagePath: string,
  serverMode: ServerMode = { type: 'remote-server', readonly: false }
): Promise<{
  server: McpServer
  service: KnowledgeGraphService
}> {
  // 設定を読み込み（自動検出含む）
  const config = await loadConfig(storagePath)
  
  // stderr にログ出力（MCPはstdoutを使うため）
  console.error(`[OCD-MCP] Storage: ${storagePath}`)
  console.error(`[OCD-MCP] Context Roots: ${config.contextRoots.map(r => r.name).join(', ')}`)
  console.error(`[OCD-MCP] Server Mode: ${serverMode.type} (readonly: ${serverMode.readonly})`)
  
  // Knowledge Graph Service 初期化
  const service = new KnowledgeGraphService(config)
  await service.initialize()
  
  // MCP Server 作成
  const server = new McpServer({
    name: 'organized-context-datastore-mcp',
    version: '0.2.0',
  })
  
  // サービス解決関数（固定サービス）
  const resolveService: ServiceResolver = async () => service
  
  // ツールを登録
  registerTools(server, serverMode, resolveService)
  
  return { server, service }
}
