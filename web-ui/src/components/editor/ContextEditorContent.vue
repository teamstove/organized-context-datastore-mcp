<script setup lang="ts">
/**
 * ContextEditorContent - 本文編集エリア
 *
 * 役割:
 * - Markdown 本文の textarea 編集
 * - 行数・文字数表示
 */

import { computed } from 'vue'

// =============================================================================
// Props & Model
// =============================================================================

const props = defineProps<{
  /** Markdown コンテンツ（v-model） */
  content: string
}>()

const emit = defineEmits<{
  'update:content': [value: string]
}>()

// =============================================================================
// Computed
// =============================================================================

/** 行数 */
const lineCount = computed(() => {
  return props.content.split('\n').length
})

/** 文字数 */
const charCount = computed(() => {
  return props.content.length
})

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:content', target.value)
}

/**
 * Tab キーでインデント挿入
 */
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    event.preventDefault()
    const target = event.target as HTMLTextAreaElement
    const start = target.selectionStart
    const end = target.selectionEnd
    const value = props.content

    // カーソル位置にタブ（スペース2つ）を挿入
    const newValue = value.substring(0, start) + '  ' + value.substring(end)
    emit('update:content', newValue)

    // カーソル位置を調整（次の tick で実行）
    requestAnimationFrame(() => {
      target.selectionStart = target.selectionEnd = start + 2
    })
  }
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- ラベル & 情報 -->
    <div class="flex items-center justify-between mb-1.5 flex-shrink-0">
      <label for="editor-content" class="text-sm font-medium">
        本文（Markdown）
      </label>
      <span class="text-xs text-muted-foreground">
        {{ lineCount }} 行 / {{ charCount }} 文字
      </span>
    </div>

    <!-- Textarea -->
    <textarea
      id="editor-content"
      :value="content"
      @input="handleInput"
      @keydown="handleKeydown"
      placeholder="Markdown 形式で本文を入力..."
      class="flex-1 min-h-0 w-full px-3 py-2 text-sm font-mono rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
    />

    <!-- ヘルプテキスト -->
    <p class="mt-1.5 text-xs text-muted-foreground flex-shrink-0">
      Tab キーでインデント挿入。Markdown 記法が使用できます
    </p>
  </div>
</template>
