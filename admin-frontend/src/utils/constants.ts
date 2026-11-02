/** 会话在 localStorage 中的持久化 key（auth store 与 request 模块共用） */
export const AUTH_STORAGE_KEY = 'leida-admin-auth'

/** 契约基础路径 */
export const API_BASE = import.meta.env.VITE_API_BASE || '/admin/api'

/** 是否启用前端 mock（axios 自定义 adapter） */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'

// 生产构建误开 mock 时给出明显提示（mock 数据仅存浏览器本地，不代表真实业务）
if (import.meta.env.PROD && USE_MOCK) {
  console.warn('[admin-frontend] 生产构建启用了本地 Mock 数据：请设置 VITE_USE_MOCK=false 并对接真实后端')
}
