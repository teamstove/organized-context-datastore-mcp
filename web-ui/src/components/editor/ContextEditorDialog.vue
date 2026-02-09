<script setup lang="ts">
/**
 * ContextEditorDialog - 編集ダイアログ（モーダル全体）
 *
 * 役割:
 * - モーダルダイアログの制御
 * - 編集フォームの状態管理
 * - 保存/キャンセル処理
 * - パス変更（移動）対応
 *
 * ロジックは ContextService / UIService に委譲
 */
import { inject, ref, watch, computed } from 'vue'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'
import ContextEditorHeader from './ContextEditorHeader.vue'
import ContextEditorMeta from './ContextEditorMeta.vue'
import ContextEditorContent from './ContextEditorContent.vue'

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// ローカル編集状態
// =============================================================================

/** 編集中のパス（変更可能） */
const editPath = ref('')
/** 元のパス（比較用） */
const originalPath = ref('')
/** 編集中のタイトル */
const editTitle = ref('')
/** 編集中のサマリ */
const editSummary = ref('')
/** 編集中のコンテンツ */
const editContent = ref('')

// =============================================================================
// Computed
// =============================================================================

/** ダイアログ表示状態 */
const isOpen = computed(() => uiService.state.editorDialogOpen)

/** 保存中フラグ */
const isSaving = computed(() => contextService.state.isSaving)

/** エラーメッセージ */
const error = computed(() => contextService.state.error)

/** パスが変更されているか */
const isPathChanged = computed(() => editPath.value !== originalPath.value)

/** パスの検証（空でないこと） */
const isPathValid = computed(() => editPath.value.trim().length > 0)

// =============================================================================
// Watchers
// =============================================================================

/**
 * ダイアログが開かれたとき、編集対象の値をローカル状態にコピー
 */
watch(isOpen, (open) => {
  if (open && contextService.state.editingContext) {
    const ctx = contextService.state.editingContext
    // パスを保持
    editPath.value = ctx.path || ''
    originalPath.value = ctx.path || ''
    // その他のフィールド
    editTitle.value = ctx.title || ''
    // summary は attrs に含まれる
    editSummary.value = (ctx.attrs.summary as string) || ''
    editContent.value = ctx.content || ''
  }
})

// =============================================================================
// イベントハンドラ
// =============================================================================

/**
 * 保存処理
 * パスが変更された場合は moveAndUpdateContext を使用
 */
async function handleSave() {
  if (!originalPath.value) return
  if (!isPathValid.value) return

  let success: boolean

  if (isPathChanged.value) {
    // パスが変更されている場合: move + update
    success = await contextService.moveAndUpdateContext(
      originalPath.value,
      editPath.value.trim(),
      {
        title: editTitle.value,
        summary: editSummary.value,
        content: editContent.value,
      }
    )
  } else {
    // パスが変更されていない場合: update のみ
    success = await contextService.updateContext(originalPath.value, {
      title: editTitle.value,
      summary: editSummary.value,
      content: editContent.value,
    })
  }

  if (success) {
    uiService.closeEditorDialog()
  }
}

/**
 * キャンセル処理
 */
function handleCancel() {
  contextService.cancelEditing()
  uiService.closeEditorDialog()
}

/**
 * 背景クリックでキャンセル（保存中は無効）
 */
function handleBackdropClick() {
  if (!isSaving.value) {
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
      <div class="relative bg-card rounded-lg shadow-xl w-full max-w-4xl h-[85vh] flex flex-col border">
        <!-- ヘッダー -->
        <ContextEditorHeader
          :path="originalPath"
          :is-saving="isSaving"
          :save-disabled="!isPathValid"
          @save="handleSave"
          @cancel="handleCancel"
        />

        <!-- エラー表示 -->
        <div
          v-if="error"
          class="mx-4 mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm"
        >
          {{ error }}
        </div>

        <!-- コンテンツエリア -->
        <div class="flex-1 overflow-auto p-4 flex flex-col gap-4">
          <!-- パス編集 -->
          <div class="flex-shrink-0">
            <div class="flex items-center justify-between mb-1.5">
              <label for="editor-path" class="text-sm font-medium">
                パス
              </label>
              <span
                v-if="isPathChanged"
                class="text-xs text-amber-500 font-medium"
              >
                ※ パスが変更されています（移動されます）
              </span>
            </div>
            <input
              id="editor-path"
              v-model="editPath"
              type="text"
              placeholder="例: docs/features/new-feature"
              class="w-full px-3 py-2 text-sm font-mono rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              :class="{ 'border-amber-500': isPathChanged }"
            />
            <p class="mt-1.5 text-xs text-muted-foreground">
              Context Root からの相対パス（拡張子なし）
            </p>
          </div>

          <!-- メタデータ編集 -->
          <div class="flex-shrink-0">
            <ContextEditorMeta
              v-model:title="editTitle"
              v-model:summary="editSummary"
            />
          </div>

          <!-- 本文編集（残りの高さをすべて使用） -->
          <div class="flex-1 min-h-0 flex flex-col">
            <ContextEditorContent
              v-model:content="editContent"
              class="flex-1"
            />
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
