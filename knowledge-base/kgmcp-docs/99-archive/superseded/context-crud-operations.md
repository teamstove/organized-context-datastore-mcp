---
title: context-crud-operations
summary: mutate_context に統合済み（後方互換性のため記録を残す）
categories:
  - archive
  - superseded
tags:
  - legacy
  - merged-to-mutate-context
---
# Context CRUD Operations

> ⚠️ **統合済み**: この機能は `mutate_context` に統合されました。
> → [mutate-context-unified-tool](../../../03-what/released/mutate-context-unified-tool)

## 経緧

元々は 4つの個別ツールとして提供:
- `create_context`
- `update_context`
- `delete_context`
- `move_context`

## 統合の理由

1. **LLM のツール選択負荷軽減**: 4ツール → 1ツール
2. **一括操作の実現**: 複数種類の操作を単一呼び出しで実行
3. **コード簡素化**: 615行削減

## 関連 ADR
→ [ADR-002: 旧書き込みツールの削除](../../90-decisions/adr-002-remove-legacy-write-tools)
