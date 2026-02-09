<script setup lang="ts">
/**
 * SearchInput - 検索入力コンポーネント
 *
 * 役割:
 * - 検索クエリの入力
 * - クライアントサイドでのツリーフィルタリング
 *
 * ロジックは ContextService に委譲
 */
import { inject, ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'
import { contextServiceKey, type ContextService } from '@/services/ContextService'

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService

// =============================================================================
// Local State
// =============================================================================

const query = ref('')

// =============================================================================
// 検索クエリの同期
// =============================================================================

// デバウンス用タイマー
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// 入力が変更されたらサービスに反映（デバウンス付き）
watch(query, (newQuery) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  debounceTimer = setTimeout(() => {
    contextService.setSearchQuery(newQuery)
  }, 150) // 150ms デバウンス
})

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleClear() {
  query.value = ''
  contextService.clearSearchQuery()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    handleClear()
  }
}
</script>

<template>
  <div class="relative">
    <!-- 検索アイコン -->
    <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

    <!-- 入力フィールド -->
    <input
      v-model="query"
      type="text"
      class="w-full pl-9 pr-8 py-2 rounded-md border bg-background text-sm"
      placeholder="検索..."
      @keydown="handleKeydown"
    />

    <!-- クリアボタン -->
    <button
      v-if="query"
      @click="handleClear"
      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent transition-colors"
    >
      <X class="w-4 h-4 text-muted-foreground" />
    </button>
  </div>
</template>
