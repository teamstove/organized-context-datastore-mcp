<script setup lang="ts">
/**
 * ProjectSelector - プロジェクト選択コンポーネント
 *
 * 役割:
 * - 保存されたプロジェクト一覧の表示
 * - 新規プロジェクト追加ダイアログの表示
 * - プロジェクトの削除
 *
 * ロジックは ProjectService に委譲
 */
import { inject, ref, computed } from 'vue'
import { FolderOpen, Server, Plus, Trash2, Clock } from 'lucide-vue-next'
import { projectServiceKey, type ProjectService } from '@/services/ProjectService'
import ProjectDialog from './ProjectDialog.vue'

// =============================================================================
// Props & Emits
// =============================================================================

const emit = defineEmits<{
  select: [projectId: string]
}>()

// =============================================================================
// Service の inject
// =============================================================================

const projectService = inject(projectServiceKey) as ProjectService

// =============================================================================
// Local State
// =============================================================================

const showDialog = ref(false)

// =============================================================================
// Computed
// =============================================================================

const projects = computed(() => {
  // 最終アクセス日時でソート（新しい順）
  return [...projectService.state.projects].sort(
    (a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
  )
})

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleSelectProject(projectId: string) {
  emit('select', projectId)
}

function handleAddProject() {
  showDialog.value = true
}

function handleCloseDialog() {
  showDialog.value = false
}

async function handleProjectCreated(projectId: string) {
  showDialog.value = false
  emit('select', projectId)
}

function handleDeleteProject(event: Event, projectId: string) {
  event.stopPropagation()
  if (confirm('このプロジェクトを削除しますか？')) {
    projectService.removeProject(projectId)
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div>
    <!-- プロジェクト一覧 -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <!-- 新規追加カード -->
      <button
        @click="handleAddProject"
        class="p-6 rounded-lg border-2 border-dashed hover:border-primary hover:bg-accent/50 transition-colors flex flex-col items-center justify-center gap-3 min-h-[160px]"
      >
        <Plus class="w-10 h-10 text-muted-foreground" />
        <span class="font-medium">新規プロジェクト</span>
      </button>

      <!-- 既存プロジェクト -->
      <div
        v-for="project in projects"
        :key="project.id"
        @click="handleSelectProject(project.id)"
        class="p-6 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all cursor-pointer group relative"
      >
        <!-- 削除ボタン -->
        <button
          @click="(e) => handleDeleteProject(e, project.id)"
          class="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive transition-opacity"
          title="削除"
        >
          <Trash2 class="w-4 h-4" />
        </button>

        <!-- アイコン -->
        <div class="mb-4">
          <div
            :class="[
              'w-12 h-12 rounded-lg flex items-center justify-center',
              project.mode === 'local' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400' : 'bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400'
            ]"
          >
            <FolderOpen v-if="project.mode === 'local'" class="w-6 h-6" />
            <Server v-else class="w-6 h-6" />
          </div>
        </div>

        <!-- プロジェクト名 -->
        <h3 class="font-semibold text-lg mb-1">{{ project.name }}</h3>

        <!-- パス/URL -->
        <p class="text-sm text-muted-foreground truncate mb-3">
          {{ project.mode === 'local' ? project.basePath : project.serverUrl }}
        </p>

        <!-- 最終アクセス -->
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock class="w-3.5 h-3.5" />
          <span>{{ formatDate(project.lastAccessed) }}</span>
        </div>
      </div>
    </div>

    <!-- プロジェクト追加ダイアログ -->
    <ProjectDialog
      v-if="showDialog"
      @close="handleCloseDialog"
      @created="handleProjectCreated"
    />
  </div>
</template>
