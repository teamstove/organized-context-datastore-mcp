<script setup lang="ts">
/**
 * TodoPopover - TODO リストをポップオーバーで表示するボタン
 *
 * 役割:
 * - TODO 件数をバッジ形式で表示
 * - クリックで詳細リストを popover 表示
 */
import { ref, computed } from 'vue'
import { CheckSquare, Square, ListTodo } from 'lucide-vue-next'

// =============================================================================
// Props
// =============================================================================

interface Todo {
  readonly text: string
  readonly completed: boolean
  readonly attributes?: readonly string[]
  readonly location?: string
  readonly line?: number
}

const props = defineProps<{
  todos: readonly Todo[]
}>()

// =============================================================================
// State
// =============================================================================

const isOpen = ref(false)
const buttonRef = ref<HTMLButtonElement | null>(null)

// =============================================================================
// Computed
// =============================================================================

/** 未完了 TODO 数 */
const incompleteCount = computed(() => props.todos.filter(t => !t.completed).length)

/** 全 TODO 数 */
const totalCount = computed(() => props.todos.length)

/** バッジラベル */
const label = computed(() => `TODO ${incompleteCount.value}/${totalCount.value}`)

// =============================================================================
// Actions
// =============================================================================

function toggle() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

// クリック外で閉じる
function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node
  if (buttonRef.value && !buttonRef.value.contains(target)) {
    close()
  }
}
</script>

<template>
  <div class="relative inline-block" v-click-outside="handleClickOutside">
    <!-- トリガーボタン -->
    <button
      ref="buttonRef"
      @click="toggle"
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors"
      :class="[
        incompleteCount > 0
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
          : 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/20'
      ]"
    >
      <ListTodo class="w-3.5 h-3.5" />
      <span class="font-medium">{{ label }}</span>
    </button>

    <!-- Popover -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-1"
    >
      <div
        v-if="isOpen"
        class="absolute top-full left-0 mt-2 z-50 w-72 max-h-64 overflow-auto bg-card border border-border rounded-lg shadow-lg"
      >
        <!-- ヘッダー -->
        <div class="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
          <span class="text-sm font-medium">TODO リスト</span>
          <span class="text-xs text-muted-foreground">{{ incompleteCount }}/{{ totalCount }}</span>
        </div>

        <!-- TODO リスト -->
        <ul class="p-2 space-y-1">
          <li
            v-for="(todo, i) in todos"
            :key="i"
            class="flex items-start gap-2 text-sm px-2 py-1.5 rounded hover:bg-muted/50"
          >
            <span class="flex-shrink-0 mt-0.5">
              <CheckSquare v-if="todo.completed" class="w-4 h-4 text-green-500" />
              <Square v-else class="w-4 h-4 text-muted-foreground" />
            </span>
            <span :class="todo.completed && 'line-through text-muted-foreground'">
              {{ todo.text }}
            </span>
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<script lang="ts">
// カスタムディレクティブ: クリック外で閉じる
export default {
  directives: {
    'click-outside': {
      mounted(el: HTMLElement, binding: { value: (event: MouseEvent) => void }) {
        el._clickOutside = (event: MouseEvent) => {
          if (!(el === event.target || el.contains(event.target as Node))) {
            binding.value(event)
          }
        }
        document.addEventListener('click', el._clickOutside)
      },
      unmounted(el: HTMLElement) {
        document.removeEventListener('click', el._clickOutside)
      },
    },
  },
}

// TypeScript の型拡張
declare module '@vue/runtime-core' {
  interface HTMLElement {
    _clickOutside?: (event: MouseEvent) => void
  }
}
</script>
