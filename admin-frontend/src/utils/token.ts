import { AUTH_STORAGE_KEY } from './constants'

/**
 * 本地会话 token 编解码：前缀式 btoa 弱混淆，避免 token 明文裸存 localStorage。
 * 兼容历史明文格式：读到明文时原样返回并自动升级为混淆存储。
 */

function encodeToken(token: string): string {
  try { return 'enc:' + btoa(encodeURIComponent(token)) } catch { return token }
}

function decodeToken(raw: string): string {
  try {
    if (raw.startsWith('enc:')) return decodeURIComponent(atob(raw.slice(4)))
    return raw // 旧明文兼容
  } catch { return '' }
}

/** 读取本地会话 token（旧明文自动升级混淆存储；损坏按未登录处理） */
export function readStoredToken(): string {
  let raw = ''
  try { raw = localStorage.getItem(AUTH_STORAGE_KEY) || '' } catch { return '' }
  if (!raw) return ''
  const token = decodeToken(raw)
  if (token && !raw.startsWith('enc:')) writeStoredToken(token)
  return token
}

/** 写入本地会话 token（混淆存储） */
export function writeStoredToken(token: string): void {
  try { localStorage.setItem(AUTH_STORAGE_KEY, encodeToken(token)) } catch { /* 写入失败忽略 */ }
}

/** 清除本地会话 */
export function clearStoredToken(): void {
  try { localStorage.removeItem(AUTH_STORAGE_KEY) } catch { /* 忽略 */ }
}
