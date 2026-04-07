/**
 * Knowledge Graph Service Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createKnowledgeGraphService, type KnowledgeGraphService } from '../index.js'
import type { ContextTreeResult } from '../types/index.js'

const TEST_DIR = '/tmp/knowledge-graph-test'

describe('KnowledgeGraphService', () => {
  let service: KnowledgeGraphService
  
  beforeAll(async () => {
    // テストディレクトリをクリーンアップ
    await fs.rm(TEST_DIR, { recursive: true, force: true })
    await fs.mkdir(TEST_DIR, { recursive: true })
    
    // サービスを作成
    service = createKnowledgeGraphService(TEST_DIR, [
      { id: 'project', name: 'Test Project', path: 'project' }
    ])
    
    await service.initialize()
  })
  
  afterAll(async () => {
    await service.close()
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  })
  
  beforeEach(async () => {
    // 各テスト前にテストデータをクリーンアップ＆セットアップ
    const projectDir = path.join(TEST_DIR, 'project')
    // 前のテストで作成されたファイルを削除
    await fs.rm(projectDir, { recursive: true, force: true })
    await fs.mkdir(projectDir, { recursive: true })
  })
  
  describe('listContextRoots', () => {
    it('should return configured context roots', async () => {
      const roots = await service.listContextRoots()
      
      expect(roots).toHaveLength(1)
      expect(roots[0].id).toBe('project')
      expect(roots[0].name).toBe('Test Project')
    })
  })
  
  describe('mutateContext (create)', () => {
    it('should create a new context with title and summary', async () => {
      // mutateContext で作成（path, title, summary, content は必須）
      const result = await service.mutateContext([{
        type: 'create',
        path: 'project/test-feature',
        content: '# テスト機能\n\nこれはテスト用のコンテンツです。',
        title: 'テスト機能実装',
        summary: 'ユーザー認証とプロファイル管理機能。OAuth2.0対応、JWT発行、セッション管理を含む',
        attrs: { status: 'draft' }
      }])
      
      // 結果は MutationResult 形式（Token 効率のため result は省略）
      expect(result.success).toBe(1)
      expect(result.errors).toBe(0)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].type).toBe('create')
      expect(result.results[0].path).toBe('project/test-feature')
      
      // 作成されたファイルの frontmatter に summary が含まれることを確認
      const contexts = await service.getContexts({
        patterns: ['project/**/*.md']
      })
      const created = contexts.find(c => c.path === 'project/test-feature')
      expect(created).toBeDefined()
      expect(created!.attrs.summary).toBe('ユーザー認証とプロファイル管理機能。OAuth2.0対応、JWT発行、セッション管理を含む')
    })
  })
  
  describe('getContexts', () => {
    beforeEach(async () => {
      // テストデータを作成
      const testFile = path.join(TEST_DIR, 'project', 'test-feature.md')
      await fs.writeFile(testFile, `---
title: テスト機能
status: draft
priority: high
---

# テスト機能

## 概要

これはテスト機能です。

## TODO [[要確認:お客様]]

- [ ] [[要確認:お客様]] 仕様の確認
- [x] [[完了]] 基本設計
`)
    })
    
    it('should get contexts by pattern', async () => {
      const contexts = await service.getContexts({
        patterns: ['project/**/*.md']
      })
      
      expect(contexts.length).toBeGreaterThan(0)
      expect(contexts[0].title).toBe('テスト機能')
    })
    
    it('should filter contexts by jq expression', async () => {
      const contexts = await service.getContexts({
        patterns: ['project/**/*.md'],
        filter: '.attrs.status == "draft"'
      })
      
      expect(contexts.length).toBeGreaterThan(0)
      expect(contexts[0].attrs.status).toBe('draft')
    })
    
    it('should parse annotations', async () => {
      const contexts = await service.getContexts({
        patterns: ['project/**/*.md']
      })
      
      expect(contexts[0].annotations.length).toBeGreaterThan(0)
      const annotation = contexts[0].annotations.find(a => 
        a.attributes.some(attr => attr.includes('要確認'))
      )
      expect(annotation).toBeDefined()
    })
    
    it('should parse todos', async () => {
      const contexts = await service.getContexts({
        patterns: ['project/**/*.md']
      })
      
      expect(contexts[0].todos.length).toBe(2)
      
      const incompleteTodo = contexts[0].todos.find(t => !t.completed)
      expect(incompleteTodo).toBeDefined()
      expect(incompleteTodo?.text).toContain('仕様の確認')
      
      const completedTodo = contexts[0].todos.find(t => t.completed)
      expect(completedTodo).toBeDefined()
      expect(completedTodo?.text).toContain('基本設計')
    })
  })
  
  describe('mutateContext (update)', () => {
    beforeEach(async () => {
      const testFile = path.join(TEST_DIR, 'project', 'update-test.md')
      await fs.writeFile(testFile, `---
title: 更新テスト
status: draft
---

# 更新テスト

内容
`)
    })
    
    it('should update context attrs', async () => {
      // mutateContext で更新
      const result = await service.mutateContext([{
        type: 'update',
        path: 'project/update-test',
        attrs: { status: 'published' }
      }])
      
      expect(result.success).toBe(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].type).toBe('update')
      expect(result.results[0].path).toBe('project/update-test')
    })
    
    it('should append content using regexp_replace', async () => {
      // mutateContext + contentUpdates で追記
      const result = await service.mutateContext([{
        type: 'update',
        path: 'project/update-test',
        contentUpdates: [{
          type: 'regexp_replace',
          pattern: '$',
          replacement: '\n\n## 追記セクション\n\n追記された内容',
          flags: 'm'
        }]
      }])
      
      expect(result.results[0].success).toBe(true)
      
      const contexts = await service.getContexts({
        patterns: ['project/update-test.md']
      })
      
      expect(contexts[0].content).toContain('追記セクション')
      expect(contexts[0].content).toContain('追記された内容')
    })
  })
  
  describe('getContextTree', () => {
    beforeEach(async () => {
      // 他のテストで作成されたファイルをクリーンアップ
      const projectDir = path.join(TEST_DIR, 'project')
      await fs.rm(projectDir, { recursive: true, force: true })
      
      // ネストしたディレクトリ構造を作成
      const dirs = [
        'project/features',
        'project/specs',
      ]
      
      for (const dir of dirs) {
        await fs.mkdir(path.join(TEST_DIR, dir), { recursive: true })
      }
      
      await fs.writeFile(path.join(TEST_DIR, 'project/index.md'), `---
title: プロジェクト概要
---

# プロジェクト概要
`)
      
      await fs.writeFile(path.join(TEST_DIR, 'project/features/feature1.md'), `---
title: 機能1
---

# 機能1
`)
    })
    
    it('should get context tree in json format', async () => {
      // rootIds が1件のとき実装は ContextTreeResult を返す（複数件時は union 型になる）
      const result = (await service.getContextTree({
        rootIds: ['project'],
        format: 'json'
      })) as ContextTreeResult
      
      expect(result.format).toBe('json')
      expect(Array.isArray(result.tree)).toBe(true)
      
      const tree = result.tree as Array<{ title: string }>
      expect(tree.length).toBeGreaterThan(0)
      
      const titles = tree.map(t => t.title)
      expect(titles).toContain('プロジェクト概要')
      expect(titles).toContain('機能1')
    })
    
    it('should get context tree in tree-text format (default)', async () => {
      const result = (await service.getContextTree({
        rootIds: ['project']
      })) as ContextTreeResult
      
      expect(result.format).toBe('tree-text')
      expect(typeof result.tree).toBe('string')
      
      const treeText = result.tree as string
      // ルートパスとノード数が表示される（仮想ディレクトリは除外）
      expect(treeText).toContain('[project]')
      expect(treeText).toContain('(2 nodes)')  // project, feature1（仮想ディレクトリ features は除外）
      // index.md は親ディレクトリ名として表示される
      // project/index → project に正規化
      expect(treeText).toContain('project:')
      // features は仮想ディレクトリなので除外される
      expect(treeText).not.toContain('features:')
      expect(treeText).toContain('feature1:')
      // デフォルトフォーマットは "$path: $title" なので title が表示される
      expect(treeText).toContain('プロジェクト概要')  // title
      expect(treeText).toContain('機能1')  // title
    })
    
    it('should get context tree in flat style', async () => {
      const result = (await service.getContextTree({
        rootIds: ['project']
      })) as ContextTreeResult
      
      expect(result.format).toBe('tree-text')
      const treeText = result.tree as string
      // フルパス表記（ネストなし）
      expect(treeText).not.toContain('├')
      expect(treeText).not.toContain('└')
    })
  })
  
  describe('searchContexts', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(TEST_DIR, 'project/search-test.md'), `---
title: 検索テスト
---

# 検索テスト

ユニークなキーワード: FINDME123
`)
    })
    
    it('should search contexts by keyword', async () => {
      const results = await service.searchContexts('FINDME123')
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].content).toContain('FINDME123')
    })
  })
  
  describe('mutateContext (統合版)', () => {
    it('should create, update, and delete in a single call', async () => {
      // 1. 作成を一括実行（path は完全なパス、content は必須）
      const result = await service.mutateContext([
        {
          type: 'create',
          path: 'project/mutate-test-1',
          content: '# Mutate Test 1\n\nテスト内容1',
          title: 'mutate-test-1'
        },
        {
          type: 'create',
          path: 'project/mutate-test-2',
          content: '# Mutate Test 2\n\nテスト内容2',
          title: 'mutate-test-2'
        }
      ])
      
      expect(result.success).toBe(2)
      expect(result.errors).toBe(0)
      expect(result.results).toHaveLength(2)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].type).toBe('create')
      
      // 2. 更新と削除を一括実行
      const result2 = await service.mutateContext([
        {
          type: 'update',
          path: 'project/mutate-test-1',
          attrs: { status: 'updated' }
        },
        {
          type: 'delete',
          path: 'project/mutate-test-2'
        }
      ])
      
      expect(result2.success).toBe(2)
      expect(result2.errors).toBe(0)
      
      // 検証: test-1 は更新されている
      const updated = await service.getContexts({ patterns: ['project/mutate-test-1*'] })
      expect(updated).toHaveLength(1)
      expect(updated[0].attrs.status).toBe('updated')
      
      // 検証: test-2 は削除されている
      const deleted = await service.getContexts({ patterns: ['project/mutate-test-2*'] })
      expect(deleted).toHaveLength(0)
    })
    
    it('should handle move operation', async () => {
      // 作成（path は完全なパス、content は必須）
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/move-source',
          content: '# Move Source\n\n移動元のコンテンツ',
          title: 'move-source',
          attrs: { note: '移動元' }
        }
      ])
      
      // 移動
      const result = await service.mutateContext([
        {
          type: 'move',
          path: 'project/move-source',
          to: 'project/move-dest'
        }
      ])
      
      expect(result.success).toBe(1)
      expect(result.results[0].type).toBe('move')
      expect(result.results[0].path).toBe('project/move-dest')
      
      // 検証
      const moved = await service.getContexts({ patterns: ['project/move-dest*'] })
      expect(moved).toHaveLength(1)
      expect(moved[0].attrs.note).toBe('移動元')
    })
    
    it('should handle errors gracefully', async () => {
      const result = await service.mutateContext([
        {
          type: 'update',
          path: 'project/non-existent',
          attrs: { status: 'na' }
        }
      ])
      
      expect(result.success).toBe(0)
      expect(result.errors).toBe(1)
      expect(result.results[0].success).toBe(false)
      expect(result.results[0].error).toBeDefined()
    })
    
    it('should continue on error (partial success)', async () => {
      // 1つ成功、1つ失敗（create は path と content が必須）
      const result = await service.mutateContext([
        {
          type: 'create',
          path: 'project/partial-success',
          content: '# Partial Success\n\nテスト内容',
          title: 'partial-success'
        },
        {
          type: 'update',
          path: 'project/non-existent',
          attrs: { status: 'failed' }
        }
      ])
      
      expect(result.success).toBe(1)
      expect(result.errors).toBe(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[1].success).toBe(false)
    })
  })
  
  // ==========================================================================
  // Move with Backlink Update Tests
  // ==========================================================================
  
  describe('mutateContext (move with backlink update)', () => {
    it('should update backlinks when moving a file', async () => {
      // 1. ターゲットファイルを作成
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/docs/feature',
          content: '# Feature\n\nFeature description.',
          title: 'Feature'
        }
      ])
      
      // 2. ターゲットを参照するファイルを作成
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/docs/overview',
          content: '# Overview\n\nSee [Feature](./feature.md) for details.\n\nAlso check [[docs/feature]].',
          title: 'Overview'
        }
      ])
      
      // 3. ファイルを移動
      const result = await service.mutateContext([
        {
          type: 'move',
          path: 'project/docs/feature',
          to: 'project/archive/feature'
        }
      ])
      
      expect(result.success).toBe(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].backlinksUpdated).toBe(1) // overview.md が更新される
      
      // 4. 被リンクが更新されているか確認
      const contexts = await service.getContexts({ 
        patterns: ['project/docs/overview*'],
        includeContent: true
      })
      
      expect(contexts).toHaveLength(1)
      // リンクが更新されていることを確認
      expect(contexts[0].content).toContain('../archive/feature')
    })
    
    it('should not return backlinksUpdated when no backlinks exist', async () => {
      // 1. リンクのないファイルを作成
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/isolated-file',
          content: '# Isolated\n\nNo links to this file.',
          title: 'Isolated'
        }
      ])
      
      // 2. 移動
      const result = await service.mutateContext([
        {
          type: 'move',
          path: 'project/isolated-file',
          to: 'project/moved-isolated'
        }
      ])
      
      expect(result.success).toBe(1)
      expect(result.results[0].success).toBe(true)
      // 被リンクがない場合は undefined
      expect(result.results[0].backlinksUpdated).toBeUndefined()
    })
    
    it('should update multiple backlinks in one file', async () => {
      // 1. ターゲットファイルを作成
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/target',
          content: '# Target\n\nTarget content.',
          title: 'Target'
        }
      ])
      
      // 2. 複数のリンクを持つファイルを作成
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/referencer',
          content: '# Referencer\n\nFirst link: [Target](./target.md)\n\nSecond link: [Also Target](./target.md)',
          title: 'Referencer'
        }
      ])
      
      // 3. 移動
      const result = await service.mutateContext([
        {
          type: 'move',
          path: 'project/target',
          to: 'project/new-target'
        }
      ])
      
      expect(result.success).toBe(1)
      expect(result.results[0].backlinksUpdated).toBe(1) // ファイル単位でカウント
      
      // 4. 確認
      const contexts = await service.getContexts({ 
        patterns: ['project/referencer*'],
        includeContent: true
      })
      
      expect(contexts).toHaveLength(1)
      // 両方のリンクが更新されていることを確認
      expect(contexts[0].content).toContain('./new-target.md')
      expect(contexts[0].content).not.toContain('./target.md')
    })
    
    it('should update backlinks from multiple files', async () => {
      // 1. ターゲットファイルを作成
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/shared-target',
          content: '# Shared Target\n\nShared content.',
          title: 'Shared Target'
        }
      ])
      
      // 2. 複数のファイルからリンク
      await service.mutateContext([
        {
          type: 'create',
          path: 'project/file1',
          content: '# File 1\n\nLink: [Shared](./shared-target.md)',
          title: 'File 1'
        },
        {
          type: 'create',
          path: 'project/file2',
          content: '# File 2\n\nLink: [Shared](./shared-target.md)',
          title: 'File 2'
        }
      ])
      
      // 3. 移動
      const result = await service.mutateContext([
        {
          type: 'move',
          path: 'project/shared-target',
          to: 'project/new-shared'
        }
      ])
      
      expect(result.success).toBe(1)
      expect(result.results[0].backlinksUpdated).toBe(2) // 2ファイルが更新される
    })
  })
})
