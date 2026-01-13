---
title: Tree Text Format Options
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

## 設定方法

### 1. ツール引数で指定

```
ocd_get_context_tree(
  rootPath: "docs",
  treeTextFormat: "$path: $title"
)
```

### 2. .ocd.config.js で設定

```javascript
export default {
  contextRoots: [...],
  treeTextFormat: '$path: $title'
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

## 関連

- [[tree-text-output-format]]
- [[config-files]]
