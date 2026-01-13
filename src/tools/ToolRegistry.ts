/**
 * Tool Registry
 * 
 * サーバーモードに応じてMCPツールを動的に構成・登録
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { KnowledgeGraphService } from '../KnowledgeGraphService.js'
import type { ServerMode } from '../types/index.js'

// =============================================================================
// Zod Schemas
// =============================================================================

/**
 * ContentUpdate スキーマ
 */
export const ContentUpdateSchema = z.discriminatedUnion('type', [
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

/**
 * ContextMutation スキーマ (統合版)
 */
export const ContextMutationSchema = z.object({
  type: z.enum(['create', 'update', 'delete', 'move']).describe('操作タイプ'),
  path: z.string().describe('対象パス (create: 親パス, update/delete: 対象パス, move: 移動元)'),
  to: z.string().optional().describe('移動先パス (move 時のみ)'),
  title: z.string().optional().describe('タイトル (create時必須)'),
  attrs: z.record(z.unknown()).optional().describe('カスタム属性 (frontmatter に保存)'),
  content: z.string().optional().describe('初期コンテンツ (create 時のみ)'),
  contentUpdates: z.array(ContentUpdateSchema).optional().describe('コンテンツ更新操作 (update 時のみ)')
})

// =============================================================================
// Service Resolver
// =============================================================================

/**
 * サービス解決関数の型
 * 
 * - local-dev モード: cwd から動的にサービスを解決
 * - remote-server モード: 固定のサービスを返す
 */
export type ServiceResolver = (cwd?: string) => Promise<KnowledgeGraphService>

// =============================================================================
// Tool Registration
// =============================================================================

/**
 * ツールを登録
 * 
 * @param server MCP サーバー
 * @param mode サーバーモード
 * @param resolveService サービス解決関数
 */
export function registerTools(
  server: McpServer,
  mode: ServerMode,
  resolveService: ServiceResolver
): void {
  // 読み取りツールは常に登録
  registerReadTools(server, mode, resolveService)
  
  // 書き込みツールは readonly でなければ登録
  if (!mode.readonly) {
    registerWriteTools(server, mode, resolveService)
  }
}

// =============================================================================
// Read Tools
// =============================================================================

/**
 * 読み取り系ツールを登録
 */
function registerReadTools(
  server: McpServer,
  mode: ServerMode,
  resolveService: ServiceResolver
): void {
  const isLocalDev = mode.type === 'local-dev'
  
  // cwd パラメータのスキーマ（local-dev モードのみ必須）
  const cwdSchema = isLocalDev
    ? { cwd: z.string().describe('作業ディレクトリ（設定探索の起点）') }
    : {}
  
  // -------------------------------------------------------------------------
  // ocd_list_context_roots
  // -------------------------------------------------------------------------
  server.tool(
    'ocd_list_context_roots',
    `[OCD] Context Root一覧を取得${isLocalDev ? '（cwd から設定を探索）' : ''}

返却される rootPath を他のツール (get_context_tree, get_contexts, mutate_context) のパス指定に使用してください。
path はファイルシステム上の絶対パスであり、ツールのパラメータには使用しません。`,
    cwdSchema,
    async (args) => {
      try {
        const service = await resolveService(isLocalDev ? (args as { cwd: string }).cwd : undefined)
        const roots = await service.listContextRoots()
        
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(roots, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // ocd_get_contexts
  // -------------------------------------------------------------------------
  const getContextsSchema = {
    ...cwdSchema,
    patterns: z.array(z.string()).describe('Context Root の rootPath で始まる glob パターン配列 (例: ["knowledge-base/**", "src/plugins/*"])'),
    filter: z.string().optional().describe('jq フィルタ式 (例: \'.categories | any(. == "feature-spec")\')'),
    includeContent: z.boolean().optional().describe('コンテンツを含めるか (default: true)')
  }
  
  server.tool(
    'ocd_get_contexts',
    `[OCD] Organized Context Datastore - 階層構造を持つコンテキストを LLM と人間が共同で読み書きする MCP サーバー。

パターンとフィルタでコンテキストを取得します。

## パラメータ
- patterns: glob パターン配列 (例: ['project/**', 'docs/*'])
- filter: jq フィルタ式 (例: '.attrs.status == "draft"')
- includeContent: コンテンツを含めるか (default: true)
${isLocalDev ? '- cwd: 作業ディレクトリ（設定探索の起点）' : ''}

## jq フィルタ例
- attrs でフィルタ: '.attrs.status == "draft"'
- 未完了TODOがあるもの: '.todos | any(.completed == false)'`,
    getContextsSchema,
    async (args) => {
      try {
        const typedArgs = args as { cwd?: string; patterns: string[]; filter?: string; includeContent?: boolean }
        const service = await resolveService(isLocalDev ? typedArgs.cwd : undefined)
        const contexts = await service.getContexts({
          patterns: typedArgs.patterns,
          filter: typedArgs.filter,
          includeContent: typedArgs.includeContent
        })
        
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(contexts, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // ocd_get_context_tree
  // -------------------------------------------------------------------------
  const getContextTreeSchema = {
    ...cwdSchema,
    rootPath: z.string().optional().describe('Context Root の rootPath（list_context_roots で取得）'),
    rootPaths: z.array(z.string()).optional().describe('Context Root の rootPath 配列（複数一括取得）'),
    depth: z.number().optional().describe('深さ制限 (省略時は全階層)'),
    format: z.enum(['tree-text', 'json']).optional().describe("出力形式 (default: 'tree-text')"),
    // treeStyle: 現在は常に 'flat' を使用（nested は未対応のため一時的に無効化）
    // treeStyle: z.enum(['nested', 'flat']).optional().describe("ツリースタイル (default: 'flat')"),
    treeTextFormat: z.string().optional().describe('表示フォーマット (default: "$path: $title"). 変数: $path, $title'),
    maxNodes: z.number().optional().describe('返却ノード数上限 (default: 1000)')
  }
  
  server.tool(
    'ocd_get_context_tree',
    `[OCD] コンテキストツリー(目次)を取得

## フォーマット
- tree-text (default): Token効率の良いテキストツリー形式
- json: 従来のJSON配列形式

## 表示フォーマット (treeTextFormat)
デフォルト: "$path: $title"
使用可能な変数: $path, $title
${isLocalDev ? '\n- cwd: 作業ディレクトリ（設定探索の起点）' : ''}`,
    getContextTreeSchema,
    async (args) => {
      try {
        const typedArgs = args as {
          cwd?: string
          rootPath?: string
          rootPaths?: string[]
          depth?: number
          format?: 'tree-text' | 'json'
          treeTextFormat?: string
          maxNodes?: number
        }
        const service = await resolveService(isLocalDev ? typedArgs.cwd : undefined)
        const result = await service.getContextTree({
          rootPath: typedArgs.rootPath,
          rootPaths: typedArgs.rootPaths,
          depth: typedArgs.depth,
          format: typedArgs.format,
          treeTextFormat: typedArgs.treeTextFormat,
          maxNodes: typedArgs.maxNodes
        })
        
        // tree-text 形式の場合はそのまま返す
        if ('format' in result && result.format === 'tree-text') {
          return {
            content: [{
              type: 'text' as const,
              text: result.tree as string
            }]
          }
        }
        
        // JSON 形式または複数結果の場合
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // ocd_search_contexts
  // -------------------------------------------------------------------------
  const searchContextsSchema = {
    ...cwdSchema,
    query: z.string().describe('検索クエリ'),
    scope: z.array(z.string()).optional().describe('検索スコープ (glob パターン)')
  }
  
  server.tool(
    'ocd_search_contexts',
    `[OCD] キーワードでコンテキストを検索${isLocalDev ? '（cwd から設定を探索）' : ''}`,
    searchContextsSchema,
    async (args) => {
      try {
        const typedArgs = args as { cwd?: string; query: string; scope?: string[] }
        const service = await resolveService(isLocalDev ? typedArgs.cwd : undefined)
        const results = await service.searchContexts(
          typedArgs.query,
          typedArgs.scope
        )
        
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(results, null, 2)
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
}

// =============================================================================
// Write Tools
// =============================================================================

/**
 * 書き込み系ツールを登録
 */
function registerWriteTools(
  server: McpServer,
  mode: ServerMode,
  resolveService: ServiceResolver
): void {
  const isLocalDev = mode.type === 'local-dev'
  
  // cwd パラメータのスキーマ（local-dev モードのみ必須）
  const cwdSchema = isLocalDev
    ? { cwd: z.string().describe('作業ディレクトリ（設定探索の起点）') }
    : {}
  
  // -------------------------------------------------------------------------
  // ocd_mutate_context (統合版: create/update/delete/move)
  // -------------------------------------------------------------------------
  const mutateContextSchema = {
    ...cwdSchema,
    operations: z.array(ContextMutationSchema).describe('変更操作の配列')
  }
  
  server.tool(
    'ocd_mutate_context',
    `[OCD] コンテキストを変更 (create/update/delete/move 一括実行)

全ての書き込み操作を単一のツールで実行可能。
複数の操作を配列で渡すことで一括処理できます。
${isLocalDev ? '\n- cwd: 作業ディレクトリ（設定探索の起点）' : ''}

**重要**: path は Context Root の rootPath（list_context_roots で取得）で始めてください。
例: "knowledge-base/new-doc", "src/plugins/MyPlugin/README"

## 操作タイプ

| type   | 必須フィールド       | オプション                     |
|--------|---------------------|------------------------------|
| create | path (親), title    | attrs, content               |
| update | path                | title, attrs, contentUpdates |
| delete | path                | -                            |
| move   | path (元), to       | -                            |

## contentUpdates の操作タイプ

### whole_replace - コンテンツ全置換
{ type: 'whole_replace', content: '新しいコンテンツ全体' }

### regexp_replace - 正規表現置換
pattern: '$', replacement: '\\n\\n追記内容', flags: 'm'`,
    mutateContextSchema,
    async (args) => {
      try {
        const typedArgs = args as { cwd?: string; operations: Parameters<KnowledgeGraphService['mutateContext']>[0] }
        const service = await resolveService(isLocalDev ? typedArgs.cwd : undefined)
        const result = await service.mutateContext(typedArgs.operations)
        
        return {
          content: [{
            type: 'text' as const,
            text: `Success: ${result.success}, Errors: ${result.errors}\n\n${JSON.stringify(result.results, null, 2)}`
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
  
  // -------------------------------------------------------------------------
  // ocd_commit (draft_commit モード用)
  // -------------------------------------------------------------------------
  const commitSchema = {
    ...cwdSchema,
    message: z.string().describe('コミットメッセージ'),
    paths: z.array(z.string()).optional().describe('対象パス (省略時は全変更)')
  }
  
  server.tool(
    'ocd_commit',
    `[OCD] 変更をコミット (git: 'manual' モード用)${isLocalDev ? '（cwd から設定を探索）' : ''}`,
    commitSchema,
    async (args) => {
      try {
        const typedArgs = args as { cwd?: string; message: string; paths?: string[] }
        const service = await resolveService(isLocalDev ? typedArgs.cwd : undefined)
        const hash = await service.commit(typedArgs.message, typedArgs.paths)
        
        return {
          content: [{
            type: 'text' as const,
            text: `Committed: ${hash}\nMessage: ${typedArgs.message}`
          }]
        }
      } catch (error) {
        return {
          content: [{
            type: 'text' as const,
            text: `Error: ${(error as Error).message}`
          }],
          isError: true
        }
      }
    }
  )
}
