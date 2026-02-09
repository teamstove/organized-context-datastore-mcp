<script setup lang="ts">
/**
 * HomeView - プロジェクト選択画面
 *
 * 役割:
 * - 保存されたプロジェクト一覧の表示
 * - 新規プロジェクトの追加
 * - プロジェクトの選択 → BrowserView へ遷移
 *
 * ロジックは ProjectService に委譲
 */
import { inject, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { projectServiceKey, type ProjectService } from '@/services/ProjectService'
import ProjectSelector from '@/components/project/ProjectSelector.vue'

// =============================================================================
// Service & Router
// =============================================================================

const projectService = inject(projectServiceKey) as ProjectService
const router = useRouter()

// =============================================================================
// ライフサイクル
// =============================================================================

onMounted(() => {
  projectService.loadProjects()
})

// =============================================================================
// イベントハンドラ
// =============================================================================

/**
 * プロジェクト選択時
 */
function handleSelectProject(projectId: string) {
  projectService.selectProject(projectId)
  router.push({ name: 'browser', params: { projectId } })
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- ヘッダー -->
    <header class="border-b bg-card">
      <div class="container py-6">
        <h1 class="text-2xl font-bold">OCD Browser</h1>
        <p class="text-muted-foreground mt-1">
          Organized Context Datastore ドキュメントブラウザ
        </p>
      </div>
    </header>

    <!-- メインコンテンツ -->
    <main class="flex-1 container py-8">
      <ProjectSelector @select="handleSelectProject" />
    </main>

    <!-- フッター -->
    <footer class="border-t py-4 text-center text-sm text-muted-foreground">
      <p>© 2024 STOVE Inc.</p>
    </footer>
  </div>
</template>
