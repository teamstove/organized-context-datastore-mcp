---
title: file-git-storage
summary: ファイルベースストレージとGitバージョン管理
categories:
  - feature
  - released
tags:
  - storage
  - git
  - file-based
---
# ファイルベースストレージ (Git)

## 概要
MarkdownファイルをGitリポジトリで管理。

## 特徴
- ファイルシステム上のMarkdownファイル
- Gitによるバージョン管理
- Context Root 毎に git 設定を変更可能

## git 設定

Context Root 毎に設定可能:

| 値 | 説明 |
|----|------|
| `'auto-commit'` | 各操作後に自動コミット |
| `'manual'` | `commit` ツールで明示的にコミット（**デフォルト**） |
| `'none'` | Git を使用しない |

## 設定例

```json
{
  "contextRoots": [
    {
      "path": "./docs",
      "git": "auto-commit"
    },
    {
      "path": "./drafts",
      "git": "manual"
    }
  ]
}
```

## デフォルト動作

- `git` 未指定時は `'manual'` （手動コミット）
- `readOnly: true` の Context Root は書き込みしないため git 設定は無視

## 関連
- [config-files](./config-files) - 設定ファイル詳細
