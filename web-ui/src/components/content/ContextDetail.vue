<script setup lang="ts">
/**
 * ContextDetail - コンテキスト詳細パネル
 *
 * 役割:
 * - 選択されたコンテキストの詳細表示
 * - Frontmatter (attrs) の表示（バッジ形式）
 * - TODO / Links をポップオーバーで表示
 * - Markdown 本文のレンダリング
 * - Preview / Markdown 表示モード切り替え
 *
 * ロジックは ContextService に委譲
 */
import { inject, computed, ref } from 'vue'
import { FileText, Calendar, Eye, Code, Pencil, Trash2 } from 'lucide-vue-next'
import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'
import MarkdownViewer from './MarkdownViewer.vue'
import TableOfContents from './TableOfContents.vue'
import TodoPopover from './TodoPopover.vue'
import LinksPopover from './LinksPopover.vue'
import { parseHeadingsFromMarkdown } from '@/utils/tocHelpers'

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// State
// =============================================================================

/** 表示モード: preview (レンダリング) / source (生 Markdown) */
const viewMode = ref<'preview' | 'source'>('preview')

// =============================================================================
// Computed
// =============================================================================

const context = computed(() => contextService.state.selectedContext)

/** 現在の Context Root */
const currentRoot = computed(() => contextService.state.currentRoot)

/** 編集可能かどうか（readOnly でない場合のみ） */
const isEditable = computed(() => {
  return currentRoot.value && !currentRoot.value.readOnly
})

// Summary 属性（タイトル直下に特別表示）
const summary = computed(() => {
  if (!context.value) return null
  const summaryValue = context.value.attrs.summary
  return typeof summaryValue === 'string' ? summaryValue : null
})

// Frontmatter の属性（title, summary 以外）
const attrs = computed(() => {
  if (!context.value) return []
  const entries = Object.entries(context.value.attrs)
  // title と summary は除外（summary はタイトル直下に別表示）
  return entries.filter(([key]) => key !== 'title' && key !== 'summary')
})

// TODO リスト
const todos = computed(() => context.value?.todos || [])

// Links（正規化済み）
const linksTo = computed(() => {
  const links = context.value?.links.to || []
  return links.map(link => normalizeAndEnrichLink(link))
})

const linksFrom = computed(() => {
  const links = context.value?.links.from || []
  return links.map(link => normalizeAndEnrichLink(link))
})

// TODO / Links の有無
const hasTodos = computed(() => todos.value.length > 0)
const hasLinks = computed(() => linksTo.value.length > 0 || linksFrom.value.length > 0)

/** メインコンテンツラッパーの幅クラス（通常: max-w-4xl / 幅広: max-w-full） */
const contentWrapperClass = computed(() =>
  uiService.state.contentWidthMode === 'wide' ? 'max-w-full mx-auto' : 'max-w-4xl mx-auto'
)

/** 目次用に見出しを抽出（プレビュー時かつ showToc 時に TOC で使用） */
const tocHeadings = computed(() => {
  const ctx = context.value
  return ctx ? parseHeadingsFromMarkdown(ctx.content) : []
})

/** 目次を表示するか（設定オンかつプレビューモード） */
const showToc = computed(() => uiService.state.showToc && viewMode.value === 'preview')

/** 目次を右カラム Sticky で表示するか */
const tocStickyRight = computed(() => uiService.state.tocStickyRight)

// =============================================================================
// リンク処理
// =============================================================================

/**
 * リンクパスを正規化し、タイトル情報を付与
 */
function normalizeAndEnrichLink(link: string): { path: string; title: string | null; displayPath: string } {
  // 相対パスを解決
  let resolvedPath = link
  if (link.startsWith('./') || link.startsWith('../')) {
    resolvedPath = resolveRelativePath(link)
  }

  // .md 拡張子を除去
  const cleanPath = resolvedPath.replace(/\.md$/, '')

  // ツリーからタイトルを取得
  const title = findTitleByPath(cleanPath)

  // 表示用パス（相対パスはそのまま、絶対パスはファイル名部分のみ）
  const displayPath = link.startsWith('./') || link.startsWith('../')
    ? link
    : cleanPath.split('/').pop() || cleanPath

  return {
    path: cleanPath,
    title,
    displayPath,
  }
}

/**
 * 相対パスを絶対パスに解決
 */
function resolveRelativePath(link: string): string {
  const basePath = context.value?.path || ''
  const baseDir = basePath.split('/').slice(0, -1).join('/')
  const parts = [...baseDir.split('/'), ...link.split('/')]
  const resolved: string[] = []

  for (const part of parts) {
    if (part === '.' || part === '') {
      continue
    } else if (part === '..') {
      resolved.pop()
    } else {
      resolved.push(part)
    }
  }

  return resolved.join('/')
}

/**
 * ツリーからパスに対応するタイトルを検索
 */
function findTitleByPath(path: string): string | null {
  const tree = contextService.state.tree

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function searchInNodes(nodes: readonly any[]): string | null {
    for (const node of nodes) {
      // パスが完全一致
      if (node.path === path) {
        return node.title
      }
      // .md なしのパスで比較
      if (node.path?.replace(/\.md$/, '') === path) {
        return node.title
      }
      // 子ノードを再帰検索
      if (node.children && node.children.length > 0) {
        const found = searchInNodes(node.children)
        if (found) return found
      }
    }
    return null
  }

  return searchInNodes(tree)
}

// =============================================================================
// Actions
// =============================================================================

function setViewMode(mode: 'preview' | 'source'): void {
  viewMode.value = mode
}

// 日時フォーマット
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

/**
 * 内部リンクをクリック（LinksPopover から emit される）
 */
