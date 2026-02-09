<script setup lang="ts">
/**
 * ContextTree - コンテキストツリーコンポーネント
 *
 * 役割:
 * - ツリー構造の表示
 * - ノードの選択
 * - 一括展開/折りたたみ
 * - 新規ドキュメント作成
 *
 * ロジックは ContextService に委譲
 */
import { inject, computed } from 'vue'
import { ChevronsDownUp, ChevronsUpDown, Plus } from 'lucide-vue-next'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'
import ContextTreeNode from './ContextTreeNode.vue'
import type { ContextNodeSummary } from '@/types'

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// Helper 関数
// =============================================================================

/**
 * ツリー内のすべてのノード数を再帰的にカウント
 */
function countAllNodes(nodes: ContextNodeSummary[]): number {
  let count = 0
  for (const node of nodes) {
    count += 1
    if (node.children && node.children.length > 0) {
      count += countAllNodes(node.children)
    }
  }
  return count
}

// =============================================================================
// Computed
// =============================================================================

// 検索フィルタが適用されたツリーを取得
const tree = computed(() => contextService.getFilteredTree())
const hasData = computed(() => tree.value.length > 0)
const wrapTitles = computed(() => uiService.state.treeSettings.wrapTitles)
const searchQuery = computed(() => contextService.state.searchQuery)
const isSearching = computed(() => searchQuery.value.length > 0)

/** すべてのノード数 */
const totalNodeCount = computed(() => countAllNodes(tree.value))

/** 現在の Context Root */
const currentRoot = computed(() => contextService.state.currentRoot)

/** 編集可能かどうか（readOnly でない場合のみ） */
const isEditable = computed(() => {
  return currentRoot.value && !currentRoot.value.readOnly
})

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleExpandAll() {
  contextService.expandAll()
}

function handleCollapseAll() {
  contextService.collapseAll()
}

/**
 * 新規作成ボタンクリック
 */
function handleCreate() {
  uiService.openCreateDialog()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- コントロールバー -->
    <div
      v-if="hasData"
      class="flex items-center gap-1 px-2 py-1 border-b bg-muted/30"
    >
      <button
        @click="handleExpandAll"
        class="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        title="すべて開く"
      >
        <ChevronsUpDown class="w-4 h-4" />
      </button>
      <button
        @click="handleCollapseAll"
        class="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        title="すべて閉じる"
      >
        <ChevronsDownUp class="w-4 h-4" />
      </button>
      <span class="tree-node-meta text-muted-foreground ml-1 flex-1">
        {{ totalNodeCount }} items
        <span v-if="isSearching" class="text-primary">(検索中)</span>
      </span>
      <!-- 新規作成ボタン（readOnly でない場合のみ表示） -->
      <button
        v-if="isEditable"
        @click="handleCreate"
        class="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        title="新規ドキュメントを作成"
      >
        <Plus class="w-4 h-4" />
      </button>
    </div>

    <!-- ツリーノード (横スクロール対応 / 折り返し時は幅100%) -->
    <div class="flex-1 overflow-x-auto overflow-y-auto">
      <div :class="['py-1', wrapTitles ? 'w-full' : 'min-w-max']">
        <template v-if="hasData">
          <ContextTreeNode
            v-for="node in tree"
            :key="node.path"
            :node="node"
            :depth="0"
          />
        </template>

        <!-- データなし -->
        <div
          v-else
          class="px-4 py-8 text-center text-muted-foreground tree-node-title"
        >
          <template v-if="isSearching">
            「{{ searchQuery }}」に一致するコンテキストがありません
          </template>
          <template v-else>
            コンテキストがありません
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
