<script setup lang="ts">
/**
 * BrowserView - メインブラウザ画面
 *
 * 役割:
 * - Context ツリーの表示（サイドバー）
 * - Context 詳細の表示（メインパネル）
 * - 検索機能
 * - URL によるドキュメント状態の保持（リロード対応）
 *
 * ロジックは各サービス・composable に委譲
 */
import { inject, onMounted, watch } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { projectServiceKey, type ProjectService } from '@/services/ProjectService'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'
import { useResizable } from '@/composables/useResizable'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import ContextDetail from '@/components/content/ContextDetail.vue'
import SettingsDialog from '@/components/dialogs/SettingsDialog.vue'
import ContextEditorDialog from '@/components/editor/ContextEditorDialog.vue'
import CreateContextDialog from '@/components/dialogs/CreateContextDialog.vue'
import DeleteConfirmDialog from '@/components/dialogs/DeleteConfirmDialog.vue'

// =============================================================================
// Service & Router
// =============================================================================

const projectService = inject(projectServiceKey) as ProjectService
const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService
const route = useRoute()
const router = useRouter()

// URL更新抑制フラグ（プログラムによる URL 変更時に watch トリガーを防ぐ）
let isUpdatingUrl = false
// 初期ロード完了フラグ（初期ロード時は replace、その後は push）
let isInitialLoad = true

// =============================================================================
// リサイズ機能（composable に委譲）
// =============================================================================

const {
  style: sidebarStyle,
  isResizing,
  startResize,
} = useResizable({
  storageKey: 'ocd-sidebar-width',
  initialWidth: 320,
  minWidth: 200,
  maxWidth: 600,
})

// =============================================================================
// ライフサイクル
// =============================================================================

onMounted(async () => {
  const projectId = route.params.projectId as string | undefined
  // URL クエリパラメータから状態を取得
  const rootId = route.query.root as string | undefined
  const docPath = route.query.doc as string | undefined

  console.log('[BrowserView] onMounted', { projectId, rootId, docPath })
  console.log('[BrowserView] projects:', projectService.state.projects.length)

  if (projectId) {
    // URL にプロジェクト ID がある場合はそれを選択
    await projectService.selectProject(projectId)
    console.log('[BrowserView] after selectProject, currentProject:', projectService.state.currentProject?.name)
  } else if (projectService.state.currentProject) {
    // すでに選択されている場合はそのまま（リロード時）
    // URL を更新してブックマーク可能にする
    isUpdatingUrl = true
    await router.replace({
      name: 'browser',
      params: { projectId: projectService.state.currentProject.id }
    })
    isUpdatingUrl = false
  } else {
    // プロジェクトが選択されていない場合は Home に戻る
    router.push({ name: 'home' })
    return
  }

  // Context Roots を読み込み
  await contextService.loadRoots()
  console.log('[BrowserView] after loadRoots, roots:', contextService.state.roots.map(r => r.id))

  // URL で指定された Root があれば選択
  if (rootId && contextService.state.roots.length > 0) {
    console.log('[BrowserView] selecting root:', rootId)
    const rootExists = await contextService.selectRootById(rootId)
    if (!rootExists) {
      console.warn(`[BrowserView] Root not found: ${rootId}`)
    } else {
      console.log('[BrowserView] root selected, tree:', contextService.state.tree.length)
    }
  }

  // URL で指定されたドキュメントがあれば開く
  if (docPath) {
    // 親ディレクトリを展開
    contextService.expandToPath(docPath)
    // ドキュメントを選択
    await contextService.selectContext(docPath)
    // ツリーのレンダリング完了を待ってから選択ノードにスクロール
    scrollToSelectedNode(docPath)
  }

  // 初期ロード完了
  isInitialLoad = false
})

// =============================================================================
// スクロール処理
// =============================================================================

/**
 * 選択されたノードにスクロール
 * ツリーのレンダリング完了を待ってから実行
 */
function scrollToSelectedNode(path: string, retryCount = 0): void {
  const maxRetries = 10
  const retryDelay = 100

  // data-path 属性で対象ノードを検索
  const nodeElement = document.querySelector(`[data-node-path="${path}"]`)

  if (nodeElement) {
    // ノードが見つかったらスクロール
    nodeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  } else if (retryCount < maxRetries) {
    // まだレンダリングされていない場合はリトライ
    setTimeout(() => {
      scrollToSelectedNode(path, retryCount + 1)
    }, retryDelay)
  }
}

