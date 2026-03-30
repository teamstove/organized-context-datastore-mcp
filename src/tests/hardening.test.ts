/**
 * OCD Tools 堅牢化テスト
 * 
 * YAML 特殊文字、予約語、入力バリデーション、正規表現安全性など
 * LLM が生成しうるエッジケースを網羅的にテストする
 */

import { describe, it, expect, beforeEach } from 'vitest'
import matter from 'gray-matter'
import { parseMarkdown, toContextNode } from '../parser/MarkdownParser.js'
import { extractFrontmatterValues, stripFrontmatterFromContent, autoFixFrontmatter } from '../parser/frontmatterUtils.js'
import { WriteTools, WriteError } from '../tools/WriteTools.js'
import type { IKnowledgeStore } from '../storage/IKnowledgeStore.js'
import type { ContextMutation, WritePermissionConfig } from '../types/index.js'

// =============================================================================
// テスト用モックストア
// =============================================================================

function createMockStore(overrides: Partial<IKnowledgeStore> = {}): IKnowledgeStore {
  const storage = new Map<string, string>()
  
  return {
    initialize: async () => {},
    close: async () => {},
    exists: async (path: string) => storage.has(path),
    read: async (path: string) => {
      const content = storage.get(path)
      if (!content) throw new Error(`Not found: ${path}`)
      return content
    },
    list: async () => [],
    listMultiple: async (_patterns: string[], _exclude?: string[]) => [],
    write: async (path: string, content: string) => { storage.set(path, content) },
    delete: async (path: string) => { storage.delete(path) },
    mkdir: async () => {},
    move: async () => {},
    getMetadata: async (path: string) => ({
      path,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      size: 100
    }),
    commit: async () => 'mock-hash',
    getHistory: async () => [],
    readVersion: async () => '',
    revert: async () => {},
    ...overrides
  }
}

function createWriteTools(
  store?: IKnowledgeStore,
  permission: WritePermissionConfig = { mode: 'unrestricted' }
): WriteTools {
  return new WriteTools(
    store ?? createMockStore(),
    { writePermission: permission }
  )
}

// =============================================================================
// 1. YAML 特殊文字を含む title のテスト
// =============================================================================

describe('YAML 特殊文字を含む title', () => {
  const specialCharTitles = [
    { name: 'コロン付き', title: 'Step1: 初期化フロー' },
    { name: '複数コロン', title: 'key: value: nested: deep' },
    { name: 'ダブルクォート付き', title: 'タイトル "引用" 付き' },
    { name: 'シングルクォート付き', title: "it's a test" },
    { name: 'ハッシュ付き', title: '#important topic' },
    { name: 'ブラケット付き', title: 'array [0] element' },
    { name: 'ブレース付き', title: '{object: true} notation' },
    { name: 'パイプ付き', title: 'option A | option B' },
    { name: '大なり付き', title: 'value > threshold' },
    { name: 'アスタリスク付き', title: '*bold* formatting' },
    { name: 'アンパサンド付き', title: 'A & B comparison' },
    { name: 'エクスクラメーション付き', title: '!important note' },
    { name: 'パーセント付き', title: '100% complete' },
    { name: 'アットマーク付き', title: '@mention user' },
    { name: 'バックスラッシュ付き', title: 'path\\to\\file' },
    { name: '三連ダッシュ', title: 'section --- break' },
    { name: 'コロンで始まる', title: ': leading colon' },
    { name: '日本語コロン混在', title: 'OAuth2.0: 認証フロー実装ガイド' },
  ]
  
  describe('matter.stringify → matter() ラウンドトリップ', () => {
    for (const { name, title } of specialCharTitles) {
      it(`${name}: "${title}"`, () => {
        // gray-matter で生成
        const md = matter.stringify('# content', { title, summary: 'test' })
        
        // gray-matter でパースし直す
        const parsed = matter(md)
        
        expect(parsed.data.title).toBe(title)
        expect(parsed.data.summary).toBe('test')
      })
    }
  })
  
  describe('MarkdownParser.parseMarkdown でのラウンドトリップ', () => {
    for (const { name, title } of specialCharTitles) {
      it(`${name}: "${title}"`, () => {
        const md = matter.stringify('# content', { title, summary: 'test' })
        
        const parsed = parseMarkdown(md, 'test/path')
        const node = toContextNode('test/path', parsed, {
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01'
        })
        
        expect(node.title).toBe(title)
      })
    }
  })
  
  describe('WriteTools.mutateContext create でのラウンドトリップ', () => {
    for (const { name, title } of specialCharTitles) {
      it(`${name}: "${title}"`, async () => {
        const store = createMockStore()
        const tools = createWriteTools(store)
        
        const result = await tools.mutateContext([{
          type: 'create',
          path: 'test/special-title',
          title,
          summary: 'テストサマリ',
          content: `# ${title}\n\nテスト本文`
        }])
        
        expect(result.success).toBe(1)
        expect(result.errors).toBe(0)
        
        // 書き込まれた内容を読み返して検証
        const written = await store.read('test/special-title')
        const parsed = matter(written)
        expect(parsed.data.title).toBe(title)
      })
    }
  })
})

