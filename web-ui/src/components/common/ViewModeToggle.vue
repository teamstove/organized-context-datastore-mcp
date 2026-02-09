<script setup lang="ts">
/**
 * ViewModeToggle - 表示モード切替コンポーネント
 *
 * 役割:
 * - ツリー / リスト / カード 表示モードの切り替え
 *
 * ロジックは UIService に委譲
 */
import { inject } from 'vue'
import { TreePine, List, LayoutGrid } from 'lucide-vue-next'
import { uiServiceKey, type UIService } from '@/services/UIService'
import type { ViewMode } from '@/types'

// =============================================================================
// Service の inject
// =============================================================================

const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleSetMode(mode: ViewMode) {
  uiService.setViewMode(mode)
}
</script>

<template>
  <div class="flex items-center gap-1 border rounded-md p-1">
    <button
      @click="handleSetMode('tree')"
      :class="[
        'p-1.5 rounded transition-colors',
        uiService.state.viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
      ]"
      title="ツリー表示"
    >
      <TreePine class="w-4 h-4" />
    </button>
    <button
      @click="handleSetMode('list')"
      :class="[
        'p-1.5 rounded transition-colors',
        uiService.state.viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
      ]"
      title="リスト表示"
    >
      <List class="w-4 h-4" />
    </button>
    <button
      @click="handleSetMode('card')"
      :class="[
        'p-1.5 rounded transition-colors',
        uiService.state.viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
      ]"
      title="カード表示"
    >
      <LayoutGrid class="w-4 h-4" />
    </button>
  </div>
</template>
