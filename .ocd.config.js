/**
 * @typedef {Object} ContextRootConfig
 * @property {string} path - パス（相対または絶対）
 * @property {string} id - 一意の識別子（省略時はパスから自動生成。重複時は明示指定推奨）
 * @property {string} name - 表示名
 * @property {boolean} [readOnly] - 読み取り専用
 * @property {'auto-commit' | 'manual' | 'none'} [git] - Git 設定（デフォルト: 'manual'）
 * @property {string[]} [ignorePatterns] - 除外パターン
 * @property {string[]} [includePatterns] - 対象パターン
 * @property {string} [defaultExtension] - 新規作成時の拡張子
 */

/**
 * @typedef {Object} OcdConfig
 * @property {ContextRootConfig[]} [contextRoots] - Context Root の配列
 * @property {boolean} [inheritGlobal] - グローバル設定を継承（デフォルト: true）
 */

/**
 * Organized Context Datastore MCP 設定ファイル
 * @type {OcdConfig}
 */
module.exports = {
  contextRoots: [
    {
      id: "docs",
      path: "./docs",
      name: "Project Docs"
    }
  ],
}
