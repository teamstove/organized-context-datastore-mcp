/**
 * JQ Filter Engine
 * 
 * jq 式を使ったフィルタリング
 * LLMが既に知っている jq 文法を活用
 */

import { run as jqRun } from 'node-jq'
import type { ContextNode } from '../types/index.js'

/**
 * jq フィルタエンジン
 */
export class JqFilterEngine {
  /**
   * jq 式でコンテキストノード配列をフィルタ
   * 
   * @param contexts フィルタ対象のコンテキストノード配列
   * @param filter jq フィルタ式 (例: '.categories | contains(["feature-spec"])')
   * @returns フィルタ後のコンテキストノード配列
   * 
   * @example
   * // カテゴリが feature-spec のもの
   * filter(contexts, '.categories | contains(["feature-spec"])')
   * 
   * @example
   * // タグに "Phase1" を含むもの
   * filter(contexts, '.tags | any(. == "Phase1")')
   * 
   * @example
   * // 未完了TODOがあるもの
   * filter(contexts, '.todos | any(.completed == false)')
   * 
   * @example
   * // 複合条件
   * filter(contexts, '(.categories | contains(["feature-spec"])) and (.tags | any(. == "priority-high"))')
   */
  async filter(contexts: ContextNode[], filterExpr: string): Promise<ContextNode[]> {
    if (!filterExpr || filterExpr.trim() === '') {
      return contexts
    }
    
    try {
      // jq 式を構築: 配列の各要素に対して select を適用
      const jqExpr = `[.[] | select(${filterExpr})]`
      
      const result = await jqRun(jqExpr, JSON.stringify(contexts), {
        input: 'string',
        output: 'json'
      })
      
      return result as ContextNode[]
    } catch (error) {
      throw new JqFilterError(
        `Invalid jq filter expression: ${filterExpr}`,
        filterExpr,
        error as Error
      )
    }
  }
  
  /**
   * jq 式でコンテキストノード配列を変換
   * フィルタだけでなく、射影（特定フィールドの抽出）も可能
   * 
   * @param contexts 変換対象
   * @param expr jq 式
   * @returns 変換結果
   * 
   * @example
   * // パスとタイトルだけ抽出
   * transform(contexts, '[.[] | {path, title}]')
   * 
   * @example
   * // TODOだけフラットに抽出
   * transform(contexts, '[.[] | .todos[]]')
   */
  async transform<T>(contexts: ContextNode[], expr: string): Promise<T> {
    try {
      const result = await jqRun(expr, JSON.stringify(contexts), {
        input: 'string',
        output: 'json'
      })
      
      return result as T
    } catch (error) {
      throw new JqFilterError(
        `Invalid jq expression: ${expr}`,
        expr,
        error as Error
      )
    }
  }
  
  /**
   * jq 式の妥当性を検証
   */
  async validate(expr: string): Promise<{ valid: boolean; error?: string }> {
    try {
      // 空の配列に対して実行してエラーがないか確認
      await jqRun(`[.[] | select(${expr})]`, '[]', {
        input: 'string',
        output: 'json'
      })
      return { valid: true }
    } catch (error) {
      return { 
        valid: false, 
        error: (error as Error).message 
      }
    }
  }
}

/**
 * jq フィルタエラー
 */
export class JqFilterError extends Error {
  constructor(
    message: string,
    public readonly expression: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'JqFilterError'
  }
}

/**
 * よく使うフィルタ式のプリセット
 */
export const FilterPresets = {
  /** カテゴリでフィルタ */
  byCategory: (category: string) => 
    `.categories | any(. == "${category}")`,
  
  /** タグでフィルタ (AND) */
  byTags: (tags: string[]) => 
    tags.map(t => `.tags | any(. == "${t}")`).join(' and '),
  
  /** タグでフィルタ (OR) */
  byTagsAny: (tags: string[]) => 
    `(${tags.map(t => `.tags | any(. == "${t}")`).join(' or ')})`,
  
  /** 未完了TODOがあるもの */
  hasIncompleteTodos: () => 
    '.todos | any(.completed == false)',
  
  /** 特定属性を持つアノテーションがあるもの */
  hasAnnotation: (attr: string) => 
    `.annotations | any(.attributes | any(contains("${attr}")))`,
  
  /** 更新日時でフィルタ */
  updatedAfter: (dateStr: string) => 
    `.updatedAt > "${dateStr}"`,
  
  /** コンテンツに文字列を含む */
  contentContains: (text: string) => 
    `.content | contains("${text}")`,
  
  /** タイトルに文字列を含む */
  titleContains: (text: string) => 
    `.title | contains("${text}")`
}
