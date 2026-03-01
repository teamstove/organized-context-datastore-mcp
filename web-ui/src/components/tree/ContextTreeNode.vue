<script setup lang="ts">
/**
 * ContextTreeNode - ツリーノードコンポーネント (再帰)
 *
 * 役割:
 * - 単一ノードの表示
 * - 子ノードの再帰的表示
 * - 展開/折りたたみ（フォルダアイコン・名前クリック）
 * - 選択状態の表示
 * - sticky ディレクトリ表示
 * - タイトル折り返し
 *
 * ロジックは ContextService / UIService に委譲
 */
import { inject, computed, ref, nextTick } from 'vue'
import { File, Folder, FolderOpen } from 'lucide-vue-next'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'
import type { ContextNodeSummary } from '@/types'

// =============================================================================
// Props
// =============================================================================

const props = defineProps<{
  node: ContextNodeSummary
  depth: number
}>()

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// Computed
// =============================================================================

const isExpanded = computed(() => contextService.isExpanded(props.node.path))
// selectedPath を使用（コンテンツ読み込み前でも選択状態を反映）
// 仮想ノード（ディレクトリ）は選択対象外:
// 同名ファイルが退避されて子になっている場合、仮想ディレクトリまでハイライトされるのを防ぐ
const isSelected = computed(() =>
  !props.node.isVirtual && contextService.state.selectedPath === props.node.path
)
const hasChildren = computed(() => 
  props.node.hasChildren || 
  props.node.childCount > 0 || 
  (props.node.children && props.node.children.length > 0)
)

// 設定から取得
const stickyDirs = computed(() => uiService.state.treeSettings.stickyDirs)
const wrapTitles = computed(() => uiService.state.treeSettings.wrapTitles)
const showFileName = computed(() => uiService.state.treeSettings.showFileName)
const showSummary = computed(() => uiService.state.treeSettings.showSummary)

// パスからファイル名（最後のセグメント）を抽出
const fileName = computed(() => {
  const parts = props.node.path.split('/')
  return parts[parts.length - 1] || ''
})

// 表示用のファイル名（タイトルと異なる場合のみ）
const displayFileName = computed(() => {
  if (hasChildren.value) return null
  if (!showFileName.value) return null
  if (!fileName.value || fileName.value === props.node.title) return null
  return fileName.value
})

// 表示用の summary（node.summary から取得）
const displaySummary = computed(() => {
  if (!showSummary.value) return null
  // バックエンドから返される summary フィールドを使用
  const summary = props.node.summary
  return typeof summary === 'string' && summary.trim() ? summary.trim() : null
})

// インデント幅（矢印アイコンを削除したので調整）
const indentStyle = computed(() => ({
  paddingLeft: `${props.depth * 16 + 4}px`,
}))

// Sticky スタイル（ディレクトリの場合のみ）
// top は em 単位で、フォントサイズ設定に応じてスケール
const stickyStyle = computed(() => {
  if (!stickyDirs.value || !hasChildren.value) {
    return {}
  }
  // ネストレベルに応じた top 位置（1行 ≈ 1.75em）
  // z-index はツリー内の重なり用に 1〜10 程度に抑え、モーダル backdrop (z-[200]) より常に下になるようにする
  return {
    position: 'sticky' as const,
    top: `calc(${props.depth} * 1.75em)`,
    zIndex: Math.max(1, 10 - props.depth),
  }
})

// Sticky 用のクラス（ディレクトリの場合のみ背景色を設定）
const stickyClass = computed(() => {
  if (!stickyDirs.value || !hasChildren.value) {
    return ''
  }
  // 背景色を設定して下の要素を隠す
  return 'sticky-dir'
})

// =============================================================================
// Refs
// =============================================================================

/** ノード行への参照（スクロール用） */
const nodeRowRef = ref<HTMLElement | null>(null)

// =============================================================================
// イベントハンドラ
// =============================================================================

/**
 * フォルダアイコン・フォルダ名クリック時の処理
 * ディレクトリの場合: 開閉をトグル
 * ファイルの場合: 何もしない（handleSelect が処理）
 * 
 * 閉じる操作の場合は、閉じた後にそのフォルダまでスクロール
 */
