/**
 * Knowledge Graph MCP デモスクリプト
 * 
 * 実際のKnowledge Baseに対して各種操作を実行
 */

import { createKnowledgeGraphService, type ContextRootConfig } from '../src/index.js'

const KNOWLEDGE_BASE_PATH = '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/COREFW_AI_WORKFLOWS/KGMCP_CONTEXT_TEST'

const contextRoots: ContextRootConfig[] = [
  { id: 'stove-business', name: 'STOVE ビジネス', path: 'stove-business', description: 'STOVE のビジネス方針' },
  { id: 'core-framework', name: 'CORE Framework', path: 'core-framework', description: 'CORE Framework ドキュメント' },
  { id: 'apiste-value', name: 'Apiste 価値提案', path: 'apiste-value-proposal', description: 'Apiste さんへの価値提案' },
  { id: 'apiste-gme', name: 'GME プロジェクト', path: 'apiste-gme', description: '現在開発中のプロジェクト' },
  { id: 'apiste-enc', name: 'ENC プロジェクト', path: 'apiste-enc', description: '過去完了プロジェクト', readOnly: true }
]

async function main() {
  console.log('='.repeat(60))
  console.log('Knowledge Graph MCP Demo')
  console.log('='.repeat(60))
  
  // サービス初期化
  const service = createKnowledgeGraphService(KNOWLEDGE_BASE_PATH, contextRoots)
  await service.initialize()
  
  try {
    // 1. Context Roots 一覧
    console.log('\n📂 Context Roots:')
    const roots = await service.listContextRoots()
    roots.forEach(root => {
      console.log(`  - ${root.name} (${root.path})${root.readOnly ? ' [readonly]' : ''}`)
    })
    
    // 2. GMEプロジェクトの目次ツリー
    console.log('\n📑 GME Project Tree:')
    const tree = await service.getContextTree({ rootPath: 'apiste-gme' })
    tree.forEach(node => {
      const indent = '  '.repeat(node.path.split('/').length - 1)
      console.log(`${indent}- ${node.title} (${node.path})`)
    })
    
    // 3. feature-spec カテゴリの取得
    console.log('\n🔍 Feature Specs (jq filter):')
    const featureSpecs = await service.getContexts({
      patterns: ['apiste-gme/**/*.md'],
      filter: '.categories | any(. == "feature-spec")',
      includeContent: false
    })
    featureSpecs.forEach(ctx => {
      console.log(`  - ${ctx.title}: ${ctx.summary}`)
      console.log(`    Tags: ${ctx.tags.join(', ')}`)
    })
    
    // 4. お客様確認待ちの項目
    console.log('\n⚠️ 要確認:お客様:')
    const pendingCustomer = await service.getContexts({
      patterns: ['apiste-gme/**/*.md'],
      filter: '.annotations | any(.attributes | any(contains("要確認:お客様")))'
    })
    pendingCustomer.forEach(ctx => {
      const annotations = ctx.annotations.filter(a => 
        a.attributes.some(attr => attr.includes('要確認:お客様'))
      )
      console.log(`  📄 ${ctx.title}:`)
      annotations.forEach(a => {
        console.log(`     - ${a.text.substring(0, 50)}...`)
      })
      
      const todos = ctx.todos.filter(t => 
        t.attributes.some(attr => attr.includes('要確認:お客様'))
      )
      todos.forEach(t => {
        console.log(`     - [${t.completed ? 'x' : ' '}] ${t.text}`)
      })
    })
    
    // 5. 未完了TODOの一覧
    console.log('\n📝 未完了TODO:')
    const withTodos = await service.getContexts({
      patterns: ['apiste-gme/**/*.md'],
      filter: '.todos | any(.completed == false)'
    })
    withTodos.forEach(ctx => {
      const incomplete = ctx.todos.filter(t => !t.completed)
      if (incomplete.length > 0) {
        console.log(`  📄 ${ctx.title}:`)
        incomplete.forEach(t => {
          const attrs = t.attributes.length > 0 ? ` [${t.attributes.join(', ')}]` : ''
          console.log(`     - [ ] ${t.text}${attrs}`)
        })
      }
    })
    
    // 6. キーワード検索
    console.log('\n🔎 Search "フィルタリング":')
    const searchResults = await service.searchContexts('フィルタリング')
    searchResults.forEach(ctx => {
      console.log(`  - ${ctx.title} (${ctx.path})`)
    })
    
    // 7. priority-high タグのコンテキスト
    console.log('\n🚨 Priority High:')
    const highPriority = await service.getContexts({
      patterns: ['**/*.md'],
      filter: '.tags | any(. == "priority-high")',
      includeContent: false
    })
    highPriority.forEach(ctx => {
      console.log(`  - ${ctx.title}: ${ctx.summary}`)
    })
    
    // 8. CORE Framework からリンクを辿る
    console.log('\n🔗 Links from ComposableDataList:')
    const datalistDocs = await service.getContexts({
      patterns: ['core-framework/plugins/composable-datalist.md']
    })
    if (datalistDocs.length > 0) {
      const doc = datalistDocs[0]
      console.log(`  Title: ${doc.title}`)
      console.log(`  Links to: ${doc.links.to.join(', ') || '(none)'}`)
      console.log(`  Annotations:`)
      doc.annotations.forEach(a => {
        console.log(`    - [${a.attributes.join(', ')}] ${a.text}`)
      })
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('Demo Complete!')
    console.log('='.repeat(60))
    
  } finally {
    await service.close()
  }
}

main().catch(console.error)
