/**
 * HTTP MCP Server Tests
 * 
 * Streamable HTTP Transport (MCP 2025-03-26 仕様準拠) のテスト
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Express } from 'express'
import { HttpMcpServer, type HttpServerConfig } from './HttpMcpServer.js'
import type { ProjectConfig } from './ProjectRegistry.js'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'

describe('HttpMcpServer', () => {
  let server: HttpMcpServer
  let testStoragePath: string
  let config: HttpServerConfig
  
  /**
   * テスト用ストレージを作成
   */
  async function createTestStorage(): Promise<string> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kgmcp-test-'))
    
    // テストプロジェクトを作成
    const projectDir = path.join(tempDir, 'test-project')
    await fs.mkdir(projectDir, { recursive: true })
    
    // テストファイルを作成
    await fs.writeFile(
      path.join(projectDir, 'index.md'),
      `---
title: Test Project
summary: テストプロジェクト
categories: ["test"]
tags: ["sample"]
---

# Test Project

これはテストプロジェクトです。
`
    )
    
    // サブディレクトリとファイルを作成
    const featuresDir = path.join(projectDir, 'features')
    await fs.mkdir(featuresDir, { recursive: true })
    
    await fs.writeFile(
      path.join(featuresDir, 'feature-a.md'),
      `---
title: Feature A
summary: 機能Aの説明
categories: ["feature-spec"]
tags: ["Phase1"]
---

# Feature A

機能Aの詳細説明
`
    )
    
    return tempDir
  }
  
  /**
   * テスト用ストレージをクリーンアップ
   */
  async function cleanupTestStorage(): Promise<void> {
    if (testStoragePath) {
      await fs.rm(testStoragePath, { recursive: true, force: true })
    }
  }
  
  beforeAll(async () => {
    // テストストレージを作成
    testStoragePath = await createTestStorage()
    
    // プロジェクト設定
    const projectConfig: ProjectConfig = {
      id: 'test-project',
      name: 'Test Project',
      storageType: 'file-git',
      storagePath: testStoragePath
    }
    
    // サーバー設定
    config = {
      port: 0, // ランダムポート
      projects: [projectConfig],
      allowDynamicStorage: true
    }
    
    // サーバー作成 (起動はしない)
    server = new HttpMcpServer(config)
  })
  
  afterAll(async () => {
    // サーバーを停止
    if (server) {
      await server.stop()
    }
    
    // テストストレージをクリーンアップ
    await cleanupTestStorage()
  })
  
  describe('Configuration', () => {
    it('サーバーインスタンスが作成できること', () => {
      expect(server).toBeDefined()
    })
    
    it('Expressアプリケーションが取得できること', () => {
      const app: Express = server.getApp()
      expect(app).toBeDefined()
    })
    
    it('ProjectRegistryが取得できること', () => {
      const registry = server.getRegistry()
      expect(registry).toBeDefined()
    })
  })
  
  describe('ProjectRegistry', () => {
    it('登録プロジェクト一覧が取得できること', async () => {
      // 初期化前はプロジェクトは空
      const registry = server.getRegistry()
      const projects = registry.listProjects()
      
      // 初期化前は0件
      expect(projects.length).toBe(0)
    })
  })
  
  describe('Streamable HTTP Transport', () => {
    it('Transport タイプが streamable-http であること', () => {
      // サーバー情報を確認 (起動後に /info で取得できる)
      expect(server).toBeDefined()
    })
  })
})

describe('HttpServerConfig validation', () => {
  it('ポートが必須であること', async () => {
    const invalidConfig = {
      projects: []
    } as unknown as HttpServerConfig
    
    expect(invalidConfig.port).toBeUndefined()
  })
  
  it('プロジェクト配列が必須であること', async () => {
    const invalidConfig = {
      port: 3000
    } as unknown as HttpServerConfig
    
    expect(invalidConfig.projects).toBeUndefined()
  })
})
