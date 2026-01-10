---
title: adr-001-tree-text-format
summary: 'ADR-001: tree-text フォーマットの導入'
categories:
  - adr
  - decisions
tags:
  - tree-text
  - token-efficiency
  - accepted
---
# ADR-001: tree-text フォーマットの導入

## Status
**accepted** (2026-01-10)

## Context

### 問題
`ocd_get_context_tree` の JSON 出力は以下の問題があった:

1. **Token 非効率**: JSON の冗長性（`"path":`, `"title":` 等のキー名繰り返し）
2. **ネスト不明確**: フラット配列なので親子関係がパスから推測必要
3. **index 問題**: `xxx/index` が複数あると区別できない

### 要件
- LLM のコンテキストウィンドウを効率的に使用
- 構造が一目で分かる形式
- 後方互換性の維持

## Decision

### 1. tree-text 形式をデフォルトに
```
[kgmcp-docs] (18 nodes)
├ 01-why: なぜ必要か [chi:2]
│ ├ problems-we-solve: 解決する課題
│ └ vision-and-goals: ビジョン
└ 02-how: 実装 [chi:2]
```

### 2. index パスの正規化
`xxx/index` → `xxx` として扱う。
ディレクトリの index.md が親ノードとして機能。

### 3. nested/flat 切り替え
- `nested`: ツリー記号で階層表示（デフォルト）
- `flat`: フルパス表記

### 4. JSON 形式の維持
`format: 'json'` で従来形式も利用可能。

## Consequences

### Positive
- Token 消費が大幅に減少（推定 50-70% 削減）
- ネスト構造が視覚的に明確
- index の混乱が解消
- 後方互換性維持

### Negative
- tree-text のパースが必要（LLM 側）
- カスタム形式なので標準ツールでの処理が困難

## 関連
- `../03-what/released/tree-text-output-format`
