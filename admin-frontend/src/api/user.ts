import { get, put } from './request'
import type { EntitlementPayload, MembershipInfo, PageData, UserDetail, UserItem, UserQuery } from './types'

/** 会员状态由服务端显式返回；旧接口缺失时展示未知，不以空日期推断终身。 */
export type UserWithMembership = UserItem & { membership?: MembershipInfo }
export type UserDetailWithMembership = Omit<UserDetail, 'plan'> & {
  membership?: MembershipInfo
  plan: UserDetail['plan'] & { membership?: MembershipInfo }
}

export function listUsers(params: UserQuery): Promise<PageData<UserWithMembership>> {
  return get<PageData<UserWithMembership>>('/users', params)
}

export function getUserDetail(id: number): Promise<UserDetailWithMembership> {
  return get<UserDetailWithMembership>(`/users/${id}`)
}

/** 封禁：数据冻结、无法登录；解封：恢复登录并按冻结时长顺延会员到期（拍板规则，Mock 已实现冻结期顺延）。 */
export function updateUserStatus(id: number, banned: boolean, reason: string): Promise<null> {
  return put<null>(`/users/${id}/status`, { banned, reason })
}

export function updateUserEntitlements(id: number, items: EntitlementPayload[]): Promise<null> {
  return put<null>(`/users/${id}/entitlements`, items)
}
