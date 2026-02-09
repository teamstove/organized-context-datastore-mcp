/**
 * Vue Router 設定
 *
 * OCD Browser のルーティング定義
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: {
      title: 'プロジェクト選択',
    },
  },
  {
    path: '/browser/:projectId?',
    name: 'browser',
    component: () => import('@/views/BrowserView.vue'),
    meta: {
      title: 'ブラウザ',
    },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// ページタイトルの更新
router.beforeEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} - OCD Browser` : 'OCD Browser'
})
