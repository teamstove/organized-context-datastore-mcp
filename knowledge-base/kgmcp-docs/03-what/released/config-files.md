---
title: Config Files
summary: グローバル設定とローカル設定ファイル（JS形式）
categories:
  - what
  - released
tags:
  - configuration
  - settings
  - javascript
---

# Config Files

OCD-MCP の設定ファイル体系。

## 設定ファイルの種類

| ファイル | 場所 | 用途 |
|---------|------|------|
| `~/.ocd/config.js` | ホームディレクトリ | グローバル設定（全 PJ 共有） |
| `.ocd.config.js` | プロジェクトディレクトリ | ローカル設定（PJ 固有） |

## JS 形式の利点

- ✅ コメントが書ける
- ✅ 環境変数の参照が可能
- ✅ 条件分岐が可能

## グローバル設定

`~/.ocd/config.js`:

```javascript
/**
 * グローバル設定（全 PJ で共有）
 */
export default {
  globalContextRoots: [
    {
      id: 'company-docs',
      name: 'Company Documentation',
      path: '/path/to/shared/company-docs',
      description: '会社共通のドキュメント',
      readOnly: true
    },
    {
      id: 'design-system',
      name: 'Design System',
      path: '/path/to/design-system',
      readOnly: true
    }
  ]
}
```

### グローバル Context Root プロパティ

| プロパティ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `id` | string | ✓ | Context Root ID |
| `name` | string | ✓ | 表示名 |
| `path` | string | ✓ | 絶対パス |
| `description` | string | - | 説明 |
| `readOnly` | boolean | - | 読み取り専用（デフォルト: true） |
| `git` | string | - | Git 設定 |
| `ignorePatterns` | string[] | - | 除外パターン |
| `includePatterns` | string[] | - | 対象パターン |

## ローカル設定

`.ocd.config.js`:

```javascript
/**
 * OCD-MCP 設定ファイル
 * 
 * contextRoots: Context Root の配列
 *   - path: string (必須)
 *   - name?: string
 *   - readOnly?: boolean
 *   - git?: 'auto-commit' | 'manual' | 'none'
 *   - ignorePatterns?: string[]
 *   - defaultExtension?: string
 * 
 * inheritGlobal?: boolean (デフォルト: true)
 */
export default {
  contextRoots: [
    {
      // プロジェクトのコンテキスト
      path: './organized-context',
      git: 'auto-commit'
    },
    {
      // CORE Framework ドキュメント（読み取り専用）
      path: './CORE/docs',
      name: 'CORE Docs',
      readOnly: true
    },
    {
      // ソースコード参照
      path: './CORE/src',
      name: 'CORE Source',
      readOnly: true,
      ignorePatterns: ['node_modules/**', 'dist/**']
    }
  ],
  
  // グローバル設定を継承
  inheritGlobal: true
}
```

### ルートプロパティ

| プロパティ | 型 | デフォルト | 説明 |
|-----------|------|----------|------|
| `contextRoots` | array | - | Context Roots 設定 |
| `inheritGlobal` | boolean | true | グローバル設定を継承するか |
| `writePermission` | object | unrestricted | 書き込み権限設定 |
| `treeTextFormat` | string | `"$path: $title"` | Tree 表示のフォーマット |

### treeTextFormat 変数

| 変数 | 説明 |
|------|------|
| `$path` | 相対パス |
| `$title` | タイトル |
| `$summary` | サマリー |
| `$categories` | カテゴリ（カンマ区切り） |
| `$tags` | タグ（カンマ区切り） |

### contextRoots 項目

| プロパティ | 型 | 必須 | デフォルト | 説明 |
|-----------|------|------|----------|------|
| `path` | string | ✓ | - | パス（相対または絶対） |
| `id` | string | - | (パスから生成) | ID |
| `name` | string | - | (パスから生成) | 表示名 |
| `description` | string | - | - | 説明 |
| `readOnly` | boolean | - | false | 読み取り専用 |
| `git` | string | - | `'manual'` | Git 設定 |
| `ignorePatterns` | string[] | - | - | 除外パターン |
| `includePatterns` | string[] | - | `['**/*.md']` | 対象パターン |
| `defaultExtension` | string | - | `'.md'` | 新規作成時の拡張子 |

## git 設定

Context Root 毎に Git コミットの挙動を設定できます。

| 値 | 説明 |
|----|------|
| `'auto-commit'` | 各操作後に自動コミット |
| `'manual'` | `ocd_commit` ツールで明示的にコミット（**デフォルト**） |
| `'none'` | Git を使用しない |

> **Note**: `readOnly: true` の Context Root は書き込みしないため `git` 設定は無視されます。

## 設定の探索とマージ

### 探索順序
1. cwd から上位に `.ocd.config.js` を探索
2. 見つかった場合はローカル設定を読み込み
3. `inheritGlobal: true` の場合、グローバル設定とマージ

### マージルール
- ローカル設定の Context Roots が先に追加
- グローバル設定の Context Roots は、同じ ID がなければ追加
- グローバル Context Roots はデフォルトで readonly

## 例: 複数 PJ での利用

```
~/
├── .ocd/
│   └── config.js            # 共有コンテキスト
├── projects/
│   ├── project-alpha/
│   │   ├── .ocd.config.js   # PJ Alpha 固有
│   │   └── ...
│   └── project-beta/
│       ├── .ocd.config.js   # PJ Beta 固有
│       └── ...
```

## 関連
- [server-modes](./server-modes) - サーバー起動モード
- [file-patterns](./file-patterns) - ファイルパターン設定
