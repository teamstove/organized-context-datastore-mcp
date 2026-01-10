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
MarkdownファイルをGitリポジトリで管理。各操作が自動コミットされる。

## 特徴
- ファイルシステム上のMarkdownファイル
- Gitによるバージョン管理
- 即時コミット or ドラフトコミットモード

## 設定
```json
{
  "storageType": "file-git",
  "storagePath": "/path/to/knowledge-base",
  "versionControlMode": "immediate"
}
```

## アーキテクチャ
→ `../../../how/internals/storage-layer/file-git-store-implementation.md`
