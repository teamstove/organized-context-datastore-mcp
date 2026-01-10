---
title: File Patterns
summary: デフォルト除外パターン、カスタム拡張子、新規作成時の拡張子決定
categories:
  - what
  - released
tags:
  - ignore
  - filter
  - extension
  - configuration
---
# File Patterns

Context Root 配下のファイルフィルタリングと拡張子設定。

## デフォルト除外パターン

以下は明示的に指定しなくても自動的に除外:

| カテゴリ | パターン |
|----------|----------|
| バージョン管理 | `.git/**`, `.svn/**`, `.hg/**` |
| パッケージ | `node_modules/**`, `bower_components/**`, `.pnpm/**` |
| ビルド出力 | `dist/**`, `build/**`, `out/**`, `.next/**`, `.nuxt/**` |
| キャッシュ | `.cache/**`, `.tmp/**`, `.temp/**`, `*.log` |
| IDE | `.idea/**`, `.vscode/**`, `*.swp`, `.DS_Store` |
| テスト | `coverage/**`, `.nyc_output/**` |

## ignorePatterns

### 追加の除外パターン

```json
{
  "contextRoots": [
    {
      "path": "./my-project",
      "ignorePatterns": [
        "*.test.md",
        "drafts/**",
        "README.md"
      ]
    }
  ]
}
```

### デフォルト除外を解除

`!pattern` でデフォルト除外を解除:

```json
{
  "ignorePatterns": ["!node_modules"]
}
```

## defaultExtension

新規作成時のデフォルト拡張子を指定。

### 例: `.context.md` 拡張子

```json
{
  "contextRoots": [
    {
      "path": "./my-project",
      "defaultExtension": ".context.md",
      "ignorePatterns": ["README.md"]
    }
  ]
}
```

この設定で `mutate_context` の `create` を実行すると:

```json
{
  "operations": [
    { "type": "create", "path": "my-project/features", "title": "新機能", "summary": "..." }
  ]
}
```

→ `my-project/features/新機能.context.md` が作成される

### create 時に明示的に指定

```json
{
  "operations": [
    { 
      "type": "create", 
      "path": "my-project/features", 
      "title": "新機能", 
      "summary": "...",
      "extension": ".md"
    }
  ]
}
```

→ `defaultExtension` を上書きして `.md` で作成

## 拡張子決定の優先順位

1. `create` 時の明示的な `extension` パラメータ
2. Context Root の `defaultExtension`
3. システムデフォルト (`.md`)

## 関連
- [config-files](./config-files) - 設定ファイルの詳細
- [mutate-context-unified-tool](./mutate-context-unified-tool) - 書き込みツール
