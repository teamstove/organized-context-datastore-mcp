/**
 * Knowledge Graph MCP 書き込み機能デモ
 * 
 * createContext, updateContext, appendToContext の動作確認
 */

import { createKnowledgeGraphService, type ContextRootConfig } from '../src/index.js'

const KNOWLEDGE_BASE_PATH = '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/COREFW_AI_WORKFLOWS/KGMCP_CONTEXT_TEST'

const contextRoots: ContextRootConfig[] = [
  { id: 'stove-business', name: 'STOVE ビジネス', path: 'stove-business' },
  { id: 'core-framework', name: 'CORE Framework', path: 'core-framework' },
  { id: 'apiste-value', name: 'Apiste 価値提案', path: 'apiste-value-proposal' },
  { id: 'apiste-gme', name: 'GME プロジェクト', path: 'apiste-gme' },
  { id: 'apiste-enc', name: 'ENC プロジェクト', path: 'apiste-enc', readOnly: true }
]

async function main() {
  console.log('='.repeat(60))
  console.log('Knowledge Graph MCP - Write Demo')
  console.log('='.repeat(60))
  
  const service = createKnowledgeGraphService(KNOWLEDGE_BASE_PATH, contextRoots)
  await service.initialize()
  
  try {
    // ========================================
    // 1. createContext - 新規コンテキスト作成
    // ========================================
    console.log('\n📝 1. createContext - 新規コンテキスト作成')
    console.log('-'.repeat(40))
    
    // シナリオ: GMEプロジェクトに新しい機能仕様を追加
    const newFeature = await service.createContext({
      parentPath: 'apiste-gme/features',
      title: 'レポート出力機能',
      summary: '月次/週次の活動レポートをPDF/Excel形式で出力する機能',
      categories: ['feature-spec'],
      tags: ['Phase2', '新規追加'],
      content: `# レポート出力機能

## 概要

営業活動の集計レポートを出力する機能。

## 要件

1. 月次レポート
2. 週次レポート
3. PDF/Excel 形式対応

## TODO

- [ ] [[要確認:お客様]] レポートに含める項目の確定
- [ ] レポートテンプレート設計
- [ ] PDF生成ロジック実装
`
    })
    
    console.log(`  ✅ 作成完了: ${newFeature.path}`)
    console.log(`     Title: ${newFeature.title}`)
    console.log(`     Categories: ${newFeature.categories.join(', ')}`)
    console.log(`     Tags: ${newFeature.tags.join(', ')}`)
    console.log(`     TODOs: ${newFeature.todos.length}件`)
    
    // ========================================
    // 2. appendToContext - 既存コンテキストに追記
    // ========================================
    console.log('\n📝 2. appendToContext - 既存コンテキストに追記')
    console.log('-'.repeat(40))
    
    // シナリオ: 決定事項に新しいエントリを追加
    const updated = await service.appendToContext({
      path: 'apiste-gme/decisions',
      content: `## 2026/01/10 追加決定

### レポート機能の追加 [[confirmed]]

- **決定**: レポート出力機能を Phase 2 のスコープに追加
- **理由**: 営業マネージャーからの要望
- **対応時期**: 2月中旬予定
`
    })
    
    console.log(`  ✅ 追記完了: ${updated.path}`)
    console.log(`     更新後のセクション数: ${updated.sections.length}`)
    
    // 追記された内容を確認
    const lastSection = updated.sections[updated.sections.length - 1]
    console.log(`     最後のセクション: ${lastSection?.title}`)
    
    // ========================================
    // 3. updateContext - 既存コンテキストを更新
    // ========================================
    console.log('\n📝 3. updateContext - 既存コンテキストを更新')
    console.log('-'.repeat(40))
    
    // シナリオ: 商品マスタのサマリとタグを更新
    const updatedProductMaster = await service.updateContext({
      path: 'apiste-gme/features/product-master',
      summary: 'GME商品情報を管理する画面の機能仕様（フィルタリング実装中）',
      tags: ['Phase1', '商品管理', 'priority-high', '実装中']
    })
    
    console.log(`  ✅ 更新完了: ${updatedProductMaster.path}`)
    console.log(`     新しいSummary: ${updatedProductMaster.summary}`)
    console.log(`     新しいTags: ${updatedProductMaster.tags.join(', ')}`)
    
    // ========================================
    // 4. 打ち合わせメモを追加
    // ========================================
    console.log('\n📝 4. createContext - 打ち合わせメモを追加')
    console.log('-'.repeat(40))
    
    const newMeeting = await service.createContext({
      parentPath: 'apiste-gme/meetings',
      title: '2026/01/10 技術検討会',
      summary: 'レポート機能の技術検討',
      categories: ['meeting-note'],
      tags: ['Apiste', 'GME', '技術検討'],
      content: `# 2026/01/10 技術検討会

## 参加者

- STOVE: 川端、山田

## 議題

1. レポート出力機能の技術選定
2. パフォーマンス要件の確認

## 決定事項

### PDF生成ライブラリ [[confirmed]]

- PDFKit を採用
- 大量ページ対応のため非同期処理必須

### Excel生成 [[confirmed]]

- xlsx ライブラリを採用

## 次回アクション

- [ ] PDFテンプレートのプロトタイプ作成
- [ ] パフォーマンステスト実施
`
    })
    
    console.log(`  ✅ 作成完了: ${newMeeting.path}`)
    console.log(`     Title: ${newMeeting.title}`)
    console.log(`     TODOs: ${newMeeting.todos.length}件`)
    console.log(`     Annotations: ${newMeeting.annotations.length}件`)
    
    // ========================================
    // 5. 作成した内容を確認
    // ========================================
    console.log('\n📋 5. 作成した内容を確認')
    console.log('-'.repeat(40))
    
    // Phase2 タグのコンテキストを検索
    const phase2Contexts = await service.getContexts({
      patterns: ['apiste-gme/**/*.md'],
      filter: '.tags | any(. == "Phase2")',
      includeContent: false
    })
    
    console.log(`\n  Phase2 タグのコンテキスト (${phase2Contexts.length}件):`)
    phase2Contexts.forEach(ctx => {
      console.log(`    - ${ctx.title}: ${ctx.summary}`)
    })
    
    // 今日の打ち合わせを検索
    const todayMeetings = await service.searchContexts('2026/01/10')
    console.log(`\n  2026/01/10 関連のコンテキスト (${todayMeetings.length}件):`)
    todayMeetings.forEach(ctx => {
      console.log(`    - ${ctx.title} (${ctx.path})`)
    })
    
    // 更新されたGMEプロジェクトのツリー
    console.log('\n  更新後のGMEプロジェクト構造:')
    const tree = await service.getContextTree({ rootPath: 'apiste-gme' })
    tree.forEach(node => {
      const indent = '  '.repeat(node.path.split('/').length - 1)
      console.log(`  ${indent}- ${node.title}`)
    })
    
    console.log('\n' + '='.repeat(60))
    console.log('Write Demo Complete!')
    console.log('='.repeat(60))
    
  } finally {
    await service.close()
  }
}

main().catch(console.error)
