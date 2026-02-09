---
title: Context Roots Filter
summary: URL クエリパラメータで Context Roots をフィルタリング（HTTP モード専用）
categories:
  - what
  - released
tags:
  - filter
  - http-only
  - multi-tenant
---
# Context Roots Filter

> **HTTP モード専用機能**
>
> stdio モードでは `.ocd.config.json` で Context Roots を設定します。

URL クエリパラメータで Context Roots を動的にフィルタリング。

## ユースケース

- 100 個の Context Roots があるサーバーで、特定の 3 個だけを対象にしたい
- 一部の Context Roots を readonly にしたい
- プロジェクト毎に異なる Context Roots の組み合わせを使いたい

## クエリパラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `roots` | 含める Context Root IDs（カンマ区切り） | `?roots=A,B,C` |
| `readonly` | readonly にする Context Root IDs | `?readonly=C` |
| `config` | JSON 形式（URL エンコード） | `?config={"roots":["A"],...}` |

## 使用例

### シンプル形式

```
# 特定の roots のみ
POST /api/mcp?roots=project-alpha,core-docs

# roots + readonly
POST /api/mcp?roots=project-alpha,shared-context&readonly=shared-context
```

### JSON 形式

```
POST /api/mcp?config={"roots":["project-alpha","shared"],"readonly":["shared"]}
```

（URL エンコードが必要）

## Cursor / IDE 設定例

```json
{
  "mcpServers": {
    "ocd-pj-alpha": {
      "url": "http://localhost:38291/api/mcp?roots=project-alpha,core-docs"
    },
    "ocd-pj-beta": {
      "url": "http://localhost:38291/api/mcp?roots=project-beta,shared&readonly=shared"
    },
    "ocd-all-readonly": {
      "url": "http://localhost:38291/api/mcp?readonly=project-alpha,project-beta,shared"
    }
  }
}
```

※ HTTP サーバーを別途起動しておく必要があります。

## 動作

### roots フィルタ
- 指定した ID の Context Roots のみが `ocd_list_context_roots` で返される
- 未指定の場合は全ての Context Roots が対象

### readonly フィルタ
- 指定した ID の Context Roots に `readOnly: true` が設定される
- 全ての roots が readonly の場合、書き込みツールは非表示

## 関連
- [server-modes](./server-modes) - サーバー起動モード
- [config-files](./config-files) - stdio モードでの設定方法
