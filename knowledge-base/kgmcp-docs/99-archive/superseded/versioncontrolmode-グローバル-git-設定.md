---
title: versionControlMode（グローバル Git 設定）
summary: Context Root 毎の git 設定に置き換えられた旧グローバル設定
categories:
  - archive
  - superseded
tags:
  - legacy
  - version-control
  - replaced-by-git-setting
---
# versionControlMode（グローバル Git 設定）

## ステータス

**Superseded** by Context Root 毎の `git` 設定 (ADR-004)

## 概要

`versionControlMode` は、全ての Context Root に対するグローバルな Git コミット動作を制御する設定だった。

## 旧設定値

```typescript
type VersionControlMode = 
  | 'immediate'      // 書き込み時に即時コミット
  | 'draft_commit'   // 未実装
  | 'approval_flow'  // 未実装
```

## 廃止理由

1. 粒度が粗すぎた（全 Context Root に同一設定）
2. 名前が直感的でなかった
3. `draft_commit` / `approval_flow` は実装されなかった

## 移行先

各 Context Root の `git` プロパティ：

```javascript
{
  contextRoots: [
    { path: './docs', git: 'auto-commit' },  // 即時コミット
    { path: './drafts', git: 'manual' },     // 手動コミット（デフォルト）
    { path: './external', git: 'none' }      // Git 操作なし
  ]
}
```

## 関連

- [ADR-004: versionControlMode 廃止と Context Root 毎の git 設定](../90-decisions/adr-004-versioncontrolmode-deprecation)
