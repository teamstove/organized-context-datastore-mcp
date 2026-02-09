<script setup lang="ts">
/**
 * ProjectDialog - プロジェクト追加ダイアログ
 *
 * 役割:
 * - 新規プロジェクトの作成フォーム
 * - Local / Remote モードの選択
 * - 接続テスト
 *
 * ロジックは ProjectService に委譲
 */
import { inject, ref, computed } from 'vue'
import { X, FolderOpen, Server, Loader2 } from 'lucide-vue-next'
import { projectServiceKey, type ProjectService } from '@/services/ProjectService'

// =============================================================================
// Emits
// =============================================================================

const emit = defineEmits<{
  close: []
  created: [projectId: string]
}>()

// =============================================================================
// Service の inject
// =============================================================================

const projectService = inject(projectServiceKey) as ProjectService

// =============================================================================
// Local State
// =============================================================================

const mode = ref<'local' | 'remote'>('local')
const name = ref('')
const basePath = ref('')
const serverUrl = ref('')
const isSubmitting = ref(false)
const error = ref<string | null>(null)

// =============================================================================
// Computed
// =============================================================================

const isValid = computed(() => {
  if (!name.value.trim()) return false
  if (mode.value === 'local' && !basePath.value.trim()) return false
  if (mode.value === 'remote' && !serverUrl.value.trim()) return false
  return true
})

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleClose() {
  emit('close')
}

async function handleSubmit() {
  if (!isValid.value || isSubmitting.value) return

  isSubmitting.value = true
  error.value = null

  try {
    const project = await projectService.addProject({
      name: name.value.trim(),
      mode: mode.value,
      basePath: mode.value === 'local' ? basePath.value.trim() : undefined,
      serverUrl: mode.value === 'remote' ? serverUrl.value.trim() : undefined,
    })

    emit('created', project.id)
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <!-- オーバーレイ -->
  <div
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
    @click.self="handleClose"
  >
    <!-- ダイアログ -->
    <div class="bg-card rounded-lg shadow-xl w-full max-w-md mx-4">
      <!-- ヘッダー -->
      <div class="flex items-center justify-between p-4 border-b">
        <h2 class="text-lg font-semibold">新規プロジェクト</h2>
        <button
          @click="handleClose"
          class="p-1.5 rounded-md hover:bg-accent transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- フォーム -->
      <form @submit.prevent="handleSubmit" class="p-4 space-y-4">
        <!-- モード選択 -->
        <div>
          <label class="block text-sm font-medium mb-2">接続モード</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              @click="mode = 'local'"
              :class="[
                'p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors',
                mode === 'local' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              ]"
            >
              <FolderOpen class="w-6 h-6" />
              <span class="text-sm font-medium">ローカル</span>
            </button>
            <button
              type="button"
              @click="mode = 'remote'"
              :class="[
                'p-3 rounded-lg border-2 flex flex-col items-center gap-2 transition-colors',
                mode === 'remote' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              ]"
            >
              <Server class="w-6 h-6" />
              <span class="text-sm font-medium">リモート</span>
            </button>
          </div>
        </div>

        <!-- プロジェクト名 -->
        <div>
          <label class="block text-sm font-medium mb-1.5">プロジェクト名</label>
          <input
            v-model="name"
            type="text"
            class="w-full px-3 py-2 rounded-md border bg-background"
            placeholder="My Project"
          />
        </div>

        <!-- ローカルモード: basePath -->
        <div v-if="mode === 'local'">
          <label class="block text-sm font-medium mb-1.5">ベースパス</label>
          <input
            v-model="basePath"
            type="text"
            class="w-full px-3 py-2 rounded-md border bg-background font-mono text-sm"
            placeholder="/path/to/project"
          />
          <p class="text-xs text-muted-foreground mt-1">
            .ocd.config.js が存在するディレクトリのパス
          </p>
        </div>

        <!-- リモートモード: serverUrl -->
        <div v-if="mode === 'remote'">
          <label class="block text-sm font-medium mb-1.5">サーバー URL</label>
          <input
            v-model="serverUrl"
            type="url"
            class="w-full px-3 py-2 rounded-md border bg-background"
            placeholder="http://localhost:3000"
          />
          <p class="text-xs text-muted-foreground mt-1">
            OCD MCP サーバーの URL
          </p>
        </div>

        <!-- エラー表示 -->
        <div
          v-if="error"
          class="p-3 rounded-md bg-destructive/10 text-destructive text-sm"
        >
          {{ error }}
        </div>

        <!-- 送信ボタン -->
        <div class="flex justify-end gap-2 pt-2">
          <button
            type="button"
            @click="handleClose"
            class="px-4 py-2 rounded-md border hover:bg-accent transition-colors"
          >
            キャンセル
          </button>
          <button
            type="submit"
            :disabled="!isValid || isSubmitting"
            class="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Loader2 v-if="isSubmitting" class="w-4 h-4 animate-spin" />
            <span>{{ isSubmitting ? '接続テスト中...' : '作成' }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
