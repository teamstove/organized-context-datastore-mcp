<script setup lang="ts">
/**
 * LinksPopover - リンク一覧をポップオーバーで表示するボタン
 *
 * 役割:
 * - リンク件数をバッジ形式で表示
 * - クリックで詳細リストを popover 表示
 * - 参照先/参照元を切り替えて表示
 */
import { ref, computed } from 'vue'
import { Link2, ExternalLink, ArrowRight, ArrowLeft } from 'lucide-vue-next'

// =============================================================================
// Types
// =============================================================================

interface LinkInfo {
  path: string
  title: string | null
  displayPath: string
}

// =============================================================================
// Props & Emits
// =============================================================================

const props = defineProps<{
  linksTo: LinkInfo[]
  linksFrom: LinkInfo[]
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

// =============================================================================
// State
// =============================================================================

const isOpen = ref(false)
const activeTab = ref<'to' | 'from'>('to')

// =============================================================================
// Computed
// =============================================================================

/** 合計リンク数 */
const totalCount = computed(() => props.linksTo.length + props.linksFrom.length)

/** バッジラベル */
const label = computed(() => `リンク ${totalCount.value}`)

/** 現在のタブで表示するリンク */
const currentLinks = computed(() => 
  activeTab.value === 'to' ? props.linksTo : props.linksFrom
)

// =============================================================================
// Actions
// =============================================================================

function toggle() {
  isOpen.value = !isOpen.value
}

function close() {
  isOpen.value = false
}

function setTab(tab: 'to' | 'from') {
  activeTab.value = tab
}

function handleLinkClick(path: string) {
  emit('navigate', path)
  close()
}
</script>

<template>
  <div class="relative inline-block" v-click-outside="close">
    <!-- トリガーボタン -->
    <button
      @click="toggle"
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
    >
      <Link2 class="w-3.5 h-3.5" />
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
        class="absolute top-full left-0 mt-2 z-50 w-80 max-h-72 overflow-hidden bg-card border border-border rounded-lg shadow-lg flex flex-col"
      >
        <!-- タブヘッダー -->
        <div class="flex border-b bg-muted/50">
          <button
            @click="setTab('to')"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm transition-colors"
            :class="activeTab === 'to' 
              ? 'border-b-2 border-primary text-primary font-medium' 
              : 'text-muted-foreground hover:text-foreground'"
          >
            <ArrowRight class="w-3.5 h-3.5" />
            参照先 ({{ linksTo.length }})
          </button>
          <button
            @click="setTab('from')"
            class="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm transition-colors"
            :class="activeTab === 'from' 
              ? 'border-b-2 border-primary text-primary font-medium' 
              : 'text-muted-foreground hover:text-foreground'"
          >
            <ArrowLeft class="w-3.5 h-3.5" />
            参照元 ({{ linksFrom.length }})
          </button>
        </div>

        <!-- リンクリスト -->
        <div class="flex-1 overflow-auto p-2">
          <ul v-if="currentLinks.length > 0" class="space-y-0.5">
            <li v-for="link in currentLinks" :key="link.path">
              <button
                @click="handleLinkClick(link.path)"
                class="w-full flex flex-col items-start gap-0.5 text-left hover:bg-accent/50 rounded px-2 py-1.5 transition-colors"
              >
                <!-- タイトル -->
                <span v-if="link.title" class="text-sm text-primary font-medium truncate w-full">
                  {{ link.title }}
                </span>
                <!-- パス -->
                <span class="flex items-center gap-1.5 text-muted-foreground text-xs font-mono truncate w-full">
                  <ExternalLink class="w-3 h-3 flex-shrink-0" />
                  {{ link.displayPath }}
                </span>
              </button>
            </li>
          </ul>
          <div v-else class="text-center text-sm text-muted-foreground py-4">
            リンクがありません
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script lang="ts">
// カスタムディレクティブ: クリック外で閉じる
export default {
  directives: {
    'click-outside': {
      mounted(el: HTMLElement, binding: { value: () => void }) {
        const handler = (event: MouseEvent) => {
          if (!(el === event.target || el.contains(event.target as Node))) {
            binding.value()
          }
        }
        ;(el as HTMLElementWithClickOutside)._clickOutsideHandler = handler
        document.addEventListener('click', handler)
      },
      unmounted(el: HTMLElement) {
        const handler = (el as HTMLElementWithClickOutside)._clickOutsideHandler
        if (handler) {
          document.removeEventListener('click', handler)
        }
      },
    },
  },
}

// TypeScript の型定義
interface HTMLElementWithClickOutside extends HTMLElement {
  _clickOutsideHandler?: (event: MouseEvent) => void
}
</script>
