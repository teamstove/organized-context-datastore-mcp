<script setup lang="ts">
/**
 * MarkdownViewer - Markdown レンダリングコンポーネント
 *
 * 役割:
 * - Markdown テキストの HTML レンダリング
 * - シンタックスハイライト（テーマは UIService で管理）
 * - XSS 対策 (DOMPurify)
 * - 相対パスリンクの解決
 * - 内部リンクのクリックハンドリング
 */
import { computed, ref, inject, onMounted, onUnmounted, watch, watchEffect } from 'vue'
import MarkdownIt from 'markdown-it'
import markdownItAnchor from 'markdown-it-anchor'
import DOMPurify from 'dompurify'
// highlight.js はコアのみインポートし、必要な言語だけ登録（メモリ最適化）
import hljs from 'highlight.js/lib/core'
// よく使う言語のみ登録
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import sql from 'highlight.js/lib/languages/sql'
import python from 'highlight.js/lib/languages/python'

// 言語を登録
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)

import { contextServiceKey, type ContextService } from '@/services/ContextService'
import { uiServiceKey, type UIService } from '@/services/UIService'
import type { CodeTheme } from '@/types'

// =============================================================================
// テーマ管理
// =============================================================================

/**
 * highlight.js テーマを動的にロード
 * link 要素を追加/更新してテーマCSSを適用
 */
const HLJS_THEME_LINK_ID = 'hljs-theme-stylesheet'

/**
 * テーマ名から highlight.js の CSS ファイルパスを取得
 */
function getThemeStylePath(theme: CodeTheme): string {
  // highlight.js のスタイルファイル名にマッピング
  const themeMap: Record<CodeTheme, string> = {
    'monokai': 'monokai',
    'github-dark': 'github-dark',
    'atom-one-dark': 'atom-one-dark',
    'dracula': 'dracula',
    'nord': 'nord',
    'tokyo-night-dark': 'tokyo-night-dark',
    'vs2015': 'vs2015',
    'night-owl': 'night-owl',
  }
  return themeMap[theme]
}

/**
 * highlight.js テーマを動的に適用
 */
