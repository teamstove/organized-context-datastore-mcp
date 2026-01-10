---
title: adr-002-remove-legacy-write-tools
summary: 'ADR-002: 旧書き込みツールの削除と mutate_context への統合'
categories:
  - adr
  - decisions
tags:
  - mutate-context
  - breaking-change
  - accepted
---
# ADR-002: 旧書き込みツールの削除

## Status
**accepted** (2026-01-10)

## Context

### 問題
4つの個別書き込みツールが存在:
- `create_context`
- `update_context`
- `delete_context`
- `move_context`

これにより:
1. LLM がツールを選択する負荷が増大
2. 複合操作に複数回のツール呼び出しが必要
3. コードの重複が多い

## Decision

### 旧ツールを削除し mutate_context に統合

```json
{
  "operations": [
    { "type": "create", ... },
    { "type": "update", ... },
    { "type": "delete", ... },
    { "type": "move", ... }
  ]
}
```

## Consequences

### Positive
- **615行削減**: コード簡素化
- **ツール数削減**: 7ツールに統一
- **一括操作**: 複数種類の操作を単一呼び出しで

### Negative
- **BREAKING CHANGE**: 旧ツールに依存するコードは更新が必要

## 移行ガイド

| 旧 | 新 |
|-----|-----|
| `create_context([{...}])` | `mutate_context([{type:'create',...}])` |
| `update_context([{...}])` | `mutate_context([{type:'update',...}])` |
| `delete_context([{...}])` | `mutate_context([{type:'delete',...}])` |
| `move_context([{...}])` | `mutate_context([{type:'move',...}])` |

## 関連
- [mutate-context-unified-tool](../../03-what/released/mutate-context-unified-tool)
- [context-crud-operations](../../99-archive/superseded/context-crud-operations) (統合済み)