// =============================================================================
// Watchers
// =============================================================================

// プロジェクト変更を監視
watch(
  () => projectService.state.currentProject,
  async (newProject) => {
    if (newProject) {
      await contextService.loadRoots()
    }
  }
)

// 選択中の Root が変わったら URL を更新
watch(
  () => contextService.state.currentRoot,
  (newRoot) => {
    if (isUpdatingUrl || !newRoot) return
    updateUrlState()
  }
)

// 選択中のドキュメントが変わったら URL を更新
watch(
  () => contextService.state.selectedPath,
  () => {
    if (isUpdatingUrl) return
    updateUrlState()
  }
)

// URL クエリパラメータの変更を監視（ブラウザの戻る/進む対応）
watch(
  () => route.query,
  async (newQuery, oldQuery) => {
    // プログラムによる更新は無視
    if (isUpdatingUrl) return

    const newRoot = newQuery.root as string | undefined
    const newDoc = newQuery.doc as string | undefined
    const oldRoot = oldQuery?.root as string | undefined
    const oldDoc = oldQuery?.doc as string | undefined

    // Root が変わった場合
    if (newRoot !== oldRoot && newRoot) {
      await contextService.selectRootById(newRoot)
    }

    // ドキュメントが変わった場合
    if (newDoc !== oldDoc) {
      if (newDoc) {
        contextService.expandToPath(newDoc)
        await contextService.selectContext(newDoc)
        scrollToSelectedNode(newDoc)
      } else {
        // ドキュメント未選択状態に戻す
        contextService.clearSelection()
      }
    }
  }
)

// =============================================================================
// URL State Management
// =============================================================================

/**
 * URL クエリパラメータを更新
 * - 初期ロード時: replace（履歴置換）
 * - それ以降: push（履歴追加）→ ブラウザの戻る/進むが機能
 */
function updateUrlState(): void {
  const currentRoot = contextService.state.currentRoot
  const selectedPath = contextService.state.selectedPath

  const newRoute = {
    name: 'browser' as const,
    params: { projectId: projectService.state.currentProject?.id },
    query: {
      ...(currentRoot ? { root: currentRoot.id } : {}),
      ...(selectedPath ? { doc: selectedPath } : {}),
    }
  }

  isUpdatingUrl = true

  // 初期ロード時は replace、それ以降は push
  const navigate = isInitialLoad ? router.replace : router.push
  navigate(newRoute).finally(() => {
    isUpdatingUrl = false
  })
}
</script>

<template>
  <div class="h-screen flex flex-col">
    <!-- ヘッダー -->
    <AppHeader />

    <!-- メインコンテンツ -->
    <div class="flex-1 flex overflow-hidden">
      <!-- サイドバー -->
      <AppSidebar
        v-if="uiService.state.sidebarOpen"
        class="border-r"
        :style="sidebarStyle"
      />

      <!-- リサイズハンドル -->
      <div
        v-if="uiService.state.sidebarOpen"
        @mousedown="startResize"
        :class="[
          'resize-handle w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors',
          isResizing && 'bg-primary/50'
        ]"
      />

      <!-- メインパネル -->
      <main class="flex-1 overflow-auto p-6">
        <!-- コンテンツ読み込み中 -->
        <div
          v-if="contextService.state.isContentLoading"
          class="h-full flex items-center justify-center"
        >
          <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
        </div>

        <!-- コンテンツ表示 -->
        <ContextDetail v-else-if="contextService.state.selectedContext" />

        <!-- 未選択時 -->
        <div
          v-else
          class="h-full flex items-center justify-center text-muted-foreground"
        >
          <div class="text-center">
            <p class="text-lg">コンテキストを選択してください</p>
            <p class="text-sm mt-2">
              左のツリーからドキュメントを選択すると、ここに内容が表示されます
            </p>
          </div>
        </div>
      </main>
    </div>

    <!-- 設定ダイアログ -->
    <SettingsDialog />

    <!-- 編集ダイアログ -->
    <ContextEditorDialog />

    <!-- 新規作成ダイアログ -->
    <CreateContextDialog />

    <!-- 削除確認ダイアログ -->
    <DeleteConfirmDialog />
  </div>
</template>

<style scoped>
.resize-handle {
  flex-shrink: 0;
}
</style>
