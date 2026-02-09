/**
 * TreeBuilder - ツリー構造構築ユーティリティ
 *
 * 責務:
 * - フラットなノードリストを階層的なツリー構造に変換
 * - 中間ディレクトリの仮想ノード生成
 * - ツリーノードのソート
 *
 * Pure functions として実装し、テスト容易性を確保
 */
import type { ContextNodeSummary, TreeSortMode } from '@/types'

// =============================================================================
// 型定義
// =============================================================================

/**
 * ツリー構築時の内部ノード型（children を必須で持つ）
 */
type TreeNode = ContextNodeSummary & { children: ContextNodeSummary[] }

// =============================================================================
// ヘルパー関数
// =============================================================================

/**
 * パスを正規化する（xxx/index → xxx）
 *
 * index.md ファイルはディレクトリの代表として扱うため、
 * パスから /index サフィックスを削除
 */
export function normalizePath(path: string): string {
  return path.endsWith('/index') ? path.slice(0, -6) : path
}

/**
 * パスから親パスを取得
 */
export function getParentPath(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

/**
 * パスからディレクトリ名を取得
 */
export function getDirectoryName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

// =============================================================================
// メイン関数
// =============================================================================

/**
 * フラットなノードリストを階層的なツリー構造に変換
 *
 * @param flatNodes - APIから取得したフラットなノードリスト
 * @param rootId - Context Root の ID（このパス配下がツリーのルートになる）
 * @param sortMode - ソートモード（デフォルト: 'name-only'）
 * @returns 階層構造に変換されたノードリスト
 */
export function buildNestedTree(
  flatNodes: ContextNodeSummary[],
  rootId: string,
  sortMode: TreeSortMode = 'name-only'
): ContextNodeSummary[] {
  // ノードマップを作成（高速検索用）
  const nodeMap = createNodeMap(flatNodes)

  // 中間ディレクトリの仮想ノードを作成
  addVirtualNodes(nodeMap, flatNodes, rootId)

  // 親子関係を構築
  const rootNodes = buildParentChildRelations(nodeMap, rootId)

  // ソート
  sortNodesRecursively(rootNodes, sortMode)

  return rootNodes
}

/**
 * ノードマップを作成
 *
 * 正規化されたパスをキーとして、ノードを格納
 */
function createNodeMap(
  flatNodes: ContextNodeSummary[]
): Map<string, TreeNode> {
  const nodeMap = new Map<string, TreeNode>()

  for (const node of flatNodes) {
    const normalizedPath = normalizePath(node.path)
    nodeMap.set(normalizedPath, {
      ...node,
      children: [],
    })
  }

  return nodeMap
}

/**
 * 中間ディレクトリの仮想ノードを追加
 *
 * パスに含まれるが、実際のノードとして存在しないディレクトリを
 * 仮想ノードとして作成
 */
function addVirtualNodes(
  nodeMap: Map<string, TreeNode>,
  flatNodes: ContextNodeSummary[],
  rootId: string
): void {
  for (const node of flatNodes) {
    const normalizedPath = normalizePath(node.path)
    const pathParts = normalizedPath.split('/')

    // ルート ID からの相対パスの各階層をチェック
    for (let i = 1; i < pathParts.length; i++) {
      const intermediatePath = pathParts.slice(0, i).join('/')

      // ルート ID 自体や、それより短いパスはスキップ
      if (intermediatePath === rootId || intermediatePath.length <= rootId.length) {
        continue
      }

      // まだ存在しない場合は仮想ノードを作成
      if (!nodeMap.has(intermediatePath)) {
        const dirName = pathParts[i - 1]
        nodeMap.set(intermediatePath, {
          path: intermediatePath,
          title: dirName,
          attrs: {},
          childCount: 0,
          hasChildren: true,
          isVirtual: true,
          children: [],
        })
      }
    }
  }
}

/**
 * 親子関係を構築し、ルートノードを返す
 */
function buildParentChildRelations(
  nodeMap: Map<string, TreeNode>,
  rootId: string
): ContextNodeSummary[] {
  const rootNodes: ContextNodeSummary[] = []

  for (const [normalizedPath, currentNode] of nodeMap) {
    // 親パスを計算
    const parentPath = getParentPath(normalizedPath)

    // ルート ID 直下またはルート ID 自体の場合
    if (
      parentPath === rootId ||
      parentPath.length < rootId.length ||
      normalizedPath === rootId
    ) {
      // ルートノードとして追加（重複チェック）
      if (!rootNodes.includes(currentNode)) {
        rootNodes.push(currentNode)
      }
      continue
    }

    // 親ノードが存在するか確認
    const parentNode = nodeMap.get(parentPath)

    if (parentNode && parentPath !== normalizedPath) {
      // 親ノードに追加（重複チェック）
      if (!parentNode.children.includes(currentNode)) {
        parentNode.children.push(currentNode)
        parentNode.hasChildren = true
        parentNode.childCount = parentNode.children.length
      }
    } else {
      // 親が見つからない場合はルートに追加
      if (!rootNodes.includes(currentNode)) {
        rootNodes.push(currentNode)
      }
    }
  }

  return rootNodes
}

/**
 * パスからファイル/ディレクトリ名（最後のセグメント）を取得
 * ソートキーとして使用
 */
function getPathBasename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || ''
}

/**
 * ノードを再帰的にソート
 *
 * ソートモード:
 * - 'name-only': 完全にパス名順（Dir/File 区別なし）
 * - 'folders-first': フォルダを先に表示してからパス名順
 *
 * 注意: タイトルではなく、パスの最後のセグメント（ファイル/ディレクトリ名）でソート
 * これにより 001_xxx, 002_yyy のような番号付きファイル名が正しい順序になる
 *
 * @param nodes - ソート対象のノード配列
 * @param sortMode - ソートモード
 */
function sortNodesRecursively(
  nodes: ContextNodeSummary[],
  sortMode: TreeSortMode
): void {
  nodes.sort((a, b) => {
    // folders-first モードの場合のみ、フォルダを先に
    if (sortMode === 'folders-first') {
      const aHasChildren = a.hasChildren || (a.children && a.children.length > 0)
      const bHasChildren = b.hasChildren || (b.children && b.children.length > 0)

      if (aHasChildren && !bHasChildren) return -1
      if (!aHasChildren && bHasChildren) return 1
    }

    // パス名（ファイル/ディレクトリ名）順でソート
    // 例: 001_overview, 002_challenges の順序を維持
    const aName = getPathBasename(a.path)
    const bName = getPathBasename(b.path)
    return aName.localeCompare(bName, 'ja')
  })

  // 再帰的に子ノードもソート
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      sortNodesRecursively(node.children, sortMode)
    }
  }
}

/**
 * ツリー内のすべてのノードパスを収集
 *
 * expandAll 用のユーティリティ
 */
export function collectAllExpandablePaths(nodes: ContextNodeSummary[]): Set<string> {
  const paths = new Set<string>()

  const collect = (nodeList: ContextNodeSummary[]): void => {
    for (const node of nodeList) {
      if (node.children && node.children.length > 0) {
        paths.add(node.path)
        collect(node.children)
      }
    }
  }

  collect(nodes)
  return paths
}

/**
 * 指定パスまでの親パスをすべて取得
 *
 * expandToPath 用のユーティリティ
 */
export function getAncestorPaths(path: string): string[] {
  const parts = path.split('/')
  const ancestors: string[] = []

  for (let i = 1; i < parts.length; i++) {
    ancestors.push(parts.slice(0, i).join('/'))
  }

  return ancestors
}
