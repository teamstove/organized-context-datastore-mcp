/**
 * CompositeStore テスト
 * 
 * Context Root ごとに異なるストレージを透過的にルーティングするテスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { CompositeStore } from '../storage/CompositeStore.js'
import type { ContextRootConfig } from '../types/index.js'

describe('CompositeStore', () => {
  // テスト用一時ディレクトリ
  let tempDir: string
  let docsDir: string
  let dataDir: string
  
  beforeAll(async () => {
    // テスト用ディレクトリを作成
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'composite-store-test-'))
    docsDir = path.join(tempDir, 'docs-repo')
    dataDir = path.join(tempDir, 'data-repo')
    
    await fs.mkdir(docsDir, { recursive: true })
    await fs.mkdir(dataDir, { recursive: true })
  })
  
  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.rm(tempDir, { recursive: true, force: true })
  })
  
  describe('パスルーティング', () => {
    let store: CompositeStore
    
    beforeEach(async () => {
      // テスト用ファイルをクリア
      await fs.rm(docsDir, { recursive: true, force: true })
      await fs.rm(dataDir, { recursive: true, force: true })
      await fs.mkdir(docsDir, { recursive: true })
      await fs.mkdir(dataDir, { recursive: true })
      
      const contextRoots: ContextRootConfig[] = [
        {
          id: 'docs',
          name: 'Documentation',
          path: 'docs',
          storageType: 'file-git',
          storagePath: docsDir
        },
        {
          id: 'data',
          name: 'Dynamic Data',
          path: 'data',
          storageType: 'file-git',
          storagePath: dataDir
        }
      ]
      
      store = new CompositeStore({
        contextRoots,
        defaultStorageType: 'file-git',
        defaultStoragePath: tempDir,
        autoCommit: false
      })
      
      await store.initialize()
    })
    
    afterAll(async () => {
      await store?.close()
    })
    
    it('異なる Context Root への書き込みが別々のストアに保存される', async () => {
      // docs に書き込み
      await store.write('docs/intro.md', '# Introduction')
      
      // data に書き込み
      await store.write('data/item1.md', '# Item 1')
      
      // 各ストアに正しく保存されていることを確認
      const docsContent = await fs.readFile(path.join(docsDir, 'docs/intro.md'), 'utf-8')
      expect(docsContent).toBe('# Introduction')
      
      const dataContent = await fs.readFile(path.join(dataDir, 'data/item1.md'), 'utf-8')
      expect(dataContent).toBe('# Item 1')
    })
    
    it('読み取りが正しいストアから行われる', async () => {
      // 事前にファイルを作成
      await fs.mkdir(path.join(docsDir, 'docs'), { recursive: true })
      await fs.writeFile(path.join(docsDir, 'docs/readme.md'), '# README')
      
      // CompositeStore から読み取り
      const content = await store.read('docs/readme.md')
      expect(content).toBe('# README')
    })
    
    it('exists が正しいストアをチェックする', async () => {
      await fs.mkdir(path.join(docsDir, 'docs'), { recursive: true })
      await fs.writeFile(path.join(docsDir, 'docs/exists.md'), 'exists')
      
      expect(await store.exists('docs/exists.md')).toBe(true)
      expect(await store.exists('docs/not-exists.md')).toBe(false)
      expect(await store.exists('data/not-exists.md')).toBe(false)
    })
    
    it('delete が正しいストアから削除する', async () => {
      await fs.mkdir(path.join(dataDir, 'data'), { recursive: true })
      await fs.writeFile(path.join(dataDir, 'data/to-delete.md'), 'delete me')
      
      expect(await store.exists('data/to-delete.md')).toBe(true)
      
      await store.delete('data/to-delete.md')
      
      expect(await store.exists('data/to-delete.md')).toBe(false)
    })
  })
  
  describe('クロスストア検索', () => {
    let store: CompositeStore
    
    beforeEach(async () => {
      await fs.rm(docsDir, { recursive: true, force: true })
      await fs.rm(dataDir, { recursive: true, force: true })
      await fs.mkdir(docsDir, { recursive: true })
      await fs.mkdir(dataDir, { recursive: true })
      
      const contextRoots: ContextRootConfig[] = [
        {
          id: 'docs',
          name: 'Documentation',
          path: 'docs',
          storageType: 'file-git',
          storagePath: docsDir
        },
        {
          id: 'data',
          name: 'Dynamic Data',
          path: 'data',
          storageType: 'file-git',
          storagePath: dataDir
        }
      ]
      
      store = new CompositeStore({
        contextRoots,
        defaultStorageType: 'file-git',
        defaultStoragePath: tempDir,
        autoCommit: false
      })
      
      await store.initialize()
      
      // テストデータを作成
      await fs.mkdir(path.join(docsDir, 'docs'), { recursive: true })
      await fs.mkdir(path.join(dataDir, 'data'), { recursive: true })
      await fs.writeFile(path.join(docsDir, 'docs/a.md'), 'doc a')
      await fs.writeFile(path.join(docsDir, 'docs/b.md'), 'doc b')
      await fs.writeFile(path.join(dataDir, 'data/x.md'), 'data x')
      await fs.writeFile(path.join(dataDir, 'data/y.md'), 'data y')
    })
    
    afterAll(async () => {
      await store?.close()
    })
    
    it('listMultiple が複数ストアから結果を取得する', async () => {
      const results = await store.listMultiple(['docs/**/*.md', 'data/**/*.md'])
      
      expect(results).toContain('docs/a.md')
      expect(results).toContain('docs/b.md')
      expect(results).toContain('data/x.md')
      expect(results).toContain('data/y.md')
      expect(results.length).toBe(4)
    })
    
    it('単一パターンで特定ストアのみ検索する', async () => {
      const docsOnly = await store.list('docs/**/*.md')
      
      expect(docsOnly).toContain('docs/a.md')
      expect(docsOnly).toContain('docs/b.md')
      expect(docsOnly).not.toContain('data/x.md')
    })
  })
  
  describe('クロスストア移動', () => {
    let store: CompositeStore
    
    beforeEach(async () => {
      await fs.rm(docsDir, { recursive: true, force: true })
      await fs.rm(dataDir, { recursive: true, force: true })
      await fs.mkdir(docsDir, { recursive: true })
      await fs.mkdir(dataDir, { recursive: true })
      
      const contextRoots: ContextRootConfig[] = [
        {
          id: 'docs',
          name: 'Documentation',
          path: 'docs',
          storageType: 'file-git',
          storagePath: docsDir
        },
        {
          id: 'data',
          name: 'Dynamic Data',
          path: 'data',
          storageType: 'file-git',
          storagePath: dataDir
        }
      ]
      
      store = new CompositeStore({
        contextRoots,
        defaultStorageType: 'file-git',
        defaultStoragePath: tempDir,
        autoCommit: false
      })
      
      await store.initialize()
    })
    
    afterAll(async () => {
      await store?.close()
    })
    
    it('同一ストア内の移動が成功する', async () => {
      await store.write('docs/original.md', '# Original')
      
      await store.move('docs/original.md', 'docs/renamed.md')
      
      expect(await store.exists('docs/original.md')).toBe(false)
      expect(await store.exists('docs/renamed.md')).toBe(true)
      expect(await store.read('docs/renamed.md')).toBe('# Original')
    })
    
    it('異なるストア間の移動が成功する (コピー + 削除)', async () => {
      await store.write('docs/to-move.md', '# To Move')
      
      await store.move('docs/to-move.md', 'data/moved.md')
      
      expect(await store.exists('docs/to-move.md')).toBe(false)
      expect(await store.exists('data/moved.md')).toBe(true)
      expect(await store.read('data/moved.md')).toBe('# To Move')
      
      // 実際に異なるディレクトリに保存されていることを確認
      const movedContent = await fs.readFile(path.join(dataDir, 'data/moved.md'), 'utf-8')
      expect(movedContent).toBe('# To Move')
    })
  })
  
  describe('読み取り専用 Context Root', () => {
    let store: CompositeStore
    
    beforeEach(async () => {
      await fs.rm(docsDir, { recursive: true, force: true })
      await fs.mkdir(docsDir, { recursive: true })
      
      // テストデータを作成
      await fs.mkdir(path.join(docsDir, 'readonly'), { recursive: true })
      await fs.writeFile(path.join(docsDir, 'readonly/protected.md'), '# Protected')
      
      const contextRoots: ContextRootConfig[] = [
        {
          id: 'readonly',
          name: 'Read Only Docs',
          path: 'readonly',
          storageType: 'file-git',
          storagePath: docsDir,
          readOnly: true
        }
      ]
      
      store = new CompositeStore({
        contextRoots,
        defaultStorageType: 'file-git',
        defaultStoragePath: tempDir,
        autoCommit: false
      })
      
      await store.initialize()
    })
    
    afterAll(async () => {
      await store?.close()
    })
    
    it('読み取り専用 Context Root への書き込みが拒否される', async () => {
      await expect(
        store.write('readonly/new.md', '# New')
      ).rejects.toThrow(/read-only/)
    })
    
    it('読み取り専用 Context Root からの読み取りは成功する', async () => {
      const content = await store.read('readonly/protected.md')
      expect(content).toBe('# Protected')
    })
    
    it('読み取り専用 Context Root からの削除が拒否される', async () => {
      await expect(
        store.delete('readonly/protected.md')
      ).rejects.toThrow(/read-only/)
    })
  })
  
  describe('ユーティリティ', () => {
    it('getRoutes がルート情報を返す', async () => {
      const contextRoots: ContextRootConfig[] = [
        {
          id: 'docs',
          name: 'Documentation',
          path: 'docs',
          storageType: 'file-git',
          storagePath: docsDir
        },
        {
          id: 'data',
          name: 'Dynamic Data',
          path: 'data',
          storageType: 'postgres',
          connectionString: 'dummy' // 実際には接続しない
        }
      ]
      
      // postgres は接続文字列がダミーなのでストアは作成されない
      // file-git のみがルートとして登録される
      const store = new CompositeStore({
        contextRoots,
        defaultStorageType: 'file-git',
        defaultStoragePath: tempDir,
        autoCommit: false
      })
      
      const routes = store.getRoutes()
      
      // file-git のルートのみ登録される (postgres は接続エラーでスキップ)
      expect(routes.some(r => r.prefix === 'docs')).toBe(true)
    })
  })
})
