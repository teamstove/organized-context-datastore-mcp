/**
 * OCD Browser - エントリーポイント
 *
 * Service クラスをインスタンス化して provide し、
 * アプリケーション全体で利用可能にする
 */
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/index.css'

// Service クラスのインポート
import { ApiClient, apiClientKey } from './services/ApiClient'
import { ProjectService, projectServiceKey } from './services/ProjectService'
import { ContextService, contextServiceKey } from './services/ContextService'
import { UIService, uiServiceKey } from './services/UIService'

// =============================================================================
// アプリケーション初期化
// =============================================================================

const app = createApp(App)

// ルーター
app.use(router)

// =============================================================================
// Service インスタンス化 & provide
// =============================================================================

// ApiClient は他の Service が依存する
const apiClient = new ApiClient()

// 各 Service をインスタンス化（依存関係順）
const projectService = new ProjectService(apiClient)
const uiService = new UIService()
const contextService = new ContextService(apiClient, projectService, uiService)

// provide で全コンポーネントから利用可能に
app.provide(apiClientKey, apiClient)
app.provide(projectServiceKey, projectService)
app.provide(contextServiceKey, contextService)
app.provide(uiServiceKey, uiService)

// =============================================================================
// マウント
// =============================================================================

app.mount('#app')

// 開発モードでのログ
if (import.meta.env.DEV) {
  console.log('[OCD Browser] Application initialized')
  console.log('[OCD Browser] Services provided:', {
    apiClient: !!apiClient,
    projectService: !!projectService,
    contextService: !!contextService,
    uiService: !!uiService,
  })
}
