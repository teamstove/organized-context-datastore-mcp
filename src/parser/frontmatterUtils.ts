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

// =============================================================================
// Content から Frontmatter を安全に分離するユーティリティ
// =============================================================================

/**
 * content に埋め込まれた frontmatter を分離する
 * 
 * LLM が content 引数に frontmatter 付き Markdown を渡すケースで、
 * matter.stringify に渡す前に frontmatter を取り除く。
 * 
 * 抽出した frontmatter のデータもオブジェクトとして返すので、
 * 呼び出し側で明示パラメータとマージできる。
 * 
 * @param content Markdown テキスト（frontmatter が含まれている可能性がある）
 * @returns body（frontmatter を除いた本文）と extractedData（frontmatter のデータ）
 */
export function stripFrontmatterFromContent(content: string): {
  body: string
  extractedData: Record<string, unknown>
} {
  // frontmatter パターン: 先頭 --- で始まり --- で閉じる
  const fmPattern = /^---\n([\s\S]*?)\n---\n?/
  const match = content.match(fmPattern)
  
  if (!match) {
    return { body: content, extractedData: {} }
  }
  
  // frontmatter テキストを安全にパースする
  // YAML パースエラーが起きる可能性があるので、正規表現フォールバックを使う
  const fmText = match[1]
  const body = content.substring(match[0].length)
  
  let extractedData: Record<string, unknown> = {}
  
  try {
    // gray-matter で全体をパースしてデータを取得
    const parsed = matter(content)
    extractedData = parsed.data as Record<string, unknown>
  } catch {
    // YAML パースエラー時は正規表現で主要フィールドだけ抽出
    extractedData = extractAllFieldsByRegex(fmText)
  }
  
  return { body, extractedData }
}

/**
 * frontmatter テキストから全フィールドを正規表現で抽出
 * 
 * YAML パースが失敗した場合のフォールバック。
 * 単純な key: value 形式のみサポート（ネストや配列は非対応）。
 */
function extractAllFieldsByRegex(fmText: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = fmText.split('\n')
  
  for (const line of lines) {
    // "key: value" パターンにマッチ（最初の : のみをセパレータとして扱う）
    const match = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/)
    if (match) {
      const key = match[1]
      let value = match[2].trim()
      // クォートを除去
      value = value.replace(/^['"]|['"]$/g, '').trim()
      result[key] = value
    }
  }
  
  return result
}

// =============================================================================
// 壊れた YAML Frontmatter の自動修復
// =============================================================================

/**
 * YAML として不正な frontmatter を自動修復する
 * 
 * 主な修復対象:
 * - 値にクォートされていないコロン `:` が含まれるケース
 *   例: `title: 実証: 加工手配管理で実行` → `title: '実証: 加工手配管理で実行'`
 * - 値にクォートされていない YAML 特殊文字（# [ ] { } | > * & ! % @）が含まれるケース
 * 
 * @param rawContent frontmatter 付き Markdown テキスト
 * @returns 修復された Markdown テキスト（frontmatter が無い場合はそのまま返す）
 */
export function autoFixFrontmatter(rawContent: string): string {
  const fmPattern = /^(---\n)([\s\S]*?)(\n---(?:\n|$))/
  const match = rawContent.match(fmPattern)
  
  if (!match) {
    return rawContent
  }
  
  const prefix = match[1]    // "---\n"
  const fmBody = match[2]    // frontmatter の中身
  const suffix = match[3]    // "\n---\n" or "\n---"
  const rest = rawContent.substring(match[0].length)
  
  // 各行を修復
  const fixedLines = fmBody.split('\n').map(line => fixYamlValueLine(line))
  const fixedFmBody = fixedLines.join('\n')
  
  return prefix + fixedFmBody + suffix + rest
}

/**
 * YAML の 1行を修復する
 * 
 * `key: value` 形式で value にクォートが必要な特殊文字が含まれている場合、
 * シングルクォートで囲む。
 * 
 * 既にクォート済み、またはブロックスカラー (| >) の行はスキップ。
 * インデントされた行（配列要素やネストされた値）もスキップ。
 */
function fixYamlValueLine(line: string): string {
  // インデントされた行はスキップ（配列要素やネスト構造）
  if (line.match(/^\s+/)) {
    return line
  }
  
  // "key: value" パターンにマッチ
  const match = line.match(/^(\w[\w.-]*)\s*:\s*(.+)$/)
  if (!match) {
    return line
  }
  
  const key = match[1]
  const value = match[2]
  
  // 既にクォート済みならスキップ
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return line
  }
  
  // ブロックスカラー指示子 (| >) はスキップ
  if (value === '|' || value === '>' || value === '|-' || value === '>-') {
    return line
  }
  
  // YAML 特殊文字が値に含まれているかチェック
  // コロン `:` が値内に存在する場合が最も頻出
  const needsQuoting = /[:#{}\[\]|>&*!%@`]/.test(value) ||
    value.startsWith('- ') ||
    value.startsWith('? ') ||
    value === 'null' || value === 'true' || value === 'false' ||
    value === 'Null' || value === 'True' || value === 'False' ||
    value === 'NULL' || value === 'TRUE' || value === 'FALSE' ||
    value === '~'
  
  if (!needsQuoting) {
    return line
  }
  
  // シングルクォートで囲む（値内の ' は '' にエスケープ）
  const escaped = value.replace(/'/g, "''")
  return `${key}: '${escaped}'`
}
