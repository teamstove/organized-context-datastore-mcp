<script setup lang="ts">
/**
 * AppHeader - アプリケーションヘッダー
 *
 * 役割:
 * - プロジェクト名の表示
 * - サイドバー開閉ボタン
 * - 表示モード切替
 * - テーマ切替
 *
 * ロジックは UIService / ProjectService に委譲
 */
import { inject, computed } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, Home, Sun, Moon, Monitor, LayoutGrid, List, TreePine, Settings } from 'lucide-vue-next'
import { projectServiceKey, type ProjectService } from '@/services/ProjectService'
import { uiServiceKey, type UIService } from '@/services/UIService'
import type { ViewMode, Theme } from '@/types'

// =============================================================================
// Service の inject
// =============================================================================

const projectService = inject(projectServiceKey) as ProjectService
const uiService = inject(uiServiceKey) as UIService
const router = useRouter()

// =============================================================================
// Computed
// =============================================================================

const projectName = computed(() => projectService.state.currentProject?.name || 'OCD Browser')

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleToggleSidebar() {
  uiService.toggleSidebar()
}

function handleGoHome() {
  router.push({ name: 'home' })
}

function handleSetViewMode(mode: ViewMode) {
  uiService.setViewMode(mode)
}

function handleSetTheme(theme: Theme) {
  uiService.setTheme(theme)
}

function handleOpenSettings() {
  uiService.openSettingsDialog()
}
</script>

<template>
  <header class="h-14 border-b bg-card flex items-center px-4 gap-4">
    <!-- サイドバートグル -->
    <button
      @click="handleToggleSidebar"
      class="p-2 rounded-md hover:bg-accent transition-colors"
      title="サイドバー切替"
    >
      <Menu class="w-5 h-5" />
    </button>

    <!-- ホームボタン -->
    <button
      @click="handleGoHome"
      class="p-2 rounded-md hover:bg-accent transition-colors"
      title="プロジェクト選択へ"
    >
      <Home class="w-5 h-5" />
    </button>

    <!-- プロジェクト名 -->
    <h1 class="font-semibold text-lg flex-1">{{ projectName }}</h1>

    <!-- 表示モード切替 -->
    <div class="flex items-center gap-1 border rounded-md p-1">
      <button
        @click="handleSetViewMode('tree')"
        :class="[
          'p-1.5 rounded transition-colors',
          uiService.state.viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        ]"
        title="ツリー表示"
      >
        <TreePine class="w-4 h-4" />
      </button>
      <button
        @click="handleSetViewMode('list')"
        :class="[
          'p-1.5 rounded transition-colors',
          uiService.state.viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        ]"
        title="リスト表示"
      >
        <List class="w-4 h-4" />
      </button>
      <button
        @click="handleSetViewMode('card')"
        :class="[
          'p-1.5 rounded transition-colors',
          uiService.state.viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        ]"
        title="カード表示"
      >
        <LayoutGrid class="w-4 h-4" />
      </button>
    </div>

    <!-- テーマ切替 -->
    <div class="flex items-center gap-1 border rounded-md p-1">
      <button
        @click="handleSetTheme('light')"
        :class="[
          'p-1.5 rounded transition-colors',
          uiService.state.theme === 'light' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        ]"
        title="ライトモード"
      >
        <Sun class="w-4 h-4" />
      </button>
      <button
        @click="handleSetTheme('dark')"
        :class="[
          'p-1.5 rounded transition-colors',
          uiService.state.theme === 'dark' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        ]"
        title="ダークモード"
      >
        <Moon class="w-4 h-4" />
      </button>
      <button
        @click="handleSetTheme('system')"
        :class="[
          'p-1.5 rounded transition-colors',
          uiService.state.theme === 'system' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
        ]"
        title="システム設定に従う"
      >
        <Monitor class="w-4 h-4" />
      </button>
    </div>

    <!-- 設定ボタン -->
    <button
      @click="handleOpenSettings"
      class="p-2 rounded-md hover:bg-accent transition-colors"
      title="表示設定"
    >
      <Settings class="w-5 h-5" />
    </button>
  </header>
</template>
