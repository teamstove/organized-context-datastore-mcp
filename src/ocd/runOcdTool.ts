/**
 * OCD ツール実行の共有実装
 *
 * MCP ToolRegistry・HTTP executeToolCall・CLI `ocd-mcp tool` で同一ロジックを使用する。
 * research #1: mcpRoutes の executeToolCall と同等の分岐をここに集約
 */

import type { KnowledgeGraphService } from '../KnowledgeGraphService.js'

/** 書き込み系ツール（readonly 時は拒否） */
const WRITE_TOOL_NORMALIZED = new Set(['mutate_context', 'commit'])

/**
 * MCP 名（ocd_*）と HTTP 短名の両方を内部キーへ正規化する
 */
export function normalizeOcdToolName(toolName: string): string {
  const t = toolName.trim()
  if (t.startsWith('ocd_')) {
    return t.slice(4)
  }
  return t
}

export interface RunOcdToolOptions {
  /**
   * true のとき mutate_context / commit を拒否（CLI --readonly やサーバーポリシーと整合）
   */
  blockWrites?: boolean
}

/**
 * 単一ツールを実行して結果を返す
 *
 * @param service 初期化済み KnowledgeGraphService
 * @param toolName ocd_list_context_roots / list_context_roots など
 * @param args ツール引数（cwd は呼び出し側で解決済みのため含まれていても無視可）
 * @param options blockWrites で mutate/commit をブロック
 */
export async function runOcdTool(
  service: KnowledgeGraphService,
  toolName: string,
  args: Record<string, unknown>,
  options: RunOcdToolOptions = {}
): Promise<unknown> {
  const name = normalizeOcdToolName(toolName)

  if (options.blockWrites && WRITE_TOOL_NORMALIZED.has(name)) {
    throw new Error(
      `[OCD] Tool "${toolName}" is not available in read-only mode`
    )
  }

  // cwd は local-dev の MCP 専用。サービス解決後は不要なため除外してもよいが、
  // 下流は未使用なのでそのまま渡しても問題なし。

  switch (name) {
    case 'list_context_roots':
      return await service.listContextRoots()

    case 'get_contexts':
      return await service.getContexts({
        patterns: args.patterns as string[],
        filter: args.filter as string | undefined,
        includeContent: args.includeContent as boolean | undefined,
      })

    case 'get_context_tree':
      return await service.getContextTree({
        rootIds: args.rootIds as string[],
        depth: args.depth as number | undefined,
        format: args.format as 'json' | 'tree-text' | undefined,
        treeTextFormat: args.treeTextFormat as string | undefined,
        maxNodes: args.maxNodes as number | undefined,
      })

    case 'search_contexts':
      return await service.searchContexts(
        args.query as string,
        args.scope as string[] | undefined
      )

    case 'mutate_context': {
      const start = performance.now()
      const ops = args.operations as Parameters<
        KnowledgeGraphService['mutateContext']
      >[0]
      if (!Array.isArray(ops)) {
        throw new Error('[OCD] mutate_context requires operations: array')
      }
      const result = await service.mutateContext(ops)
      const took = (performance.now() - start) / 1000
      return { ...result, took }
    }

    case 'commit':
      return await service.commit(
        args.message as string,
        args.paths as string[] | undefined
      )

    default:
      throw new Error(`Unknown OCD tool: ${toolName}`)
  }
}
