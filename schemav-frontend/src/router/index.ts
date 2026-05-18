import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * LiteBoard Router — 全栈路由配置
 *
 * / 或 /projects → TaskHubView（任务大厅）
 * /editor/:taskId → EditorView（大屏编辑器）
 */

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'taskHub',
    component: () => import('../views/TaskHubView'),
  },
  {
    path: '/projects',
    redirect: '/',
  },
  {
    path: '/editor/:taskId',
    name: 'editor',
    component: () => import('../views/EditorView'),
    props: true,
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