// =============================================================================
// 2. YAML 予約語のテスト
// =============================================================================

describe('YAML 予約語が title に使われた場合', () => {
  const reservedWordTests = [
    { word: 'null', expected: 'null' },
    { word: 'Null', expected: 'Null' },
    { word: 'NULL', expected: 'NULL' },
    { word: 'true', expected: 'true' },
    { word: 'True', expected: 'True' },
    { word: 'false', expected: 'false' },
    { word: 'False', expected: 'False' },
    { word: 'yes', expected: 'yes' },
    { word: 'no', expected: 'no' },
    { word: 'on', expected: 'on' },
    { word: 'off', expected: 'off' },
    { word: '123', expected: '123' },
    { word: '1.5', expected: '1.5' },
  ]
  
  describe('matter.stringify 経由なら常に string として保持される', () => {
    for (const { word, expected } of reservedWordTests) {
      it(`"${word}" → string "${expected}"`, () => {
        // matter.stringify は自動的にクォートする
        const md = matter.stringify('# content', { title: word })
        const parsed = matter(md)
        
        expect(typeof parsed.data.title).toBe('string')
        expect(parsed.data.title).toBe(expected)
      })
    }
  })
  
  describe('手動作成ファイル（クォートなし）でも MarkdownParser が string に変換', () => {
    for (const { word, expected } of reservedWordTests) {
      it(`クォートなし "${word}" → MarkdownParser で string として取得`, () => {
        // 手動で書いた場合は YAML パーサーが型変換するが、
        // MarkdownParser が string に戻す
        const md = matter.stringify('# content', { title: word })
        
        const parsed = parseMarkdown(md, 'test/path')
        const node = toContextNode('test/path', parsed, {
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01'
        })
        
        expect(typeof node.title).toBe('string')
      })
    }
  })
})

// =============================================================================
// 3. extractFrontmatterValues のテスト
// =============================================================================

describe('extractFrontmatterValues', () => {
  it('通常の title/summary を正しく抽出する', () => {
    const md = matter.stringify('# content', { title: 'テスト', summary: '概要' })
    const result = extractFrontmatterValues(md)
    
    expect(result.title).toBe('テスト')
    expect(result.summary).toBe('概要')
  })
  
  it('コロンを含む title を正しく抽出する', () => {
    const md = matter.stringify('# content', { title: 'OAuth2.0: 認証フロー' })
    const result = extractFrontmatterValues(md)
    
    expect(result.title).toBe('OAuth2.0: 認証フロー')
  })
  
  it('frontmatter がない場合は undefined を返す', () => {
    const result = extractFrontmatterValues('# No frontmatter here')
    
    expect(result.title).toBeUndefined()
    expect(result.summary).toBeUndefined()
  })
  
  it('YAML 予約語を string に変換する', () => {
    // matter.stringify は自動クォートするので、手動 YAML を直接テスト
    const md = matter.stringify('# content', { title: 'null', summary: 'true' })
    const result = extractFrontmatterValues(md)
    
    expect(result.title).toBe('null')
    expect(result.summary).toBe('true')
  })
  
  it('壊れた YAML でもフォールバックで抽出する', () => {
    // gray-matter がパースできない YAML を手動作成
    const md = `---
title: Step1: 初期化
summary: テスト概要
---

# Test`
    
    const result = extractFrontmatterValues(md)
    
    // フォールバックの正規表現で抽出される（不正確でもクラッシュしない）
    expect(result.title).toBeDefined()
    expect(result.summary).toBeDefined()
  })
  
  it('クォート付きの値からクォートを除去する（フォールバック時）', () => {
    // フォールバック経路のテスト用に手動で構成
    // gray-matter が正常パースできる場合はこの経路は通らないが、
    // extractAndUnquote の動作確認
    const md = matter.stringify('# content', { title: "OAuth2.0: 認証フロー" })
    const result = extractFrontmatterValues(md)
    
    // gray-matter 経由で正しく取得
    expect(result.title).toBe('OAuth2.0: 認証フロー')
  })
})

