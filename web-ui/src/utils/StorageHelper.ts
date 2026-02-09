/**
 * StorageHelper - LocalStorage 操作ユーティリティ
 *
 * 責務:
 * - 型安全な LocalStorage の読み書き
 * - エラーハンドリングの共通化
 * - デフォルト値のサポート
 *
 * 各サービスで重複していた load/save パターンを共通化
 */

// =============================================================================
// 型定義
// =============================================================================

/**
 * ストレージ操作の結果
 */
export interface StorageResult<T> {
  success: boolean
  data?: T
  error?: Error
}

// =============================================================================
// StorageHelper クラス
// =============================================================================

/**
 * 型安全な LocalStorage ラッパー
 *
 * @example
 * ```ts
 * const storage = new StorageHelper<UISettings>('ocd-ui-settings')
 * const settings = storage.load({ viewMode: 'tree', sidebarOpen: true })
 * storage.save(updatedSettings)
 * ```
 */
export class StorageHelper<T extends object> {
  private readonly key: string
  private readonly logPrefix: string

  constructor(key: string, logPrefix?: string) {
    this.key = key
    this.logPrefix = logPrefix || `[StorageHelper:${key}]`
  }

  /**
   * LocalStorage からデータを読み込み
   *
   * @param defaultValue - データが存在しない場合のデフォルト値
   * @returns 読み込んだデータ、またはデフォルト値
   */
  load(defaultValue: T): T {
    try {
      const stored = localStorage.getItem(this.key)
      if (!stored) {
        return defaultValue
      }

      const parsed = JSON.parse(stored) as Partial<T>
      // デフォルト値とマージ（部分的なデータでも対応）
      return { ...defaultValue, ...parsed }
    } catch (error) {
      console.error(`${this.logPrefix} Failed to load:`, error)
      return defaultValue
    }
  }

  /**
   * LocalStorage からデータを読み込み（部分的なデータを返す）
   *
   * @returns 読み込んだ部分データ、またはnull
   */
  loadPartial(): Partial<T> | null {
    try {
      const stored = localStorage.getItem(this.key)
      if (!stored) {
        return null
      }
      return JSON.parse(stored) as Partial<T>
    } catch (error) {
      console.error(`${this.logPrefix} Failed to load:`, error)
      return null
    }
  }

  /**
   * LocalStorage にデータを保存
   *
   * @param data - 保存するデータ
   * @returns 保存結果
   */
  save(data: T): StorageResult<T> {
    try {
      localStorage.setItem(this.key, JSON.stringify(data))
      return { success: true, data }
    } catch (error) {
      console.error(`${this.logPrefix} Failed to save:`, error)
      return { success: false, error: error as Error }
    }
  }

  /**
   * LocalStorage から特定のキーを削除
   */
  remove(): void {
    try {
      localStorage.removeItem(this.key)
    } catch (error) {
      console.error(`${this.logPrefix} Failed to remove:`, error)
    }
  }

  /**
   * データが存在するか確認
   */
  exists(): boolean {
    try {
      return localStorage.getItem(this.key) !== null
    } catch {
      return false
    }
  }
}

// =============================================================================
// ファクトリ関数
// =============================================================================

/**
 * StorageHelper インスタンスを作成
 *
 * @example
 * ```ts
 * const projectsStorage = createStorage<OcdProject[]>('ocd-projects', '[ProjectService]')
 * ```
 */
export function createStorage<T extends object>(
  key: string,
  logPrefix?: string
): StorageHelper<T> {
  return new StorageHelper<T>(key, logPrefix)
}

// =============================================================================
// シンプルな値用のヘルパー
// =============================================================================

/**
 * シンプルな文字列値を読み込み
 */
export function loadString(key: string, defaultValue: string = ''): string {
  try {
    return localStorage.getItem(key) ?? defaultValue
  } catch {
    return defaultValue
  }
}

/**
 * シンプルな文字列値を保存
 */
export function saveString(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * シンプルな数値を読み込み
 */
export function loadNumber(key: string, defaultValue: number): number {
  try {
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    const parsed = parseInt(stored, 10)
    return isNaN(parsed) ? defaultValue : parsed
  } catch {
    return defaultValue
  }
}

/**
 * シンプルな数値を保存
 */
export function saveNumber(key: string, value: number): boolean {
  try {
    localStorage.setItem(key, String(value))
    return true
  } catch {
    return false
  }
}
