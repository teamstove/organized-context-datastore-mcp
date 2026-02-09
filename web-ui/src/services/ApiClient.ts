/**
 * ApiClient - REST API / MCP 呼び出しの抽象化
 *
 * 責務:
 * - REST API エンドポイントへの HTTP リクエスト
 * - エラーハンドリング
 * - レスポンスの型変換
 *
 * パラメータ構築は apiHelpers に委譲
 */
import axios, { type AxiosInstance, type AxiosError } from 'axios'
import type { InjectionKey } from 'vue'
import type {
  ContextRootConfig,
  ContextNode,
  ContextTreeResult,
  ContextMutation,
} from '@/types'
import { ParamsBuilder } from '@/utils/apiHelpers'

// =============================================================================
// API レスポンス型
// =============================================================================

export interface ApiResponse<T> {
  data?: T
  error?: string
}

export interface RootsResponse {
  roots: ContextRootConfig[]
}

export interface ContextsResponse {
  contexts: ContextNode[]
}

export interface ContextResponse {
  context: ContextNode
}

export interface SearchResponse {
  contexts: ContextNode[]
  query: string
  total: number
}

export interface MutationResponse {
  success: number
  errors: number
  results: Array<{
    type: 'create' | 'update' | 'delete' | 'move'
    path: string
    success: boolean
    error?: string
  }>
}

export interface CommitResponse {
  commitHash: string
}

// =============================================================================
// ApiClient クラス
// =============================================================================

export class ApiClient {
  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private client: AxiosInstance
  private baseUrl: string

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(baseUrl: string = '/api/ocd') {
    this.baseUrl = baseUrl
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })

    // レスポンスインターセプター
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error('[ApiClient] Request failed:', error.message)
        return Promise.reject(error)
      }
    )
  }

  // ---------------------------------------------------------------------------
  // Read Operations
  // ---------------------------------------------------------------------------

  /**
   * Context Root 一覧を取得
   */
  async listRoots(cwd: string): Promise<ContextRootConfig[]> {
    const response = await this.client.get<RootsResponse>('/roots', {
      params: { cwd },
    })
    return response.data.roots
  }

  /**
   * Context ツリーを取得
   * 
   * @param cwd 作業ディレクトリ
   * @param options.rootIds Context Root の ID 配列（list_context_roots で取得した id を使用）
   */
  async getTree(
    cwd: string,
    options: {
      rootIds: string[]
      depth?: number
      format?: 'json' | 'tree-text'
      maxNodes?: number
    }
  ): Promise<ContextTreeResult> {
    const params = new ParamsBuilder()
      .set('cwd', cwd)
      .setArray('rootIds', options.rootIds)
      .setIfPresent('depth', options.depth)
      .setIfPresent('format', options.format || 'json')
      .setIfPresent('maxNodes', options.maxNodes)
      .build()

    const response = await this.client.get<ContextTreeResult>('/tree', { params })
    return response.data
  }

  /**
   * Context 一覧を取得（パターン指定）
   */
  async getContexts(
    cwd: string,
    options?: {
      patterns?: string[]
      filter?: string
      includeContent?: boolean
    }
  ): Promise<ContextNode[]> {
    const params = new ParamsBuilder()
      .set('cwd', cwd)
      .setArray('patterns', options?.patterns)
      .setIfPresent('filter', options?.filter)
      .setIfPresent('includeContent', options?.includeContent)
      .build()

    const response = await this.client.get<ContextsResponse>('/contexts', { params })
    return response.data.contexts
  }

  /**
   * 単一 Context を取得
   */
  async getContext(cwd: string, path: string): Promise<ContextNode | null> {
    try {
      const response = await this.client.get<ContextResponse>(`/context/${path}`, {
        params: { cwd },
      })
      return response.data.context
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return null
      }
      throw error
    }
  }

  /**
   * 検索
   */
  async search(
    cwd: string,
    query: string,
    scope?: string[]
  ): Promise<SearchResponse> {
    const params = new ParamsBuilder()
      .set('cwd', cwd)
      .set('q', query)
      .setArray('scope', scope)
      .build()

    const response = await this.client.get<SearchResponse>('/search', { params })
    return response.data
  }

  // ---------------------------------------------------------------------------
  // Write Operations
  // ---------------------------------------------------------------------------

  /**
   * 変更操作
   */
  async mutate(cwd: string, operations: ContextMutation[]): Promise<MutationResponse> {
    const response = await this.client.post<MutationResponse>('/mutate', {
      cwd,
      operations,
    })
    return response.data
  }

  /**
   * コミット
   */
  async commit(cwd: string, message: string, paths?: string[]): Promise<string> {
    const response = await this.client.post<CommitResponse>('/commit', {
      cwd,
      message,
      paths,
    })
    return response.data.commitHash
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * ベース URL を変更
   */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl
    this.client.defaults.baseURL = baseUrl
  }

  /**
   * 現在のベース URL を取得
   */
  getBaseUrl(): string {
    return this.baseUrl
  }
}

// =============================================================================
// Injection Key
// =============================================================================

export const apiClientKey: InjectionKey<ApiClient> = Symbol('ApiClient')
