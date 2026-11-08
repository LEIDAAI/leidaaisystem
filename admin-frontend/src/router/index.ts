import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuthStore } from '@/stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    component: AdminLayout,
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
        meta: { title: '工作概览', perm: 'dashboard:view', menuGroup: '业务运营', menuOrder: 0 }
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/users/UsersView.vue'),
        meta: { title: '用户管理', perm: 'user:view', menuGroup: '业务运营', menuOrder: 1 }
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/orders/OrdersView.vue'),
        meta: { title: '订单管理', perm: 'order:view', menuGroup: '业务运营', menuOrder: 2 }
      },
      {
        path: 'plans',
        name: 'plans',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '套餐管理', perm: 'plan:view', menuGroup: '商品计费', menuOrder: 20 }
      },
      {
        path: 'credit-packages',
        name: 'credit-packages',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '积分加油包', perm: 'plan:view', menuGroup: '商品计费', menuOrder: 21 }
      },
      {
        path: 'billing-settings',
        name: 'billing-settings',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '计费设置', perm: 'plan:view', menuGroup: '商品计费', menuOrder: 22 }
      },
      {
        path: 'experts',
        name: 'experts',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '专家管理', perm: 'expert:view', menuGroup: 'AI 资源', menuOrder: 10 }
      },
      {
        path: 'skills',
        name: 'skills',
        component: () => import('@/views/SkillsView.vue'),
        meta: { title: '技能管理', perm: 'skill:view', menuGroup: 'AI 资源', menuOrder: 11 }
      },
      {
        path: 'mcp',
        name: 'mcp',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: 'MCP 服务', perm: 'mcp:view', menuGroup: 'AI 资源', menuOrder: 12 }
      },
      {
        path: 'knowledge',
        name: 'knowledge',
        component: () => import('@/views/KnowledgeView.vue'),
        meta: { title: '知识库管理', perm: 'knowledge:view', menuGroup: 'AI 资源', menuOrder: 13 }
      },
      {
        path: 'models',
        name: 'models',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '模型管理', perm: 'model:view', menuGroup: 'AI 资源', menuOrder: 14 }
      },
      {
        path: 'chats',
        name: 'chats',
        component: () => import('@/views/ChatsView.vue'),
        meta: { title: '对话管理', perm: 'chat:view', menuGroup: '业务运营', menuOrder: 3 }
      },
      {
        path: 'feedback',
        name: 'feedback',
        component: () => import('@/views/feedback/FeedbackView.vue'),
        meta: { title: '反馈管理', perm: 'feedback:view', menuGroup: '业务运营', menuOrder: 4 }
      },
      {
        path: 'admins',
        name: 'admins',
        component: () => import('@/views/admins/AdminsView.vue'),
        meta: { title: '管理员账号', perm: 'admin:manage', menuGroup: '系统设置', menuOrder: 30 }
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('@/views/roles/RolesView.vue'),
        meta: { title: '角色与权限', perm: 'role:manage', menuGroup: '系统设置', menuOrder: 31 }
      },
      {
        path: '403',
        name: 'forbidden',
        component: () => import('@/views/ForbiddenView.vue'),
        meta: { title: '无权限' }
      },
      {
        path: '404',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
        meta: { title: '页面不存在' }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/404' }
]

const router = createRouter({
  // hash 路由：静态托管（GitHub Pages 子路径）下刷新/深链接不 404
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to) => {
  document.title = to.meta.title ? `${to.meta.title} - 店雷达管理系统` : '店雷达管理系统'
  const auth = useAuthStore()
  // 每次导航校验外部撤权；网络失败保留 token，由布局展示重试。
  try { await auth.restore(!to.meta.public) } catch { /* 恢复失败与无权限分别展示。 */ }
  if (to.meta.public) {
    if (auth.token && to.path === '/login') return { path: '/' }
    return true
  }
  if (!auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (!auth.ready) return true
  if (to.path === '/dashboard' && !auth.hasPerm('dashboard:view')) {
    const first = router.getRoutes()
      .filter(item => item.meta.menuGroup && item.meta.perm && auth.hasPerm(String(item.meta.perm)))
      .sort((a, b) => Number(a.meta.menuOrder) - Number(b.meta.menuOrder))[0]
    return { path: first?.path || '/403' }
  }
  const perm = to.meta.perm
  if (perm && !auth.hasPerm(perm)) {
    return { path: '/403' }
  }
  return true
})

export default router
