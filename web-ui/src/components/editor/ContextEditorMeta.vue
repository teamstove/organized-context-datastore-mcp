<script setup lang="ts">
/**
 * ContextEditorMeta - メタデータ編集フォーム
 *
 * 役割:
 * - title の編集
 * - summary の編集
 * - 文字数ガイドの表示
 */

// =============================================================================
// Props & Model
// =============================================================================

const props = defineProps<{
  /** タイトル（v-model） */
  title: string
  /** サマリ（v-model） */
  summary: string
}>()

const emit = defineEmits<{
  'update:title': [value: string]
  'update:summary': [value: string]
}>()

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleTitleInput(event: Event) {
  const target = event.target as HTMLInputElement
  emit('update:title', target.value)
}

function handleSummaryInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:summary', target.value)
}
</script>

<template>
  <div class="space-y-4">
    <!-- Title -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <label for="editor-title" class="text-sm font-medium">
          タイトル
        </label>
        <span class="text-xs text-muted-foreground">
          {{ title.length }} 文字（目安: 10-50文字）
        </span>
      </div>
      <input
        id="editor-title"
        type="text"
        :value="title"
        @input="handleTitleInput"
        placeholder="ドキュメントのタイトルを入力"
        class="w-full px-3 py-2 text-sm rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      <p class="text-xs text-muted-foreground">
        path から想像できる以上の情報を含め、summary と連結して読んだときに自然なフレーズになるようにします
      </p>
    </div>

    <!-- Summary -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <label for="editor-summary" class="text-sm font-medium">
          サマリ
        </label>
        <span class="text-xs text-muted-foreground">
          {{ summary.length }} 文字（目安: 50-300文字）
        </span>
      </div>
      <textarea
        id="editor-summary"
        :value="summary"
        @input="handleSummaryInput"
        placeholder="ドキュメントの要約を入力"
        rows="3"
        class="w-full px-3 py-2 text-sm rounded-md border bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      <p class="text-xs text-muted-foreground">
        LLM向けに圧縮された内容説明。具体的キーワードの羅列でもOKです
      </p>
    </div>
  </div>
</template>
