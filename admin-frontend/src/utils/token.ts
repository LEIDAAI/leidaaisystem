import { AUTH_STORAGE_KEY } from './constants'

function encodeToken(token: string): string {
  try { return 'enc:' + btoa(encodeURIComponent(token)) } catch { return token }
}

function decodeToken(raw: string): string {
  try { return raw.startsWith('enc:') ? decodeURIComponent(atob(raw.slice(4))) : raw } catch { return '' }
}

/** 保留历史存储格式兼容；编码仅为混淆，不是加密。 */
export function readStoredToken(): string {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY) || ''
    const token = decodeToken(raw)
    if (token && !raw.startsWith('enc:')) localStorage.setItem(AUTH_STORAGE_KEY, encodeToken(token))
    return token
  } catch { return '' }
}

export interface SessionSnapshot { token: string; version: number }
const revisionKey = `${AUTH_STORAGE_KEY}:revision`
export const PERMISSIONS_STORAGE_KEY = `${AUTH_STORAGE_KEY}:permissions`
function readRevision(): string {
  try { return localStorage.getItem(revisionKey) || '' } catch { return '' }
}
let currentToken = readStoredToken()
let revision = readRevision()
let version = 0
let identityVersion = -1
const listeners = new Set<(session: SessionSnapshot) => void>()

function notify(): void {
  version++
  const session = { token: currentToken, version }
  listeners.forEach(listener => listener(session))
}

/** 请求和身份状态使用同一个快照，发现跨标签变化先使旧页面失效。 */
export function captureSession(): SessionSnapshot {
  let storedToken: string
  let storedRevision: string
  try {
    storedToken = decodeToken(localStorage.getItem(AUTH_STORAGE_KEY) || '')
    storedRevision = localStorage.getItem(revisionKey) || ''
  } catch { return { token: currentToken, version } }
  if (storedToken !== currentToken || storedRevision !== revision) {
    currentToken = storedToken
    revision = storedRevision
    notify()
  }
  return { token: currentToken, version }
}

export function isSessionCurrent(session: SessionSnapshot): boolean {
  const current = captureSession()
  return session.version === current.version && session.token === current.token
}

export function markSessionReady(ready: boolean): void {
  identityVersion = ready ? captureSession().version : -1
}

export function isSessionReady(session: SessionSnapshot): boolean {
  return isSessionCurrent(session) && identityVersion === session.version
}

export function subscribeSession(listener: (session: SessionSnapshot) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function writeStoredToken(token: string): void {
  const nextRevision = `${Date.now()}:${Math.random()}`
  try {
    if (token) localStorage.setItem(AUTH_STORAGE_KEY, encodeToken(token))
    else localStorage.removeItem(AUTH_STORAGE_KEY)
    localStorage.setItem(revisionKey, nextRevision)
  } catch { /* 存储不可用时保持当前标签页会话。 */ }
  currentToken = token
  revision = readRevision()
  notify()
}

export function clearStoredToken(): void { writeStoredToken('') }

export function broadcastPermissionsChanged(): void {
  try { localStorage.setItem(PERMISSIONS_STORAGE_KEY, `${Date.now()}:${Math.random()}`) } catch { /* 当前标签页仍会刷新。 */ }
}

window.addEventListener('storage', (event) => {
  if (event.key === AUTH_STORAGE_KEY || event.key === revisionKey || event.key === null) captureSession()
})
