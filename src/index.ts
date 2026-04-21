/**
 * @stove-ai/knowledge-graph-mcp
 * 
 * Knowledge Graph MCP Server
 * 
 * ネストした知識グラフをLLMと人間が共同で読み書きできるMCPサーバー
 * 
 * ## 概要
 * 
 * - **ステートレス**: MCPサーバーはセッション状態を持たない
 * - **読み書き対応**: LLMがコンテキストを読み書きできる
 * - **ストレージ抽象化**: File+Git ベースで開始、DB対応も視野に
 * - **jq フィルタ**: LLMの既存知識を活用したフィルタリング
 * - **Markdown拡張**: [[属性]] 記法でアノテーション
 * - **配列対応**: すべての書き込みツールが配列入力に対応し、複数パスへの一括操作が可能
 * 
 * ## 使用例
 * 
 * ```typescript
 * import { createKnowledgeGraphService } from '@stove-ai/knowledge-graph-mcp'
 * 
 * // サービスを作成
 * const service = createKnowledgeGraphService('./knowledge-base', [
 *   { id: 'project', name: 'Project', path: 'project' },
 *   { id: 'core-framework', name: 'CORE Framework', path: 'core-framework' }
 * ])
 * 
 * // 初期化
 * await service.initialize()
 * 
 * // コンテキストを取得
 * const contexts = await service.getContexts({
 *   patterns: ['project/**'],
 *   filter: '.categories | any(. == "feature-spec")'
 * })
 * 
 * // コンテキストを作成 (配列対応)
 * await service.createContext([{
 *   parentPath: 'project/features',
 *   title: '新機能',
 *   summary: '新機能の説明',
 *   categories: ['feature-spec'],
 *   tags: ['Phase1']
 * }])
 * 
 * // コンテキストを更新 (replace でセクション操作)
 * await service.updateContext([{
 *   path: 'project/features/new-feature',
 *   tags: ['completed'],
 *   contentUpdates: [
 *     { type: 'replace', search: '$', replacement: '\n\n## 完了メモ\n実装完了', isRegex: true, flags: 'm' }
 *   ]
 * }])
 * 
 * // 終了
 * await service.close()
 * ```
 * 
 * ## MCP ツール
 * 
 * ### 読み取りツール (4)
 * - `list_context_roots` - Context Root 一覧
 * - `get_contexts` - パターン + jq フィルタでコンテキスト取得
 * - `get_context_tree` - 目次ツリー取得
 * - `search_contexts` - キーワード検索
 * 
 * ### 書き込みツール (5) - すべて配列対応
 * - `create_context` - 新規作成
 * - `update_context` - 統合更新 (メタデータ + コンテンツ操作)
 * - `delete_context` - 削除
 * - `move_context` - 移動
 * - `commit` - コミット (draft_commit モード)
 */

// Main Service
export { 
  KnowledgeGraphService,
  createKnowledgeGraphService 
} from './KnowledgeGraphService.js'

// Types
export type {
  // Core Types
  ContextNode,
  ContextNodeSummary,
  Annotation,
  Todo,
  Section,
  
  // API Types
  GetContextsOptions,
  GetContextTreeOptions,
  CreateContextParams,
  
  // New Update Types
  UpdateContextOperation,
  DeleteContextOperation,
  MoveContextOperation,
  ContentUpdate,
  ContentUpdateWholeReplace,
  ContentUpdateReplace,
  
  // Legacy Types (deprecated)
  UpdateContextParams,
  AppendToContextParams,
  
  // Storage Types
  FileMetadata,
  VersionEntry,
  
  // Config Types
  KnowledgeGraphMCPConfig,
  ContextRootConfig,
  WritePermissionConfig,
} from './types/index.js'

// Storage
export { FileGitStore, type FileGitStoreConfig } from './storage/FileGitStore.js'
export { PostgresStore, type PostgresStoreConfig } from './storage/PostgresStore.js'
export { CompositeStore, type CompositeStoreConfig } from './storage/CompositeStore.js'
export { KnowledgeStoreError, type KnowledgeStoreErrorCode } from './storage/IKnowledgeStore.js'
export type { IKnowledgeStore } from './storage/IKnowledgeStore.js'

// Parser
export { 
  parseMarkdown, 
  toContextNode,
  type ParsedMarkdown,
  type MarkdownFrontmatter 
} from './parser/MarkdownParser.js'

// Filter
export { 
  JqFilterEngine, 
  JqFilterError,
  FilterPresets 
} from './filter/JqFilterEngine.js'

// Tools
export { ReadTools } from './tools/ReadTools.js'
export { 
  WriteTools, 
  WriteError, 
  type WriteToolsConfig, 
  type WriteErrorCode,
  type WriteResult 
} from './tools/WriteTools.js'

// Config
export { 
  ConfigLoader, 
  loadConfig,
  CONFIG_FILE_NAME,
  type ConfigFile,
  type ContextRootConfigInput
} from './config/ConfigLoader.js'

// Storage (additional)
export { 
  MigrationRunner, 
  createKnexConfig 
} from './storage/migrations/index.js'

// HTTP Server (Streamable HTTP Transport - MCP 2025-03-26)
export {
  HttpMcpServer,
  startHttpServer,
  loadServerConfig,
  type HttpServerConfig,
  type ProjectConfig
} from './http/index.js'
export {
  ProjectRegistry
} from './http/ProjectRegistry.js'
