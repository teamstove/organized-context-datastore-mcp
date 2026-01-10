---
title: problems-we-solve
summary: Knowledge Graph MCP が解決する課題とその背景
categories:
  - why
  - problems
tags:
  - challenges
  - pain-points
---
# 解決する課題

## 課題 1: LLMのコンテキスト消失問題
LLMはセッション間でコンテキストを保持できない。プロジェクト固有の知識（アーキテクチャ決定、仕様議論、コード規約）が毎回失われる。

## 課題 2: ドキュメントの散逸
知識が複数の場所に分散（Notion, Confluence, README, コメント）し、整合性が取れない。

## 課題 3: Token消費の非効率
大きなドキュメントをそのままLLMに渡すと、必要な情報は一部だけなのに大量の Token を消費。

## 課題 4: 知識の陳腐化
ドキュメントが実際の実装と乖離していく。更新が追跡されず、信頼性が下がる。

## 解決アプローチ
→ `../how/overall-architecture.md` で解決策を説明
