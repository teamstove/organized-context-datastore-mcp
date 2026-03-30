/**
 * ReadTools テスト
 * 
 * id から絶対パスへの変換機能をテスト
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ReadTools } from '../tools/ReadTools.js'
import type { ContextRootConfig } from '../types/index.js'

/** getContextTree 検証用: listMultiple の第1・第2引数を検証する */
const listMultipleMock = vi.fn(
  async (_patterns: string[], _exclude?: string[]) => [] as string[]
)

// モックストア
const mockStore = {
  initialize: async () => {},
  close: async () => {},
  exists: async () => false,
  read: async () =>
    '---\ntitle: Mock Title\nsummary: Mock summary line\n---\nbody\n',
  list: async () => [],
  listMultiple: listMultipleMock,
  write: async () => {},
  delete: async () => {},
  mkdir: async () => {},
  move: async () => {},
  getMetadata: async () => ({
    path: 'docs/mock.md',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    size: 10,
  }),
  commit: async () => '',
  getHistory: async () => [],
  readVersion: async () => '',
  revert: async () => {}
}

describe('ReadTools', () => {
  // テスト用の Context Roots（ユーザーの問題を再現）
  const contextRoots: ContextRootConfig[] = [
    {
      id: 'docs',
      name: 'TAIRIKUT DX Project Docs',
      path: '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/docs'
    },
    {
      id: 'docs-for-ai',
      name: 'CORE Framework Tech Docs',
      path: '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/docs-for-ai'
    },
    {
      id: 'src',  // ← これが問題になっていた id
      name: 'CORE Framework Source',
      path: '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/src'
    },
    {
      id: 'development-notes',
      name: 'CORE Framework Dev Notes',
      path: '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/development-notes'
    }
  ]

  let readTools: ReadTools

  beforeEach(() => {
    listMultipleMock.mockReset()
    listMultipleMock.mockResolvedValue(['docs/mock.md'])
    readTools = new ReadTools(mockStore as any, contextRoots)
  })

  describe('resolveRootPath', () => {
    it('id から絶対パスに変換できる', () => {
      const result = readTools.resolveRootPath('src')
      expect(result).toBe('/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/src')
    })

    it('docs-for-ai id から絶対パスに変換できる', () => {
      const result = readTools.resolveRootPath('docs-for-ai')
      expect(result).toBe('/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/docs-for-ai')
    })

    it('既に絶対パスの場合はそのまま返す', () => {
      const absolutePath = '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/src'
      const result = readTools.resolveRootPath(absolutePath)
      expect(result).toBe(absolutePath)
    })

    it('id/subpath 形式のパスも変換できる', () => {
      const result = readTools.resolveRootPath('src/plugins')
      expect(result).toBe('/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/src/plugins')
    })

    it('存在しない id の場合はそのまま返す', () => {
      const result = readTools.resolveRootPath('unknown-id')
      expect(result).toBe('unknown-id')
    })
  })

  describe('resolvePatterns', () => {
    it('id/**/*.md 形式のパターンを絶対パスに変換できる', () => {
      const patterns = ['src/**/*.md']
      const result = readTools.resolvePatterns(patterns)
      expect(result).toEqual(['/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/src/**/*.md'])
    })

    it('複数パターンを変換できる', () => {
      const patterns = ['docs/**/*.md', 'src/**/*.md']
      const result = readTools.resolvePatterns(patterns)
      expect(result).toEqual([
        '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/docs/**/*.md',
        '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/src/**/*.md'
      ])
    })

    it('既に絶対パスのパターンはそのまま', () => {
      const patterns = ['/some/absolute/path/**/*.md']
      const result = readTools.resolvePatterns(patterns)
      expect(result).toEqual(['/some/absolute/path/**/*.md'])
    })

    it('id/* 形式のパターンも変換できる', () => {
      const patterns = ['src/*']
      const result = readTools.resolvePatterns(patterns)
      expect(result).toEqual(['/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/src/*'])
    })
  })

  describe('listContextRoots', () => {
    it('設定された Context Roots を返す', async () => {
      const roots = await readTools.listContextRoots()
      expect(roots).toHaveLength(4)
      expect(roots[0].id).toBe('docs')
      expect(roots[2].id).toBe('src')
    })
  })

  describe('getContextTree — patterns / exclude', () => {
    it('patterns のみ指定時は rootId プレフィックス付きで listMultiple し、depth は使わない', async () => {
      await readTools.getContextTree({
        rootIds: ['docs'],
        patterns: ['recipes/**'],
        format: 'json',
      })
      expect(listMultipleMock).toHaveBeenCalledWith(['docs/recipes/**'], undefined)
    })

    it('exclude のみ指定時はデフォルト列挙 + ignorePatterns', async () => {
      await readTools.getContextTree({
        rootIds: ['docs'],
        exclude: ['plans/**'],
        format: 'json',
      })
      expect(listMultipleMock).toHaveBeenCalledWith(['docs/**/*.md'], ['docs/plans/**'])
    })

    it('patterns + exclude の両方を渡す', async () => {
      await readTools.getContextTree({
        rootIds: ['docs'],
        patterns: ['a/**', 'b/**'],
        exclude: ['plans/**'],
        format: 'json',
      })
      expect(listMultipleMock).toHaveBeenCalledWith(
        ['docs/a/**', 'docs/b/**'],
        ['docs/plans/**']
      )
    })

    it('patterns と depth の両方指定時は patterns が優先', async () => {
      await readTools.getContextTree({
        rootIds: ['docs'],
        patterns: ['only-this/**'],
        depth: 5,
        format: 'json',
      })
      expect(listMultipleMock).toHaveBeenCalledWith(['docs/only-this/**'], undefined)
    })

    it('depth のみ指定時は buildDepthPatterns（リグレッション）', async () => {
      await readTools.getContextTree({
        rootIds: ['docs'],
        depth: 1,
        format: 'json',
      })
      expect(listMultipleMock).toHaveBeenCalledWith(['docs/*.md', 'docs/*/*.md'], undefined)
    })

    it('patterns が空配列のときは未指定扱いでデフォルト glob', async () => {
      await readTools.getContextTree({
        rootIds: ['docs'],
        patterns: [],
        format: 'json',
      })
      expect(listMultipleMock).toHaveBeenCalledWith(['docs/**/*.md'], undefined)
    })
  })
})
