/**
 * Knowledge Graph Service
 * 
 * Knowledge Graph MCP の統合サービス
 * ReadTools と WriteTools を統合し、MCPサーバーとして公開可能な形で提供
 */

import * as path from 'node:path'
import type { 
  ContextNode,
  ContextNodeSummary,
  GetContextsOptions,
  GetContextTreeOptions,
  ContextTreeResult,
  ContextTreeResults,
  ContextMutation,
  MutationResult,
  KnowledgeGraphMCPConfig,
  ContextRootConfig
} from './types/index.js'
import type { IKnowledgeStore } from './storage/IKnowledgeStore.js'
import { FileGitStore } from './storage/FileGitStore.js'
import { PostgresStore } from './storage/PostgresStore.js'
import { CompositeStore } from './storage/CompositeStore.js'
import { ReadTools } from './tools/ReadTools.js'
import { WriteTools, type WriteToolsConfig, type WriteResult } from './tools/WriteTools.js'

/**
 * Knowledge Graph Service
 * 
 * MCPツールとして公開する全機能を統合
 */
export class KnowledgeGraphService {
  private readonly config: KnowledgeGraphMCPConfig
  private readonly store: IKnowledgeStore
  private readonly readTools: ReadTools
  private readonly writeTools: WriteTools
  private initialized = false
  
  constructor(config: KnowledgeGraphMCPConfig) {
    this.config = config
    
    // ストレージを初期化
    this.store = this.createStore(config)
    
    // ツールを初期化
    this.readTools = new ReadTools(this.store, config.contextRoots)
    
    const writeConfig: WriteToolsConfig = {
      writePermission: config.writePermission,
      contextRoots: config.contextRoots
    }
    this.writeTools = new WriteTools(this.store, writeConfig)
  }
  
  /**
   * ストレージを作成
   * 
   * Context Root に個別ストレージ設定がある場合は CompositeStore を使用
   */
  private createStore(config: KnowledgeGraphMCPConfig): IKnowledgeStore {
    // デフォルトの Git モード（各 Context Root の git 設定で上書き可能）
    const defaultGitMode = 'manual' as const
    
    // 複数の Context Root がある場合は CompositeStore を使用
    // （storageType が明示されていなくても、各 contextRoot.path をストレージとして使用）
    if (config.contextRoots.length > 0) {
      console.error('[KnowledgeGraphService] CompositeStore を使用 (複数 Context Root)')
      
      return new CompositeStore({
        contextRoots: config.contextRoots,
        defaultStorageType: config.storageType || 'file-git',
        defaultStoragePath: config.storagePath,
        defaultConnectionString: config.connectionString,
        defaultGitMode
      })
    }
    
    // コンテキストルートがない場合は単一ストア
    if (config.storageType === 'file-git') {
      return new FileGitStore({
        rootPath: config.storagePath,
        git: defaultGitMode
      })
    }
    
    if (config.storageType === 'postgres') {
      if (!config.connectionString) {
        throw new Error('connectionString is required for postgres storage')
      }
      return new PostgresStore({
        connectionString: config.connectionString,
        projectId: config.storagePath || 'default',
        autoMigrate: true
      })
    }
    
    throw new Error(`Storage type '${config.storageType}' is not supported`)
  }
  
  // ==========================================================================
  // Lifecycle
  // ==========================================================================
  
  /**
   * サービスを初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    
    await this.store.initialize()
    this.initialized = true
  }
  
  /**
   * サービスを終了
   */
  async close(): Promise<void> {
    await this.store.close()
    this.initialized = false
  }
  
  // ==========================================================================
  // Read Operations (MCP Tools)
  // ==========================================================================
  
  /**
   * list_context_roots
   * 
   * 利用可能な Context Root 一覧を取得
   */
  async listContextRoots(): Promise<ContextRootConfig[]> {
    this.ensureInitialized()
    return this.readTools.listContextRoots()
  }
  
  /**
   * get_contexts
   * 
   * パターンとフィルタでコンテキストを取得
   * 
   * @param options.patterns - glob パターン配列
   * @param options.filter - jq フィルタ式
   * @param options.includeContent - コンテンツを含めるか
   * @param options.depth - 子階層を含める深さ
   */
  async getContexts(options: GetContextsOptions): Promise<ContextNode[]> {
    this.ensureInitialized()
    return this.readTools.getContexts(options)
  }
  
