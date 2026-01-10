---
title: mutate-context-unified-tool
summary: 全ての書き込み操作を統合した唯一のツール
categories:
  - feature
  - released
tags:
  - mutate-context
  - unified
  - write-tool
---
# mutate_context - 統合書き込みツール

## 概要

**唯一の書き込みツール**。create, update, delete, move を単一のツールで実行可能。
複数の操作を配列で渡すことで一括処理。

## 操作タイプ

| type   | 必須                        | オプション                                |
|--------|---------------------------|------------------------------------------|
| create | path (親), title, summary | categories, tags, content                |
| update | path                      | title, summary, categories, tags, contentUpdates |
| delete | path                      | -                                        |
| move   | path (元), to             | -                                        |

## 使用例

```json
{
  "operations": [
    { "type": "create", "path": "docs", "title": "新機能", "summary": "..." },
    { "type": "update", "path": "docs/existing", "summary": "更新" },
    { "type": "move", "path": "old/path", "to": "new/path" },
    { "type": "delete", "path": "docs/obsolete" }
  ]
}
```

## contentUpdates

### whole_replace - コンテンツ全置換
```json
{ "type": "whole_replace", "content": "新しいコンテンツ全体" }
```

### regexp_replace - 正規表現置換

#### 末尾追記
```json
{ "type": "regexp_replace", "pattern": "$", "replacement": "\\n\\n追記内容", "flags": "m" }
```

#### セクション置換
```json
{ "type": "regexp_replace", "pattern": "## セクション名\\n.*?(?=\\n## |$)", "replacement": "## セクション名\\n新内容", "flags": "s" }
```

## メリット

1. **1回のツール呼び出しで複合操作**
2. **LLM のツール選択負荷軽減** (4ツール → 1ツール)
3. **一括コミット** (全操作が完了後にまとめて Git コミット)

## 関連 ADR
→ [ADR-002: 旧書き込みツールの削除](../../90-decisions/adr-002-remove-legacy-write-tools)
