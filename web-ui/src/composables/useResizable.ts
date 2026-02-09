/**
 * useResizable - リサイズ機能 composable
 *
 * 責務:
 * - ドラッグによるリサイズ操作の管理
 * - LocalStorage への幅の永続化
 * - マウスイベントのハンドリング
 *
 * BrowserView から分離してテスト可能・再利用可能に
 */
import { ref, computed, onUnmounted } from 'vue'
import { loadNumber, saveNumber } from '@/utils/StorageHelper'

// =============================================================================
// 型定義
// =============================================================================

export interface UseResizableOptions {
  /** LocalStorage のキー */
  storageKey: string
  /** 初期幅 */
  initialWidth?: number
  /** 最小幅 */
  minWidth?: number
  /** 最大幅 */
  maxWidth?: number
}

export interface UseResizableReturn {
  /** 現在の幅 */
  width: ReturnType<typeof ref<number>>
  /** リサイズ中かどうか */
  isResizing: ReturnType<typeof ref<boolean>>
  /** スタイルオブジェクト（width, flexShrink） */
  style: ReturnType<typeof computed>
  /** リサイズ開始ハンドラ */
  startResize: (event: MouseEvent) => void
}

// =============================================================================
// Composable
// =============================================================================

/**
 * リサイズ可能な要素のロジックを提供
 *
 * @example
 * ```vue
 * <script setup>
 * const { width, isResizing, style, startResize } = useResizable({
 *   storageKey: 'ocd-sidebar-width',
 *   initialWidth: 320,
 *   minWidth: 200,
 *   maxWidth: 600
 * })
 * </script>
 *
 * <template>
 *   <aside :style="style">...</aside>
 *   <div @mousedown="startResize" class="resize-handle" />
 * </template>
 * ```
 */
export function useResizable(options: UseResizableOptions): UseResizableReturn {
  const {
    storageKey,
    initialWidth = 320,
    minWidth = 200,
    maxWidth = 600,
  } = options

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // LocalStorage から復元、または初期値
  const savedWidth = loadNumber(storageKey, initialWidth)
  const validWidth = Math.max(minWidth, Math.min(maxWidth, savedWidth))

  const width = ref(validWidth)
  const isResizing = ref(false)

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------

  const style = computed(() => ({
    width: `${width.value}px`,
    flexShrink: 0,
  }))

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  function doResize(event: MouseEvent): void {
    if (!isResizing.value) return

    const newWidth = event.clientX
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      width.value = newWidth
    }
  }

  function stopResize(): void {
    if (!isResizing.value) return

    isResizing.value = false
    document.removeEventListener('mousemove', doResize)
    document.removeEventListener('mouseup', stopResize)

    // スタイルをリセット
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    // LocalStorage に保存
    saveNumber(storageKey, width.value)
  }

  function startResize(event: MouseEvent): void {
    event.preventDefault()
    isResizing.value = true

    document.addEventListener('mousemove', doResize)
    document.addEventListener('mouseup', stopResize)

    // ドラッグ中のテキスト選択を防止
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  onUnmounted(() => {
    document.removeEventListener('mousemove', doResize)
    document.removeEventListener('mouseup', stopResize)
  })

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    width,
    isResizing,
    style,
    startResize,
  }
}