  /**
   * get_context_tree
   * 
   * コンテキストツリー (目次) を取得
   * 
   * @param options オプション
   * - rootPath: 単一のルートパス
   * - rootPaths: 複数のルートパス（一括取得）
   * - format: 'json' | 'tree-text' (default: 'tree-text')
   * - includeSummary, includeCategories, includeTags
   * - maxNodes: 返却上限
   * 
   * @returns rootPaths指定時は ContextTreeResults、それ以外は ContextTreeResult
   */
  async getContextTree(options: GetContextTreeOptions): Promise<ContextTreeResult | ContextTreeResults> {
    this.ensureInitialized()
    return this.readTools.getContextTree(options)
  }
  
  /**
   * search_contexts
   * 
   * キーワードでコンテキストを検索
   */
  async searchContexts(query: string, scope?: string[]): Promise<ContextNode[]> {
    this.ensureInitialized()
    return this.readTools.searchContexts(query, scope)
  }
  
  // ==========================================================================
  // Write Operations (MCP Tools) - 配列対応
  // ==========================================================================
  
  /**
   * mutate_context (統合版)
   * 
   * 全ての書き込み操作を単一のツールで実行
   * create, update, delete, move を一括で処理
   * 
   * @param operations 変更操作の配列
   * @returns 変更結果
   * 
   * @example
   * // 複数操作を一括実行
   * await mutateContext([
   *   { type: 'create', path: 'docs/features', title: '新機能', summary: '...' },
   *   { type: 'update', path: 'docs/existing', summary: '更新' },
   *   { type: 'move', path: 'old/path', to: 'new/path' },
   *   { type: 'delete', path: 'docs/obsolete' }
   * ])
   */
  async mutateContext(operations: ContextMutation[]): Promise<MutationResult> {
    this.ensureInitialized()
    return this.writeTools.mutateContext(operations)
  }
  
  /**
   * commit
   * 
   * 変更をコミット (draft_commit モード用)
   */
  async commit(message: string, paths?: string[]): Promise<string> {
    this.ensureInitialized()
    return this.writeTools.commit(message, paths)
  }
  
  // ==========================================================================
  // MCP Tool Definitions
  // ==========================================================================
  
