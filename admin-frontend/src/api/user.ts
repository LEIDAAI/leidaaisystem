import { get, put } from './request'
import type { EntitlementPayload, PageData, UserDetail, UserItem, UserQuery } from './types'

export function listUsers(params: UserQuery): Promise<PageData<UserItem>> {
  return get<PageData<UserItem>>('/users', params)
}

export function getUserDetail(id: number): Promise<UserDetail> {
  return get<UserDetail>(`/users/${id}`)
}

export function updateUserStatus(id: number, banned: true, reason: string): Promise<null> {
  if (banned !== true) return Promise.reject(new Error('仅支持封禁用户'))
  return put<null>(`/users/${id}/status`, { banned, reason })
}

export function updateUserEntitlements(id: number, items: EntitlementPayload[]): Promise<null> {
  return put<null>(`/users/${id}/entitlements`, items)
}
