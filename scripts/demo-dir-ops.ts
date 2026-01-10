/**
 * ディレクトリ操作のデモスクリプト
 * 
 * move_context と delete_context のディレクトリ対応をテスト
 */
import { KnowledgeGraphService } from '../src/KnowledgeGraphService.js'
import type { ContextRootConfig } from '../src/types/index.js'
import path from 'path'
import { promises as fs } from 'fs'

const STORAGE_PATH = '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/COREFW_AI_WORKFLOWS/KGMCP_CONTEXT_TEST'

const contextRoots: ContextRootConfig[] = [
  { id: 'test-dir', name: 'テスト用ディレクトリ', path: 'test-dir' }
]

async function main() {
  console.log('='.repeat(60))
  console.log('ディレクトリ操作デモ')
  console.log('='.repeat(60))
  
  const service = new KnowledgeGraphService({
    storageType: 'file-git',
    storagePath: STORAGE_PATH,
    contextRoots,
    writePermission: { mode: 'unrestricted' },
    versionControlMode: 'immediate'
  })
  
  await service.initialize()
  
  try {
    // 1. テスト用のディレクトリ構造を作成
    console.log('\n📁 1. テスト用ディレクトリ構造を作成...')
    
    await service.createContext({
      parentPath: 'test-dir',
      title: 'テストディレクトリ',
      summary: 'ディレクトリ操作テスト用',
      content: 'これはテスト用のディレクトリです。'
    })
    console.log('   ✅ test-dir/index.md 作成')
    
    await service.createContext({
      parentPath: 'test-dir/sub1',
      title: 'サブディレクトリ1',
      summary: 'サブ1の説明',
      content: 'サブディレクトリ1のコンテンツ'
    })
    console.log('   ✅ test-dir/sub1/index.md 作成')
    
    await service.createContext({
      parentPath: 'test-dir/sub1',
      title: 'ファイルA',
      summary: 'ファイルAの説明',
      content: 'ファイルAのコンテンツ'
    })
    console.log('   ✅ test-dir/sub1/ファイルa.md 作成')
    
    await service.createContext({
      parentPath: 'test-dir/sub2',
      title: 'サブディレクトリ2',
      summary: 'サブ2の説明',
      content: 'サブディレクトリ2のコンテンツ'
    })
    console.log('   ✅ test-dir/sub2/index.md 作成')
    
    // 2. 現在の構造を確認
    console.log('\n📋 2. 現在のディレクトリ構造:')
    const tree = await service.getContextTree('test-dir')
    console.log(JSON.stringify(tree, null, 2))
    
    // 3. ディレクトリ移動のテスト
    console.log('\n🔄 3. ディレクトリ移動テスト: test-dir/sub1 → test-dir/renamed-sub1')
    const moveResult = await service.moveContext('test-dir/sub1', 'test-dir/renamed-sub1')
    console.log('   移動結果:', moveResult ? `path: ${moveResult.path}` : 'undefined (ディレクトリ移動)')
    
    // 4. 移動後の構造を確認
    console.log('\n📋 4. 移動後のディレクトリ構造:')
    const treeAfterMove = await service.getContextTree('test-dir')
    console.log(JSON.stringify(treeAfterMove, null, 2))
    
    // 5. ディレクトリ削除のテスト
    console.log('\n🗑️  5. ディレクトリ削除テスト: test-dir/renamed-sub1')
    await service.deleteContext('test-dir/renamed-sub1')
    console.log('   ✅ 削除完了')
    
    // 6. 削除後の構造を確認
    console.log('\n📋 6. 削除後のディレクトリ構造:')
    const treeAfterDelete = await service.getContextTree('test-dir')
    console.log(JSON.stringify(treeAfterDelete, null, 2))
    
    // 7. クリーンアップ
    console.log('\n🧹 7. クリーンアップ: test-dir 全体を削除')
    await service.deleteContext('test-dir')
    console.log('   ✅ 削除完了')
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ ディレクトリ操作デモ完了！')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('❌ エラー:', error)
    
    // エラー時のクリーンアップを試行
    console.log('\n🧹 エラー時クリーンアップを試行...')
    try {
      await fs.rm(path.join(STORAGE_PATH, 'test-dir'), { recursive: true, force: true })
      console.log('   ✅ test-dir を削除しました')
    } catch {
      console.log('   (クリーンアップ不要)')
    }
  }
}

main()
