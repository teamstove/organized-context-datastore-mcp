/**
 * Knowledge Store Interface
 * 
 * ストレージの抽象化レイヤー
 * File+Git と Database (将来) の両方に対応するためのインターフェース
 */

import type { FileMetadata, VersionEntry } from '../types/index.js'

/**
 * Knowledge Store の抽象インターフェース
 */
export interface IKnowledgeStore {
  // ==========================================================================
  // Read Operations
  // ==========================================================================
  
  /**
   * パスが存在するか確認
   */
  exists(path: string): Promise<boolean>
  
  /**
   * ファイル/ノードの内容を読み取り
   */
  read(path: string): Promise<string>
  
  /**
   * glob パターンでファイル/ノード一覧を取得
   */
  list(pattern: string): Promise<string[]>
  
  /**
   * 複数の glob パターンでファイル/ノード一覧を取得
   */
  listMultiple(patterns: string[]): Promise<string[]>
  
  /**
   * ファイル/ノードのメタデータを取得
   */
  getMetadata(path: string): Promise<FileMetadata>
  
  // ==========================================================================
  // Write Operations
  // ==========================================================================
  
  /**
   * ファイル/ノードに書き込み (作成または上書き)
   */
  write(path: string, content: string): Promise<void>
  
  /**
   * ファイル/ノードを削除
   */
  delete(path: string): Promise<void>
  
  /**
   * ファイル/ノードを移動/リネーム
   */
  move(fromPath: string, toPath: string): Promise<void>
  
  /**
   * ディレクトリ/コンテナを作成
   */
  mkdir(path: string): Promise<void>
  
  // ==========================================================================
  // Version Control Operations
  // ==========================================================================
  
  /**
   * 変更をコミット
   * @param message コミットメッセージ
   * @param paths 対象パス (省略時は全変更)
   * @returns バージョンID (Git commit hash など)
   */
  commit(message: string, paths?: string[]): Promise<string>
  
  /**
   * 変更履歴を取得
   * @param path 対象パス
   * @param limit 取得件数
   */
  getHistory(path: string, limit?: number): Promise<VersionEntry[]>
  
  /**
   * 特定バージョンに戻す
   * @param path 対象パス
   * @param version バージョンID
   */
  revert(path: string, version: string): Promise<void>
  
  /**
   * 特定バージョンの内容を取得
   * @param path 対象パス
   * @param version バージョンID
   */
  readVersion(path: string, version: string): Promise<string>
  
  // ==========================================================================
  // Utility Operations
  // ==========================================================================
  
  /**
   * ストレージを初期化/接続確認
   */
  initialize(): Promise<void>
  
  /**
   * ストレージを閉じる/クリーンアップ
   */
  close(): Promise<void>
}

/**
 * ストレージエラー
 */
export class KnowledgeStoreError extends Error {
  constructor(
    message: string,
    public readonly code: KnowledgeStoreErrorCode,
    public readonly path?: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'KnowledgeStoreError'
  }
}

export type KnowledgeStoreErrorCode = 
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'PERMISSION_DENIED'
  | 'INVALID_PATH'
  | 'VERSION_NOT_FOUND'
  | 'COMMIT_FAILED'
  | 'STORAGE_ERROR'
