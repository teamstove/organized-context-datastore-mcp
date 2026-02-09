#!/usr/bin/env node
/**
 * OCD-MCP bin ラッパー
 * tsx で src/cli.ts を直接実行（ビルド不要）
 * Windows / Unix 両対応
 *
 * tsx は require.resolve('tsx/cli') で解決。
 * npx で取得時は依存がホイストされるため、固定パスではなく resolve を使用。
 */

import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const require = createRequire(import.meta.url)
const tsxPath = require.resolve('tsx/cli', { paths: [root] })
const cliPath = join(root, 'src', 'cli.ts')
const args = process.argv.slice(2)

const child = spawn(
  process.execPath,
  [tsxPath, cliPath, ...args],
  {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  }
)

child.on('exit', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
