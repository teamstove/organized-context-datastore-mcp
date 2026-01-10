#!/usr/bin/env node
/**
 * Organized Context Datastore MCP - CLI エントリポイント
 * 
 * 使い方:
 *   npx github:teamstove/organized-context-datastore-mcp --storage /path/to/kb
 *   ocd-mcp --storage /path/to/kb
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from './mcp-server.js'

// CLI 引数解析
function parseArgs(): { storage: string } {
  const args = process.argv.slice(2)
  let storage: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--storage' || arg === '-s') {
      storage = args[i + 1]
      i++
    } else if (arg?.startsWith('--storage=')) {
      storage = arg.split('=')[1]
    }
  }

  if (!storage) {
    console.error(`
Organized Context Datastore MCP Server

Usage:
  ocd-mcp --storage <path>
  ocd-mcp -s <path>

Options:
  --storage, -s  Context Datastore のパス (必須)

Examples:
  ocd-mcp --storage ./context-store
  ocd-mcp --storage /absolute/path/to/store
  npx github:teamstove/organized-context-datastore-mcp --storage ./store
`)
    process.exit(1)
  }

  return { storage }
}

async function main() {
  const { storage } = parseArgs()
  
  // MCP サーバー作成
  const { server, service } = await createMcpServer(storage)
  
  // Stdio トランスポートで接続
  const transport = new StdioServerTransport()
  await server.connect(transport)
  
  // 終了時のクリーンアップ
  process.on('SIGINT', async () => {
    await service.close()
    process.exit(0)
  })
  
  process.on('SIGTERM', async () => {
    await service.close()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('[OCD-MCP] Fatal error:', error)
  process.exit(1)
})
