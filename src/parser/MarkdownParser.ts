/**
 * Markdown Parser
 * 
 * Frontmatter + [[属性]] + TODO をパースする
 */

import matter from 'gray-matter'
import type { 
  ContextNode, 
  Annotation, 
  Todo, 
  Section 
} from '../types/index.js'

/**
 * Markdown パース結果
 */
export interface ParsedMarkdown {
  /** Frontmatter データ */
  frontmatter: MarkdownFrontmatter
  
  /** 本文コンテンツ (Frontmatter除く) */
  content: string
  
  /** [[属性]] アノテーション */
  annotations: Annotation[]
  
  /** TODO 項目 */
  todos: Todo[]
  
  /** セクション構造 */
  sections: Section[]
  
  /** 抽出されたリンク */
  links: string[]
}

/**
 * Frontmatter 構造
 * 
 * title 以外のフィールドは全て attrs として扱う
 */
export interface MarkdownFrontmatter {
  title?: string
  related?: string[]
  [key: string]: unknown
}

/**
 * [[属性]] パターン
 * 例: [[要確認:お客様]], [[完了]], [[priority:high]]
 */
const ANNOTATION_PATTERN = /\[\[([^\]]+)\]\]/g

/**
 * TODO パターン
 * 例: - [ ] xxx, - [x] xxx
 */
const TODO_PATTERN = /^(\s*)-\s*\[([ xX])\]\s*(.+)$/gm

/**
 * 見出しパターン
 * 例: # Title, ## Section
 */
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/gm

/**
 * 内部リンクパターン
 * 例: [text](path/to/doc), [[path/to/doc]]
 */
const LINK_PATTERN = /(?:\[([^\]]*)\]\(([^)]+)\)|\[\[([^\]]+)\]\])/g

/**
 * Markdown をパースする
 */
export function parseMarkdown(rawContent: string, filePath: string): ParsedMarkdown {
  // Frontmatter をパース
  const { data: frontmatter, content } = matter(rawContent)
  
  // 行ごとに分割
  const lines = content.split('\n')
  
  // セクションをパース
  const sections = parseSections(lines)
  
  // アノテーションをパース
  const annotations = parseAnnotations(lines, sections)
  
  // TODOをパース
  const todos = parseTodos(lines, sections)
  
  // リンクを抽出
  const links = extractLinks(content, frontmatter as MarkdownFrontmatter)
  
  return {
    frontmatter: frontmatter as MarkdownFrontmatter,
    content,
    annotations,
    todos,
    sections,
    links
  }
}

/**
 * セクション構造をパース
 */
function parseSections(lines: string[]): Section[] {
  const sections: Section[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    
    if (match) {
      const level = match[1].length
      const titleWithAttrs = match[2]
      
      // タイトルから [[属性]] を抽出
      const attributes: string[] = []
      const title = titleWithAttrs.replace(ANNOTATION_PATTERN, (_, attr) => {
        attributes.push(attr)
        return ''
      }).trim()
      
      sections.push({
        level,
        title,
        attributes,
        startLine: i + 1,
        endLine: -1  // 後で設定
      })
    }
  }
  
  // 各セクションの終了行を設定
  for (let i = 0; i < sections.length; i++) {
    const current = sections[i]
    const next = sections[i + 1]
    
    if (next) {
      current.endLine = next.startLine - 1
    } else {
      current.endLine = lines.length
    }
  }
  
  return sections
}

/**
 * [[属性]] アノテーションをパース
 */
function parseAnnotations(lines: string[], sections: Section[]): Annotation[] {
  const annotations: Annotation[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1
    
    // セクション見出しの属性は sections で処理済み
    if (line.match(/^#{1,6}\s+/)) {
      const section = sections.find(s => s.startLine === lineNumber)
      if (section && section.attributes.length > 0) {
        annotations.push({
          location: `${'#'.repeat(section.level)} ${section.title}`,
          type: 'section',
          attributes: section.attributes,
          text: section.title,
          line: lineNumber
        })
      }
      continue
    }
    
    // TODO行の属性は todos で処理
    if (line.match(/^\s*-\s*\[[ xX]\]/)) {
      continue
    }
    
    // インライン属性
    const matches = [...line.matchAll(ANNOTATION_PATTERN)]
    if (matches.length > 0) {
      const location = findSectionForLine(lineNumber, sections)
      const attributes = matches.map(m => m[1])
      
      annotations.push({
        location,
        type: 'inline',
        attributes,
        text: line.trim(),
        line: lineNumber
      })
    }
  }
  
  return annotations
}

/**
 * TODO 項目をパース
 */
function parseTodos(lines: string[], sections: Section[]): Todo[] {
  const todos: Todo[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNumber = i + 1
    
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/)
    if (match) {
      const completed = match[1].toLowerCase() === 'x'
      let text = match[2]
      
      // TODO テキストから [[属性]] を抽出
      const attributes: string[] = []
      text = text.replace(ANNOTATION_PATTERN, (_, attr) => {
        attributes.push(attr)
        return ''
      }).trim()
      
      const location = findSectionForLine(lineNumber, sections)
      
      todos.push({
        text,
        completed,
        attributes,
        location,
        line: lineNumber
      })
    }
  }
  
  return todos
}

/**
 * 行番号からセクションを特定
 */
function findSectionForLine(lineNumber: number, sections: Section[]): string {
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i]
    if (section.startLine <= lineNumber) {
      return `${'#'.repeat(section.level)} ${section.title}`
    }
  }
  return '(root)'
}

/**
 * リンクを抽出
 */
function extractLinks(content: string, frontmatter: MarkdownFrontmatter): string[] {
  const links: string[] = []
  
  // Frontmatter の related からリンクを抽出
  if (frontmatter.related && Array.isArray(frontmatter.related)) {
    links.push(...frontmatter.related)
  }
  
  // コンテンツからリンクを抽出
  const matches = [...content.matchAll(LINK_PATTERN)]
  for (const match of matches) {
    // [text](path) 形式
    if (match[2]) {
      const href = match[2]
      // 外部リンク (http://, https://) は除外
      if (!href.startsWith('http://') && !href.startsWith('https://')) {
        links.push(href)
      }
    }
    // [[path]] 形式
    if (match[3]) {
      links.push(match[3])
    }
  }
  
  // 重複除去
  return [...new Set(links)]
}

/**
 * ContextNode を生成
 */
export function toContextNode(
  path: string,
  parsed: ParsedMarkdown,
  metadata: { createdAt: string; updatedAt: string }
): ContextNode {
  const { frontmatter, content, annotations, todos, sections, links } = parsed
  
  // タイトルを決定 (Frontmatter > 最初のH1 > ファイル名)
  let title = frontmatter.title
  if (!title) {
    const h1 = sections.find(s => s.level === 1)
    title = h1?.title
  }
  if (!title) {
    // パスからファイル名を抽出
    const parts = path.split('/')
    const filename = parts[parts.length - 1]
    title = filename.replace(/\.md$/, '')
  }
  
  // attrs を構築 (title と related 以外の全フィールド)
  const { title: _title, related: _related, ...attrs } = frontmatter
  
  // sections は内部処理でのみ使用、レスポンスには含めない (Token数節約)
  return {
    path,
    title: title ?? path,
    attrs,
    createdAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
    links: {
      to: links,
      from: []  // backlinks は後で計算
    },
    content,
    annotations,
    todos
  }
}
