---
title: Ignore Patterns
summary: デフォルトで node_modules 等を除外、カスタムパターンも追加可能
categories:
  - what
  - released
tags:
  - ignore
  - filter
  - configuration
---
# Ignore Patterns

Context Root 配下のファイルをフィルタリングする機能。

## デフォルト除外パターン

以下は明示的に指定しなくても自動的に除外されます:

| カテゴリ | パターン |
|----------|----------|
| バージョン管理 | `.git/**`, `.svn/**`, `.hg/**` |
| パッケージ | `node_modules/**`, `bower_components/**`, `.pnpm/**` |
| ビルド出力 | `dist/**`, `build/**`, `out/**`, `.next/**`, `.nuxt/**` |
| キャッシュ | `.cache/**`, `.tmp/**`, `.temp/**`, `*.log` |
| IDE | `.idea/**`, `.vscode/**`, `*.swp`, `.DS_Store` |
| テスト | `coverage/**`, `.nyc_output/**` |

## 設定例

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

`!pattern` でデフォルト除外を解除できます:

```json
{
  "contextRoots": [
    {
      "path": "./my-project",
      "ignorePatterns": [
        "!node_modules"
      ]
    }
  ]
}
```

これで `node_modules` 配下の `.md` ファイルも Context として認識されます。

## 関連
- [config-files](./config-files) - 設定ファイルの詳細
