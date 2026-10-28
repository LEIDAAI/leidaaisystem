import { del, get, post, put } from './request'
import type {
  AdminCreatePayload,
  AdminItem,
  AdminQuery,
  AdminUpdatePayload,
  PageData,
  PermissionModule,
  RoleItem,
  RolePayload
} from './types'

// -------------------------------------------------- 管理员账号
export function listAdmins(params: AdminQuery): Promise<PageData<AdminItem>> {
  return get<PageData<AdminItem>>('/admins', params)
}

export function createAdmin(payload: AdminCreatePayload): Promise<null> {
  return post<null>('/admins', payload)
}

export function updateAdmin(id: number, payload: AdminUpdatePayload): Promise<null> {
  return put<null>(`/admins/${id}`, payload)
}

export function updateAdminStatus(id: number, status: number): Promise<null> {
  return put<null>(`/admins/${id}/status`, { status })
}

export function resetAdminPassword(id: number, password: string): Promise<null> {
  return put<null>(`/admins/${id}/password`, { password })
}

export function deleteAdmin(id: number): Promise<null> {
  return del<null>(`/admins/${id}`)
}

// -------------------------------------------------- 角色
export function listRoles(): Promise<RoleItem[]> {
  return get<RoleItem[]>('/roles')
}

export function createRole(payload: RolePayload): Promise<null> {
  return post<null>('/roles', payload)
}

export function updateRole(id: number, payload: RolePayload): Promise<null> {
  return put<null>(`/roles/${id}`, payload)
}

export function updateRoleStatus(id: number, status: number): Promise<null> {
  return put<null>(`/roles/${id}/status`, { status })
}

export function deleteRole(id: number): Promise<null> {
  return del<null>(`/roles/${id}`)
}

// -------------------------------------------------- 权限点字典（按 module 分组）
export function listPermissions(): Promise<PermissionModule[]> {
  return get<PermissionModule[]>('/permissions')
}
