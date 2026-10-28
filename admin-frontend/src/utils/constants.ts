/** 会话在 localStorage 中的持久化 key（auth store 与 request 模块共用） */
export const AUTH_STORAGE_KEY = 'leida-admin-auth'

/** 契约基础路径 */
export const API_BASE = import.meta.env.VITE_API_BASE || '/admin/api'

/** 是否启用前端 mock（axios 自定义 adapter） */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false'