function handleFolderClick(event: Event) {
  if (hasChildren.value) {
    event.stopPropagation()
    
    // 閉じる操作かどうかを判定（トグル前の状態で判定）
    const isClosing = isExpanded.value
    
    // トグル実行
    contextService.toggleNode(props.node.path)
    
    // 閉じる操作の場合、DOM更新後にスクロール
    if (isClosing) {
      nextTick(() => {
        if (nodeRowRef.value) {
          // sticky ヘッダーの高さ分のオフセットを計算
          // 各 sticky 行の実際の高さ: py-0.5 (4px) + テキスト行高 (~20px) + border (1px) ≈ 25px
          // stickyStyle の top は depth * 24px なので、それに合わせて計算
          // オフセット = 閉じるフォルダの上にある全ての sticky 行の top 位置 + 行高さ
          // = (depth * 24) + 25 + 余裕 (8px)
          // フォントサイズに応じて行高が変わるため、em ベースで概算
          const rowHeightEm = 1.75
          const extraMarginEm = 0.5
          const stickyOffsetEm = stickyDirs.value
            ? (props.depth * rowHeightEm) + rowHeightEm + extraMarginEm
            : 0
          
          // 一時的に scrollMarginTop を設定してスクロール
          const originalMargin = nodeRowRef.value.style.scrollMarginTop
          nodeRowRef.value.style.scrollMarginTop = `${stickyOffsetEm}em`
          
          nodeRowRef.value.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          })
          
          // スクロール完了後に元に戻す（アニメーション完了を待つ）
          setTimeout(() => {
            if (nodeRowRef.value) {
              nodeRowRef.value.style.scrollMarginTop = originalMargin
            }
          }, 500)
        }
      })
    }
  }
}

/**
 * ノード行クリック時の処理
 * ファイルの場合のみコンテンツを選択
 */
function handleSelect() {
  if (!hasChildren.value) {
    contextService.selectContext(props.node.path)
  }
}
</script>

<template>
  <div>
    <!-- ノード行 -->
    <div
      ref="nodeRowRef"
      :data-node-path="node.path"
      @click="handleSelect"
      :class="[
        'tree-node flex gap-1.5 py-0.5 pr-2',
        hasChildren ? 'cursor-pointer' : 'cursor-pointer',
        isSelected && 'selected',
        wrapTitles ? 'items-start flex-wrap' : 'items-center whitespace-nowrap',
        stickyClass
      ]"
      :style="{ ...indentStyle, ...stickyStyle }"
    >
      <!-- アイコン（クリックでフォルダ開閉） -->
      <span
        @click="handleFolderClick"
        :class="[
          'flex-shrink-0 mt-0.5',
          hasChildren && 'hover:opacity-70 transition-opacity'
        ]"
      >
        <template v-if="hasChildren">
          <FolderOpen v-if="isExpanded" class="w-4 h-4 text-amber-500" />
          <Folder v-else class="w-4 h-4 text-amber-500" />
        </template>
        <File v-else class="w-4 h-4 text-muted-foreground" />
      </span>

      <!-- 子ノード数（フォルダの場合、アイコンの直後に表示） -->
      <span
        v-if="node.childCount > 0"
        @click="handleFolderClick"
        class="tree-node-meta text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0 hover:opacity-70 transition-opacity"
      >
        {{ node.childCount }}
      </span>

      <!-- タイトル（ファイル名表示オプション対応）（フォルダの場合はクリックで開閉） -->
      <div
        @click="handleFolderClick"
        :class="[
          'flex-1 min-w-0',
          wrapTitles ? 'title-wrap' : '',
          node.isVirtual && 'italic text-muted-foreground'
        ]"
      >
        <!-- タイトル行（フォントサイズは親から継承） -->
        <div :class="['tree-node-title', !wrapTitles && 'truncate']">
          <!-- ファイル名（薄い色） -->
          <span v-if="displayFileName" class="text-muted-foreground/70">{{ displayFileName }}: </span>
          <!-- タイトル -->
          <span>{{ node.title }}</span>
        </div>
        <!-- Summary（タイトルの下に表示） -->
        <div
          v-if="displaySummary"
          :class="[
            'tree-node-meta text-muted-foreground mt-0.5',
            !wrapTitles && 'truncate'
          ]"
        >
          {{ displaySummary }}
        </div>
      </div>
    </div>

    <!-- 子ノード (再帰) -->
    <div
      v-if="isExpanded && hasChildren && node.children"
      class="children"
    >
      <ContextTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<style scoped>
/* Sticky ディレクトリの背景色（下の要素を隠す） */
.sticky-dir {
  background-color: hsl(var(--card));
  /* ボーダーで視覚的に区切る */
  border-bottom: 1px solid hsl(var(--border) / 0.5);
}

/* タイトルの折り返し表示 */
.title-wrap {
  white-space: normal !important;
  word-break: break-word;
  overflow-wrap: break-word;
}
</style>
