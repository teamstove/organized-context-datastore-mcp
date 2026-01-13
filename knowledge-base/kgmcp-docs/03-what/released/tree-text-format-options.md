---
title: Tree Text Format Options
summary: get_context_tree の表示フォーマット設定
categories:
  - feature-spec
tags: []
---
# Tree Text Format Options

## 概要

`ocd_get_context_tree` の出力フォーマットをカスタマイズ可能。

## デフォルトフォーマット

```
$path: $title
```

## 使用可能な変数

| 変数 | 説明 |
|------|------|
| `$path` | 相対パス |
| `$title` | タイトル |
| `$summary` | サマリー |
| `$categories` | カテゴリ（カンマ区切り） |
| `$tags` | タグ（カンマ区切り） |

## 設定方法

### 1. ツール引数で指定

```
ocd_get_context_tree(
  rootPath: "docs",
  treeTextFormat: "$path: $summary [$categories]"
)
```

### 2. .ocd.config.js で設定

```javascript
export default {
  contextRoots: [...],
  treeTextFormat: '$path: $summary [$categories]'
}
```

## 出力例

### デフォルト (`$path: $title`)

```
[docs] (5 nodes)
api/overview: API 概要
api/endpoints: エンドポイント一覧
guide/getting-started: はじめに
```

### `$path: $summary` 指定時

```
[docs] (5 nodes)
api/overview: API の全体像と使い方
api/endpoints: 利用可能な全 API エンドポイント
guide/getting-started: インストールと初期設定
```

## 関連

- [[tree-text-output-format]]
- [[config-files]]
