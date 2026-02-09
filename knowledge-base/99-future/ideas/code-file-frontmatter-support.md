---
title: コードファイル(.ts/.js)のFrontmatter形式サポート
summary: >-
  JSDoc形式でtitle/summary等のメタデータを記述可能にし、.mdと同様にコンテキストとして扱えるようにする拡張機能。ソースコードドキュメントとナレッジベースの統合を実現。
---
# コードファイル(.ts/.js)のFrontmatter形式サポート

## 背景・動機

現在、OCD-MCPは `.md` ファイルのみをコンテキストとして認識し、YAML Frontmatter からメタデータを抽出している。

実際のプロジェクトでは、ソースコード自体にも重要なドキュメントが含まれており、これらも統合的に管理したいというニーズがある。

## 提案する形式

`.ts` / `.js` ファイルにおいて、先頭のJSDocコメントからメタデータを抽出する:

```typescript
/**
 * @title ユーザー認証モジュール
 * @summary JWT認証、OAuth2.0対応、セッション管理、2FA対応
 * @category auth
 * @related security/encryption
 */

export function authenticate() { ... }
```

### サポートするタグ

| タグ | 用途 | 必須 |
|------|------|------|
| `@title` | タイトル（10-50文字） | ○ |
| `@summary` | サマリ（50-300文字） | ○ |
| `@category` | カテゴリ | - |
| `@related` | 関連リンク（カンマ区切り） | - |
| その他 `@xxx` | カスタム属性として `attrs` に格納 | - |

## 実装計画

### Phase 1: 読み取りサポート

1. **新規: `CodeDocParser.ts`**
   - JSDocコメントからメタデータを抽出
   - `ParsedMarkdown` 互換の構造を返す
   - 本文 = コード全体（コメント含む）

2. **修正: `FileGitStore.ts`**
   - `includePatterns` で `.ts`/`.js` も対象にできるように
   - `.md` 自動付与ロジックの拡張（拡張子付きのパスはそのまま扱う）

3. **修正: `ReadTools.ts`**
   - ファイル拡張子に応じてパーサーを選択
   - `.md` → `MarkdownParser`
   - `.ts`/`.js` → `CodeDocParser`

### Phase 2: 書き込みサポート（オプション）

1. **修正: `WriteTools.ts`**
   - コードファイルのJSDocコメント更新
   - `mutate_context` でコードファイルのメタデータ編集

### Phase 3: 追加言語サポート（将来）

- Python: `"""` docstring
- Go: `//` or `/* */` コメント
- Rust: `///` or `//!` コメント

## 設定例

```javascript
// .ocd.config.js
export default {
  contextRoots: [
    {
      id: 'my-project',
      path: './src',
      // .md に加えて .ts/.js も対象に
      includePatterns: ['**/*.md', '**/*.ts', '**/*.js']
    }
  ]
}
```

## 考慮事項

### 1. パスの扱い

現在、`.md` 拡張子は自動付与・除去されているが、コードファイルはファイル拡張子をそのまま維持する必要がある。

**案:**
- パスに拡張子が含まれていればそのまま使用
- 拡張子がなければ Context Root の `defaultExtension` または `.md` を付与

### 2. コンテンツの扱い

- Markdown: Frontmatter を除いた本文
- コード: ファイル全体（JSDocコメント含む）

### 3. 編集の難しさ

コードファイルのJSDocだけを更新するのは複雑なため、Phase 2 は優先度低め。
読み取り専用でも十分価値がある。

## 期待される効果

1. **統合的なナレッジ管理**
   - ドキュメントとコードを同じツールで検索・参照
   - ソースコードの構造と目的を LLM が理解しやすくなる

2. **ドキュメントの二重管理を削減**
   - 別途 `.md` ファイルを作らなくても、コード内コメントで管理可能

3. **コンテキスト収集の効率化**
   - 必要なファイルを `@category` 等でフィルタリング可能

## 関連

- [[03-what/released/file-patterns]]
- [[02-how/internals]]
