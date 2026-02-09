<script setup lang="ts">
/**
 * TableOfContents - 目次コンポーネント
 *
 * 見出し一覧を表示し、クリックで該当箇所へスクロール。
 * 開閉可能。各アイテムは border-bottom で区切り。
 * Sticky 右カラム時は、表示中の見出しを active 表示（そのときだけ青）。
 */
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import type { TocHeading } from '@/utils/tocHelpers'

// =============================================================================
// Props
// =============================================================================

const props = withDefaults(
  defineProps<{
    /** 見出し一覧（parseHeadingsFromMarkdown の戻り値） */
    headings: TocHeading[]
    /** 右カラム Sticky 表示用のコンパクトスタイル（フォント・余白縮小、背景なし） */
    stickyRight?: boolean
  }>(),
  { stickyRight: false }
)

// =============================================================================
// 開閉状態（デフォルトは開）
// =============================================================================

const isOpen = ref(true)

function toggleOpen(): void {
  isOpen.value = !isOpen.value
}

// =============================================================================
// Active 見出し（Sticky 時のみ：表示中の見出しを追跡）
// =============================================================================

const activeSlug = ref<string | null>(null)
let observer: IntersectionObserver | null = null

/**
 * 見出し要素を監視し、ビューポート上部付近にあるものを active にする
 * root: null でビューポート基準。rootMargin で「上部〜30%」を active ゾーンに。
 */
function setupIntersectionObserver(): void {
  if (!props.stickyRight || props.headings.length === 0) return

  const ids = props.headings.map((h) => h.slug)
  const elements = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el != null)
  if (elements.length === 0) return

  observer?.disconnect()
  observer = new IntersectionObserver(
    () => {
      // 画面上部付近（active ゾーン）にある見出し、またはそこになければ「通過済みの最後」を active に
      const withRect = elements.map((el) => ({ el, rect: el.getBoundingClientRect() }))
      const inZone = withRect.filter(({ rect }) => rect.top <= 120 && rect.bottom >= 0).sort((a, b) => a.rect.top - b.rect.top)
      const passed = withRect.filter(({ rect }) => rect.top <= 0).sort((a, b) => b.rect.top - a.rect.top) // 通過済みで一番下
      const current = inZone[0] ?? passed[0]
      activeSlug.value = current ? current.el.id : null
    },
    {
      root: null,
      rootMargin: '-80px 0px -65% 0px', // 画面上部〜35% を active ゾーン
      threshold: 0,
    }
  )

  elements.forEach((el) => observer!.observe(el))
}

function cleanupObserver(): void {
  observer?.disconnect()
  observer = null
  activeSlug.value = null
}

onMounted(() => {
  if (!props.stickyRight) return
  nextTick(() => {
    setTimeout(setupIntersectionObserver, 100) // MarkdownViewer の描画を待つ
  })
})

onUnmounted(cleanupObserver)

watch(
  () => [props.headings, props.stickyRight] as const,
  () => {
    if (!props.stickyRight) {
      cleanupObserver()
      return
    }
    nextTick(() => {
      setTimeout(setupIntersectionObserver, 100)
    })
  }
)
</script>

<template>
  <nav
    v-if="headings.length > 0"
    :class="[
      'toc overflow-hidden',
      stickyRight
        ? 'mb-0 rounded-none border-0 bg-transparent'
        : 'mb-6 rounded-lg border border-border/50 bg-muted/20'
    ]"
    aria-label="目次"
  >
    <!-- ヘッダー（クリックで開閉） -->
    <button
      type="button"
      :class="[
        'w-full flex items-center justify-between gap-1 text-left transition-colors',
        stickyRight ? 'p-2 hover:bg-muted/20' : 'p-4 hover:bg-muted/30'
      ]"
      @click="toggleOpen"
      :aria-expanded="isOpen"
    >
      <h2
        :class="[
          'font-semibold text-muted-foreground',
          stickyRight ? 'content-text-xs' : 'content-text-sm'
        ]"
      >
        目次
      </h2>
      <ChevronDown
        v-if="isOpen"
        :class="['text-muted-foreground shrink-0 transition-transform', stickyRight ? 'w-3.5 h-3.5' : 'w-4 h-4']"
      />
      <ChevronRight
        v-else
        :class="['text-muted-foreground shrink-0 transition-transform', stickyRight ? 'w-3.5 h-3.5' : 'w-4 h-4']"
      />
    </button>

    <!-- 見出し一覧（開いているときのみ表示） -->
    <ul
      v-show="isOpen"
      :class="[
        'border-t border-border/50',
        stickyRight ? 'content-text-xs' : 'content-text-sm'
      ]"
    >
      <li
        v-for="(h, i) in headings"
        :key="i"
        :style="{ paddingLeft: stickyRight ? `${(h.level - 1) * 0.5}rem` : `${(h.level - 1) * 0.75}rem` }"
        class="truncate border-b border-border/50 last:border-b-0"
      >
        <a
          :href="`#${h.slug}`"
          :class="[
            'block hover:underline',
            stickyRight ? 'py-1 pr-2' : 'py-2 pr-4',
            (stickyRight && activeSlug === h.slug) ? 'text-primary font-medium' : 'text-foreground/80'
          ]"
        >
          {{ h.title }}
        </a>
      </li>
    </ul>
  </nav>
</template>
