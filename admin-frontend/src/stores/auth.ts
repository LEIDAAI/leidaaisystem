import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiLogin, apiLogout, apiMe } from '@/api/auth'
import { ApiError } from '@/api/request'
import type { AdminInfo, LoginResult } from '@/api/types'
import { readStoredToken, writeStoredToken, clearStoredToken } from '@/utils/token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(readStoredToken())
  const admin = ref<AdminInfo | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<string[]>([])
  const ready = ref(false)
  let restoring: Promise<void> | null = null

  function hasPerm(code: string): boolean { return permissions.value.includes(code) }
  function persist(): void { writeStoredToken(token.value) }
  function setSession(result: LoginResult): void {
    token.value = result.token
    admin.value = result.admin
    roles.value = result.roles
    permissions.value = result.permissions
    ready.value = true
    persist()
  }
  async function login(username: string, password: string): Promise<void> { setSession(await apiLogin(username, password)) }
  function clearSession(): void {
    token.value = ''
    admin.value = null
    roles.value = []
    permissions.value = []
    ready.value = false
    clearStoredToken()
  }
  async function refreshSession(): Promise<void> {
    if (!token.value) return
    const session = await apiMe()
    admin.value = session.admin
    roles.value = session.roles
    permissions.value = session.permissions
    ready.value = true
  }
  async function restore(): Promise<void> {
    if (ready.value || !token.value) return
    // 仅 401（会话失效）清除会话；网络异常等保留 token，下次导航自动重试
    if (!restoring) restoring = refreshSession().catch((e) => { if (e instanceof ApiError && e.code === 401) clearSession() }).finally(() => { restoring = null })
    await restoring
  }
  async function logout(): Promise<void> {
    try { await apiLogout() } catch { /* 本地退出始终完成 */ }
    clearSession()
  }
  return { token, admin, roles, permissions, ready, hasPerm, login, logout, setSession, clearSession, restore, refreshSession }
})
