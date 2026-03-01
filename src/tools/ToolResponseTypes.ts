/**
 * MCP ツールレスポンス型定義
 *
 * 各ツールの structuredContent / content text の形状を定義。
 * buildResult<T>() のジェネリクスパラメータとして使用される。
 */

import type {
  ContextRootConfig,
  ContextNode,
  ContextTreeResult,
  ContextTreeResults,
  MutationResult,
  MutationOperationResult,
} from '../types/index.js'

// =============================================================================
// Read Tool Responses
// =============================================================================

/** ocd_list_context_roots のレスポンス */
export interface ListContextRootsResponse {
  roots: ContextRootConfig[]
}

/** ocd_get_contexts のレスポンス */
export interface GetContextsResponse {
  contexts: ContextNode[]
  count: number
}

/**
 * ocd_get_context_tree のレスポンス
 *
 * - 単一 rootId → ContextTreeResult
 * - 複数 rootIds → ContextTreeResults
 */
export type GetContextTreeResponse = ContextTreeResult | ContextTreeResults

/** ocd_search_contexts のレスポンス */
export interface SearchContextsResponse {
  results: ContextNode[]
  count: number
}

// =============================================================================
// Write Tool Responses
// =============================================================================

/**
 * ocd_mutate_context のレスポンス
 *
 * MutationResult の took を必須化（ToolRegistry 側で計測して付与するため）
 */
export interface MutateContextResponse {
  success: number
  errors: number
  results: MutationOperationResult[]
  took: number
}

/** ocd_commit のレスポンス */
export interface CommitResponse {
  hash: string
  message: string
}

// =============================================================================
// Common
// =============================================================================

/** エラーレスポンス（全ツール共通） */
export interface ToolErrorResponse {
  error: string
}

// =============================================================================
// Re-exports (型の参照用)
// =============================================================================

export type {
  ContextRootConfig,
  ContextNode,
  ContextTreeResult,
  ContextTreeResults,
  MutationResult,
  MutationOperationResult,
}
