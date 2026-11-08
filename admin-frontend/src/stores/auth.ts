import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiLogin, apiLogout, apiMe } from '@/api/auth'
import { ApiError } from '@/api/request'
import type { AdminInfo, LoginResult, SessionInfo } from '@/api/types'
import {
  captureSession, isSessionCurrent, subscribeSession, writeStoredToken, clearStoredToken,
  broadcastPermissionsChanged, PERMISSIONS_STORAGE_KEY, markSessionReady
} from '@/utils/token'

export const useAuthStore = defineStore('auth', () => {
  const initial = captureSession()
  const token = ref(initial.token)
  const sessionVersion = ref(initial.version)
  const permissionVersion = ref(0)
  const admin = ref<AdminInfo | null>(null)
  const roles = ref<string[]>([])
  const permissions = ref<string[]>([])
  const ready = ref(false)
  const restoring = ref(false)
  const restoreError = ref('')
  let pending: Promise<void> | null = null
  let refreshVersion = 0
  let loginVersion = 0

  subscribeSession((session) => {
    token.value = session.token
    sessionVersion.value = session.version
    admin.value = null
    roles.value = []
    permissions.value = []
    ready.value = false
    restoreError.value = ''
    restoring.value = false
    pending = null
    refreshVersion++
    loginVersion++
  })

  function hasPerm(code: string): boolean { return ready.value && permissions.value.includes(code) }
  function applyIdentity(session: SessionInfo): void {
    const previous = JSON.stringify([admin.value?.id, roles.value, permissions.value])
    admin.value = session.admin
    roles.value = [...session.roles]
    permissions.value = [...session.permissions]
    if (previous !== JSON.stringify([admin.value.id, roles.value, permissions.value])) permissionVersion.value++
    markSessionReady(true)
    ready.value = true
    restoreError.value = ''
  }
  function setSession(result: LoginResult): void {
    writeStoredToken(result.token)
    applyIdentity(result)
  }
  async function login(username: string, password: string): Promise<void> {
    const session = captureSession()
    const attempt = ++loginVersion
    const result = await apiLogin(username, password)
    if (attempt !== loginVersion || !isSessionCurrent(session)) throw new ApiError(-2, '会话已变化，请重新登录')
    setSession(result)
  }
  function clearSession(): void { clearStoredToken() }

  async function refreshSession(force = false): Promise<void> {
    const session = captureSession()
    if (!session.token) return
    if (pending && !force) return pending
    const requestVersion = ++refreshVersion
    restoring.value = true
    restoreError.value = ''
    const task = (async () => {
      try {
        const identity = await apiMe()
        if (requestVersion === refreshVersion && isSessionCurrent(session)) applyIdentity(identity)
      } catch (error) {
        if (requestVersion !== refreshVersion || !isSessionCurrent(session)) return
        if (error instanceof ApiError && error.code === 401) clearSession()
        else {
          markSessionReady(false)
          ready.value = false
          restoreError.value = '身份信息加载失败，请检查网络后重试。'
        }
        throw error
      } finally {
        if (requestVersion === refreshVersion) {
          restoring.value = false
          pending = null
        }
      }
    })()
    pending = task
    return task
  }
  async function restore(force = false): Promise<void> {
    captureSession()
    if (!token.value || (ready.value && !force)) return
    await refreshSession()
  }
  async function refreshPermissions(): Promise<void> {
    broadcastPermissionsChanged()
    await refreshSession(true)
  }
  window.addEventListener('storage', (event) => {
    if (event.key === PERMISSIONS_STORAGE_KEY && token.value) void refreshSession(true).catch(() => {})
  })
  async function logout(): Promise<void> {
    const session = captureSession()
    try { await apiLogout() } catch { /* 本地退出始终完成。 */ }
    if (isSessionCurrent(session)) clearSession()
  }
  return {
    token, admin, roles, permissions, ready, restoring, restoreError, sessionVersion, permissionVersion,
    hasPerm, login, logout, setSession, clearSession, restore, refreshSession, refreshPermissions
  }
})
