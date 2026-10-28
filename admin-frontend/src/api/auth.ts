import { get, post } from './request'
import type { LoginResult, SessionInfo } from './types'

export function apiLogin(username: string, password: string): Promise<LoginResult> {
  return post<LoginResult>('/auth/login', { username, password })
}

export function apiLogout(): Promise<null> {
  return post<null>('/auth/logout')
}

/** 页面刷新时恢复会话（token 由请求拦截器自动携带） */
export function apiMe(): Promise<SessionInfo> {
  return get<SessionInfo>('/auth/me')
}
