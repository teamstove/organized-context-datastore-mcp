#!/usr/bin/env node
/**
 * Knowledge Graph MCP Server
 * 
 * MCP (Model Context Protocol) サーバーとして動作
 * Cursor, Claude Desktop などのMCPクライアントから接続可能
 * 
 * 起動方法:
 *   npx tsx src/mcp-server.ts --storage /path/to/knowledge-base
 * 
 * 環境変数:
 *   KGMCP_STORAGE_PATH: Knowledge Base のパス
 *   KGMCP_VERSION_MODE: immediate | draft_commit (default: immediate)
 */

import * as path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { KnowledgeGraphService } from './index.js'
import { loadConfig } from './config/ConfigLoader.js'

// =============================================================================
// Zod Schemas
// =============================================================================

// ContentUpdate スキーマ
const ContentUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('whole_replace'),
    content: z.string().describe('新しいコンテンツ全体')
  }),
  z.object({
    type: z.literal('regexp_replace'),
    pattern: z.string().describe('正規表現パターン'),
    replacement: z.string().describe('置換文字列 ($1, $2 等のグループ参照可)'),
    flags: z.string().optional().describe('正規表現フラグ (g, i, m, s)')
  })
])

// ContextMutation スキーマ (統合版)
const ContextMutationSchema = z.object({
  type: z.enum(['create', 'update', 'delete', 'move']).describe('操作タイプ'),
  path: z.string().describe('対象パス (create: 親パス, update/delete: 対象パス, move: 移動元)'),
  to: z.string().optional().describe('移動先パス (move 時のみ)'),
  title: z.string().optional().describe('タイトル (create時必須)'),
  summary: z.string().optional().describe('サマリ (create時必須)'),
  categories: z.array(z.string()).optional().describe('カテゴリ'),
  tags: z.array(z.string()).optional().describe('タグ'),
  content: z.string().optional().describe('初期コンテンツ (create 時のみ)'),
  contentUpdates: z.array(ContentUpdateSchema).optional().describe('コンテンツ更新操作 (update 時のみ)')
})

// =============================================================================
// Configuration
// =============================================================================

function parseStoragePath(): string {
  const args = process.argv.slice(2)
  
  // デフォルト値
  let storagePath = process.env['KGMCP_STORAGE_PATH'] ?? process.cwd()
  
  // コマンドライン引数をパース
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--storage' && args[i + 1]) {
      storagePath = args[i + 1]!
      i++
    }
  }
  
  return storagePath
}

// =============================================================================
// Server Factory (エクスポート用)
// =============================================================================

/**
 * MCP サーバーを作成
 * CLI や他のモジュールから呼び出し可能
 */
export async function createMcpServer(storagePath: string): Promise<{
  server: McpServer
  service: KnowledgeGraphService
}> {
  // 設定を読み込み（自動検出含む）
  const config = await loadConfig(storagePath)
  
  // stderr にログ出力（MCPはstdoutを使うため）
  console.error(`[knowledge-graph-mcp] Storage: ${storagePath}`)
  console.error(`[knowledge-graph-mcp] Context Roots: ${config.contextRoots.map(r => r.name).join(', ')}`)
  console.error(`[knowledge-graph-mcp] Version Mode: ${config.versionControlMode}`)
  
  // Knowledge Graph Service 初期化
  const service = new KnowledgeGraphService(config)
  await service.initialize()
  
  // MCP Server 作成
  const server = new McpServer({
    name: 'knowledge-graph-mcp',
    version: '0.1.0',
  })
  
  // ツールを登録
  registerTools(server, service)
  
  return { server, service }
}

// =============================================================================
// Main Entry Point (直接実行用)
// =============================================================================

