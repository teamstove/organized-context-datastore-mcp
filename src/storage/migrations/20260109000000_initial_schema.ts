/**
 * Knowledge Graph MCP - 初期スキーママイグレーション
 * 
 * PostgreSQL用のテーブル定義:
 * - projects: プロジェクト設定
 * - context_nodes: コンテキストノード (Knowledge Graphの基本単位)
 * - context_versions: バージョン履歴
 */

import type { Knex } from 'knex'

/**
 * マイグレーション UP: テーブル作成
 */
export async function up(knex: Knex): Promise<void> {
  // ==========================================================================
  // PostgreSQL拡張機能の有効化 (UUID生成用)
  // ==========================================================================
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

  // ==========================================================================
  // projects テーブル: プロジェクト設定
  // ==========================================================================
  await knex.schema.createTable('projects', (table) => {
    // プロジェクトID (例: 'apiste-gme', 'core-framework')
    table.string('id', 255).primary()
    
    // 表示名
    table.string('name', 255).notNullable()
    
    // ストレージタイプ ('file-git' | 'postgres')
    table.string('storage_type', 50).defaultTo('postgres')
    
    // file-git の場合のストレージパス
    table.string('storage_path', 1024).nullable()
    
    // 設定JSON (contextRoots, writePermission など)
    table.jsonb('config').defaultTo('{}')
    
    // タイムスタンプ
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
  })

  // ==========================================================================
  // context_nodes テーブル: コンテキストノード
  // ==========================================================================
  await knex.schema.createTable('context_nodes', (table) => {
    // UUID主キー
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
    
    // 所属プロジェクトID
    table.string('project_id', 255).notNullable()
      .references('id').inTable('projects').onDelete('CASCADE')
    
    // パス (例: 'features/product-master')
    // プロジェクト内で一意
    table.string('path', 1024).notNullable()
    
    // タイトル
    table.string('title', 512).notNullable()
    
    // サマリ
    table.text('summary').nullable()
    
    // 本文コンテンツ (Markdown)
    table.text('content').nullable()
    
    // カテゴリ (JSON配列)
    table.jsonb('categories').defaultTo('[]')
    
    // タグ (JSON配列)
    table.jsonb('tags').defaultTo('[]')
    
    // フロントマター (JSON)
    table.jsonb('frontmatter').defaultTo('{}')
    
    // リンク情報 (JSON: { to: [], from: [] })
    table.jsonb('links').defaultTo('{"to": [], "from": []}')
    
    // アノテーション (JSON配列)
    table.jsonb('annotations').defaultTo('[]')
    
    // TODO項目 (JSON配列)
    table.jsonb('todos').defaultTo('[]')
    
    // セクション構造 (JSON配列)
    table.jsonb('sections').defaultTo('[]')
    
    // バージョン (楽観的ロック用)
    table.integer('version').defaultTo(1)
    
    // タイムスタンプ
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())
    
    // 複合ユニーク制約: プロジェクト内でパスは一意
    table.unique(['project_id', 'path'])
  })

  // インデックス作成
  await knex.schema.raw(`
    CREATE INDEX idx_context_nodes_project_id ON context_nodes(project_id);
    CREATE INDEX idx_context_nodes_path ON context_nodes(path);
    CREATE INDEX idx_context_nodes_categories ON context_nodes USING GIN(categories);
    CREATE INDEX idx_context_nodes_tags ON context_nodes USING GIN(tags);
    CREATE INDEX idx_context_nodes_updated_at ON context_nodes(updated_at);
  `)

  // ==========================================================================
  // context_versions テーブル: バージョン履歴
  // ==========================================================================
  await knex.schema.createTable('context_versions', (table) => {
    // UUID主キー
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'))
    
    // 対象ノードID
    table.uuid('node_id').notNullable()
      .references('id').inTable('context_nodes').onDelete('CASCADE')
    
    // バージョン番号
    table.integer('version').notNullable()
    
    // スナップショット: 本文コンテンツ
    table.text('content').nullable()
    
    // スナップショット: フロントマター
    table.jsonb('frontmatter').defaultTo('{}')
    
    // コミットメッセージ
    table.string('message', 512).nullable()
    
    // 作者
    table.string('author', 255).nullable()
    
    // タイムスタンプ
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    
    // 複合ユニーク制約: ノード内でバージョン番号は一意
    table.unique(['node_id', 'version'])
  })

  // インデックス作成
  await knex.schema.raw(`
    CREATE INDEX idx_context_versions_node_id ON context_versions(node_id);
    CREATE INDEX idx_context_versions_created_at ON context_versions(created_at);
  `)

  // ==========================================================================
  // 更新トリガー: updated_at 自動更新
  // ==========================================================================
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    CREATE TRIGGER update_projects_updated_at
      BEFORE UPDATE ON projects
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_context_nodes_updated_at
      BEFORE UPDATE ON context_nodes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `)
}

/**
 * マイグレーション DOWN: テーブル削除
 */
export async function down(knex: Knex): Promise<void> {
  // トリガーの削除
  await knex.raw(`
    DROP TRIGGER IF EXISTS update_context_nodes_updated_at ON context_nodes;
    DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
    DROP FUNCTION IF EXISTS update_updated_at_column;
  `)

  // テーブルの削除 (依存関係の逆順)
  await knex.schema.dropTableIfExists('context_versions')
  await knex.schema.dropTableIfExists('context_nodes')
  await knex.schema.dropTableIfExists('projects')
}
