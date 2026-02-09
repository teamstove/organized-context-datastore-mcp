---
title: Git コミット設定（Context Root 毎）
summary: Context Root 毎に auto-commit / manual / none を設定可能
categories:
  - what
  - released
tags:
  - git
  - version-control
  - per-context-root
---
# Git コミット設定（Context Root 毎）

## 概要

各 Context Root に対して、Git のコミット動作を個別に設定できる。

## 設定値

| 値 | 動作 | ユースケース |
|-----|------|-------------|
| `auto-commit` | 書き込み時に自動コミット | 履歴を自動で記録したい場合 |
| `manual` | `ocd_commit` で明示的にコミット | 複数の変更をまとめてコミットしたい場合 |
| `none` | Git 操作を一切行わない | Git 管理下にないディレクトリ |

## デフォルト値

`manual` （意図しない自動コミットを防止）

## 設定例

```javascript
// .ocd.config.js
export default {
  contextRoots: [
    {
      path: './knowledge-base',
      name: 'Knowledge Base',
      git: 'auto-commit'  // 変更毎に自動コミット
    },
    {
      path: './drafts',
      name: 'Draft Documents',
      git: 'manual'  // ocd_commit で手動コミット
    },
    {
      path: './external-docs',
      name: 'External Reference',
      git: 'none',       // Git 操作なし
      readOnly: true     // 読み取り専用
    }
  ]
}
```

## 注意事項

- `readOnly: true` の Context Root では Git 操作は自動的にスキップされる
- Git が初期化されていないディレクトリではコミットはスキップされる（エラーにはならない）

## 関連 ADR

- [ADR-004: versionControlMode 廃止と Context Root 毎の git 設定](../../90-decisions/adr-004-versioncontrolmode-deprecation)