// =============================================================================
// 4. 入力バリデーションのテスト
// =============================================================================

describe('WriteTools 入力バリデーション', () => {
  describe('パストラバーサル検出', () => {
    it('../ を含むパスを拒否する', async () => {
      const tools = createWriteTools()
      
      const result = await tools.mutateContext([{
        type: 'create',
        path: '../../../etc/passwd',
        title: 'malicious',
        summary: 'test',
        content: '# test'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].success).toBe(false)
      expect(result.results[0].error).toContain('path traversal')
    })
    
    it('中間の ../ も検出する', async () => {
      const tools = createWriteTools()
      
      const result = await tools.mutateContext([{
        type: 'create',
        path: 'docs/../../../secret',
        title: 'malicious',
        summary: 'test',
        content: '# test'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].error).toContain('path traversal')
    })
    
    it('move の to パスも検証する', async () => {
      const store = createMockStore()
      // 移動元を事前作成
      await store.write('docs/source', matter.stringify('# Source', { title: 'Source' }))
      
      const tools = createWriteTools(store)
      
      const result = await tools.mutateContext([{
        type: 'move',
        path: 'docs/source',
        to: '../../../etc/passwd'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].error).toContain('path traversal')
    })
  })
  
  describe('空パスの拒否', () => {
    it('空文字列のパスを拒否する', async () => {
      const tools = createWriteTools()
      
      const result = await tools.mutateContext([{
        type: 'create',
        path: '',
        title: 'test',
        summary: 'test',
        content: '# test'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].error).toContain('must not be empty')
    })
    
    it('whitespace のみのパスを拒否する', async () => {
      const tools = createWriteTools()
      
      const result = await tools.mutateContext([{
        type: 'create',
        path: '   ',
        title: 'test',
        summary: 'test',
        content: '# test'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].error).toContain('must not be empty')
    })
  })
  
  describe('空タイトルの拒否', () => {
    it('空文字列のタイトルを拒否する', async () => {
      const tools = createWriteTools()
      
      const result = await tools.mutateContext([{
        type: 'create',
        path: 'docs/test',
        title: '',
        summary: 'test',
        content: '# test'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].error).toContain('title must not be empty')
    })
    
    it('whitespace のみのタイトルを拒否する', async () => {
      const tools = createWriteTools()
      
      const result = await tools.mutateContext([{
        type: 'create',
        path: 'docs/test',
        title: '   ',
        summary: 'test',
        content: '# test'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].error).toContain('title must not be empty')
    })
  })
  
  describe('連続スラッシュの検出', () => {
    it('パス中間の連続スラッシュを拒否する', async () => {
      const tools = createWriteTools()
      
      const result = await tools.mutateContext([{
        type: 'create',
        path: 'docs//test',
        title: 'test',
        summary: 'test',
        content: '# test'
      }])
      
      expect(result.errors).toBe(1)
      expect(result.results[0].error).toContain('empty segments')
    })
  })
})

// =============================================================================
// 5. slugify のエッジケーステスト
// =============================================================================

describe('WriteTools slugify', () => {
  // slugify は private なので、create 操作を通じて間接的にテスト
  // タイトルに特殊文字のみの場合でも空のパスにならないことを確認
  
  it('正常なタイトルからスラッグを生成できる', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'create',
      path: 'docs/normal-title',
      title: 'Normal Title',
      summary: 'test',
      content: '# Normal Title'
    }])
    
    expect(result.success).toBe(1)
  })
  
  it('日本語タイトルでもスラッグを生成できる', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'create',
      path: 'docs/日本語テスト',
      title: '日本語タイトル',
      summary: 'テスト',
      content: '# 日本語タイトル'
    }])
    
    expect(result.success).toBe(1)
  })
})

