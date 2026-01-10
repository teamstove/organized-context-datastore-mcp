#!/usr/bin/env node
/**
 * HTTP MCP Server - CLI Entry Point
 * 
 * Streamable HTTP Transport (MCP 2025-03-26 仕様準拠)
 * 
 * Usage:
 *   # 設定ファイルから起動 (推奨)
 *   tsx src/http-server.ts --config ./kgmcp-server.config.json
 * 
 *   # 動的ストレージモードで起動 (storage指定なし)
 *   tsx src/http-server.ts --port 3000
 *   → POST /api/mcp/dynamic?storage=/path/to/kb でアクセス
 * 
 *   # デフォルトプロジェクト付きで起動 (オプション)
 *   tsx src/http-server.ts --port 3000 --storage /path/to/kb --project my-project
 *   → POST /api/mcp/my-project でアクセス可能
 */

import { startHttpServer, loadServerConfig, type HttpServerConfig } from './http/HttpMcpServer.js'
import type { ProjectConfig } from './http/ProjectRegistry.js'

/**
 * CLIオプションをパース
 */
function parseArgs(): { config?: string, port?: number, project?: string, storage?: string } {
  const args = process.argv.slice(2)
  const result: { config?: string, port?: number, project?: string, storage?: string } = {}
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--config':
      case '-c':
        result.config = args[++i]
        break
      case '--port':
      case '-p':
        result.port = parseInt(args[++i], 10)
        break
      case '--project':
        result.project = args[++i]
        break
      case '--storage':
      case '-s':
        result.storage = args[++i]
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
    }
  }
  
  return result
}

/**
 * ヘルプを表示
 */
function printHelp(): void {
  console.log(`
Knowledge Graph MCP HTTP Server

Usage:
  tsx src/http-server.ts [options]

Options:
  -c, --config <path>    設定ファイルパス (推奨)
  -p, --port <number>    ポート番号 (default: 3000)
  -s, --storage <path>   デフォルトプロジェクトのストレージパス (オプション)
  --project <id>         デフォルトプロジェクトID (default: default)
  -h, --help             ヘルプを表示

Examples:
  # 動的ストレージモード (storage指定なし)
  tsx src/http-server.ts --port 3000
  
  # 設定ファイルから起動
  tsx src/http-server.ts --config ./kgmcp-server.config.json
  
  # デフォルトプロジェクト付きで起動
  tsx src/http-server.ts --port 3000 --storage /path/to/kb

Endpoints:
  GET  /health                         ヘルスチェック
  GET  /info                           サーバー情報
  POST /api/mcp/:projectId             MCP リクエスト (設定済みプロジェクト)
  POST /api/mcp/dynamic?storage=...    MCP リクエスト (動的ストレージ)
`)
}

/**
 * メイン処理
 */
async function main(): Promise<void> {
  const args = parseArgs()
  
  let config: HttpServerConfig
  
  if (args.config) {
    // 設定ファイルから読み込み
    console.log(`[KGMCP HTTP] 設定ファイル読み込み: ${args.config}`)
    config = await loadServerConfig(args.config)
    
  } else {
    // コマンドライン引数から設定を作成
    const port = args.port || parseInt(process.env.KGMCP_PORT || '3000', 10)
    const projects: ProjectConfig[] = []
    
    // --storage が指定されていれば デフォルトプロジェクトを追加
    if (args.storage) {
      projects.push({
        id: args.project || 'default',
        name: args.project || 'Default Project',
        storageType: 'file-git',
        storagePath: args.storage
      })
    }
    
    // 環境変数 KGMCP_STORAGE_PATH があれば追加
    const envStorage = process.env.KGMCP_STORAGE_PATH
    if (envStorage && !args.storage) {
      projects.push({
        id: 'default',
        name: 'Default Project',
        storageType: 'file-git',
        storagePath: envStorage
      })
    }
    
    config = {
      port,
      projects,
      allowDynamicStorage: true
    }
  }
  
  // サーバー起動
  console.log(`[KGMCP HTTP] サーバー起動中...`)
  console.log(`[KGMCP HTTP] Transport: Streamable HTTP (MCP 2025-03-26)`)
  console.log(`[KGMCP HTTP] ポート: ${config.port}`)
  
  if (config.projects.length > 0) {
    console.log(`[KGMCP HTTP] 登録プロジェクト: ${config.projects.length}件`)
    config.projects.forEach(p => {
      console.log(`  - ${p.id}: ${p.storagePath || '(postgres)'}`)
    })
  } else {
    console.log(`[KGMCP HTTP] 動的ストレージモード (プロジェクト未登録)`)
  }
  
  await startHttpServer(config)
  
  console.log('')
  console.log('[KGMCP HTTP] エンドポイント:')
  console.log(`  GET  http://localhost:${config.port}/health`)
  console.log(`  GET  http://localhost:${config.port}/info`)
  
  if (config.projects.length > 0) {
    config.projects.forEach(p => {
      console.log(`  POST http://localhost:${config.port}/api/mcp/${p.id}`)
    })
  }
  
  console.log(`  POST http://localhost:${config.port}/api/mcp/dynamic?storage=...`)
  console.log('')
}

main().catch((error) => {
  console.error('[KGMCP HTTP] 起動エラー:', error)
  process.exit(1)
})
