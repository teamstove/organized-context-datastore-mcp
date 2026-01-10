/**
 * MCP Server Tests
 * 
 * MCPサーバーのツール登録と動作確認
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { 
  createKnowledgeGraphService, 
  type KnowledgeGraphService 
} from '../index.js'

const TEST_DIR = '/tmp/mcp-server-test'

describe('MCP Server Tools', () => {
  let service: KnowledgeGraphService
  
  beforeAll(async () => {
    // テストディレクトリをセットアップ
    await fs.rm(TEST_DIR, { recursive: true, force: true })
    await fs.mkdir(TEST_DIR, { recursive: true })
    await fs.mkdir(path.join(TEST_DIR, 'project/features'), { recursive: true })
    
    // テストデータを作成
    await fs.writeFile(path.join(TEST_DIR, 'project/index.md'), `---
title: Test Project
summary: テストプロジェクト
categories:
  - project-overview
tags:
  - test
---

# Test Project

テスト用プロジェクト
`)
    
    await fs.writeFile(path.join(TEST_DIR, 'project/features/feature1.md'), `---
title: Feature 1
summary: 機能1の仕様
categories:
  - feature-spec
tags:
  - Phase1
  - priority-high
---

# Feature 1

## TODO

- [ ] [[要確認:お客様]] 仕様確認
- [x] [[完了]] 設計完了
`)
    
    // サービス初期化
    service = createKnowledgeGraphService(TEST_DIR, [
      { id: 'project', name: 'Test Project', path: 'project' }
    ])
    await service.initialize()
  })
  
  afterAll(async () => {
    await service.close()
    await fs.rm(TEST_DIR, { recursive: true, force: true })
  })
  
  describe('Tool Definitions', () => {
    it('should have all expected tools defined', () => {
      const tools = service.getToolDefinitions()
      
      const toolNames = tools.map(t => t.name)
      
      // 読み取りツール (4)
      expect(toolNames).toContain('list_context_roots')
      expect(toolNames).toContain('get_contexts')
      expect(toolNames).toContain('get_context_tree')
      expect(toolNames).toContain('search_contexts')
      
      // 書き込みツール (5) - append_to_context は削除済み
      expect(toolNames).toContain('create_context')
      expect(toolNames).toContain('update_context')
      expect(toolNames).toContain('delete_context')
      expect(toolNames).toContain('move_context')
      expect(toolNames).toContain('commit')
      
      // append_to_context は存在しないことを確認
      expect(toolNames).not.toContain('append_to_context')
    })
    
    it('should have proper input schema for get_contexts', () => {
      const tools = service.getToolDefinitions()
      const getContexts = tools.find(t => t.name === 'get_contexts')
      
      expect(getContexts).toBeDefined()
      expect(getContexts?.inputSchema.properties).toHaveProperty('patterns')
      expect(getContexts?.inputSchema.properties).toHaveProperty('filter')
      expect(getContexts?.inputSchema.required).toContain('patterns')
    })
    
    it('should have array-based operations schema for create_context', () => {
      const tools = service.getToolDefinitions()
      const createContext = tools.find(t => t.name === 'create_context')
      
      expect(createContext).toBeDefined()
      expect(createContext?.inputSchema.properties).toHaveProperty('operations')
      expect(createContext?.inputSchema.required).toContain('operations')
    })
    
    it('should have contentUpdates in update_context schema', () => {
      const tools = service.getToolDefinitions()
      const updateContext = tools.find(t => t.name === 'update_context')
      
      expect(updateContext).toBeDefined()
      expect(updateContext?.inputSchema.properties).toHaveProperty('operations')
      
      // 説明に contentUpdates の使い方が含まれていること
      expect(updateContext?.description).toContain('contentUpdates')
      expect(updateContext?.description).toContain('regexp_replace')
    })
  })
  
  describe('Service Methods (Direct Calls)', () => {
    it('should handle listContextRoots', async () => {
      const result = await service.listContextRoots()
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0].id).toBe('project')
    })
    
    it('should handle getContexts with patterns', async () => {
      const result = await service.getContexts({
        patterns: ['project/**/*.md']
      })
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
    
    it('should handle getContexts with jq filter', async () => {
      const result = await service.getContexts({
        patterns: ['project/**/*.md'],
        filter: '.categories | any(. == "feature-spec")'
      })
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0].title).toBe('Feature 1')
    })
    
    it('should handle getContextTree', async () => {
      const result = await service.getContextTree({
        rootPath: 'project',
        format: 'json'  // JSON形式で取得
      })
      
      expect(result.format).toBe('json')
      expect(Array.isArray(result.tree)).toBe(true)
      expect((result.tree as unknown[]).length).toBeGreaterThan(0)
    })
    
    it('should handle getContextTree with tree-text format', async () => {
      const result = await service.getContextTree({
        rootPath: 'project',
        format: 'tree-text'
      })
      
      expect(result.format).toBe('tree-text')
      expect(typeof result.tree).toBe('string')
      expect(result.tree).toContain('[project]')
    })
    
    it('should handle searchContexts', async () => {
      const result = await service.searchContexts('Feature')
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })
    
    it('should handle mutateContext with create operation', async () => {
      const result = await service.mutateContext([{
        type: 'create',
        path: 'project/features',
        title: 'New Feature',
        summary: '新しい機能',
        categories: ['feature-spec'],
        tags: ['Phase2']
      }])
      
      expect(result.success).toBe(1)
      expect(result.errors).toBe(0)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].result?.path).toContain('new-feature')
    })
    
    it('should handle mutateContext with update operation', async () => {
      const result = await service.mutateContext([{
        type: 'update',
        path: 'project/features/feature1',
        summary: '更新された機能1の仕様'
      }])
      
      expect(result.success).toBe(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].result?.summary).toBe('更新された機能1の仕様')
    })
    
    it('should handle mutateContext with contentUpdates (append)', async () => {
      const result = await service.mutateContext([{
        type: 'update',
        path: 'project/index',
        contentUpdates: [{
          type: 'regexp_replace',
          pattern: '$',
          replacement: '\n\n## 追記セクション\n\n追記された内容',
          flags: 'm'
        }]
      }])
      
      expect(result.success).toBe(1)
      expect(result.results[0].success).toBe(true)
      expect(result.results[0].result?.content).toContain('追記セクション')
    })
    
    it('should handle multiple operations in batch', async () => {
      // 複数種類の操作を一度に実行
      const result = await service.mutateContext([
        {
          type: 'create',
          path: 'project/features',
          title: 'Batch Feature 1',
          summary: 'バッチ機能1'
        },
        {
          type: 'create',
          path: 'project/features',
          title: 'Batch Feature 2',
          summary: 'バッチ機能2'
        }
      ])
      
      expect(result.success).toBe(2)
      expect(result.errors).toBe(0)
      expect(result.results.length).toBe(2)
    })
  })
})
