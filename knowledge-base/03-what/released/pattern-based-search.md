---
title: pattern-based-search
summary: globパターンとjqフィルタによる柔軟なコンテキスト検索
categories:
  - feature
  - released
tags:
  - search
  - glob
  - jq
---
# パターンベース検索

## 概要
globパターンとjqフィルタを組み合わせた柔軟な検索機能。

## 使用例

### globパターン
```json
{ "patterns": ["project/**", "features/*"] }
```

### jqフィルタ
```json
{ 
  "patterns": ["**/*"],
  "filter": ".categories | any(. == \"feature-spec\")" 
}
```

## APIリファレンス
→ `./api-reference-for-pattern-search-tools.md`
