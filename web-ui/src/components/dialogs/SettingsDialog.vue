<script setup lang="ts">
/**
 * SettingsDialog - 設定ダイアログ
 *
 * 役割:
 * - ツリー表示設定の切り替え
 * - ソートモードの選択
 * - 設定は LocalStorage に自動保存
 */
import { inject, computed } from 'vue'
import { X, Settings, Code2, PanelRightOpen } from 'lucide-vue-next'
import { uiServiceKey, type UIService } from '@/services/UIService'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import type { TreeSortMode, CodeTheme, ContentWidthMode } from '@/types'
import { CODE_THEME_LABELS, FONT_SIZE_MIN, FONT_SIZE_MAX } from '@/types'

// =============================================================================
// Service の inject
// =============================================================================

const uiService = inject(uiServiceKey) as UIService
const contextService = inject(contextServiceKey) as ContextService

// =============================================================================
// Computed
// =============================================================================

const isOpen = computed(() => uiService.state.settingsDialogOpen)
const stickyDirs = computed(() => uiService.state.treeSettings.stickyDirs)
const wrapTitles = computed(() => uiService.state.treeSettings.wrapTitles)
const sortMode = computed(() => uiService.state.treeSettings.sortMode)
const showFileName = computed(() => uiService.state.treeSettings.showFileName)
const showSummary = computed(() => uiService.state.treeSettings.showSummary)
const codeTheme = computed(() => uiService.state.codeTheme)
const contentWidthMode = computed(() => uiService.state.contentWidthMode)
const showToc = computed(() => uiService.state.showToc)
const tocStickyRight = computed(() => uiService.state.tocStickyRight)
const treeFontSize = computed(() => uiService.state.treeFontSize)
const contentFontSize = computed(() => uiService.state.contentFontSize)

/** 利用可能なコードテーマ一覧 */
const availableCodeThemes = Object.entries(CODE_THEME_LABELS) as [CodeTheme, string][]

// =============================================================================
// イベントハンドラ
// =============================================================================

function handleClose() {
  uiService.closeSettingsDialog()
}

function handleToggleStickyDirs() {
  uiService.toggleStickyDirs()
}

function handleToggleWrapTitles() {
  uiService.toggleWrapTitles()
}

function handleToggleShowFileName() {
  uiService.toggleShowFileName()
}

function handleToggleShowSummary() {
  uiService.toggleShowSummary()
}

/**
 * ソートモードを変更
 * 変更後、ツリーを再ソート
 */
function handleSortModeChange(mode: TreeSortMode) {
  uiService.setSortMode(mode)
  // ツリーを再ソート
  contextService.resortTree()
}

/**
 * コードテーマを変更
 */
function handleCodeThemeChange(theme: CodeTheme) {
  uiService.setCodeTheme(theme)
}

/**
 * メインコンテンツ幅モードを変更（通常 / 幅広）
 */
function handleContentWidthModeChange(mode: ContentWidthMode) {
  uiService.setContentWidthMode(mode)
}

/**
 * 目次表示のオン/オフを切り替え
 */
function handleToggleShowToc() {
  uiService.setShowToc(!showToc.value)
}

/**
 * 目次を右カラム Sticky 表示に切り替え
 */
function handleToggleTocStickyRight() {
  uiService.setTocStickyRight(!tocStickyRight.value)
}

/**
 * ツリーのフォントサイズを変更 (px)
 */
function handleTreeFontSizeChange(event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseInt(target.value, 10)
  if (!Number.isNaN(value)) {
    uiService.setTreeFontSize(value)
  }
}

/**
 * コンテンツのフォントサイズを変更 (px)
 */
function handleContentFontSizeChange(event: Event) {
  const target = event.target as HTMLInputElement
  const value = parseInt(target.value, 10)
  if (!Number.isNaN(value)) {
    uiService.setContentFontSize(value)
  }
}
</script>

