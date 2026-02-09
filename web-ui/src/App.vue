<script setup lang="ts">
/**
 * App.vue - ルートコンポーネント
 *
 * 役割:
 * - 基本レイアウトの定義
 * - テーマの適用
 * - プロジェクト情報の復元
 *
 * ロジックは UIService / ProjectService に委譲し、最小限の実装のみ
 */
import { inject, watchEffect, onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { uiServiceKey, type UIService } from '@/services/UIService'
import { projectServiceKey, type ProjectService } from '@/services/ProjectService'

// =============================================================================
// Service の inject
// =============================================================================

const uiService = inject(uiServiceKey) as UIService
const projectService = inject(projectServiceKey) as ProjectService

// =============================================================================
// 初期化
// =============================================================================

// アプリ起動時にプロジェクト情報を LocalStorage から復元
onMounted(() => {
  projectService.loadProjects()
})

// =============================================================================
// テーマの適用
// =============================================================================

// テーマ変更を監視して DOM に適用
watchEffect(() => {
  const theme = uiService.state.theme
  const root = document.documentElement

  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system: OS の設定に従う
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    if (prefersDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <RouterView />
  </div>
</template>
