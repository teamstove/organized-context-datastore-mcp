---
title: 'ADR-004: versionControlMode 廃止と Context Root 毎の git 設定'
summary: グローバルな versionControlMode を廃止し、Context Root 毎に git 設定を行う方式に移行
categories:
  - adr
  - decisions
tags:
  - git
  - version-control
  - breaking-change
  - accepted
---
# ADR-004: versionControlMode 廃止と Context Root 毎の git 設定

## ステータス

**Accepted** (2026-01-12)

## コンテキスト

従来、Git のコミット動作はグローバルな `versionControlMode` 設定で制御されていた：

```typescript
type VersionControlMode = 
  | 'immediate'      // 即時反映
  | 'draft_commit'   // DRAFT → commit
  | 'approval_flow'  // edit → commit → approve → merge
```

しかし、この設計には以下の問題があった：

1. **粒度が粗い**: 全ての Context Root に同じ設定が適用される
2. **名前が分かりづらい**: `versionControlMode: 'immediate'` が何を意味するか直感的でない
3. **柔軟性が低い**: Context Root によって異なる動作が必要なケースに対応できない
4. **`draft_commit` と `approval_flow` は未実装**: 実質的に `immediate` のみ使用されていた

## 決定

1. **`versionControlMode` を完全に廃止**
2. **Context Root 毎に `git` 設定を導入**

```typescript
interface LocalContextRootConfig {
  path: string
  git?: 'auto-commit' | 'manual' | 'none'  // 新しい設定
  // ...
}
```

### 各設定値の動作

| 設定 | 動作 |
|------|------|
| `auto-commit` | 書き込み時に自動でコミット |
| `manual` (デフォルト) | `ocd_commit` ツールで明示的にコミット |
| `none` | Git 操作を一切行わない |

## 結果

### 良い点

- Context Root 毎に適切な Git 動作を設定可能
- 設定名が直感的（`git: 'auto-commit'` vs `versionControlMode: 'immediate'`）
- デフォルトが `manual` になり、意図しない自動コミットを防止
- `readOnly: true` の Context Root では自動的に Git 操作がスキップされる

### 注意点

- **Breaking Change**: `versionControlMode` を使用していた設定は更新が必要
- 旧来の設定は単純に無視される（エラーにはならない）

## 移行ガイド

### Before（旧設定）

```json
{
  "versionControlMode": "immediate"
}
```

### After（新設定）

```javascript
export default {
  contextRoots: [
    {
      path: './docs',
      git: 'auto-commit'  // 即時コミットしたい場合
    },
    {
      path: './drafts',
      git: 'manual'  // 手動コミット（デフォルト）
    },
    {
      path: './external',
      git: 'none'  // Git 管理しない
    }
  ]
}
```
