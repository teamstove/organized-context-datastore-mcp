<script setup lang="ts">
/**
 * DeleteConfirmDialog - 削除確認ダイアログ
 *
 * 役割:
 * - 削除前の確認表示
 * - 削除実行/キャンセル
 *
 * ロジックは ContextService / UIService に委譲
 */
import { inject, computed } from 'vue'
import { X, Trash2, Loader2, AlertTriangle } from 'lucide-vue-next'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// Computed
// =============================================================================

/** ダイアログ表示状態 */
const isOpen = computed(() => uiService.state.deleteDialogOpen)

/** 削除対象のパス */
const targetPath = computed(() => uiService.state.deleteTargetPath)

/** 保存中フラグ */
const isDeleting = computed(() => contextService.state.isSaving)

/** エラーメッセージ */
const error = computed(() => contextService.state.error)

// =============================================================================
// イベントハンドラ
// =============================================================================

/**
 * 削除実行
 */
async function handleDelete() {
  if (!targetPath.value) return

  const success = await contextService.deleteContext(targetPath.value)

  if (success) {
    uiService.closeDeleteDialog()
  }
}

/**
 * キャンセル処理
 */
function handleCancel() {
  uiService.closeDeleteDialog()
}

/**
 * 背景クリックでキャンセル（削除中は無効）
 */
function handleBackdropClick() {
  if (!isDeleting.value) {
    handleCancel()
  }
}
</script>

<template>
  <!-- オーバーレイ -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[200] flex items-center justify-center p-4"
    >
      <!-- 背景 -->
      <div
        class="absolute inset-0 bg-black/50"
        @click="handleBackdropClick"
      />

      <!-- ダイアログ本体 -->
      <div class="relative bg-card rounded-lg shadow-xl w-full max-w-md border">
        <!-- ヘッダー -->
        <div class="flex items-center justify-between p-4 border-b">
          <div class="flex items-center gap-2 text-destructive">
            <AlertTriangle class="w-5 h-5" />
            <h2 class="text-lg font-semibold">削除の確認</h2>
          </div>
          <button
            @click="handleCancel"
            :disabled="isDeleting"
            class="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- コンテンツ -->
        <div class="p-4 space-y-4">
          <!-- エラー表示 -->
          <div
            v-if="error"
            class="p-3 rounded-md bg-destructive/10 text-destructive text-sm"
          >
            {{ error }}
          </div>

          <p class="text-sm">
            以下のドキュメントを削除しますか？
          </p>

          <div class="p-3 rounded-md bg-muted font-mono text-sm break-all">
            {{ targetPath }}
          </div>

          <p class="text-sm text-muted-foreground">
            この操作は取り消せません。削除されたドキュメントは復元できません。
          </p>
        </div>

        <!-- フッター -->
        <div class="flex items-center justify-end gap-2 p-4 border-t bg-muted/30">
          <button
            @click="handleCancel"
            :disabled="isDeleting"
            class="px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            @click="handleDelete"
            :disabled="isDeleting"
            class="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            <Loader2 v-if="isDeleting" class="w-4 h-4 animate-spin" />
            <Trash2 v-else class="w-4 h-4" />
            <span>{{ isDeleting ? '削除中...' : '削除' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