function applyHljsTheme(theme: CodeTheme): void {
  const styleName = getThemeStylePath(theme)
  const href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${styleName}.min.css`

  // 既存の link 要素を取得または作成
  let linkEl = document.getElementById(HLJS_THEME_LINK_ID) as HTMLLinkElement | null

  if (!linkEl) {
    // 新規作成
    linkEl = document.createElement('link')
    linkEl.id = HLJS_THEME_LINK_ID
    linkEl.rel = 'stylesheet'
    document.head.appendChild(linkEl)
  }

  // href を更新（変更があれば新しいCSSがロードされる）
  if (linkEl.href !== href) {
    linkEl.href = href
  }
}

// =============================================================================
// Props
// =============================================================================

const props = defineProps<{
  content: string
  /** 現在のドキュメントのパス（相対リンク解決用） */
  basePath?: string
}>()

// =============================================================================
// Service の inject
// =============================================================================

const contextService = inject(contextServiceKey) as ContextService
const uiService = inject(uiServiceKey) as UIService

// =============================================================================
// Template Refs
// =============================================================================

const contentRef = ref<HTMLElement | null>(null)

// =============================================================================
// Markdown パーサー
// =============================================================================

// TOC アンカー用: 見出しに toc-0, toc-1, ... を付与（TableOfContents のリンク先と一致させる）
const tocAnchorIndex = ref(0)

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch {
        // エラー時はそのまま返す
      }
    }
    return '' // デフォルトのエスケープを使用
  },
})

// 見出しに id を付与（markdown-it-anchor）。slug は toc-0, toc-1, ... で TOC と一致
md.use(markdownItAnchor, {
  level: [1, 2, 3, 4, 5, 6],
  slugify: () => `toc-${tocAnchorIndex.value++}`,
  permalink: false, // 見出し横のリンクアイコンは出さない
})

// =============================================================================
// 相対パス解決
// =============================================================================

/**
 * 相対パスを絶対パスに解決
 */
function resolveRelativePath(href: string, basePath: string): string {
  // 外部リンクはそのまま返す
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    return href
  }

  // アンカーリンクはそのまま返す
  if (href.startsWith('#')) {
    return href
  }

  // basePath からディレクトリパスを取得
  const baseDir = basePath.split('/').slice(0, -1).join('/')

  // 相対パスを解決
  const parts = [...baseDir.split('/'), ...href.split('/')]
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

// =============================================================================
// Computed
// =============================================================================

const renderedHtml = computed(() => {
  if (!props.content) return ''

  // 見出し id 用カウンタをリセット（TOC と順序を一致させる）
  tocAnchorIndex.value = 0

  // Markdown をレンダリング
  let html = md.render(props.content)

  // 相対パスリンクを解決済みパスに変換
  if (props.basePath) {
    html = html.replace(
      /<a\s+href="([^"]+)"/g,
      (match, href) => {
        // 外部リンクはそのまま
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
          return `<a href="${href}" target="_blank" rel="noopener noreferrer"`
        }

        // アンカーリンクはそのまま
        if (href.startsWith('#')) {
          return match
        }

        // 相対パスを解決
        const resolved = resolveRelativePath(href, props.basePath!)

        // .md 拡張子を除去
        const cleanPath = resolved.replace(/\.md$/, '')

        // 内部リンクはデータ属性を追加
        return `<a href="#" data-internal-link="${cleanPath}"`
      }
    )
  }

  // XSS 対策
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['target', 'rel', 'data-internal-link'],
  })
})

// =============================================================================
// イベントハンドリング
// =============================================================================

function handleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement

  // リンク要素を探す
  const link = target.closest('a[data-internal-link]') as HTMLAnchorElement | null

  if (link) {
    event.preventDefault()
    const path = link.dataset.internalLink

    if (path) {
      // 親ディレクトリを展開
      contextService.expandToPath(path)
      // ドキュメントを選択
      contextService.selectContext(path)
    }
  }
}

// =============================================================================
// ライフサイクル
// =============================================================================

onMounted(() => {
  contentRef.value?.addEventListener('click', handleClick)

  // 初期テーマを適用
  applyHljsTheme(uiService.state.codeTheme)
})

onUnmounted(() => {
  contentRef.value?.removeEventListener('click', handleClick)
})

// コンテンツ変更時にイベントリスナーを再設定
watch(() => props.content, () => {
  // DOM 更新後にイベントリスナーが効くようにする（既存のリスナーは維持）
})

// コードテーマ変更を監視して動的に適用
watchEffect(() => {
  applyHljsTheme(uiService.state.codeTheme)
})
</script>

<template>
  <div
    ref="contentRef"
    class="markdown-content prose dark:prose-invert max-w-none"
    v-html="renderedHtml"
  />
</template>

<style>
/* Markdown コンテンツ用の追加スタイル */
.markdown-content {
  @apply leading-relaxed;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3,
.markdown-content h4,
.markdown-content h5,
.markdown-content h6 {
  @apply font-semibold mt-6 mb-3;
}

.markdown-content h1 {
  @apply text-2xl border-b pb-2;
}

.markdown-content h2 {
  @apply text-xl border-b pb-2;
}

.markdown-content h3 {
  @apply text-lg;
}

.markdown-content p {
  @apply my-4;
}

.markdown-content ul,
.markdown-content ol {
  @apply my-4 pl-6;
}

.markdown-content li {
  @apply my-1;
}

/* コードブロック（pre）は Light/Dark 両方で暗い背景をキープ */
.markdown-content pre {
  @apply p-4 rounded-lg overflow-x-auto my-4;
  background-color: hsl(var(--code-bg));
  color: hsl(var(--code-text));
}

/* インラインコードは Light mode でも暗めの背景 */
.markdown-content code {
  @apply px-1.5 py-0.5 rounded text-sm font-mono;
  background-color: hsl(var(--code-inline-bg));
  color: hsl(var(--code-text));
}

/* pre 内の code は背景色を継承 */
.markdown-content pre code {
  @apply bg-transparent p-0;
  color: inherit;
}

.markdown-content blockquote {
  @apply border-l-4 border-primary/50 pl-4 my-4 italic text-muted-foreground;
}

.markdown-content table {
  @apply w-full border-collapse my-4;
}

.markdown-content th,
.markdown-content td {
  @apply border px-3 py-2 text-left;
}

.markdown-content th {
  @apply bg-muted font-semibold;
}

.markdown-content a {
  @apply text-primary hover:underline cursor-pointer;
}

.markdown-content a[data-internal-link] {
  @apply text-primary hover:underline;
}

.markdown-content a[target="_blank"]::after {
  content: " ↗";
  @apply text-xs;
}

.markdown-content img {
  @apply max-w-full h-auto rounded-lg my-4;
}

.markdown-content hr {
  @apply border-border my-8;
}
</style>
