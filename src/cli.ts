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
 *   ocd-mcp --http --port 38291
 *   ocd-mcp --http --port 38291 --mode remote-server --config /path/to/config.json
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
  
  /** HTTP ポート番号 (HTTP モード時) */
  port: number
  
  /** Web UI ポート番号 (stdio モード時に併用、デフォルト 38291) */
  webUiPort: number
  
  /** Web UI を無効化 (デフォルト: false = 有効) */
  disableWebUi: boolean
  
  /** 設定ファイルパス (remote-server モード用) */
  config?: string
  
  /** トランスポート */
  transport: 'http' | 'stdio'
}

// =============================================================================
// 引数パース
// =============================================================================

function parseArgs(argv: string[]): CliArgs {
  const args = argv
  
  // デフォルト値
  let mode: ServerModeType = 'local-dev'
  let readonly = false
  let port = 38291
  let webUiPort = 38291
  let disableWebUi = false
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
      port = parseInt(args[i + 1] || '38291', 10)
      i++
    } else if (arg?.startsWith('--port=')) {
      port = parseInt(arg.split('=')[1] || '38291', 10)
    }
    // --web-ui-port
    else if (arg === '--web-ui-port') {
      webUiPort = parseInt(args[i + 1] || '38291', 10)
      i++
    } else if (arg?.startsWith('--web-ui-port=')) {
      webUiPort = parseInt(arg.split('=')[1] || '38291', 10)
    }
    // --disable-web-ui
    else if (arg === '--disable-web-ui') {
      disableWebUi = true
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
  
  return { mode, readonly, port, webUiPort, disableWebUi, config, transport }
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
  --port, -p <port>     HTTP server port (default: 38291, requires --http)
  --web-ui-port <port>  Web UI port in stdio mode (default: 38291)
  --disable-web-ui     Disable Web UI (default: enabled in stdio mode)
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
  ocd-mcp --http --port 38291
  ocd-mcp --http --port 38291 --mode remote-server --config /path/to/config.json

  # CLI（ツール相当・JSON 出力）詳細は ocd-mcp tool --help
  ocd-mcp tool --cwd . list-roots

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
  const argv = process.argv.slice(2)
  if (argv[0] === 'tool') {
    const { runOcdToolCli } = await import('./cli/ocdToolCli.js')
    await runOcdToolCli(argv.slice(1))
    return
  }

  const args = parseArgs(argv)
  
  const serverMode: ServerMode = {
    type: args.mode,
    readonly: args.readonly
  }
  
  if (args.transport === 'stdio') {
    // stdio モード（Cursor / Claude Desktop 用）+ オプションで Web UI
    await startStdioServer(serverMode, {
      webUiPort: args.webUiPort,
      disableWebUi: args.disableWebUi,
    })
  } else {
    // HTTP サーバーモード
    console.error(`[OCD-MCP] Starting HTTP server...`)
    console.error(`[OCD-MCP] Mode: ${serverMode.type}`)
    console.error(`[OCD-MCP] Readonly: ${serverMode.readonly}`)
    await startHttpServer(args.port, args.config, serverMode, !args.disableWebUi)
  }
}

/** stdio 起動時の Web UI オプション */
interface StdioWebUiOptions {
  webUiPort: number
  disableWebUi: boolean
}

/**
 * stdio サーバー起動（local-dev モード）
 * --disable-web-ui でなければ Web UI 用 HTTP サーバーも並行起動
 * 
 * Web UI のポートが競合している場合は、Web UI を起動せずに
 * stdio MCP サーバーのみで動作を継続する。
 */
async function startStdioServer(serverMode: ServerMode, webUiOptions: StdioWebUiOptions): Promise<void> {
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { createLocalDevMcpServer } = await import('./mcp-server.js')
  
  let webUiServer: InstanceType<typeof import('./http/WebUiServer.js').WebUiServer> | null = null
  let webUiStarted = false
  
  // --- Web UI サーバーの起動（ポート競合時は stdio のみで続行） ---
  if (!webUiOptions.disableWebUi) {
    const { WebUiServer, WebUiPortConflictError } = await import('./http/WebUiServer.js')
    webUiServer = new WebUiServer({
      port: webUiOptions.webUiPort,
      serverMode,
    })
    try {
      await webUiServer.start()
      webUiStarted = true
    } catch (err) {
      // ポート競合: 致命的ではない → Web UI なしで stdio を続行
      if (err instanceof WebUiPortConflictError) {
        if (err.kind === 'ocd-conflict') {
          console.error(`[OCD-MCP] Web UI: ポート ${webUiOptions.webUiPort} は既に別の OCD が使用中です。Web UI をスキップして stdio のみで起動します。`)
          console.error(`[OCD-MCP] 既存の Web UI を利用してください: http://localhost:${webUiOptions.webUiPort}/viewer`)
        } else {
          console.error(`[OCD-MCP] Web UI: ポート ${webUiOptions.webUiPort} は別プロセスが使用中です。Web UI をスキップして stdio のみで起動します。`)
        }
        // サーバーインスタンスをクリア
        webUiServer = null
      } else {
        // その他のエラーも致命的にせず、警告のみ
        console.error(`[OCD-MCP] Web UI の起動に失敗しました: ${err instanceof Error ? err.message : err}`)
        console.error(`[OCD-MCP] stdio のみで起動を続行します。`)
        webUiServer = null
      }
    }
  }
  
  // --- stdio MCP サーバーの起動（こちらは常に起動する） ---
  const server = await createLocalDevMcpServer(serverMode)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  
  // stderr にログ出力（stdout は MCP 通信に使用）
  console.error(`[OCD-MCP] stdio server started (local-dev mode, readonly: ${serverMode.readonly})`)
  if (webUiStarted) {
    console.error(`[OCD-MCP] Web UI: http://localhost:${webUiOptions.webUiPort}/viewer`)
  }
  
  // Graceful shutdown で Web UI サーバーも停止
  const shutdown = async () => {
    if (webUiServer) {
      await webUiServer.stop()
    }
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

/**
 * HTTP サーバー起動
 */
async function startHttpServer(port: number, configPath: string | undefined, serverMode: ServerMode, enableWebUi: boolean): Promise<void> {
  const { startHttpMcpServer } = await import('./http/HttpMcpServer.js')
  
  await startHttpMcpServer({
    port,
    configPath,
    serverMode,
    enableWebUi,
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