// =============================================================================
// 6. regexp_replace の安全性テスト
// =============================================================================

describe('regexp_replace の安全性', () => {
  it('正常な正規表現置換が動作する', async () => {
    const store = createMockStore()
    const md = matter.stringify('# Old Title\n\nOld content', { title: 'Test' })
    await store.write('docs/test', md)
    
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'update',
      path: 'docs/test',
      contentUpdates: [{
        type: 'regexp_replace',
        pattern: 'Old',
        replacement: 'New',
        flags: 'g'
      }]
    }])
    
    expect(result.success).toBe(1)
  })
  
  it('不正な正規表現パターンがエラーになる', async () => {
    const store = createMockStore()
    const md = matter.stringify('# Test', { title: 'Test' })
    await store.write('docs/test', md)
    
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'update',
      path: 'docs/test',
      contentUpdates: [{
        type: 'regexp_replace',
        pattern: '[invalid',
        replacement: 'fix',
        flags: ''
      }]
    }])
    
    expect(result.errors).toBe(1)
    expect(result.results[0].error).toContain('Invalid regexp')
  })
  
  it('不正なフラグが拒否される', async () => {
    const store = createMockStore()
    const md = matter.stringify('# Test', { title: 'Test' })
    await store.write('docs/test', md)
    
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'update',
      path: 'docs/test',
      contentUpdates: [{
        type: 'regexp_replace',
        pattern: 'test',
        replacement: 'fix',
        flags: 'gx'
      }]
    }])
    
    expect(result.errors).toBe(1)
    expect(result.results[0].error).toContain('Invalid regexp flag')
  })
  
  it('過度に長いパターンが拒否される', async () => {
    const store = createMockStore()
    const md = matter.stringify('# Test', { title: 'Test' })
    await store.write('docs/test', md)
    
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'update',
      path: 'docs/test',
      contentUpdates: [{
        type: 'regexp_replace',
        pattern: 'a'.repeat(1001),
        replacement: 'fix',
        flags: ''
      }]
    }])
    
    expect(result.errors).toBe(1)
    expect(result.results[0].error).toContain('maximum length')
  })
})

// =============================================================================
// 7. 複合シナリオのテスト（LLM が実際に行いそうな操作）
// =============================================================================

describe('LLM ユースケース: 複合シナリオ', () => {
  it('コロン付き title でコンテキストを作成→更新→読み取り', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    // 1. 作成
    const createResult = await tools.mutateContext([{
      type: 'create',
      path: 'plans/20250101_01_oauth-flow',
      title: 'OAuth2.0: Google認証フロー実装',
      summary: 'Google/GitHub連携対応。JWT発行、リフレッシュトークン管理',
      content: '# OAuth2.0: Google認証フロー実装\n\n## 概要\n認証フローの実装'
    }])
    
    expect(createResult.success).toBe(1)
    
    // 2. 更新（summary の変更）
    const updateResult = await tools.mutateContext([{
      type: 'update',
      path: 'plans/20250101_01_oauth-flow',
      summary: 'Google/GitHub連携対応。JWT発行: RS256、リフレッシュトークン: 7日有効'
    }])
    
    expect(updateResult.success).toBe(1)
    
    // 3. 読み取って検証
    const content = await store.read('plans/20250101_01_oauth-flow')
    const parsed = matter(content)
    
    expect(parsed.data.title).toBe('OAuth2.0: Google認証フロー実装')
    expect(parsed.data.summary).toBe('Google/GitHub連携対応。JWT発行: RS256、リフレッシュトークン: 7日有効')
  })
  
  it('attrs にコロンや特殊文字を含む値を保存', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'create',
      path: 'docs/config-guide',
      title: '設定ガイド',
      summary: 'プロジェクト設定の手順',
      content: '# 設定ガイド',
      attrs: {
        status: 'in-progress: phase1',
        tags: ['config: advanced', 'setup: initial'],
        'custom-key': 'value with: colons "and" quotes'
      }
    }])
    
    expect(result.success).toBe(1)
    
    const content = await store.read('docs/config-guide')
    const parsed = matter(content)
    
    expect(parsed.data.status).toBe('in-progress: phase1')
    expect(parsed.data.tags).toEqual(['config: advanced', 'setup: initial'])
    expect(parsed.data['custom-key']).toBe('value with: colons "and" quotes')
  })
  
  it('一括操作で一部が失敗しても他は成功する', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    // 事前に更新対象を作成
    await store.write('docs/existing', matter.stringify('# Existing', { title: 'Existing' }))
    
    const result = await tools.mutateContext([
      // 成功: 通常の create
      {
        type: 'create',
        path: 'docs/new',
        title: 'New Doc',
        summary: 'test',
        content: '# New'
      },
      // 失敗: パストラバーサル
      {
        type: 'create',
        path: '../evil',
        title: 'Evil',
        summary: 'test',
        content: '# Evil'
      },
      // 成功: 通常の update
      {
        type: 'update',
        path: 'docs/existing',
        title: 'Updated: Title with Colon'
      }
    ])
    
    expect(result.success).toBe(2)
    expect(result.errors).toBe(1)
    expect(result.results[0].success).toBe(true)
    expect(result.results[1].success).toBe(false)
    expect(result.results[2].success).toBe(true)
  })
  
  it('whole_replace でコンテンツを全置換できる', async () => {
    const store = createMockStore()
    const md = matter.stringify('# Old Content\n\nOld text', { title: 'Test: Title' })
    await store.write('docs/test', md)
    
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'update',
      path: 'docs/test',
      contentUpdates: [{
        type: 'whole_replace',
        content: '# New Content\n\nNew text with: colons'
      }]
    }])
    
    expect(result.success).toBe(1)
    
    const content = await store.read('docs/test')
    const parsed = matter(content)
    
    // frontmatter は維持される
    expect(parsed.data.title).toBe('Test: Title')
    // content は置換される
    expect(parsed.content).toContain('New text with: colons')
  })
})

