/**
 * API Helpers - API 呼び出し用ユーティリティ
 *
 * 責務:
 * - パラメータのクリーンアップ
 * - 共通的な変換処理
 */

// =============================================================================
// パラメータ処理
// =============================================================================

/**
 * オブジェクトから undefined/null 値を持つプロパティを除去
 *
 * API リクエストのパラメータから不要なプロパティを削除するために使用
 *
 * @example
 * ```ts
 * const params = cleanParams({
 *   cwd: '/path',
 *   depth: undefined,
 *   format: 'json'
 * })
 * // => { cwd: '/path', format: 'json' }
 * ```
 */
export function cleanParams<T extends Record<string, unknown>>(
  params: T
): Partial<T> {
  const result: Partial<T> = {}

  for (const key of Object.keys(params) as Array<keyof T>) {
    const value = params[key]
    if (value !== undefined && value !== null) {
      result[key] = value
    }
  }

  return result
}

/**
 * 配列をカンマ区切り文字列に変換（undefined の場合は undefined を返す）
 *
 * @example
 * ```ts
 * joinArray(['a', 'b', 'c']) // => 'a,b,c'
 * joinArray(undefined)       // => undefined
 * ```
 */
export function joinArray(arr: string[] | undefined): string | undefined {
  return arr?.join(',')
}

/**
 * API パラメータを構築するビルダー
 *
 * メソッドチェーンでパラメータを構築し、最終的に cleanParams を適用
 *
 * @example
 * ```ts
 * const params = new ParamsBuilder()
 *   .set('cwd', '/path')
 *   .setIfPresent('depth', options.depth)
 *   .setArray('patterns', options.patterns)
 *   .build()
 * ```
 */
export class ParamsBuilder {
  private params: Record<string, unknown> = {}

  /**
   * パラメータを設定
   */
  set(key: string, value: unknown): this {
    this.params[key] = value
    return this
  }

  /**
   * 値が存在する場合のみパラメータを設定
   */
  setIfPresent(key: string, value: unknown): this {
    if (value !== undefined && value !== null) {
      this.params[key] = value
    }
    return this
  }

  /**
   * 配列をカンマ区切りで設定
   */
  setArray(key: string, arr: string[] | undefined): this {
    if (arr && arr.length > 0) {
      this.params[key] = arr.join(',')
    }
    return this
  }

  /**
   * クリーンアップ済みのパラメータオブジェクトを取得
   */
  build(): Record<string, unknown> {
    return cleanParams(this.params) as Record<string, unknown>
  }
}
