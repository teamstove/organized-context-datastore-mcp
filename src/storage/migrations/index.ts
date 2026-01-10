/**
 * Knowledge Graph MCP - マイグレーション管理
 * 
 * Knexを使用したPostgreSQLマイグレーションのエントリポイント
 */

import type { Knex } from 'knex'

// マイグレーションファイルのインポート
import * as initialSchema from './20260109000000_initial_schema.js'

/**
 * マイグレーション定義
 */
interface Migration {
  name: string
  up: (knex: Knex) => Promise<void>
  down: (knex: Knex) => Promise<void>
}

/**
 * 全マイグレーション (時系列順)
 */
export const migrations: Migration[] = [
  {
    name: '20260109000000_initial_schema',
    up: initialSchema.up,
    down: initialSchema.down
  }
]

/**
 * マイグレーション実行クラス
 */
export class MigrationRunner {
  constructor(private readonly knex: Knex) {}

  /**
   * 全マイグレーションを実行
   */
  async runAll(): Promise<void> {
    console.log('[MigrationRunner] マイグレーション開始...')

    // マイグレーション履歴テーブルを作成
    await this.ensureMigrationTable()

    // 未実行のマイグレーションを実行
    const executed = await this.getExecutedMigrations()
    
    for (const migration of migrations) {
      if (!executed.includes(migration.name)) {
        console.log(`[MigrationRunner] 実行中: ${migration.name}`)
        await migration.up(this.knex)
        await this.recordMigration(migration.name)
        console.log(`[MigrationRunner] 完了: ${migration.name}`)
      }
    }

    console.log('[MigrationRunner] マイグレーション完了')
  }

  /**
   * 最後のマイグレーションをロールバック
   */
  async rollbackLast(): Promise<void> {
    const executed = await this.getExecutedMigrations()
    
    if (executed.length === 0) {
      console.log('[MigrationRunner] ロールバック対象なし')
      return
    }

    const lastName = executed[executed.length - 1]
    const migration = migrations.find(m => m.name === lastName)

    if (migration) {
      console.log(`[MigrationRunner] ロールバック: ${migration.name}`)
      await migration.down(this.knex)
      await this.removeMigration(migration.name)
      console.log(`[MigrationRunner] ロールバック完了: ${migration.name}`)
    }
  }

  /**
   * 全マイグレーションをロールバック
   */
  async rollbackAll(): Promise<void> {
    const executed = await this.getExecutedMigrations()
    
    // 逆順でロールバック
    for (const name of executed.reverse()) {
      const migration = migrations.find(m => m.name === name)
      if (migration) {
        console.log(`[MigrationRunner] ロールバック: ${migration.name}`)
        await migration.down(this.knex)
        await this.removeMigration(migration.name)
      }
    }

    console.log('[MigrationRunner] 全ロールバック完了')
  }

  /**
   * マイグレーション履歴テーブルを作成
   */
  private async ensureMigrationTable(): Promise<void> {
    const exists = await this.knex.schema.hasTable('knex_migrations')
    
    if (!exists) {
      await this.knex.schema.createTable('knex_migrations', (table) => {
        table.increments('id')
        table.string('name', 255).notNullable()
        table.timestamp('migration_time', { useTz: true }).defaultTo(this.knex.fn.now())
      })
    }
  }

  /**
   * 実行済みマイグレーション名を取得
   */
  private async getExecutedMigrations(): Promise<string[]> {
    const rows = await this.knex('knex_migrations')
      .select('name')
      .orderBy('id', 'asc')
    
    return rows.map(row => row.name)
  }

  /**
   * マイグレーション実行を記録
   */
  private async recordMigration(name: string): Promise<void> {
    await this.knex('knex_migrations').insert({ name })
  }

  /**
   * マイグレーション記録を削除
   */
  private async removeMigration(name: string): Promise<void> {
    await this.knex('knex_migrations').where({ name }).delete()
  }
}

/**
 * Knex接続設定を作成
 */
export function createKnexConfig(connectionString: string): Knex.Config {
  return {
    client: 'pg',
    connection: connectionString,
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations'
    }
  }
}