<template>
  <!-- オーバーレイ -->
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-[200] flex items-center justify-center"
    >
      <!-- 背景 -->
      <div
        class="absolute inset-0 bg-black/50"
        @click="handleClose"
      />

      <!-- ダイアログ（高さ制限＋縦 flex でコンテンツをスクロール可能に） -->
      <div class="relative bg-card rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col mx-4 border">
        <!-- ヘッダー -->
        <div class="flex items-center justify-between p-4 border-b">
          <div class="flex items-center gap-2">
            <Settings class="w-5 h-5 text-muted-foreground" />
            <h2 class="text-lg font-semibold">表示設定</h2>
          </div>
          <button
            @click="handleClose"
            class="p-1 rounded hover:bg-accent transition-colors"
          >
            <X class="w-5 h-5" />
          </button>
        </div>

        <!-- コンテンツ（スクロール可能領域） -->
        <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
          <!-- メインコンテンツ幅 -->
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <PanelRightOpen class="w-4 h-4 text-muted-foreground" />
              <h3 class="text-sm font-medium text-muted-foreground">メインコンテンツ幅</h3>
            </div>
            <div class="flex rounded-md border p-1 gap-1">
              <button
                type="button"
                @click="handleContentWidthModeChange('normal')"
                :class="[
                  'flex-1 px-3 py-2 text-sm rounded transition-colors',
                  contentWidthMode === 'normal'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                ]"
              >
                通常
              </button>
              <button
                type="button"
                @click="handleContentWidthModeChange('wide')"
                :class="[
                  'flex-1 px-3 py-2 text-sm rounded transition-colors',
                  contentWidthMode === 'wide'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                ]"
              >
                幅広
              </button>
            </div>
            <p class="text-xs text-muted-foreground">
              通常: 最大幅を制限して読みやすく表示。幅広: パネルいっぱいに表示。
            </p>
          </div>

          <!-- フォントサイズ -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-muted-foreground">フォントサイズ</h3>

            <!-- ツリー（左ペイン） -->
            <div>
              <div class="font-medium text-sm mb-1">ツリー（左側のファイル一覧）</div>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  :min="FONT_SIZE_MIN"
                  :max="FONT_SIZE_MAX"
                  :value="treeFontSize"
                  @input="handleTreeFontSizeChange"
                  class="w-20 px-3 py-2 rounded-md border bg-background text-sm"
                />
                <span class="text-sm text-muted-foreground">px</span>
              </div>
            </div>

            <!-- コンテンツ（右ペイン） -->
            <div>
              <div class="font-medium text-sm mb-1">コンテンツ（右側のドキュメント）</div>
              <div class="flex items-center gap-2">
                <input
                  type="number"
                  :min="FONT_SIZE_MIN"
                  :max="FONT_SIZE_MAX"
                  :value="contentFontSize"
                  @input="handleContentFontSizeChange"
                  class="w-20 px-3 py-2 rounded-md border bg-background text-sm"
                />
                <span class="text-sm text-muted-foreground">px</span>
              </div>
            </div>

            <p class="text-xs text-muted-foreground">
              左側のファイルツリーと右側のドキュメントの基本フォントサイズを px で指定できます（{{ FONT_SIZE_MIN }}-{{ FONT_SIZE_MAX }}px）。
            </p>
          </div>

          <!-- 目次表示 -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-muted-foreground">目次（Table of Contents）</h3>
            <label class="flex items-center justify-between cursor-pointer">
              <div>
                <div class="font-medium text-sm">目次を表示</div>
                <div class="text-xs text-muted-foreground">
                  本文の前に見出し一覧を表示し、クリックで該当箇所へジャンプ
                </div>
              </div>
              <button
                type="button"
                @click="handleToggleShowToc"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors',
                  showToc ? 'bg-primary' : 'bg-muted'
                ]"
              >
                <span
                  :class="[
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    showToc ? 'left-6' : 'left-1'
                  ]"
                />
              </button>
            </label>

            <!-- 右カラム Sticky 表示（目次を表示がオンのとき有効） -->
            <label class="flex items-center justify-between cursor-pointer">
              <div>
                <div class="font-medium text-sm">目次を右カラムで Sticky 表示</div>
                <div class="text-xs text-muted-foreground">
                  目次を右側に固定表示し、スクロール中も常に表示
                </div>
              </div>
              <button
                type="button"
                @click="handleToggleTocStickyRight"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors',
                  tocStickyRight ? 'bg-primary' : 'bg-muted'
                ]"
              >
                <span
                  :class="[
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    tocStickyRight ? 'left-6' : 'left-1'
                  ]"
                />
              </button>
            </label>
          </div>

          <!-- ソートモード設定 -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-muted-foreground">並び順</h3>

            <!-- 名前順 (Dir/File区別なし) -->
            <label class="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="sortMode"
                value="name-only"
                :checked="sortMode === 'name-only'"
                @change="handleSortModeChange('name-only')"
                class="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
              />
              <div class="flex-1">
                <div class="font-medium text-sm group-hover:text-primary transition-colors">
                  名前順
                </div>
                <div class="text-xs text-muted-foreground">
                  ファイルとディレクトリを名前でソート（001_, 002_ 等の順番を維持）
                </div>
              </div>
            </label>

            <!-- フォルダ優先 -->
            <label class="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="sortMode"
                value="folders-first"
                :checked="sortMode === 'folders-first'"
                @change="handleSortModeChange('folders-first')"
                class="w-4 h-4 text-primary border-gray-300 focus:ring-primary"
              />
              <div class="flex-1">
                <div class="font-medium text-sm group-hover:text-primary transition-colors">
                  フォルダ優先
                </div>
                <div class="text-xs text-muted-foreground">
                  フォルダを先に表示し、その後ファイルを名前順で表示
                </div>
              </div>
            </label>
          </div>

          <!-- ツリー表示設定 -->
          <div class="space-y-3">
            <h3 class="text-sm font-medium text-muted-foreground">ツリー表示</h3>

            <!-- Sticky ディレクトリ -->
            <label class="flex items-center justify-between cursor-pointer">
              <div>
                <div class="font-medium text-sm">ディレクトリ名を固定表示</div>
                <div class="text-xs text-muted-foreground">
                  スクロール時にディレクトリ名を画面上部に固定
                </div>
              </div>
              <button
                @click="handleToggleStickyDirs"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors',
                  stickyDirs ? 'bg-primary' : 'bg-muted'
                ]"
              >
                <span
                  :class="[
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    stickyDirs ? 'left-6' : 'left-1'
                  ]"
                />
              </button>
            </label>

            <!-- タイトル折り返し -->
            <label class="flex items-center justify-between cursor-pointer">
              <div>
                <div class="font-medium text-sm">タイトルを折り返し表示</div>
                <div class="text-xs text-muted-foreground">
                  長いファイル名を複数行で表示
                </div>
              </div>
              <button
                @click="handleToggleWrapTitles"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors',
                  wrapTitles ? 'bg-primary' : 'bg-muted'
                ]"
              >
                <span
                  :class="[
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    wrapTitles ? 'left-6' : 'left-1'
                  ]"
                />
              </button>
            </label>

            <!-- ファイル名表示 -->
            <label class="flex items-center justify-between cursor-pointer">
              <div>
                <div class="font-medium text-sm">ファイル名を表示</div>
                <div class="text-xs text-muted-foreground">
                  タイトルの前にファイル名を表示
                </div>
              </div>
              <button
                @click="handleToggleShowFileName"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors',
                  showFileName ? 'bg-primary' : 'bg-muted'
                ]"
              >
                <span
                  :class="[
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    showFileName ? 'left-6' : 'left-1'
                  ]"
                />
              </button>
            </label>

            <!-- Summary 表示 -->
            <label class="flex items-center justify-between cursor-pointer">
              <div>
                <div class="font-medium text-sm">Summary を表示</div>
                <div class="text-xs text-muted-foreground">
                  タイトルの下に要約を表示
                </div>
              </div>
              <button
                @click="handleToggleShowSummary"
                :class="[
                  'relative w-11 h-6 rounded-full transition-colors',
                  showSummary ? 'bg-primary' : 'bg-muted'
                ]"
              >
                <span
                  :class="[
                    'absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                    showSummary ? 'left-6' : 'left-1'
                  ]"
                />
              </button>
            </label>
          </div>

          <!-- コードテーマ設定 -->
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <Code2 class="w-4 h-4 text-muted-foreground" />
              <h3 class="text-sm font-medium text-muted-foreground">コードテーマ</h3>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="[themeKey, themeLabel] in availableCodeThemes"
                :key="themeKey"
                @click="handleCodeThemeChange(themeKey)"
                :class="[
                  'px-3 py-2 text-sm rounded-md border transition-colors text-left',
                  codeTheme === themeKey
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card hover:bg-accent border-border'
                ]"
              >
                {{ themeLabel }}
              </button>
            </div>

            <p class="text-xs text-muted-foreground">
              コードブロックのシンタックスハイライトテーマを選択
            </p>
          </div>
        </div>

        <!-- フッター -->
        <div class="p-4 border-t bg-muted/30">
          <p class="text-xs text-muted-foreground text-center">
            設定は自動的に保存されます
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
