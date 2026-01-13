/**
 * Knowledge Graph Service Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createKnowledgeGraphService, type KnowledgeGraphService } from '../index.js'

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
    it('should create a new context', async () => {
      // mutateContext で作成
      const result = await service.mutateContext([{
        type: 'create',
        path: 'project',
        title: 'テスト機能',
        summary: 'これはテスト機能です',
        categories: ['feature-spec'],
        tags: ['Phase1']
      }])
      
      // 結果は MutationResult 形式（Token 効率のため result は省略）
      expect(result.success).toBe(1)
      expect(result.errors).toBe(0)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].type).toBe('create')
      expect(result.results[0].path).toContain('テスト機能')  // slugified title (日本語対応)
    })
  })
  
  describe('getContexts', () => {
    beforeEach(async () => {
      // テストデータを作成
      const testFile = path.join(TEST_DIR, 'project', 'test-feature.md')
      await fs.writeFile(testFile, `---
title: テスト機能
summary: テスト機能の概要
categories:
  - feature-spec
tags:
  - Phase1
  - priority-high
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
        filter: '.categories | any(. == "feature-spec")'
      })
      
      expect(contexts.length).toBeGreaterThan(0)
      expect(contexts[0].categories).toContain('feature-spec')
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
summary: 更新前のサマリ
categories: []
tags: []
---

# 更新テスト

内容
`)
    })
    
    it('should update context summary', async () => {
      // mutateContext で更新
      const result = await service.mutateContext([{
        type: 'update',
        path: 'project/update-test',
        summary: '更新後のサマリ'
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
summary: プロジェクトのトップページ
---

# プロジェクト概要
`)
      
      await fs.writeFile(path.join(TEST_DIR, 'project/features/feature1.md'), `---
title: 機能1
summary: 機能1の説明
---

# 機能1
`)
    })
    
    it('should get context tree in json format', async () => {
      const result = await service.getContextTree({
        rootPath: 'project',
        format: 'json'
      })
      
      expect(result.format).toBe('json')
      expect(Array.isArray(result.tree)).toBe(true)
      
      const tree = result.tree as Array<{ title: string }>
      expect(tree.length).toBeGreaterThan(0)
      
      const titles = tree.map(t => t.title)
      expect(titles).toContain('プロジェクト概要')
      expect(titles).toContain('機能1')
    })
    
    it('should get context tree in tree-text format (default)', async () => {
      const result = await service.getContextTree({
        rootPath: 'project'
      })
      
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
      const result = await service.getContextTree({
        rootPath: 'project',
        treeStyle: 'flat'
      })
      
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
summary: 検索用のテストドキュメント
tags: [検索, テスト]
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
      // 1. 作成 + 更新 + 削除を一括実行
      const result = await service.mutateContext([
        // 作成
        {
          type: 'create',
          path: 'project',
          title: 'mutate-test-1',
          summary: 'テスト1'
        },
        {
          type: 'create',
          path: 'project',
          title: 'mutate-test-2',
          summary: 'テスト2'
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
          summary: '更新済み'
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
      expect(updated[0].summary).toBe('更新済み')
      
      // 検証: test-2 は削除されている
      const deleted = await service.getContexts({ patterns: ['project/mutate-test-2*'] })
      expect(deleted).toHaveLength(0)
    })
    
    it('should handle move operation', async () => {
      // 作成
      await service.mutateContext([
        {
          type: 'create',
          path: 'project',
          title: 'move-source',
          summary: '移動元'
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
      expect(moved[0].summary).toBe('移動元')
    })
    
    it('should handle errors gracefully', async () => {
      const result = await service.mutateContext([
        {
          type: 'update',
          path: 'project/non-existent',
          summary: '存在しない'
        }
      ])
      
      expect(result.success).toBe(0)
      expect(result.errors).toBe(1)
      expect(result.results[0].success).toBe(false)
      expect(result.results[0].error).toBeDefined()
    })
    
    it('should continue on error (partial success)', async () => {
      // 1つ成功、1つ失敗
      const result = await service.mutateContext([
        {
          type: 'create',
          path: 'project',
          title: 'partial-success',
          summary: 'これは成功'
        },
        {
          type: 'update',
          path: 'project/non-existent',
          summary: 'これは失敗'
        }
      ])
      
      expect(result.success).toBe(1)
      expect(result.errors).toBe(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[1].success).toBe(false)
    })
  })
})
