/**
 * ocd-mcp tool <subcommand> — MCP ツールと同等の操作を CLI から実行
 *
 * 注意: 同一リポジトリで stdio MCP サーバーと同時に mutate/commit すると Git 競合の恐れあり
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { KnowledgeGraphService } from '../KnowledgeGraphService.js'
import {
  loadConfig,
  resolveConfigFromCwd,
  resolvedConfigToMcpConfig,
} from '../config/ConfigLoader.js'
import { runOcdTool } from '../ocd/runOcdTool.js'

// =============================================================================
// サービス生成（キャッシュなし・毎回最新設定）
// =============================================================================

async function createServiceForCli(options: {
  cwd?: string
  storage?: string
}): Promise<KnowledgeGraphService> {
  const { cwd, storage } = options
  if (cwd && storage) {
    throw new Error('--cwd と --storage は同時に指定できません')
  }
  if (!cwd && !storage) {
    throw new Error('--cwd または --storage のいずれかを指定してください')
  }
  if (cwd) {
    const resolved = await resolveConfigFromCwd(path.resolve(cwd))
    const storagePath = resolved.contextRoots[0]?.path || path.resolve(cwd)
    const mcpConfig = resolvedConfigToMcpConfig(resolved, storagePath)
    const svc = new KnowledgeGraphService(mcpConfig)
    await svc.initialize()
    return svc
  }
  const config = await loadConfig(path.resolve(storage!))
  const svc = new KnowledgeGraphService(config)
  await svc.initialize()
  return svc
}

// =============================================================================
// 引数パース（サブコマンド + フラグ）
// =============================================================================

interface ToolCliGlobal {
  cwd?: string
  storage?: string
  readonly: boolean
  help: boolean
}

type SubCmd =
  | 'list-roots'
  | 'get-contexts'
  | 'get-tree'
  | 'search'
  | 'mutate'
  | 'commit'
  | 'help'

interface ParsedToolCli {
  global: ToolCliGlobal
  sub: SubCmd | null
  /** サブコマンド専用の残り引数（再パース用） */
  rest: string[]
}

/**
 * どこにあっても --cwd / --storage 等を拾い、位置引数はサブコマンド + その専用引数
 * 例: ocd-mcp tool list-roots --cwd . / ocd-mcp tool --cwd . list-roots 両対応
 */
function parseGlobalAndSub(argv: string[]): ParsedToolCli {
  const global: ToolCliGlobal = { readonly: false, help: false }
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--help' || a === '-h') {
      global.help = true
      continue
    }
    if (a === '--readonly' || a === '-r') {
      global.readonly = true
      continue
    }
    if (a === '--cwd') {
      global.cwd = argv[++i]
      continue
    }
    if (a.startsWith('--cwd=')) {
      global.cwd = a.slice('--cwd='.length)
      continue
    }
    if (a === '--storage') {
      global.storage = argv[++i]
      continue
    }
    if (a.startsWith('--storage=')) {
      global.storage = a.slice('--storage='.length)
      continue
    }
    positional.push(a)
  }

  const first = positional[0]
  if (!first || first.startsWith('-')) {
    return { global, sub: null, rest: positional }
  }
  const subMap: Record<string, SubCmd> = {
    'list-roots': 'list-roots',
    'get-contexts': 'get-contexts',
    'get-tree': 'get-tree',
    search: 'search',
    mutate: 'mutate',
    commit: 'commit',
    help: 'help',
  }
  const sub = subMap[first] ?? null
  return { global, sub, rest: positional.slice(1) }
}

function printToolHelp(): void {
  console.error(`
ocd-mcp tool — OCD を CLI から操作（stdout は JSON）

共通:
  --cwd <dir>       作業ディレクトリ（.ocd.config.js を上位探索）
  --storage <dir>   ストレージルート（loadConfig、HTTP の JSON config とは別）
  上記はどちらか一方必須
  --readonly, -r    mutate / commit を拒否
  -h, --help        このヘルプ

サブコマンド:
  list-roots
  get-contexts      --patterns <g>（複数可） [--filter <jq>] [--include-content]
  get-tree          --root-ids <id>（複数可） [--depth N] [--format json|tree-text]
                    [--tree-text-format <fmt>] [--max-nodes N]
  search            --query <q> [--scope <s>（複数可）]
  mutate            --file <path>（JSON 配列、または { "operations": [...] }。「-」で stdin）
  commit            --message|-m <msg> [--paths <p>（複数可）]

例:
  ocd-mcp tool --cwd . list-roots
  ocd-mcp tool --cwd . get-contexts --patterns 'docs/**'
  ocd-mcp tool --cwd . search --query "認証"
  ocd-mcp tool --cwd . mutate --file ops.json

注意: MCP サーバーと同時に同じ Git ルートへ書き込まないでください。
`)
}

// =============================================================================
// サブコマンド別パース
// =============================================================================

function collectMultiFlag(args: string[], name: string): string[] {
  const out: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) {
      out.push(args[i + 1] ?? '')
      i++
    } else if (args[i]?.startsWith(`${name}=`)) {
      out.push(args[i]!.slice(name.length + 1))
    }
  }
  return out.filter(Boolean)
}

