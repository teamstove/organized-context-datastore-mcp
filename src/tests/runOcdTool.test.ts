/**
 * runOcdTool: ツール名エイリアスと readonly ガード
 */
import { describe, it, expect, vi } from 'vitest'
import { normalizeOcdToolName, runOcdTool } from '../ocd/runOcdTool.js'
import type { KnowledgeGraphService } from '../KnowledgeGraphService.js'

describe('normalizeOcdToolName', () => {
  it('ocd_ プレフィックスを除去する', () => {
    expect(normalizeOcdToolName('ocd_list_context_roots')).toBe(
      'list_context_roots'
    )
    expect(normalizeOcdToolName('list_context_roots')).toBe('list_context_roots')
  })
})

describe('runOcdTool', () => {
  it('blockWrites 時は mutate を拒否', async () => {
    const service = {
      mutateContext: vi.fn(),
    } as unknown as KnowledgeGraphService
    await expect(
      runOcdTool(service, 'mutate_context', { operations: [] }, {
        blockWrites: true,
      })
    ).rejects.toThrow(/read-only/)
    expect(service.mutateContext).not.toHaveBeenCalled()
  })

  it('blockWrites 時は ocd_mutate_context も拒否', async () => {
    const service = {} as KnowledgeGraphService
    await expect(
      runOcdTool(
        service,
        'ocd_mutate_context',
        { operations: [] },
        { blockWrites: true }
      )
    ).rejects.toThrow(/read-only/)
  })

  it('list_context_roots を呼べる', async () => {
    const roots = [{ id: 'a', name: 'A', path: '/x', readOnly: false }]
    const service = {
      listContextRoots: vi.fn().mockResolvedValue(roots),
    } as unknown as KnowledgeGraphService
    const r = await runOcdTool(service, 'ocd_list_context_roots', {})
    expect(r).toEqual(roots)
    expect(service.listContextRoots).toHaveBeenCalled()
  })

  it('未知ツールはエラー', async () => {
    const service = {} as KnowledgeGraphService
    await expect(
      runOcdTool(service, 'unknown_tool', {})
    ).rejects.toThrow(/Unknown OCD tool/)
  })
})
