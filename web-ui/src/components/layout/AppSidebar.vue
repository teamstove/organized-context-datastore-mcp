<script setup lang="ts">
/**
 * AppSidebar - サイドバー
 *
 * 役割:
 * - Context Root セレクタ
 * - 検索バー
 * - Context ツリー表示
 *
 * ロジックは ContextService に委譲
 */
import { inject, computed } from 'vue'
import { Search, Loader2 } from 'lucide-vue-next'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import ContextTree from '@/components/tree/ContextTree.vue'
import SearchInput from '@/components/common/SearchInput.vue'

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService

// =============================================================================
// Computed
// =============================================================================

const roots = computed(() => contextService.state.roots)
const currentRoot = computed(() => contextService.state.currentRoot)
// ツリー読み込み中フラグのみ参照（コンテンツ読み込みはツリーに影響しない）
const isTreeLoading = computed(() => contextService.state.isTreeLoading)

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleSelectRoot(event: Event) {
  const target = event.target as HTMLSelectElement
  const rootId = target.value
  if (rootId) {
    contextService.selectRoot(rootId)
  }
}
</script>

<template>
  <aside class="flex flex-col bg-card h-full">
    <!-- Context Root セレクタ -->
    <div class="p-3 border-b">
      <select
        :value="currentRoot?.id || ''"
        @change="handleSelectRoot"
        class="w-full px-3 py-2 rounded-md border bg-background text-sm"
      >
        <option value="" disabled>Context Root を選択...</option>
        <option
          v-for="root in roots"
          :key="root.id"
          :value="root.id"
        >
          {{ root.name }}
        </option>
      </select>
    </div>

    <!-- 検索バー -->
    <div class="p-3 border-b">
      <SearchInput />
    </div>

    <!-- ツリー表示（フォントサイズは設定で変更可能） -->
    <div class="flex-1 overflow-auto tree-font-area">
      <!-- ローディング -->
      <div
        v-if="isTreeLoading"
        class="flex items-center justify-center p-8"
      >
        <Loader2 class="w-6 h-6 animate-spin text-muted-foreground" />
      </div>

      <!-- ツリー -->
      <ContextTree v-else-if="currentRoot" />

      <!-- 未選択時 -->
      <div
        v-else
        class="p-4 text-center text-muted-foreground tree-node-title"
      >
        Context Root を選択してください
      </div>
    </div>
  </aside>
</template>
