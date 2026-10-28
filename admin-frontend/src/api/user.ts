import { get, put } from './request'
import type { EntitlementPayload, PageData, UserDetail, UserItem, UserQuery } from './types'

export function listUsers(params: UserQuery): Promise<PageData<UserItem>> {
  return get<PageData<UserItem>>('/users', params)
}

export function getUserDetail(id: number): Promise<UserDetail> {
  return get<UserDetail>(`/users/${id}`)
}

export function updateUserStatus(id: number, banned: boolean, reason: string): Promise<null> {
  return put<null>(`/users/${id}/status`, { banned, reason })
}

export function updateUserEntitlements(id: number, items: EntitlementPayload[]): Promise<null> {
  return put<null>(`/users/${id}/entitlements`, items)
}