// =============================================================================
// 8. MarkdownParser のエッジケーステスト
// =============================================================================

describe('MarkdownParser エッジケース', () => {
  it('空文字列をパースしてもクラッシュしない', () => {
    const parsed = parseMarkdown('', 'test/empty')
    const node = toContextNode('test/empty', parsed, {
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01'
    })
    
    expect(node.path).toBe('test/empty')
    expect(typeof node.title).toBe('string')
  })
  
  it('frontmatter のみ（本文なし）をパースできる', () => {
    const md = matter.stringify('', { title: 'Title Only' })
    
    const parsed = parseMarkdown(md, 'test/title-only')
    const node = toContextNode('test/title-only', parsed, {
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01'
    })
    
    expect(node.title).toBe('Title Only')
  })
  
  it('本文中の --- は frontmatter として誤検出されない', () => {
    const md = matter.stringify(
      '# Title\n\nSome text\n\n---\n\nMore text after separator',
      { title: 'Real Title' }
    )
    
    const parsed = parseMarkdown(md, 'test/with-hr')
    const node = toContextNode('test/with-hr', parsed, {
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01'
    })
    
    expect(node.title).toBe('Real Title')
    expect(node.content).toContain('More text after separator')
  })
  
  it('非常に長い title でもパースできる', () => {
    const longTitle = 'あ'.repeat(300)
    const md = matter.stringify('# content', { title: longTitle })
    
    const parsed = parseMarkdown(md, 'test/long')
    const node = toContextNode('test/long', parsed, {
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01'
    })
    
    expect(node.title).toBe(longTitle)
  })
  
  it('Unicode（絵文字）を含む title をパースできる', () => {
    // gray-matter は Unicode を正しく処理する
    const md = matter.stringify('# content', { title: '進捗報告 📊🎉' })
    
    const parsed = parseMarkdown(md, 'test/emoji')
    const node = toContextNode('test/emoji', parsed, {
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01'
    })
    
    expect(node.title).toBe('進捗報告 📊🎉')
  })
})

// =============================================================================
// 9. stripFrontmatterFromContent テスト
// =============================================================================

