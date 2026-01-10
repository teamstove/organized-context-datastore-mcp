/**
 * Config Loader Demo
 * 
 * 設定ファイルの読み込みと自動検出の動作確認
 */

import { loadConfig } from '../src/config/ConfigLoader.js'

const KNOWLEDGE_BASE_PATH = '/Applications/MAMP/htdocs/TAIRIKUT/TAIRIKUT_CORE/CORE/COREFW_AI_WORKFLOWS/KGMCP_CONTEXT_TEST'

async function main() {
  console.log('='.repeat(60))
  console.log('Config Loader Demo')
  console.log('='.repeat(60))
  
  const config = await loadConfig(KNOWLEDGE_BASE_PATH)
  
  console.log('\n📁 Storage Path:')
  console.log(`  ${config.storagePath}`)
  
  console.log('\n⚙️ Version Control Mode:')
  console.log(`  ${config.versionControlMode}`)
  
  console.log('\n📂 Context Roots:')
  for (const root of config.contextRoots) {
    const flags = []
    if (root.readOnly) flags.push('readonly')
    const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : ''
    
    console.log(`  - ${root.name} (${root.path})${flagStr}`)
    if (root.description) {
      console.log(`    ${root.description}`)
    }
  }
  
  console.log('\n🔒 Write Permission:')
  console.log(`  Mode: ${config.writePermission.mode}`)
  if (config.writePermission.deniedPaths && config.writePermission.deniedPaths.length > 0) {
    console.log(`  Denied Paths:`)
    for (const path of config.writePermission.deniedPaths) {
      console.log(`    - ${path}`)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('Demo Complete!')
  console.log('='.repeat(60))
}

main().catch(console.error)