async function main() {
  const storagePath = parseStoragePath()
  
  const { server, service } = await createMcpServer(storagePath)
  
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

// =============================================================================
// Tool Registration
// =============================================================================

function registerTools(server: McpServer, service: KnowledgeGraphService) {
  
  // -------------------------------------------------------------------------
  // list_context_roots
  // -------------------------------------------------------------------------
  server.tool(
    'list_context_roots',
    'Knowledge Baseで利用可能なContext Root一覧を取得します',
    {},
    async () => {
      try {
        const roots = await service.listContextRoots()
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(roots, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // get_contexts
  // -------------------------------------------------------------------------
  server.tool(
    'get_contexts',
    `パターンとフィルタでコンテキストを取得します。

## パラメータ
- patterns: glob パターン配列 (例: ['gme-project/**', 'core-framework/plugins/*'])
- filter: jq フィルタ式 (例: '.categories | any(. == "feature-spec")')
- includeContent: コンテンツを含めるか (default: true)

## jq フィルタ例
- カテゴリでフィルタ: '.categories | any(. == "feature-spec")'
- タグでフィルタ: '.tags | any(. == "Phase1")'
- 未完了TODOがあるもの: '.todos | any(.completed == false)'
- 属性でフィルタ: '.annotations | any(.attributes | any(contains("要確認")))'
- 複合条件: '(.categories | contains(["feature-spec"])) and (.tags | any(. == "priority-high"))'`,
    {
      patterns: z.array(z.string()).describe('glob パターン配列'),
      filter: z.string().optional().describe('jq フィルタ式'),
      includeContent: z.boolean().optional().default(true).describe('コンテンツを含めるか')
    },
    async (args) => {
      try {
        const contexts = await service.getContexts({
          patterns: args.patterns,
          filter: args.filter,
          includeContent: args.includeContent
        })
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(contexts, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // get_context_tree
  // -------------------------------------------------------------------------
  server.tool(
    'get_context_tree',
    `コンテキストツリー(目次)を取得します。

## パラメータ
- rootPath: 単一のルートパス
- rootPaths: 複数のルートパス（一括取得）
※ どちらか一方を指定。両方指定時は rootPaths が優先。

## フォーマット
- tree-text (default): Token効率の良いテキストツリー形式
- json: 従来のJSON配列形式

## ツリースタイル (tree-text のみ)
- nested (default): ネスト形式（ツリー記号で階層表示）
- flat: フルパス表記（階層なし）

## nested 出力例
\`\`\`
[kgmcp-docs] (18 nodes)
├ 01-why: なぜ必要か [chi:2]
│ ├ problems-we-solve: 解決する課題
│ └ vision-and-goals: ビジョンと目標
└ 02-how: 実装とアーキテクチャ [chi:2]
\`\`\`

## flat 出力例
\`\`\`
[kgmcp-docs] (18 nodes)
01-why: なぜ必要か
01-why/problems-we-solve: 解決する課題
01-why/vision-and-goals: ビジョンと目標
\`\`\`

## 複数ルートパス例
\`\`\`json
{ "rootPaths": ["project-a", "project-b"] }
\`\`\`
→ 各ルートパスのツリーが results 配列で返却される`,
    {
      rootPath: z.string().optional().describe('ルートパス（単一）'),
      rootPaths: z.array(z.string()).optional().describe('ルートパス配列（複数一括取得）'),
      depth: z.number().optional().describe('深さ制限 (省略時は全階層)'),
      format: z.enum(['json', 'tree-text']).optional().describe("出力形式 (default: 'tree-text')"),
      treeStyle: z.enum(['flat', 'nested']).optional().describe("ツリースタイル (default: 'flat')"),
      includeSummary: z.boolean().optional().describe('summary を含めるか (default: true)'),
      includeCategories: z.boolean().optional().describe('categories を含めるか (default: true)'),
      includeTags: z.boolean().optional().describe('tags を含めるか (default: true)'),
      maxNodes: z.number().optional().describe('返却ノード数上限 (default: 1000)')
    },
    async (args) => {
      try {
        // rootPath も rootPaths も指定されていない場合はエラー
        if (!args.rootPath && (!args.rootPaths || args.rootPaths.length === 0)) {
          return {
            content: [{
              type: 'text',
              text: 'Error: rootPath or rootPaths is required'
            }],
            isError: true
          }
        }
        
        const result = await service.getContextTree({
          rootPath: args.rootPath,
          rootPaths: args.rootPaths,
          depth: args.depth,
          format: args.format,
          treeStyle: args.treeStyle,
          includeSummary: args.includeSummary,
          includeCategories: args.includeCategories,
          includeTags: args.includeTags,
          maxNodes: args.maxNodes
        })
        
        // 複数結果の場合
        if ('results' in result) {
          const texts: string[] = []
          for (const r of result.results) {
            const text = r.format === 'tree-text' 
              ? r.tree as string
              : JSON.stringify(r.tree, null, 2)
            texts.push(text)
          }
          
          const truncatedWarning = result.truncated
            ? `\n\n⚠️ 一部結果が切り詰められています (合計 ${result.totalNodes} ノード)`
            : ''
          
          return {
            content: [{
              type: 'text',
              text: texts.join('\n\n---\n\n') + truncatedWarning
            }]
          }
        }
        
        // 単一結果の場合
        // tree-text の場合はそのまま返す、json の場合は JSON 文字列化
        const text = result.format === 'tree-text' 
          ? result.tree as string
          : JSON.stringify(result.tree, null, 2)
        
        // truncated の場合は警告を追加
        const displayedCount = result.format === 'tree-text'
          ? (args.maxNodes ?? 1000)
          : (result.tree as unknown[]).length
        const truncatedWarning = result.truncated 
          ? `\n\n⚠️ 結果が切り詰められています (${result.totalNodes}ノード中 ${displayedCount}件を表示)`
          : ''
        
        return {
          content: [{
            type: 'text',
            text: text + truncatedWarning
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // search_contexts
  // -------------------------------------------------------------------------
  server.tool(
    'search_contexts',
    'キーワードでコンテキストを検索します',
    {
      query: z.string().describe('検索クエリ'),
      scope: z.array(z.string()).optional().describe('検索スコープ (glob パターン)')
    },
    async (args) => {
      try {
        const results = await service.searchContexts(args.query, args.scope)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // mutate_context (統合版: create/update/delete/move)
  // -------------------------------------------------------------------------
  server.tool(
    'mutate_context',
    `コンテキストを変更します (統合版: create/update/delete/move を一括実行)

全ての書き込み操作を単一のツールで実行可能。
複数の操作を配列で渡すことで一括処理できます。

## 操作タイプ

| type   | 必須フィールド              | オプション                                |
|--------|---------------------------|------------------------------------------|
| create | path (親), title, summary | categories, tags, content                |
| update | path                      | title, summary, categories, tags, contentUpdates |
| delete | path                      | -                                        |
| move   | path (元), to             | -                                        |

## contentUpdates の操作タイプ

### whole_replace - コンテンツ全置換
{ type: 'whole_replace', content: '新しいコンテンツ全体' }

### regexp_replace - 正規表現置換
以下のパターンで append, prepend, セクション操作を実現:

#### 末尾追記
pattern: '$', replacement: '\\n\\n追記内容', flags: 'm'

#### 先頭追記
pattern: '^', replacement: '先頭内容\\n\\n', flags: ''

#### セクション末尾に追記
pattern: '(## セクション名.*?)(\\n## |$)', replacement: '$1\\n- 追記内容$2', flags: 's'

#### セクション置換
pattern: '## セクション名\\n.*?(?=\\n## |$)', replacement: '## セクション名\\n新しい内容', flags: 's'

#### TODO完了マーク
pattern: '- \\\\[\\\\s*\\\\] (対象タスク)', replacement: '- [x] $1'`,
    {
      operations: z.array(ContextMutationSchema).describe('変更操作の配列')
    },
    async (args) => {
      try {
        const result = await service.mutateContext(args.operations as Parameters<typeof service.mutateContext>[0])
        
        return {
          content: [{
            type: 'text',
            text: `Success: ${result.success}, Errors: ${result.errors}\n\n${JSON.stringify(result.results, null, 2)}`
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // commit (draft_commit モード用)
  // -------------------------------------------------------------------------
  server.tool(
    'commit',
    '変更をコミットします (draft_commitモード用)',
    {
      message: z.string().describe('コミットメッセージ'),
      paths: z.array(z.string()).optional().describe('対象パス (省略時は全変更)')
    },
    async (args) => {
      try {
        const hash = await service.commit(args.message, args.paths)
        return {
          content: [{
            type: 'text',
            text: `Committed: ${hash}\nMessage: ${args.message}`
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
}

// =============================================================================
// Entry Point
// =============================================================================

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