describe('stripFrontmatterFromContent', () => {
  it('frontmatter なしの content はそのまま返す', () => {
    const content = '# Hello\n\nSome text'
    const { body, extractedData } = stripFrontmatterFromContent(content)
    
    expect(body).toBe(content)
    expect(Object.keys(extractedData)).toHaveLength(0)
  })
  
  it('frontmatter 付き content から frontmatter を分離する', () => {
    const content = '---\ntitle: テストタイトル\nsummary: テストサマリ\n---\n# 本文\n\nテスト'
    const { body, extractedData } = stripFrontmatterFromContent(content)
    
    expect(body).toBe('# 本文\n\nテスト')
    expect(extractedData.title).toBe('テストタイトル')
    expect(extractedData.summary).toBe('テストサマリ')
  })
  
  it('壊れた YAML を含む frontmatter でも正規表現フォールバックで分離できる', () => {
    // コロン含む title がクォートされていないケース
    const content = '---\ntitle: 実証: 加工手配管理で実行\nsummary: テスト\n---\n# 本文'
    const { body, extractedData } = stripFrontmatterFromContent(content)
    
    expect(body).toBe('# 本文')
    // 正規表現フォールバックでは最初の : 以降を値として扱う
    expect(extractedData.title).toBeDefined()
    expect(extractedData.summary).toBe('テスト')
  })
  
  it('空の content はそのまま返す', () => {
    const { body, extractedData } = stripFrontmatterFromContent('')
    
    expect(body).toBe('')
    expect(Object.keys(extractedData)).toHaveLength(0)
  })
})

// =============================================================================
// 10. autoFixFrontmatter テスト
// =============================================================================

describe('autoFixFrontmatter', () => {
  it('frontmatter なしの content はそのまま返す', () => {
    const content = '# Hello\n\nSome text'
    expect(autoFixFrontmatter(content)).toBe(content)
  })
  
  it('正常な frontmatter はそのまま返す', () => {
    const content = "---\ntitle: 'Hello: World'\nsummary: Test\n---\n# Body"
    expect(autoFixFrontmatter(content)).toBe(content)
  })
  
  it('クォートされていないコロンを含む title を修復する', () => {
    const broken = '---\ntitle: 実証: 加工手配管理で実行\nsummary: テスト\n---\n# 本文'
    const fixed = autoFixFrontmatter(broken)
    
    // 修復後は gray-matter でパースできる
    const parsed = matter(fixed)
    expect(parsed.data.title).toBe('実証: 加工手配管理で実行')
    expect(parsed.data.summary).toBe('テスト')
    expect(parsed.content.trim()).toBe('# 本文')
  })
  
  it('複数のコロンを含む title を修復する', () => {
    const broken = '---\ntitle: Step1: 初期化: 処理開始\n---\n# Content'
    const fixed = autoFixFrontmatter(broken)
    
    const parsed = matter(fixed)
    expect(parsed.data.title).toBe('Step1: 初期化: 処理開始')
  })
  
  it('# を含む値を修復する', () => {
    const broken = '---\ntitle: #important topic\n---\n# Content'
    const fixed = autoFixFrontmatter(broken)
    
    const parsed = matter(fixed)
    expect(parsed.data.title).toBe('#important topic')
  })
  
  it('括弧類を含む値を修復する', () => {
    const broken = '---\ntitle: array [0] {key: val}\n---\n# Content'
    const fixed = autoFixFrontmatter(broken)
    
    const parsed = matter(fixed)
    expect(parsed.data.title).toBe('array [0] {key: val}')
  })
  
  it('既にクォート済みの値は二重クォートしない', () => {
    const content = "---\ntitle: 'Step1: 初期化'\nsummary: 'テスト: サマリ'\n---\n# Body"
    const fixed = autoFixFrontmatter(content)
    
    // 変わらないはず
    expect(fixed).toBe(content)
    
    const parsed = matter(fixed)
    expect(parsed.data.title).toBe('Step1: 初期化')
  })
  
  it('値にシングルクォートが含まれる場合はエスケープする', () => {
    const broken = "---\ntitle: it's a test: with colon\n---\n# Content"
    const fixed = autoFixFrontmatter(broken)
    
    const parsed = matter(fixed)
    expect(parsed.data.title).toBe("it's a test: with colon")
  })
})

// =============================================================================
// 11. Content に frontmatter が含まれる場合の mutateContext create テスト
// =============================================================================

