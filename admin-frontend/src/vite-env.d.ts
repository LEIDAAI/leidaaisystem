/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK: string
  readonly VITE_API_BASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题（用于菜单/面包屑） */
    title?: string
    /** 访问该路由所需的权限点 */
    permission?: string
    perm?: string
    public?: boolean
    placeholder?: boolean
    /** 是否在菜单中隐藏（如详情页） */
    hidden?: boolean
  }
}