function takeFlag(args: string[], long: string, short?: string): string | undefined {
  const i = args.findIndex(
    (a) => a === long || (short && a === short) || a.startsWith(`${long}=`)
  )
  if (i < 0) return undefined
  const a = args[i]!
  if (a.includes('=')) return a.split('=').slice(1).join('=')
  return args[i + 1]
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name)
}

function parseIntFlag(args: string[], name: string, def: number): number {
  const v = takeFlag(args, name)
  if (v === undefined) return def
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

/**
 * stdin / ファイルから mutate 用 operations を読む
 */
function readMutateOperations(filePath: string): unknown[] {
  const raw =
    filePath === '-'
      ? fs.readFileSync(0, 'utf-8')
      : fs.readFileSync(path.resolve(filePath), 'utf-8')
  const parsed = JSON.parse(raw) as unknown
  if (Array.isArray(parsed)) return parsed
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { operations?: unknown }).operations)
  ) {
    return (parsed as { operations: unknown[] }).operations
  }
  throw new Error(
    'mutate: JSON は operations の配列、または { "operations": [...] } 形式にしてください'
  )
}

// =============================================================================
// エントリ
// =============================================================================

export async function runOcdToolCli(argv: string[]): Promise<void> {
  const { global, sub, rest } = parseGlobalAndSub(argv)

  if (global.help || sub === 'help' || sub === null) {
    if (sub === null && !global.help && argv.length > 0) {
      console.error('[OCD] 不明なサブコマンドです。')
    }
    printToolHelp()
    process.exit(sub === null && !global.help && argv.length > 0 ? 1 : 0)
  }

  let service: KnowledgeGraphService | null = null
  try {
    service = await createServiceForCli({
      cwd: global.cwd,
      storage: global.storage,
    })
    const blockWrites = global.readonly
    let result: unknown

    switch (sub) {
      case 'list-roots':
        result = await runOcdTool(
          service,
          'list_context_roots',
          {},
          { blockWrites }
        )
        break

      case 'get-contexts': {
        const patterns = collectMultiFlag(rest, '--patterns')
        if (patterns.length === 0) {
          throw new Error('get-contexts: --patterns を1つ以上指定してください')
        }
        const filter = takeFlag(rest, '--filter')
        const includeContent = hasFlag(rest, '--include-content')
        result = await runOcdTool(
          service,
          'get_contexts',
          { patterns, filter, includeContent },
          { blockWrites }
        )
        break
      }

      case 'get-tree': {
        const rootIds = collectMultiFlag(rest, '--root-ids')
        if (rootIds.length === 0) {
          throw new Error('get-tree: --root-ids を1つ以上指定してください')
        }
        const depth = parseIntFlag(rest, '--depth', NaN)
        const format = takeFlag(rest, '--format') as
          | 'json'
          | 'tree-text'
          | undefined
        const treeTextFormat = takeFlag(rest, '--tree-text-format')
        const maxNodes = parseIntFlag(rest, '--max-nodes', NaN)
        const args: Record<string, unknown> = { rootIds }
        if (Number.isFinite(depth)) args.depth = depth
        if (format === 'json' || format === 'tree-text') args.format = format
        if (treeTextFormat) args.treeTextFormat = treeTextFormat
        if (Number.isFinite(maxNodes)) args.maxNodes = maxNodes
        result = await runOcdTool(service, 'get_context_tree', args, {
          blockWrites,
        })
        break
      }

      case 'search': {
        const query = takeFlag(rest, '--query')
        if (!query) {
          throw new Error('search: --query を指定してください')
        }
        const scope = collectMultiFlag(rest, '--scope')
        result = await runOcdTool(
          service,
          'search_contexts',
          { query, scope: scope.length ? scope : undefined },
          { blockWrites }
        )
        break
      }

      case 'mutate': {
        const file = takeFlag(rest, '--file')
        if (!file) {
          throw new Error('mutate: --file <path> を指定してください（「-」で stdin）')
        }
        const operations = readMutateOperations(file)
        result = await runOcdTool(
          service,
          'mutate_context',
          { operations },
          { blockWrites }
        )
        break
      }

      case 'commit': {
        let message = takeFlag(rest, '--message')
        if (!message) {
          const mi = rest.indexOf('-m')
          if (mi >= 0 && rest[mi + 1]) message = rest[mi + 1]
        }
        if (!message) {
          throw new Error('commit: --message または -m を指定してください')
        }
        const paths = collectMultiFlag(rest, '--paths')
        result = await runOcdTool(
          service,
          'commit',
          { message, paths: paths.length ? paths : undefined },
          { blockWrites }
        )
        break
      }

      default:
        printToolHelp()
        process.exit(1)
    }

    console.log(JSON.stringify(result, null, 2))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[OCD] ${msg}`)
    process.exit(1)
  } finally {
    if (service) {
      await service.close().catch(() => {})
    }
  }
}