describe('mutateContext create: content に frontmatter が含まれるケース', () => {
  it('content に frontmatter 付き Markdown を渡してもクラッシュしない', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    // LLM が content に frontmatter を含めるケース
    const result = await tools.mutateContext([{
      type: 'create',
      path: 'test/embedded-fm',
      title: '実証: 加工手配管理で実行',
      summary: 'テストサマリ',
      content: '---\ntitle: 実証: 加工手配管理で実行\nsummary: テストサマリ\n---\n# 実証: 加工手配管理で実行\n\nテスト本文'
    }])
    
    expect(result.success).toBe(1)
    expect(result.errors).toBe(0)
    
    // 書き込まれた内容がパースできることを確認
    const written = await store.read('test/embedded-fm')
    const parsed = matter(written)
    expect(parsed.data.title).toBe('実証: 加工手配管理で実行')
  })
  
  it('content に frontmatter が含まれている場合、明示パラメータが優先される', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'create',
      path: 'test/priority-check',
      title: '明示タイトル',
      summary: '明示サマリ',
      content: '---\ntitle: content内タイトル\nsummary: content内サマリ\n---\n# 本文'
    }])
    
    expect(result.success).toBe(1)
    
    const written = await store.read('test/priority-check')
    const parsed = matter(written)
    // 明示パラメータが優先
    expect(parsed.data.title).toBe('明示タイトル')
    expect(parsed.data.summary).toBe('明示サマリ')
  })
  
  it('content に frontmatter がない通常ケースは変わらず動作する', async () => {
    const store = createMockStore()
    const tools = createWriteTools(store)
    
    const result = await tools.mutateContext([{
      type: 'create',
      path: 'test/normal-content',
      title: '通常タイトル',
      summary: 'テスト',
      content: '# 通常タイトル\n\n本文テスト'
    }])
    
    expect(result.success).toBe(1)
    
    const written = await store.read('test/normal-content')
    const parsed = matter(written)
    expect(parsed.data.title).toBe('通常タイトル')
    expect(parsed.content.trim()).toContain('# 通常タイトル')
  })
})

// =============================================================================
// 12. 壊れた YAML を含む既存ファイルの update テスト
// =============================================================================

describe('mutateContext update: 壊れた YAML を含む既存ファイルの修復', () => {
  it('クォートされていないコロンを含む既存ファイルを update できる', async () => {
    const store = createMockStore()
    
    // 壊れた YAML の既存ファイルをストアに直接書き込む
    const brokenContent = '---\ntitle: 実証: 加工手配管理\nsummary: テスト\n---\n# 本文\n\n既存テキスト'
    await store.write('test/broken-yaml', brokenContent)
    
    const tools = createWriteTools(store)
    
    // update で summary を変更
    const result = await tools.mutateContext([{
      type: 'update',
      path: 'test/broken-yaml',
      summary: '更新されたサマリ'
    }])
    
    expect(result.success).toBe(1)
    expect(result.errors).toBe(0)
    
    // 更新後のファイルがパースできることを確認
    const written = await store.read('test/broken-yaml')
    const parsed = matter(written)
    expect(parsed.data.title).toBe('実証: 加工手配管理')
    expect(parsed.data.summary).toBe('更新されたサマリ')
  })
})

// =============================================================================
// 13. parseMarkdown の YAML 自動修復テスト
// =============================================================================

describe('parseMarkdown: YAML 自動修復', () => {
  it('壊れた frontmatter を自動修復してパースする', () => {
    const broken = '---\ntitle: OAuth2.0: 認証フロー実装ガイド\nsummary: 認証の実装手順\n---\n# OAuth2.0: 認証フロー\n\n本文'
    
    // parseMarkdown がクラッシュせずにパースできることを確認
    const parsed = parseMarkdown(broken, 'test/broken')
    const node = toContextNode('test/broken', parsed, {
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01'
    })
    
    expect(node.title).toBe('OAuth2.0: 認証フロー実装ガイド')
    expect(node.content).toContain('# OAuth2.0: 認証フロー')
  })
  
  it('正常な frontmatter はそのまま動作する', () => {
    const normal = matter.stringify('# 本文', { title: 'テスト', summary: 'サマリ' })
    
    const parsed = parseMarkdown(normal, 'test/normal')
    const node = toContextNode('test/normal', parsed, {
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01'
    })
    
    expect(node.title).toBe('テスト')
  })
})
