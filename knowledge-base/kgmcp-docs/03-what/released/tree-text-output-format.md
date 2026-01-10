---
title: tree-text-output-format
summary: get_context_tree の Token 効率が良いテキスト形式出力
categories:
  - feature
  - released
tags:
  - tree-text
  - token-efficiency
  - output-format
---
# tree-text 出力フォーマット

## 概要
`get_context_tree` ツールの Token 効率が良いテキスト形式出力。
JSON 形式と比較して大幅に Token 消費を削減。

## ツリースタイル

| スタイル | 説明 | 用途 |
|----------|------|------|
| `flat` (default) | フルパス表記 | パスの直接参照、ディレクトリ/ファイル区別が明確 |
| `nested` | ツリー記号で階層表示 | 深いネスト構造の視覚的把握 |

## nested 出力例
```
[kgmcp-docs] (18 nodes)
├ 01-why: なぜ必要か [chi:2]
│ ├ problems-we-solve: 解決する課題
│ └ vision-and-goals: ビジョンと目標
└ 02-how: 実装とアーキテクチャ [chi:2]
```

## flat 出力例
```
[kgmcp-docs] (18 nodes)
01-why: なぜ必要か
01-why/problems-we-solve: 解決する課題
01-why/vision-and-goals: ビジョンと目標
```

## パラメータ

| パラメータ | 型 | 説明 |
|------------|-----|------|
| `rootPath` | `string` | 単一のルートパス |
| `rootPaths` | `string[]` | 複数のルートパス（一括取得） |

※ どちらか一方を指定。両方指定時は `rootPaths` が優先。

## オプション

| オプション | 型 | デフォルト | 説明 |
|------------|-----|------------|------|
| `format` | `'json' \| 'tree-text'` | `'tree-text'` | 出力形式 |
| `treeStyle` | `'flat' \| 'nested'` | `'flat'` | ツリースタイル |
| `includeSummary` | `boolean` | `true` | summary を含める |
| `includeCategories` | `boolean` | `true` | categories を含める |
| `includeTags` | `boolean` | `true` | tags を含める |
| `maxNodes` | `number` | `1000` | 返却ノード数上限 |
| `depth` | `number` | 全階層 | 深さ制限 |

## 技術詳細

### index パスの正規化
`xxx/index` パスは `xxx` として表示される。
これによりディレクトリの index.md が親ノードとして機能する。

### ソート順
パスのアルファベット順。
数字プレフィックス（例: `01-why`, `02-how`）で順序制御可能。

## アーキテクチャ
→ `../../../02-how/internals/`

## 関連 ADR
→ `../../../90-decisions/adr-001-tree-text-format`
