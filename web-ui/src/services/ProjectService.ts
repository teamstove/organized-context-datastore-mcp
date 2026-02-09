/**
 * ProjectService - プロジェクト管理サービス
 *
 * 責務:
 * - プロジェクト一覧の管理
 * - 現在選択中のプロジェクトの管理
 * - プロジェクトの CRUD 操作
 *
 * LocalStorage 操作は StorageHelper に委譲
 */
import { reactive, readonly, type InjectionKey, type DeepReadonly } from 'vue'
import type { OcdProject } from '@/types'
import type { ApiClient } from './ApiClient'
import { loadString, saveString } from '@/utils/StorageHelper'

// =============================================================================
// 定数
// =============================================================================

const STORAGE_KEY_PROJECTS = 'ocd-projects'
const STORAGE_KEY_CURRENT = 'ocd-current-project'

// =============================================================================
// ストレージヘルパー関数（配列用）
// =============================================================================

/**
 * プロジェクト一覧を LocalStorage から読み込み
 */
function loadProjectsFromStorage(): OcdProject[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PROJECTS)
    if (!stored) return []
    return JSON.parse(stored) as OcdProject[]
  } catch (error) {
    console.error('[ProjectService] Failed to load projects:', error)
    return []
  }
}

/**
 * プロジェクト一覧を LocalStorage に保存
 */
function saveProjectsToStorage(projects: OcdProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projects))
  } catch (error) {
    console.error('[ProjectService] Failed to save projects:', error)
  }
}

// =============================================================================
// State 型定義
// =============================================================================

export interface ProjectServiceState {
  /** プロジェクト一覧 */
  projects: OcdProject[]
  /** 現在選択中のプロジェクト */
  currentProject: OcdProject | null
  /** 読み込み中フラグ */
  isLoading: boolean
  /** エラーメッセージ */
  error: string | null
}

// =============================================================================
// ProjectService クラス
// =============================================================================

export class ProjectService {
  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _state = reactive<ProjectServiceState>({
    projects: [],
    currentProject: null,
    isLoading: false,
    error: null,
  })

  private apiClient: ApiClient

  // ---------------------------------------------------------------------------
  // Public State (readonly)
  // ---------------------------------------------------------------------------

  readonly state: DeepReadonly<ProjectServiceState> = readonly(this._state)

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
  }

  // ---------------------------------------------------------------------------
  // Actions - Load
  // ---------------------------------------------------------------------------

  /**
   * プロジェクト一覧を読み込み
   */
  loadProjects(): void {
    try {
      this._state.projects = loadProjectsFromStorage()

      // 前回選択していたプロジェクトを復元
      const currentId = loadString(STORAGE_KEY_CURRENT)
      if (currentId) {
        const current = this._state.projects.find((p) => p.id === currentId)
        if (current) {
          this._state.currentProject = current
        }
      }
    } catch (error) {
      console.error('[ProjectService] Failed to load projects:', error)
      this._state.error = 'プロジェクトの読み込みに失敗しました'
    }
  }

  // ---------------------------------------------------------------------------
  // Actions - CRUD
  // ---------------------------------------------------------------------------

  /**
   * プロジェクトを追加
   */
  async addProject(project: Omit<OcdProject, 'id' | 'lastAccessed'>): Promise<OcdProject> {
    const newProject: OcdProject = {
      ...project,
      id: this.generateId(),
      lastAccessed: new Date().toISOString(),
    }

    // バリデーション: 接続テスト
    if (project.mode === 'local' && project.basePath) {
      try {
        this._state.isLoading = true
        this._state.error = null

        // API 経由で接続テスト（Context Roots を取得できるか）
        await this.apiClient.listRoots(project.basePath)
      } catch (error) {
        this._state.error = `接続テストに失敗しました: ${(error as Error).message}`
        throw error
      } finally {
        this._state.isLoading = false
      }
    }

    this._state.projects.push(newProject)
    this.saveProjects()

    return newProject
  }

  /**
   * プロジェクトを選択
   */
  async selectProject(id: string): Promise<void> {
    const project = this._state.projects.find((p) => p.id === id)
    if (!project) {
      this._state.error = 'プロジェクトが見つかりません'
      return
    }

    // 最終アクセス日時を更新
    project.lastAccessed = new Date().toISOString()
    this._state.currentProject = project

    saveString(STORAGE_KEY_CURRENT, id)
    this.saveProjects()

    // Remote モードの場合は API ベース URL を更新
    if (project.mode === 'remote' && project.serverUrl) {
      this.apiClient.setBaseUrl(`${project.serverUrl}/api/ocd`)
    } else {
      // Local モードの場合はデフォルトに戻す
      this.apiClient.setBaseUrl('/api/ocd')
    }
  }

  /**
   * プロジェクトを更新
   */
  updateProject(id: string, updates: Partial<OcdProject>): void {
    const index = this._state.projects.findIndex((p) => p.id === id)
    if (index === -1) {
      this._state.error = 'プロジェクトが見つかりません'
      return
    }

    this._state.projects[index] = {
      ...this._state.projects[index],
      ...updates,
    }

    // 現在選択中のプロジェクトの場合は更新
    if (this._state.currentProject?.id === id) {
      this._state.currentProject = this._state.projects[index]
    }

    this.saveProjects()
  }

  /**
   * プロジェクトを削除
   */
  removeProject(id: string): void {
    const index = this._state.projects.findIndex((p) => p.id === id)
    if (index === -1) {
      return
    }

    this._state.projects.splice(index, 1)

    // 現在選択中のプロジェクトを削除した場合はクリア
    if (this._state.currentProject?.id === id) {
      this._state.currentProject = null
      try {
        localStorage.removeItem(STORAGE_KEY_CURRENT)
      } catch {
        // ignore
      }
    }

    this.saveProjects()
  }

  // ---------------------------------------------------------------------------
  // Actions - Error
  // ---------------------------------------------------------------------------

  /**
   * エラーをクリア
   */
  clearError(): void {
    this._state.error = null
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /**
   * 現在のプロジェクトの cwd を取得
   */
  getCurrentCwd(): string | null {
    const project = this._state.currentProject
    if (!project) return null

    if (project.mode === 'local') {
      return project.basePath || null
    }

    // Remote モードの場合は cwd は不要（サーバー側で解決）
    return null
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * プロジェクト一覧を保存
   */
  private saveProjects(): void {
    saveProjectsToStorage(this._state.projects)
  }

  /**
   * ユニーク ID を生成
   */
  private generateId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  }
}

// =============================================================================
// Injection Key
// =============================================================================

export const projectServiceKey: InjectionKey<ProjectService> = Symbol('ProjectService')
