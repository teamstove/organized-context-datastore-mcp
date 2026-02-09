<script setup lang="ts">
/**
 * ContextEditorHeader - 編集ダイアログのヘッダー
 *
 * 役割:
 * - パス表示
 * - 保存/キャンセルボタン
 * - 保存中の状態表示
 */
import { X, Save, Loader2, FileText } from 'lucide-vue-next'

// =============================================================================
// Props & Emits
// =============================================================================

const props = defineProps<{
  /** 編集対象のパス */
  path: string
  /** 保存中フラグ */
  isSaving: boolean
  /** 保存ボタン無効化フラグ */
  saveDisabled?: boolean
}>()

const emit = defineEmits<{
  /** 保存ボタンクリック */
  save: []
  /** キャンセルボタンクリック */
  cancel: []
}>()

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleSave() {
  emit('save')
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="flex items-center justify-between p-4 border-b bg-card">
    <!-- 左側: パス表示 -->
    <div class="flex items-center gap-3 min-w-0 flex-1">
      <FileText class="w-5 h-5 text-muted-foreground flex-shrink-0" />
      <div class="min-w-0">
        <h2 class="text-lg font-semibold truncate">ドキュメントを編集</h2>
        <p class="text-sm text-muted-foreground font-mono truncate">{{ path }}</p>
      </div>
    </div>

    <!-- 右側: ボタン -->
    <div class="flex items-center gap-2 flex-shrink-0 ml-4">
      <!-- キャンセルボタン -->
      <button
        @click="handleCancel"
        :disabled="isSaving"
        class="px-3 py-2 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
      >
        キャンセル
      </button>

      <!-- 保存ボタン -->
      <button
        @click="handleSave"
        :disabled="isSaving || saveDisabled"
        class="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
        <Save v-else class="w-4 h-4" />
        <span>{{ isSaving ? '保存中...' : '保存' }}</span>
      </button>
    </div>
  </div>
</template>
