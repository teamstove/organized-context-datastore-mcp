<script setup lang="ts">
/**
 * CreateContextDialog - 新規作成ダイアログ
 *
 * 役割:
 * - 新規 Context の作成フォーム
 * - パス、タイトル、サマリ、本文の入力
 *
 * ロジックは ContextService / UIService に委譲
 */
import { inject, ref, computed, watch } from 'vue'
import { X, Plus, Loader2, FilePlus } from 'lucide-vue-next'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// フォーム状態
// =============================================================================

/** パス */
const formPath = ref('')
/** タイトル */
const formTitle = ref('')
/** サマリ */
const formSummary = ref('')
/** コンテンツ */
const formContent = ref('')

// =============================================================================
// Computed
// =============================================================================

/** ダイアログ表示状態 */
const isOpen = computed(() => uiService.state.createDialogOpen)

/** 保存中フラグ */
const isSaving = computed(() => contextService.state.isSaving)

/** エラーメッセージ */
const error = computed(() => contextService.state.error)

/** 現在の Context Root */
const currentRoot = computed(() => contextService.state.currentRoot)

/** フルパス（プレビュー用） */
const fullPath = computed(() => {
  if (!currentRoot.value || !formPath.value) return ''
  return `${currentRoot.value.id}/${formPath.value}`
})

/** フォームが有効か */
const isFormValid = computed(() => {
  return formPath.value.trim() !== '' &&
         formTitle.value.trim() !== '' &&
         formSummary.value.trim() !== ''
})

// =============================================================================
// Watchers
// =============================================================================

/**
 * ダイアログが開かれたとき、フォームをリセット
 */
watch(isOpen, (open) => {
  if (open) {
    formPath.value = ''
    formTitle.value = ''
    formSummary.value = ''
    formContent.value = ''
    contextService.clearError()
  }
})

// =============================================================================
// イベントハンドラ
// =============================================================================

/**
 * 作成処理
 */
async function handleCreate() {
  if (!isFormValid.value || !currentRoot.value) return

  // パスに Context Root ID を含める
  const fullPathValue = `${currentRoot.value.id}/${formPath.value}`

  const success = await contextService.createContext({
    path: fullPathValue,
    title: formTitle.value,
    summary: formSummary.value,
    content: formContent.value,
  })

  if (success) {
    uiService.closeCreateDialog()
  }
}

/**
 * キャンセル処理
 */
function handleCancel() {
  uiService.closeCreateDialog()
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
      <div class="relative bg-card rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border">
        <!-- ヘッダー -->
        <div class="flex items-center justify-between p-4 border-b">
          <div class="flex items-center gap-2">
            <FilePlus class="w-5 h-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">新規ドキュメントを作成</h2>
          </div>
          <button
            @click="handleCancel"
            :disabled="isSaving"
            class="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- エラー表示 -->
        <div
          v-if="error"
          class="mx-4 mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm"
        >
          {{ error }}
        </div>

        <!-- フォーム -->
        <div class="flex-1 overflow-auto p-4 space-y-4">
          <!-- パス -->
          <div class="space-y-1.5">
            <label for="create-path" class="text-sm font-medium">
              パス <span class="text-destructive">*</span>
            </label>
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground font-mono">
                {{ currentRoot?.id }}/
              </span>
              <input
                id="create-path"
                v-model="formPath"
                type="text"
                placeholder="features/new-feature"
                class="flex-1 px-3 py-2 text-sm font-mono rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <p class="text-xs text-muted-foreground">
              ディレクトリ区切りには「/」を使用。拡張子は自動付与されます
            </p>
          </div>

          <!-- タイトル -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label for="create-title" class="text-sm font-medium">
                タイトル <span class="text-destructive">*</span>
              </label>
              <span class="text-xs text-muted-foreground">
                {{ formTitle.length }} 文字
              </span>
            </div>
            <input
              id="create-title"
              v-model="formTitle"
              type="text"
              placeholder="ドキュメントのタイトル"
              class="w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <!-- サマリ -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label for="create-summary" class="text-sm font-medium">
                サマリ <span class="text-destructive">*</span>
              </label>
              <span class="text-xs text-muted-foreground">
                {{ formSummary.length }} 文字
              </span>
            </div>
            <textarea
              id="create-summary"
              v-model="formSummary"
              placeholder="ドキュメントの要約（50-300文字推奨）"
              rows="2"
              class="w-full px-3 py-2 text-sm rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <!-- コンテンツ -->
          <div class="space-y-1.5">
            <div class="flex items-center justify-between">
              <label for="create-content" class="text-sm font-medium">
                本文（Markdown）
              </label>
              <span class="text-xs text-muted-foreground">
                {{ formContent.length }} 文字
              </span>
            </div>
            <textarea
              id="create-content"
              v-model="formContent"
              placeholder="Markdown 形式で本文を入力..."
              rows="8"
              class="w-full px-3 py-2 text-sm font-mono rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>

        <!-- フッター -->
        <div class="flex items-center justify-end gap-2 p-4 border-t bg-muted/30">
          <button
            @click="handleCancel"
            :disabled="isSaving"
            class="px-4 py-2 text-sm rounded-md border hover:bg-accent transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            @click="handleCreate"
            :disabled="isSaving || !isFormValid"
            class="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Loader2 v-if="isSaving" class="w-4 h-4 animate-spin" />
            <Plus v-else class="w-4 h-4" />
            <span>{{ isSaving ? '作成中...' : '作成' }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
