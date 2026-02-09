#!/usr/bin/env node
/**
 * OCD-MCP bin ラッパー
 * tsx で src/cli.ts を直接実行（ビルド不要）
 * Windows / Unix 両対応
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const tsxPath = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
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