  /**
   * MCPツール定義を取得
   */
  getToolDefinitions(): Array<{ name: string, description: string, inputSchema: object }> {
    return [
      {
        name: 'list_context_roots',
        description: 'Knowledge Baseで利用可能なContext Root一覧を取得します',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_contexts',
        description: `パターンとフィルタでコンテキストを取得します

## パラメータ
- patterns: glob パターン配列 (例: ['gme-project/**', 'core-framework/plugins/*'])
- filter: jq フィルタ式 (例: '.categories | any(. == "feature-spec")')
- includeContent: コンテンツを含めるか (default: true)`,
        inputSchema: {
          type: 'object',
          properties: {
            patterns: { type: 'array', items: { type: 'string' }, description: 'glob パターン配列' },
            filter: { type: 'string', description: 'jq フィルタ式' },
            includeContent: { type: 'boolean', description: 'コンテンツを含めるか', default: true }
          },
          required: ['patterns']
        }
      },
      {
        name: 'get_context_tree',
        description: 'コンテキストツリー(目次)を取得します。軽量版でtitle + summaryのみ返します。',
        inputSchema: {
          type: 'object',
          properties: {
            rootPath: { type: 'string', description: 'ルートパス' },
            depth: { type: 'number', description: '深さ (省略時は全階層)' }
          },
          required: ['rootPath']
        }
      },
      {
        name: 'search_contexts',
        description: 'キーワードでコンテキストを検索します',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '検索クエリ' },
            scope: { type: 'array', items: { type: 'string' }, description: '検索スコープ (glob パターン)' }
          },
          required: ['query']
        }
      },
      {
        name: 'create_context',
        description: '新規コンテキストを作成します (配列対応: 複数一括作成可能)',
        inputSchema: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  parentPath: { type: 'string', description: '親ノードのパス' },
                  title: { type: 'string', description: 'タイトル' },
                  summary: { type: 'string', description: 'サマリ' },
                  content: { type: 'string', description: '本文コンテンツ' },
                  categories: { type: 'array', items: { type: 'string' }, description: 'カテゴリ' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'タグ' }
                },
                required: ['parentPath', 'title', 'summary']
              }
            }
          },
          required: ['operations']
        }
      },
      {
        name: 'update_context',
        description: `既存コンテキストを更新します (配列対応: 複数一括更新可能)

## 概要
メタデータ (title, summary, categories, tags) と コンテンツ (contentUpdates) の両方を更新可能。

## contentUpdates の操作タイプ
### whole_replace - コンテンツ全置換
{ type: 'whole_replace', content: '新しいコンテンツ全体' }

### regexp_replace - 正規表現置換
#### 末尾追記
pattern: '$', replacement: '\\n\\n追記内容', flags: 'm'
#### 先頭追記
pattern: '^', replacement: '先頭内容\\n\\n', flags: ''
#### セクション末尾に追記
pattern: '(## セクション名.*?)(\\n## |$)', replacement: '$1\\n- 追記内容$2', flags: 's'`,
        inputSchema: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: '対象パス' },
                  title: { type: 'string', description: 'タイトル (変更する場合)' },
                  summary: { type: 'string', description: 'サマリ (変更する場合)' },
                  categories: { type: 'array', items: { type: 'string' }, description: 'カテゴリ' },
                  tags: { type: 'array', items: { type: 'string' }, description: 'タグ' },
                  contentUpdates: {
                    type: 'array',
                    items: {
                      oneOf: [
                        {
                          type: 'object',
                          properties: {
                            type: { type: 'string', enum: ['whole_replace'] },
                            content: { type: 'string' }
                          },
                          required: ['type', 'content']
                        },
                        {
                          type: 'object',
                          properties: {
                            type: { type: 'string', enum: ['regexp_replace'] },
                            pattern: { type: 'string' },
                            replacement: { type: 'string' },
                            flags: { type: 'string' }
                          },
                          required: ['type', 'pattern', 'replacement']
                        }
                      ]
                    },
                    description: 'コンテンツ操作の配列'
                  }
                },
                required: ['path']
              }
            }
          },
          required: ['operations']
        }
      },
      {
        name: 'delete_context',
        description: 'コンテキストを削除します (配列対応: 複数一括削除可能)',
        inputSchema: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string', description: '削除対象パス' }
                },
                required: ['path']
              }
            }
          },
          required: ['operations']
        }
      },
      {
        name: 'move_context',
        description: 'コンテキストを移動/リネームします (配列対応: 複数一括移動可能)',
        inputSchema: {
          type: 'object',
          properties: {
            operations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  fromPath: { type: 'string', description: '移動元パス' },
                  toPath: { type: 'string', description: '移動先パス' }
                },
                required: ['fromPath', 'toPath']
              }
            }
          },
          required: ['operations']
        }
      },
      {
        name: 'commit',
        description: '変更をコミットします (draft_commitモード用)',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'コミットメッセージ' },
            paths: { type: 'array', items: { type: 'string' }, description: '対象パス (省略時は全変更)' }
          },
          required: ['message']
        }
      }
    ]
  }
  
  // ==========================================================================
  // Internal
  // ==========================================================================
  
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('KnowledgeGraphService is not initialized. Call initialize() first.')
    }
  }
}

/**
 * デフォルト設定でサービスを作成
 */
export function createKnowledgeGraphService(
  storagePath: string,
  contextRoots: ContextRootConfig[] = []
): KnowledgeGraphService {
  // contextRoots の相対パスを絶対パスに解決
  const resolvedContextRoots = contextRoots.map(root => ({
    ...root,
    path: path.isAbsolute(root.path) ? root.path : path.resolve(storagePath, root.path)
  }))
  
  return new KnowledgeGraphService({
    storagePath,
    storageType: 'file-git',
    writePermission: {
      mode: 'unrestricted'
    },
    contextRoots: resolvedContextRoots
  })
}
