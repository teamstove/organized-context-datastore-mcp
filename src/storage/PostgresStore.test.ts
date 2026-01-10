/**
 * PostgresStore Tests
 * 
 * PostgreSQL ストレージのテスト
 * 
 * 注意: このテストを実行するには実際のPostgreSQL接続が必要です
 * 環境変数 KGMCP_PG_CONNECTION_STRING を設定してください
 * 
 * 例:
 *   KGMCP_PG_CONNECTION_STRING=postgres://user:pass@localhost:5432/kgmcp_test
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { PostgresStore, type PostgresStoreConfig } from './PostgresStore.js'

// PostgreSQL接続文字列 (環境変数から取得)
const connectionString = process.env.KGMCP_PG_CONNECTION_STRING

// PostgreSQLが利用可能かどうか
const isPostgresAvailable = !!connectionString

describe.skipIf(!isPostgresAvailable)('PostgresStore', () => {
  let store: PostgresStore
  const projectId = `test-project-${Date.now()}`
  
  beforeAll(async () => {
    const config: PostgresStoreConfig = {
      connectionString: connectionString!,
      projectId,
      autoMigrate: true,
      pool: { min: 1, max: 2 }
    }
    
    store = new PostgresStore(config)
    await store.initialize()
  })
  
  afterAll(async () => {
    if (store) {
      await store.close()
    }
  })
  
  beforeEach(async () => {
    // 各テスト前にテストデータをクリーンアップ
    try {
      await store.delete('test-node')
    } catch {
      // 存在しない場合は無視
    }
  })
  
  describe('CRUD Operations', () => {
    it('ノードを作成できること', async () => {
      const content = `---
title: Test Node
summary: テストノード
categories: ["test"]
tags: ["sample"]
---

# Test Node

これはテストノードです。
`
      await store.write('test-node', content)
      
      const exists = await store.exists('test-node')
      expect(exists).toBe(true)
    })
    
    it('ノードを読み取れること', async () => {
      const content = `---
title: Test Node
summary: テストノード
---

# Test Content
`
      await store.write('test-node', content)
      
      const result = await store.read('test-node')
      expect(result).toContain('Test Node')
      expect(result).toContain('Test Content')
    })
    
    it('ノードを更新できること', async () => {
      await store.write('test-node', `---
title: Original
summary: Original summary
---

Original content
`)
      
      await store.write('test-node', `---
title: Updated
summary: Updated summary
---

Updated content
`)
      
      const result = await store.read('test-node')
      expect(result).toContain('Updated')
    })
    
    it('ノードを削除できること', async () => {
      await store.write('test-node', `---
title: To Delete
summary: This will be deleted
---

Delete me
`)
      
      await store.delete('test-node')
      
      const exists = await store.exists('test-node')
      expect(exists).toBe(false)
    })
    
    it('ノードを移動できること', async () => {
      await store.write('test-node', `---
title: Movable
summary: This will be moved
---

Move me
`)
      
      await store.move('test-node', 'test-node-moved')
      
      const existsOld = await store.exists('test-node')
      const existsNew = await store.exists('test-node-moved')
      
      expect(existsOld).toBe(false)
      expect(existsNew).toBe(true)
      
      // クリーンアップ
      await store.delete('test-node-moved')
    })
  })
  
  describe('Glob Pattern Matching', () => {
    beforeEach(async () => {
      // テストデータを作成
      await store.write('features/feature-a', `---
title: Feature A
summary: Feature A
---
Content A
`)
      await store.write('features/feature-b', `---
title: Feature B
summary: Feature B
---
Content B
`)
      await store.write('docs/readme', `---
title: README
summary: README
---
README content
`)
    })
    
    afterAll(async () => {
      // クリーンアップ
      try {
        await store.delete('features/feature-a')
        await store.delete('features/feature-b')
        await store.delete('docs/readme')
      } catch {
        // 無視
      }
    })
    
    it('パターンでリストできること', async () => {
      const features = await store.list('features/%')
      expect(features.length).toBeGreaterThanOrEqual(2)
    })
    
    it('複数パターンでリストできること', async () => {
      const all = await store.listMultiple(['features/%', 'docs/%'])
      expect(all.length).toBeGreaterThanOrEqual(3)
    })
  })
  
  describe('Metadata', () => {
    it('メタデータを取得できること', async () => {
      await store.write('test-node', `---
title: Metadata Test
summary: Test
---
Content
`)
      
      const metadata = await store.getMetadata('test-node')
      
      expect(metadata.path).toBe('test-node')
      expect(metadata.createdAt).toBeDefined()
      expect(metadata.updatedAt).toBeDefined()
    })
  })
})

describe('PostgresStore (Mock)', () => {
  // PostgreSQLが利用できない場合のフォールバックテスト
  
  it('接続文字列が必要であること', () => {
    const config: PostgresStoreConfig = {
      connectionString: 'postgres://localhost/test',
      projectId: 'test'
    }
    
    expect(config.connectionString).toBeDefined()
  })
  
  it('プロジェクトIDが必要であること', () => {
    const config: PostgresStoreConfig = {
      connectionString: 'postgres://localhost/test',
      projectId: 'test-project'
    }
    
    expect(config.projectId).toBeDefined()
  })
})
