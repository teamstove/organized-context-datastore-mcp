/**
 * Frontmatter ユーティリティ
 * 
 * gray-matter を使った安全な frontmatter 操作。
 * YAML 特殊文字（: " ' # [] {} | > 等）や予約語（null, true, false）を
 * 正しく処理する。
 * 
 * ConfigLoader 等、gray-matter への直接依存を避けたいモジュールから
 * 共通関数として利用する。
 */

import matter from 'gray-matter'

/**
 * Markdown コンテンツから frontmatter の title と summary を安全に抽出
 * 
 * YAML 予約語（null, true, false 等）が値として使われた場合でも
 * 常に string として返す。
 * 
 * @param content Markdown テキスト（frontmatter 付き）
 * @returns title と summary（存在しない場合は undefined）
 */
export function extractFrontmatterValues(content: string): {
  title: string | undefined
  summary: string | undefined
} {
  try {
    const { data } = matter(content)
    
    return {
      title: coerceToString(data.title),
      summary: coerceToString(data.summary)
    }
  } catch {
    // YAML パースエラー時は正規表現フォールバック
    return extractFrontmatterByRegex(content)
  }
}

/**
 * 任意の値を string に安全変換
 * 
 * YAML パーサーが null / true / false / 数値 に変換してしまう場合に
 * string として復元する。undefined や null の場合は undefined を返す。
 */
function coerceToString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'string') return value
  // boolean, number 等 → YAML が型変換したケースなので文字列に戻す
  return String(value)
}

/**
 * 正規表現による frontmatter 抽出（フォールバック用）
 * 
 * gray-matter でのパースに失敗した場合のみ使用。
 * クォートの除去も行う。
 */
function extractFrontmatterByRegex(content: string): {
  title: string | undefined
  summary: string | undefined
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return { title: undefined, summary: undefined }
  
  const fm = fmMatch[1]
  
  return {
    title: extractAndUnquote(fm, 'title'),
    summary: extractAndUnquote(fm, 'summary')
  }
}

/**
 * frontmatter テキストから指定キーの値を抽出し、クォートを除去
 */
function extractAndUnquote(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  if (!match) return undefined
  
  // シングルクォート/ダブルクォートを除去
  return match[1].replace(/^['"]|['"]$/g, '').trim()
}
