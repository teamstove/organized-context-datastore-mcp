/**
 * Table of Contents（目次）用ヘルパー
 *
 * Markdown 本文から見出しを抽出し、TOC 表示と MarkdownViewer の見出し id と対応させる。
 * slug は index ベース（toc-0, toc-1, ...）で、markdown-it-anchor 側と同じ順序で付与する。
 */

// =============================================================================
// 型
// =============================================================================

export interface TocHeading {
  /** 見出しレベル (1-6) */
  level: number
  /** 見出しテキスト */
  title: string
  /** アンカー用 id（MarkdownViewer の見出し id と一致させる） */
  slug: string
}

// =============================================================================
// 正規表現: Markdown の見出し行 (# 〜 ## など)
// =============================================================================

const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm

// =============================================================================
// 見出し抽出
// =============================================================================

/**
 * Markdown 本文から見出し行を抽出する
 *
 * - 行頭の # の数が level、その後の空白を除いた文字列が title
 * - コードブロック内もマッチするが、多くのドキュメントでは問題になりにくい
 *
 * @param content - 生の Markdown 文字列
 * @returns 見出しの配列（出現順）。slug は toc-0, toc-1, ... で MarkdownViewer の id と一致
 */
export function parseHeadingsFromMarkdown(content: string): TocHeading[] {
  if (!content || typeof content !== 'string') {
    return []
  }

  const headings: TocHeading[] = []
  let match: RegExpExecArray | null

  // 正規表現をリセット（lastIndex を 0 に）
  HEADING_REGEX.lastIndex = 0

  while ((match = HEADING_REGEX.exec(content)) !== null) {
    const level = match[1].length
    const title = match[2].trim()
    if (title) {
      headings.push({
        level,
        title,
        slug: `toc-${headings.length}`,
      })
    }
  }

  return headings
}
