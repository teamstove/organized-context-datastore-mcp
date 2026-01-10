#!/usr/bin/env node
/**
 * Organized Context Datastore MCP - CLI エントリポイント
 * 
 * 使い方:
 *   # stdio モード（Cursor / Claude Desktop 用）
 *   ocd-mcp
 *   ocd-mcp --readonly
 * 
 *   # HTTP サーバーモード
 *   ocd-mcp --http --port 3100
 *   ocd-mcp --http --port 3100 --mode remote-server --config /path/to/config.json
 */

import type { ServerMode, ServerModeType } from './types/index.js'

// =============================================================================
// CLI 引数
// =============================================================================

interface CliArgs {
  /** サーバーモード */
  mode: ServerModeType
  
  /** 読み取り専用 */
  readonly: boolean
  
  /** HTTP ポート番号 */
  port: number
  
  /** 設定ファイルパス (remote-server モード用) */
  config?: string
  
  /** トランスポート */
  transport: 'http' | 'stdio'
}

// =============================================================================
// 引数パース
// =============================================================================

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  
  // デフォルト値
  let mode: ServerModeType = 'local-dev'
  let readonly = false
  let port = 3100
  let config: string | undefined
  let transport: 'http' | 'stdio' = 'stdio' // デフォルトは stdio
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    // --http (HTTP モードに切り替え)
    if (arg === '--http') {
      transport = 'http'
    }
    
    // --mode (HTTP モードでのみ有効)
    else if (arg === '--mode' || arg === '-m') {
      const value = args[i + 1]
      if (value === 'local-dev' || value === 'remote-server') {
        mode = value
      } else {
        console.error(`Invalid mode: ${value}. Use 'local-dev' or 'remote-server'`)
        process.exit(1)
      }
      i++
    } else if (arg?.startsWith('--mode=')) {
      const value = arg.split('=')[1] as ServerModeType
      if (value === 'local-dev' || value === 'remote-server') {
        mode = value
      } else {
        console.error(`Invalid mode: ${value}. Use 'local-dev' or 'remote-server'`)
        process.exit(1)
      }
    }
    
    // --readonly
    else if (arg === '--readonly' || arg === '-r') {
      readonly = true
    }
    
    // --port
    else if (arg === '--port' || arg === '-p') {
      port = parseInt(args[i + 1] || '3100', 10)
      i++
    } else if (arg?.startsWith('--port=')) {
      port = parseInt(arg.split('=')[1] || '3100', 10)
    }
    
    // --config
    else if (arg === '--config' || arg === '-c') {
      config = args[i + 1]
      i++
    } else if (arg?.startsWith('--config=')) {
      config = arg.split('=')[1]
    }
    
    // --help
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  
  // stdio の場合は必ず local-dev
  if (transport === 'stdio') {
    mode = 'local-dev'
  }
  
  // バリデーション
  if (mode === 'remote-server' && transport === 'http' && !config) {
    console.error('Error: --config is required for remote-server mode')
    process.exit(1)
  }
  
  return { mode, readonly, port, config, transport }
}

function printHelp(): void {
  console.error(`
Organized Context Datastore MCP Server

Usage:
  ocd-mcp [options]

Transport:
  (default)             stdio mode (for Cursor, Claude Desktop)
  --http                HTTP server mode

Options:
  --readonly, -r        Disable write tools (read-only mode)
  --port, -p <port>     HTTP server port (default: 3100, requires --http)
  --mode, -m <mode>     Server mode (HTTP only, default: local-dev)
                        - local-dev: Dynamic config discovery via cwd parameter
                        - remote-server: Fixed config from config file
  --config, -c <path>   Config file path (required for remote-server mode)
  --help, -h            Show this help

Examples:
  # stdio mode (for Cursor / Claude Desktop)
  ocd-mcp
  ocd-mcp --readonly

  # HTTP server mode
  ocd-mcp --http --port 3100
  ocd-mcp --http --port 3100 --mode remote-server --config /path/to/config.json

Cursor / Claude Desktop Configuration:
  {
    "mcpServers": {
      "ocd-mcp": {
        "command": "npx",
        "args": ["github:teamstove/organized-context-datastore-mcp"]
      }
    }
  }
`)
}

// =============================================================================
// メイン処理
// =============================================================================

async function main() {
  const args = parseArgs()
  
  const serverMode: ServerMode = {
    type: args.mode,
    readonly: args.readonly
  }
  
  if (args.transport === 'stdio') {
    // stdio モード（Cursor / Claude Desktop 用）
    await startStdioServer(serverMode)
  } else {
    // HTTP サーバーモード
    console.error(`[OCD-MCP] Starting HTTP server...`)
    console.error(`[OCD-MCP] Mode: ${serverMode.type}`)
    console.error(`[OCD-MCP] Readonly: ${serverMode.readonly}`)
    await startHttpServer(args.port, args.config, serverMode)
  }
}

/**
 * stdio サーバー起動（local-dev モード）
 */
async function startStdioServer(serverMode: ServerMode): Promise<void> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { createLocalDevMcpServer } = await import('./mcp-server.js')
  
  const server = await createLocalDevMcpServer(serverMode)
  
  const transport = new StdioServerTransport()
  await server.connect(transport)
  
  // stderr にログ出力（stdout は MCP 通信に使用）
  console.error(`[OCD-MCP] stdio server started (local-dev mode, readonly: ${serverMode.readonly})`)
}

/**
 * HTTP サーバー起動
 */
async function startHttpServer(port: number, configPath: string | undefined, serverMode: ServerMode): Promise<void> {
  const { startHttpMcpServer } = await import('./http/HttpMcpServer.js')
  
  await startHttpMcpServer({
    port,
    configPath,
    serverMode
  })
  
  console.error(`[OCD-MCP] HTTP server started on port ${port}`)
}

// =============================================================================
// エントリポイント
// =============================================================================

main().catch((error) => {
  console.error('[OCD-MCP] Fatal error:', error)
  process.exit(1)
})