function handleLinkNavigate(path: string): void {
  // .md 拡張子を除去（すでに正規化済みだが念のため）
  const cleanPath = path.replace(/\.md$/, '')

  // 親ディレクトリを展開
  contextService.expandToPath(cleanPath)
  // ドキュメントを選択
  contextService.selectContext(cleanPath)
}

// =============================================================================
// 編集・削除アクション
// =============================================================================

/**
 * 編集ボタンクリック
 */
function handleEdit(): void {
  // 編集モードを開始
  contextService.startEditing()
  // 編集ダイアログを開く
  uiService.openEditorDialog()
}

/**
 * 削除ボタンクリック
 */
function handleDelete(): void {
  if (!context.value) return
  // 削除確認ダイアログを開く
  uiService.openDeleteDialog(context.value.path)
}
</script>

<template>
  <div v-if="context" :class="contentWrapperClass">
    <!-- ヘッダー -->
    <header class="mb-6">
      <!-- パス -->
      <div class="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <FileText class="w-4 h-4" />
        <span class="font-mono">{{ context.path }}</span>
      </div>

      <!-- タイトル -->
      <h1 class="text-3xl font-bold mb-3">{{ context.title }}</h1>

      <!-- Summary（タイトル直下に alert スタイルで表示） -->
      <div
        v-if="summary"
        class="mb-4 p-3 rounded-lg border border-border/50 bg-muted/30 text-sm text-muted-foreground"
      >
        {{ summary }}
      </div>

      <!-- メタ情報 & 表示モード切り替え -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div class="flex items-center gap-1.5">
            <Calendar class="w-4 h-4" />
            <span>更新: {{ formatDate(context.updatedAt) }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <Calendar class="w-4 h-4" />
            <span>作成: {{ formatDate(context.createdAt) }}</span>
          </div>
        </div>

        <!-- 表示モード切り替え & アクションボタン -->
        <div class="flex items-center gap-2">
          <!-- 表示モード切り替え -->
          <div class="flex rounded-md border p-0.5">
            <button
              @click="setViewMode('preview')"
              :class="[
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-sm transition-colors',
                viewMode === 'preview' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              ]"
              title="プレビュー表示"
            >
              <Eye class="w-4 h-4" />
              Preview
            </button>
            <button
              @click="setViewMode('source')"
              :class="[
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-sm transition-colors',
                viewMode === 'source' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
              ]"
              title="Markdown ソース表示"
            >
              <Code class="w-4 h-4" />
              Source
            </button>
          </div>

          <!-- 編集ボタン（readOnly でない場合のみ表示） -->
          <button
            v-if="isEditable"
            @click="handleEdit"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border hover:bg-accent transition-colors"
            title="編集"
          >
            <Pencil class="w-4 h-4" />
            編集
          </button>

          <!-- 削除ボタン（readOnly でない場合のみ表示） -->
          <button
            v-if="isEditable"
            @click="handleDelete"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border border-destructive/50 text-destructive hover:bg-destructive/10 transition-colors"
            title="削除"
          >
            <Trash2 class="w-4 h-4" />
            削除
          </button>
        </div>
      </div>
    </header>

    <!-- Frontmatter 属性 + TODO + Links（バッジ形式で横並び） -->
    <div v-if="attrs.length > 0 || hasTodos || hasLinks" class="flex flex-wrap gap-2 mb-6">
      <!-- TODO Popover -->
      <TodoPopover v-if="hasTodos" :todos="todos" />

      <!-- Links Popover -->
      <LinksPopover
        v-if="hasLinks"
        :links-to="linksTo"
        :links-from="linksFrom"
        @navigate="handleLinkNavigate"
      />

      <!-- 属性バッジ -->
      <template v-for="[key, value] in attrs" :key="key">
        <!-- 配列の場合は各要素を個別バッジとして表示 -->
        <template v-if="Array.isArray(value)">
          <span
            v-for="(item, i) in value"
            :key="`${key}-${i}`"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-muted border border-border/50"
          >
            <span class="text-muted-foreground">{{ key }}:</span>
            <span class="font-medium">{{ item }}</span>
          </span>
        </template>
        <!-- 単一値の場合 -->
        <span
          v-else
          class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-muted border border-border/50"
        >
          <span class="text-muted-foreground">{{ key }}:</span>
          <span class="font-medium">{{ value }}</span>
        </span>
      </template>
    </div>

    <!-- 本文（目次が右 Sticky のときは flex で2カラム） -->
    <section
      :class="[
        showToc && tocStickyRight && 'flex gap-6 items-start'
      ]"
    >
      <!-- 左カラム（本文）または単一カラム -->
      <div :class="[showToc && tocStickyRight && 'min-w-0 flex-1']">
        <!-- 目次が本文上にある場合のみここに表示 -->
        <TableOfContents v-if="showToc && !tocStickyRight" :headings="tocHeadings" />

        <!-- プレビューモード -->
        <MarkdownViewer
          v-if="viewMode === 'preview'"
          :content="context.content"
          :base-path="context.path"
        />

        <!-- ソースモード -->
        <div
          v-else
          class="bg-muted/50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap overflow-x-auto"
        >
          <pre class="text-foreground">{{ context.content }}</pre>
        </div>
      </div>

      <!-- 右カラム：目次 Sticky 固定（設定でオンのときのみ・コンパクト・背景なし） -->
      <aside
        v-if="showToc && tocStickyRight"
        class="w-64 shrink-0 sticky top-6 self-start max-h-[calc(100vh-6rem)] overflow-y-auto"
      >
        <TableOfContents :headings="tocHeadings" :sticky-right="true" />
      </aside>
    </section>
  </div>
</template>
