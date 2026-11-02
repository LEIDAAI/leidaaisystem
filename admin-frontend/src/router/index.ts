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
        meta: { title: '仪表盘', perm: 'dashboard:view' }
      },
      {
        path: 'users',
        name: 'users',
        component: () => import('@/views/users/UsersView.vue'),
        meta: { title: '用户管理', perm: 'user:view' }
      },
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/orders/OrdersView.vue'),
        meta: { title: '订单管理', perm: 'order:view' }
      },
      {
        path: 'plans',
        name: 'plans',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '套餐管理', perm: 'plan:view' }
      },
      {
        path: 'experts',
        name: 'experts',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '专家管理', perm: 'expert:view' }
      },
      {
        path: 'skills',
        name: 'skills',
        component: () => import('@/views/SkillsView.vue'),
        meta: { title: '技能管理', perm: 'skill:view' }
      },
      {
        path: 'mcp',
        name: 'mcp',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: 'MCP管理', perm: 'mcp:view' }
      },
      {
        path: 'knowledge',
        name: 'knowledge',
        component: () => import('@/views/KnowledgeView.vue'),
        meta: { title: '知识库管理', perm: 'knowledge:view' }
      },
      {
        path: 'models',
        name: 'models',
        component: () => import('@/views/ConfigView.vue'),
        meta: { title: '模型管理', perm: 'model:view' }
      },
      {
        path: 'chats',
        name: 'chats',
        component: () => import('@/views/ChatsView.vue'),
        meta: { title: '对话管理', perm: 'chat:view' }
      },
      {
        path: 'admins',
        name: 'admins',
        component: () => import('@/views/admins/AdminsView.vue'),
        meta: { title: '管理员账号', perm: 'admin:manage' }
      },
      {
        path: 'roles',
        name: 'roles',
        component: () => import('@/views/roles/RolesView.vue'),
        meta: { title: '角色权限', perm: 'role:manage' }
      },
      {
        path: 'audit-logs',
        name: 'audit-logs',
        component: () => import('@/views/AuditView.vue'),
        meta: { title: '审计日志', perm: 'audit:view' }
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
  document.title = to.meta.title ? `${to.meta.title} - 雷达AI管理后台` : '雷达AI管理后台'
  const auth = useAuthStore()
  // 会话恢复仅在首次（restore 内部已去重）；不再每次导航刷 /me，避免网络抖动被误踢下线
  if (!to.meta.public) await auth.restore()
  if (to.meta.public) {
    if (auth.token && to.path === '/login') return { path: '/' }
    return true
  }
  if (!auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/dashboard' && !auth.hasPerm('dashboard:view')) {
    const first = [{ path: '/users', perm: 'user:view' }, { path: '/orders', perm: 'order:view' }, { path: '/admins', perm: 'admin:manage' }, { path: '/chats', perm: 'chat:view' }, { path:'/plans',perm:'plan:view' }, { path:'/experts',perm:'expert:view' }, {path:'/skills',perm:'skill:view'}, {path:'/mcp',perm:'mcp:view'}, {path:'/knowledge',perm:'knowledge:view'}, {path:'/models',perm:'model:view'}, {path:'/audit-logs',perm:'audit:view'}].find(item => auth.hasPerm(item.perm))
    return { path: first?.path || '/403' }
  }
  const perm = to.meta.perm
  if (perm && !auth.hasPerm(perm)) {
    return { path: '/403' }
  }
  return true
})

export default router
