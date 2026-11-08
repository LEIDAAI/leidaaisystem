import dayjs from 'dayjs'
import { formatOrderExpiry, formatOrderDuration, isValidMoney } from '../../utils/format'
import { createExcelBlob, excelDateTime, type ExcelColumn } from '../../utils/excel'
import { registerConfigHandlers, validateEntitlements } from './config-handlers'
import { registerOperationsHandlers } from './operations-handlers'
import { registerWorkspaceHandlers } from './workspace-handlers'
import { redact } from './extension-data'

import type { InternalAxiosRequestConfig } from 'axios'

import type { ApiResponse } from '../types'
import { API_BASE } from '../../utils/constants'
import {
  db,
  MOCK_TOKEN_TTL_MS,
  nextMockId,
  nowStr,
  permissionCodesOf,
  persistMockDB,
  readMockMembership,
  readMockOrderExpiry,
  roleRefsOf,
  type MockAdmin,
  type MockFeedback,
  type MockOrder,
  type MockUser
} from './db'

/** mock 业务错误：以契约错误码抛出，统一包装为 {code, msg} 响应 */
export class MockApiError extends Error {
  code: number

  constructor(code: number, msg: string) {
    super(msg)
    this.code = code
    this.name = 'MockApiError'
  }
}

interface MockContext {
  params: Record<string, string>
  query: Record<string, unknown>
  body: unknown
  /** 已登录管理员的 id，未登录时为 0 */
  adminId: number
  token: string
}

type Handler = (ctx: MockContext) => unknown

interface RouteDef {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

const routes: RouteDef[] = []

function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = []
  const pattern = new RegExp(
    '^' +
      path.replace(/:([A-Za-z0-9_]+)/g, (_m: string, k: string) => {
        keys.push(k)
        return '([^/]+)'
      }) +
      '$'
  )
  routes.push({ method, pattern, keys, handler })
}

// ------------------------------------------------------------------ 通用工具
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function paginate<T>(list: T[], query: Record<string, unknown>): { total: number; list: T[] } {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  return { total: list.length, list: list.slice((page - 1) * pageSize, page * pageSize) }
}

function qStr(query: Record<string, unknown>, key: string): string {
  const v = query[key]
  return v === undefined || v === null ? '' : String(v)
}

function qNum(query: Record<string, unknown>, key: string): number | '' {
  const v = query[key]
  if (v === undefined || v === null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? n : ''
}

function findOr404<T extends { id: number }>(list: T[], id: string, label = '记录'): T {
  const item = list.find((x) => x.id === Number(id))
  if (!item) throw new MockApiError(404, `${label}不存在或已删除`)
  return item
}

function assertPerm(ctx: MockContext, code: string): void {
  if (!permissionCodesOf(ctx.adminId).includes(code)) {
    throw new MockApiError(403, '无权限执行该操作')
  }
}

function isSuperAdmin(adminId: number): boolean {
  const admin = db.admins.find(a => a.id === adminId)
  return !!admin && db.roles.some(r => admin.roleIds.includes(r.id) && r.status === 1 && r.code === 'SUPER_ADMIN')
}

function canManageRole(adminId: number, role: Pick<typeof db.roles[number], 'code' | 'permissionIds'>): boolean {
  if (isSuperAdmin(adminId)) return true
  if (role.code === 'SUPER_ADMIN') return false
  const codes = new Set(permissionCodesOf(adminId))
  return role.permissionIds.every(id => {
    const permission = db.permissions.find(p => p.id === id)
    return !!permission && codes.has(permission.code)
  })
}

function assertAdminScope(ctx: MockContext, admin: MockAdmin): void {
  if (admin.roleIds.some(id => {
    const role = db.roles.find(r => r.id === id)
    return !role || !canManageRole(ctx.adminId, role)
  })) throw new MockApiError(403, '不能维护超出自身权限范围的管理员')
}

function assignableRoleIds(ctx: MockContext, value: unknown): number[] {
  if (!Array.isArray(value) || !value.length || value.some(id => !Number.isSafeInteger(id))) {
    throw new MockApiError(422, '请选择有效的启用角色')
  }
  const ids = [...new Set(value as number[])]
  for (const id of ids) {
    const role = db.roles.find(r => r.id === id)
    if (!role || role.status !== 1) throw new MockApiError(422, '请选择有效的启用角色')
    if (!canManageRole(ctx.adminId, role)) throw new MockApiError(403, '不能分配超出自身权限范围的角色')
  }
  return ids
}

function validatedPermissionIds(ctx: MockContext, value: unknown): number[] {
  if (!Array.isArray(value) || value.some(id => !Number.isSafeInteger(id) || !db.permissions.some(p => p.id === id))) {
    throw new MockApiError(422, '权限参数无效')
  }
  const ids = [...new Set(value as number[])]
  if (!canManageRole(ctx.adminId, { permissionIds: ids, code: '' })) {
    throw new MockApiError(403, '不能授予超出自身范围的权限')
  }
  return ids
}

function recordAudit(
  adminId: number,
  action: string,
  objectType: string,
  objectId: string | number,
  before: unknown,
  after: unknown
): void {
  const admin = db.admins.find((a) => a.id === adminId)
  db.auditLogs.unshift({
    id: nextMockId(),
    adminUserId: adminId,
    username: admin ? admin.username : 'unknown',
    action,
    objectType,
    objectId: String(objectId),
    beforeJson: redact(before ?? null) as Record<string, unknown> | null,
    afterJson: redact(after ?? null) as Record<string, unknown> | null,
    ip: '192.168.1.10',
    createdAt: nowStr()
  })
}

function sessionPayload(admin: MockAdmin): {
  admin: { id: number; username: string; displayName: string }
  roles: string[]
  permissions: string[]
} {
  return {
    admin: { id: admin.id, username: admin.username, displayName: admin.displayName },
    roles: db.roles.filter((r) => admin.roleIds.includes(r.id)).map((r) => r.code),
    permissions: permissionCodesOf(admin.id)
  }
}

function toOrderItem(o: MockOrder): Omit<MockOrder, 'transactions'> & { wechatNickname: string; phone: string; assetsFrozen: boolean; quoteExpired?: boolean } {
  const { transactions: _transactions, ...rest } = o
  const user = db.users.find((u) => u.id === o.userId)
  const membership = o.durationMode === 'MEMBERSHIP' ? readMockMembership(user) : undefined
  // 报价有效期标记（场景 24）：过期待支付单提示"报价已过期，请关闭重下"
  const quoteExpireAt = o.quoteExpireAt ? dayjs(o.quoteExpireAt).valueOf() : NaN
  const quoteExpired = o.status === 'PENDING' && Number.isFinite(quoteExpireAt) && quoteExpireAt <= Date.now()
  return {
    ...rest,
    expiresAt: readMockOrderExpiry(o, user),
    assetsFrozen: user?.status === 0,
    ...(quoteExpired ? { quoteExpired: true } : {}),
    ...(membership ? { membership, expiresAt: membership.expiresAt, durationMonths: null, durationDays: undefined } : {}),
    phone: user?.phone || '—',
    wechatNickname: user ? (user.wechatNickname || '-') : '-'
  }
}

const CHANNEL_LABELS: Record<string, string> = { WECHAT: '微信支付', ALIPAY: '支付宝', OFFLINE: '线下录入' }
/** v11 订单来源中文标签（线上/手工/赠送） */
const ORDER_SOURCE_LABELS: Record<string, string> = { ONLINE: '线上订单', MANUAL: '手工订单', GIFT: '赠送订单' }
const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: '待支付',
  PAID: '已支付',
  CLOSED: '已关闭'
}

const failCounts = new Map<string, { count: number; lockedAt: number }>()

// ------------------------------------------------------------------ 认证
route('POST', '/auth/login', (ctx) => {
  const username = String((ctx.body as Record<string, unknown>)?.username ?? '')
  const password = String((ctx.body as Record<string, unknown>)?.password ?? '')
  let rec = failCounts.get(username)
  if (rec && Date.now() - rec.lockedAt >= 15 * 60 * 1000) { failCounts.delete(username); rec = undefined }
  if (rec && rec.count >= 5 && Date.now() - rec.lockedAt < 15 * 60 * 1000) {
    throw new MockApiError(423, '账号已锁定，请15分钟后重试')
  }
  const admin = db.admins.find((a) => a.username === username)
  if (!admin || admin.password !== password) {
    failCounts.set(username, { count: (rec?.count ?? 0) + 1, lockedAt: Date.now() })
    throw new MockApiError(422, '用户名或密码错误')
  }
  if (admin.status !== 1) throw new MockApiError(423, '账号已被禁用，请联系管理员')
  failCounts.delete(username)
  const token = `mock-token-${admin.id}-${Date.now()}`
  db.tokens.set(token, admin.id)
  admin.lastLoginAt = nowStr()
  return { token, expiresIn: MOCK_TOKEN_TTL_MS / 1000, ...sessionPayload(admin) }
})

route('POST', '/auth/logout', (ctx) => {
  if (ctx.token) db.tokens.delete(ctx.token)
  return null
})

route('GET', '/auth/me', (ctx) => {
  const admin = db.admins.find((a) => a.id === ctx.adminId)
  if (!admin || admin.status !== 1) throw new MockApiError(401, '未登录或登录已过期')
  return sessionPayload(admin)
})

// ------------------------------------------------------------------ 管理员
route('GET', '/admins', (ctx) => {
  assertPerm(ctx, 'admin:manage')
  const keyword = qStr(ctx.query, 'keyword')
  const status = qNum(ctx.query, 'status')
  let list = [...db.admins].sort((a, b) => b.id - a.id)
  if (keyword) list = list.filter((a) => a.username.includes(keyword) || a.displayName.includes(keyword))
  if (status !== '') list = list.filter((a) => a.status === status)
  const p = paginate(list, ctx.query)
  return {
    total: p.total,
    list: p.list.map((a) => ({
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      status: a.status,
      roles: roleRefsOf(a.id),
      lastLoginAt: a.lastLoginAt,
      createdAt: a.createdAt
    }))
  }
})

route('GET', '/admin-role-options', (ctx) => {
  const permissions = permissionCodesOf(ctx.adminId)
  if (!permissions.includes('admin:manage') && !permissions.includes('admin:edit')) throw new MockApiError(403, '无权限读取可分配角色')
  return db.roles
    .filter(role => (isSuperAdmin(ctx.adminId) || role.status === 1) && canManageRole(ctx.adminId, role))
    .sort((a, b) => a.id - b.id)
    .map(role => ({ id: role.id, code: role.code, name: role.name, status: role.status }))
})

route('POST', '/admins', (ctx) => {
  assertPerm(ctx, 'admin:edit')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const username = String(b.username ?? '').trim()
  const password = String(b.password ?? '')
  const displayName = String(b.displayName ?? '').trim()
  const roleIds = assignableRoleIds(ctx, b.roleIds)
  if (!username || !displayName) throw new MockApiError(422, '用户名和显示名不能为空')
  if (password.length < 6) throw new MockApiError(422, '初始密码长度至少 6 位')
  if (db.admins.some((a) => a.username === username)) throw new MockApiError(422, '用户名已存在')
  const admin: MockAdmin = {
    id: nextMockId(),
    username,
    password,
    displayName,
    status: 1,
    roleIds,
    lastLoginAt: null,
    createdAt: nowStr()
  }
  db.admins.push(admin)
  recordAudit(ctx.adminId, 'admin.create', 'admin', admin.id, null, { username, displayName, roleIds })
  return null
})

route('PUT', '/admins/:id', (ctx) => {
  assertPerm(ctx, 'admin:edit')
  const admin = findOr404(db.admins, ctx.params.id, '管理员')
  assertAdminScope(ctx, admin)
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const displayName = String(b.displayName ?? admin.displayName).trim()
  const roleIds = Object.prototype.hasOwnProperty.call(b, 'roleIds') ? assignableRoleIds(ctx, b.roleIds) : [...admin.roleIds]
  if (!displayName) throw new MockApiError(422, '显示名不能为空')
  if (admin.id === 1 && !roleIds.includes(1)) throw new MockApiError(422, '内置管理员必须保留超级管理员角色')
  const before = { displayName: admin.displayName, roleIds: [...admin.roleIds] }
  admin.displayName = displayName
  admin.roleIds = roleIds
  recordAudit(ctx.adminId, 'admin.update', 'admin', admin.id, before, {
    displayName: admin.displayName,
    roleIds: [...admin.roleIds]
  })
  return null
})

route('PUT', '/admins/:id/status', (ctx) => {
  assertPerm(ctx, 'admin:edit')
  const admin = findOr404(db.admins, ctx.params.id, '管理员')
  assertAdminScope(ctx, admin)
  const status = Number((ctx.body as Record<string, unknown>)?.status)
  if (status !== 0 && status !== 1) throw new MockApiError(422, '状态参数无效')
  if ((admin.id === ctx.adminId || admin.id === 1) && status === 0) throw new MockApiError(422, '不能禁用当前登录账号或内置管理员')
  const before = { status: admin.status }
  admin.status = status
  if (status === 0) {
    for (const [tk, id] of db.tokens) {
      if (id === admin.id) db.tokens.delete(tk)
    }
  }
  recordAudit(ctx.adminId, 'admin.status', 'admin', admin.id, before, { status })
  return null
})

route('PUT', '/admins/:id/password', (ctx) => {
  assertPerm(ctx, 'admin:edit')
  const admin = findOr404(db.admins, ctx.params.id, '管理员')
  assertAdminScope(ctx, admin)
  const password = String((ctx.body as Record<string, unknown>)?.password ?? '')
  if (password.length < 6) throw new MockApiError(422, '新密码长度至少 6 位')
  admin.password = password
  recordAudit(ctx.adminId, 'admin.password.reset', 'admin', admin.id, null, { password: '(已重置)' })
  return null
})

route('DELETE', '/admins/:id', (ctx) => {
  assertPerm(ctx, 'admin:edit')
  const admin = findOr404(db.admins, ctx.params.id, '管理员')
  assertAdminScope(ctx, admin)
  if (admin.id === ctx.adminId || admin.id === 1) throw new MockApiError(422, '不能删除当前登录账号或内置管理员')
  db.admins.splice(db.admins.indexOf(admin), 1)
  for (const [token, id] of db.tokens) if (id === admin.id) db.tokens.delete(token)
  recordAudit(ctx.adminId, 'admin.delete', 'admin', admin.id, { username: admin.username }, null)
  return null
})

// ------------------------------------------------------------------ 角色 / 权限
route('GET', '/roles', (ctx) => {
  assertPerm(ctx, 'role:manage')
  return [...db.roles]
    .sort((a, b) => a.id - b.id)
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      remark: r.remark,
      status: r.status,
      permissionIds: [...r.permissionIds],
      createdAt: r.createdAt
    }))
})

route('POST', '/roles', (ctx) => {
  assertPerm(ctx, 'role:manage')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const code = String(b.code ?? '').trim()
  const name = String(b.name ?? '').trim()
  const remark = String(b.remark ?? '')
  const permissionIds = validatedPermissionIds(ctx, b.permissionIds ?? [])
  if (code === 'SUPER_ADMIN') throw new MockApiError(422, '不能创建内置超级管理员角色')
  if (!code || !name) throw new MockApiError(422, '角色编码和名称不能为空')
  if (db.roles.some((r) => r.code === code)) throw new MockApiError(422, '角色编码已存在')
  const role = {
    id: nextMockId(),
    code,
    name,
    remark,
    status: 1,
    permissionIds,
    createdAt: nowStr()
  }
  db.roles.push(role)
  recordAudit(ctx.adminId, 'role.create', 'role', role.id, null, { code, name, permissionIds })
  return null
})

route('PUT', '/roles/:id', (ctx) => {
  assertPerm(ctx, 'role:manage')
  const role = findOr404(db.roles, ctx.params.id, '角色')
  if (!canManageRole(ctx.adminId, role)) throw new MockApiError(403, '不能维护超出自身权限范围的角色')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const code = String(b.code ?? role.code)
  const name = String(b.name ?? role.name)
  const remark = String(b.remark ?? role.remark)
  const permissionIds = validatedPermissionIds(ctx, b.permissionIds ?? role.permissionIds)
  if (code === 'SUPER_ADMIN' && role.code !== 'SUPER_ADMIN') throw new MockApiError(422, '不能改为内置超级管理员角色')
  if (!code || !name) throw new MockApiError(422, '角色编码和名称不能为空')
  if (db.roles.some((r) => r.code === code && r.id !== role.id)) throw new MockApiError(422, '角色编码已存在')
  if (role.code === 'SUPER_ADMIN' && (code !== role.code || db.permissions.some(p => !permissionIds.includes(p.id)))) throw new MockApiError(422, '内置超级管理员的编码与完整权限不可修改')
  const before = { name: role.name, remark: role.remark, permissionIds: [...role.permissionIds] }
  role.code = code
  role.name = name
  role.remark = remark
  role.permissionIds = permissionIds
  recordAudit(ctx.adminId, 'role.update', 'role', role.id, before, {
    name: role.name,
    remark: role.remark,
    permissionIds: [...role.permissionIds]
  })
  return null
})

route('PUT', '/roles/:id/status', (ctx) => {
  assertPerm(ctx, 'role:manage')
  const role = findOr404(db.roles, ctx.params.id, '角色')
  if (!canManageRole(ctx.adminId, role)) throw new MockApiError(403, '不能维护超出自身权限范围的角色')
  const status = Number((ctx.body as Record<string, unknown>)?.status)
  if (status !== 0 && status !== 1) throw new MockApiError(422, '状态参数无效')
  if (role.code === 'SUPER_ADMIN') throw new MockApiError(422, '内置超级管理员角色不可禁用')
  const before = { status: role.status }
  role.status = status
  recordAudit(ctx.adminId, 'role.status', 'role', role.id, before, { status })
  return null
})

route('DELETE', '/roles/:id', (ctx) => {
  assertPerm(ctx, 'role:manage')
  const role = findOr404(db.roles, ctx.params.id, '角色')
  if (!canManageRole(ctx.adminId, role)) throw new MockApiError(403, '不能维护超出自身权限范围的角色')
  if (role.code === 'SUPER_ADMIN') throw new MockApiError(422, '内置超级管理员角色不可删除')
  if (db.admins.some((a) => a.roleIds.includes(role.id))) {
    throw new MockApiError(409, '该角色已绑定管理员账号，无法删除')
  }
  db.roles.splice(db.roles.indexOf(role), 1)
  recordAudit(ctx.adminId, 'role.delete', 'role', role.id, { code: role.code, name: role.name }, null)
  return null
})

route('GET', '/permissions', () => {
  const modules: Array<{ module: string; permissions: Array<Record<string, unknown>> }> = []
  for (const p of db.permissions) {
    let m = modules.find((x) => x.module === p.module)
    if (!m) {
      m = { module: p.module, permissions: [] }
      modules.push(m)
    }
    m.permissions.push({ id: p.id, code: p.code, name: p.name, type: p.type, sort: p.sort })
  }
  return modules
})

// ------------------------------------------------------------------ 用户（C 端）
route('GET', '/users', (ctx) => {
  assertPerm(ctx, 'user:view')
  const keyword = qStr(ctx.query, 'keyword')
  const status = qNum(ctx.query, 'status')
  const start = qStr(ctx.query, 'start')
  const end = qStr(ctx.query, 'end')
  let list = [...db.users].sort((a, b) => b.id - a.id)
  if (keyword) {
    list = list.filter(
      (u) =>
        u.phone.includes(keyword) ||
        u.email.includes(keyword) ||
        String(u.id) === keyword
    )
  }
  if (status !== '') list = list.filter((u) => u.status === status)
  if (start) list = list.filter((u) => u.registeredAt.slice(0, 10) >= start)
  if (end) list = list.filter((u) => u.registeredAt.slice(0, 10) <= end)
  const p = paginate(list, ctx.query)
  return {
    total: p.total,
    list: p.list.map((u) => ({
      id: u.id,
      phone: u.phone,
      email: u.email,
      wechatNickname: u.wechatNickname,
      region: u.region,
      status: u.status,
      planName: u.planName,
      chatCount: db.chats.filter((c) => c.userId === u.id).length,
      registeredAt: u.registeredAt,
      lastLoginAt: u.lastLoginAt,
      expireAt: readMockMembership(u).expiresAt,
      membership: readMockMembership(u),
      assetsFrozen: u.status === 0
    }))
  }
})

route('GET', '/users/:id', (ctx) => {
  assertPerm(ctx, 'user:view')
  const u = findOr404(db.users, ctx.params.id, '用户')
  const orders = db.orders.filter((o) => o.userId === u.id)
  return {
    profile: {
      id: u.id,
      phone: u.phone,
      email: u.email,
      status: u.status,
      registeredAt: u.registeredAt,
      lastLoginAt: u.lastLoginAt
    },
    plan: {
      planId: u.planId,
      planName: u.planName,
      expireAt: readMockMembership(u).expiresAt,
      membership: readMockMembership(u),
      assetsFrozen: u.status === 0
    },
    entitlements: u.entitlements.map((e) => ({ ...e })),
    orders: {
      totalCount: orders.length,
      totalAmount: orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.amount, 0),
      list: orders.slice(0, 10).map((o) => toOrderItem(o))
    },
    chatStats: (() => {
      // 由真实会话数据派生，避免「显示有会话但记录为空」的演示数据矛盾
      const chats = db.chats.filter((c) => c.userId === u.id)
      return {
        conversationCount: chats.length,
        messageCount: chats.reduce((s, c) => s + c.messages.length, 0),
        lastChatAt: chats.reduce<string | null>((acc, c) => (!acc || c.createdAt > acc ? c.createdAt : acc), null)
      }
    })(),
    loginLogs: u.loginLogs.map((l) => ({ ...l }))
  }
})

route('PUT', '/users/:id/status', (ctx) => {
  assertPerm(ctx, 'user:ban')
  const u = findOr404(db.users, ctx.params.id, '用户')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  if (typeof b.banned !== 'boolean') throw new MockApiError(422, '封禁参数须为布尔值')
  const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
  if (!reason || reason.length > 200) throw new MockApiError(422, '请填写不超过 200 字的封禁或解封原因')
  const status = b.banned ? 0 : 1
  if (u.status === status) throw new MockApiError(409, b.banned ? '用户已封禁' : '用户已解除封禁')
  if (u.status !== 0 && u.status !== 1) throw new MockApiError(409, '当前账户状态不支持封禁或解封')
  const before = { status: u.status, membershipExpireAt: u.membershipExpireAt }
  const at = Date.now()
  u.frozenPeriods ||= []
  if (b.banned) {
    u.frozenPeriods.push({ startedAt: at, endedAt: null })
  } else {
    const period = u.frozenPeriods.find(p => p.endedAt === null)
    if (period) {
      period.endedAt = at
      const expiry = dayjs(u.membershipExpireAt).valueOf()
      if (Number.isFinite(expiry) && expiry > period.startedAt) {
        u.membershipExpireAt = dayjs(expiry + Math.max(0, at - period.startedAt)).format('YYYY-MM-DD HH:mm:ss')
      }
    }
  }
  u.status = status
  recordAudit(ctx.adminId, b.banned ? 'user.ban' : 'user.unban', 'user', u.id, before, {
    status: u.status,
    assetsFrozen: b.banned,
    membershipExpireAt: u.membershipExpireAt,
    reason
  })
  return null
})

route('PUT', '/users/:id/entitlements', (ctx) => {
  assertPerm(ctx, 'user:entitlement')
  const u = findOr404(db.users, ctx.params.id, '用户')
  if (u.status !== 1) throw new MockApiError(409, '账户权益已冻结，解除封禁后才能调整')
  const items = ctx.body
  if (!Array.isArray(items)) throw new MockApiError(422, '权益数据格式错误')
  const before = u.entitlements.map((e) => ({ ...e }))
  const validated = validateEntitlements(items, MockApiError)
  u.entitlements = validated.map(e => ({ ...e, resourceName:e.resourceName!, used:before.find(b=>b.resourceType===e.resourceType && b.resourceId===e.resourceId)?.used || 0 }))
  recordAudit(ctx.adminId, 'user.entitlement.update', 'user', u.id, before, u.entitlements.map((e) => ({ ...e })))
  return null
})

// ------------------------------------------------------------------ 订单
function filterOrders(ctx: MockContext): MockOrder[] {
  const orderNo = qStr(ctx.query, 'orderNo')
  const userId = qNum(ctx.query, 'userId')
  const status = qStr(ctx.query, 'status')
  const payChannel = qStr(ctx.query, 'payChannel')
  const start = qStr(ctx.query, 'start')
  const end = qStr(ctx.query, 'end')
  let list = [...db.orders]
  if (orderNo) list = list.filter((o) => o.orderNo.includes(orderNo))
  if (userId !== '') list = list.filter((o) => o.userId === userId)
  if (status) list = list.filter((o) => o.status === status)
  if (payChannel) list = list.filter((o) => o.payChannel === payChannel)
  if (start) list = list.filter((o) => o.createdAt.slice(0, 10) >= start)
  if (end) list = list.filter((o) => o.createdAt.slice(0, 10) <= end)
  return list
}

route('GET', '/orders', (ctx) => {
  assertPerm(ctx, 'order:view')
  const list = filterOrders(ctx)
  const p = paginate(list, ctx.query)
  return { total: p.total, list: p.list.map((o) => toOrderItem(o)) }
})

route('GET', '/orders/:id', (ctx) => {
  assertPerm(ctx, 'order:view')
  const o = findOr404(db.orders, ctx.params.id, '订单')
  return { ...toOrderItem(o), transactions: o.transactions.map((t) => ({ ...t })) }
})

/** v11 手工/赠送订单共用：按手机号定位用户（演示数据手机号为脱敏格式，需精确匹配） */
function findUserByPhone(phone: string): MockUser {
  const u = db.users.find((x) => x.phone === phone)
  if (!u) throw new MockApiError(422, '手机号对应用户不存在')
  if (u.status !== 1) throw new MockApiError(422, '该用户已被禁用，无法创建订单')
  return u
}

/** v11 创建手工订单：线下收款录入，生成 OFFLINE 渠道支付流水 */
route('POST', '/orders/manual', (ctx) => {
  assertPerm(ctx, 'order:create')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const phone = String(b.phone ?? '').trim()
  const planId = Number(b.planId)
  if (!isValidMoney(b.amount)) throw new MockApiError(422, '请填写非负支付金额，最多两位小数')
  const amount = Math.round(b.amount * 100) / 100
  if (!phone) throw new MockApiError(422, '请填写手机号')
  const u = findUserByPhone(phone)
  const plan = db.plans.find((p) => p.id === planId)
  if (!plan) throw new MockApiError(422, '套餐不存在')
  if ((plan.planType || 'NORMAL') !== 'NORMAL') throw new MockApiError(422, '手工订单只能选择常规套餐')
  if (plan.status !== 1) throw new MockApiError(422, '套餐已停用')
  if (plan.durationMode === 'MEMBERSHIP') throw new MockApiError(422, '常规套餐不支持会员期内有效')
  // v21 计费周期：默认 MONTHLY 兼容旧调用；YEARLY 须已配置年付周期价。时长按周期写入（年=365 天）。
  const cycle = b.cycle === undefined ? 'MONTHLY' : b.cycle
  if (cycle !== 'MONTHLY' && cycle !== 'YEARLY') throw new MockApiError(422, '计费周期须为 MONTHLY 或 YEARLY')
  const cycleConf = cycle === 'YEARLY' ? plan.billingCycles?.find((c) => c.cycle === 'YEARLY' && Number.isFinite(Number(c.price))) : undefined
  if (cycle === 'YEARLY' && !cycleConf) throw new MockApiError(422, '该套餐未配置年付周期，请先在套餐管理添加')
  // 首购价：仅当套餐配置了对应周期（或月付基础）首购价且 useFirstPurchase 显式声明时生效；
  // 是否"真实首购"由交易服务核定，这里按操作员申报记录到审计。
  const useFirstPurchase = b.useFirstPurchase === true
  const confFirst = cycleConf?.firstPurchasePrice
  const baseFirst = cycle === 'MONTHLY' && typeof plan.firstPurchasePrice === 'number' ? plan.firstPurchasePrice : undefined
  const firstPrice = typeof confFirst === 'number' ? confFirst : baseFirst
  if (useFirstPurchase && typeof firstPrice !== 'number') throw new MockApiError(422, '该套餐未配置首购价，不能按首购价结算')
  const credits = Number(plan.credits ?? 0)
  if (!Number.isFinite(credits) || credits < 0) throw new MockApiError(422, 'AI 积分无效')
  const durationMode = plan.durationMode ?? (plan.durationDays === 0 ? 'LIFETIME' : 'CUSTOM_DAYS')
  const durationDays = durationMode === 'LIFETIME' ? 0 : cycle === 'YEARLY' ? 365 : plan.durationDays ?? 30
  if (!Number.isSafeInteger(durationDays) || durationDays < 0 || (durationMode !== 'LIFETIME' && durationDays === 0)) throw new MockApiError(422, '套餐有效天数无效')
  const at = nowStr()
  const id = nextMockId()
  const orderNo = `ORD2026${String(10000000 + id)}`
  const order: MockOrder = {
    id,
    orderNo,
    source: 'MANUAL',
    userId: u.id,
    planId: plan.id,
    planName: cycle === 'YEARLY' ? `${plan.name}（年付）` : plan.name,
    orderCategory: 'FIRST_PURCHASE',
    amount,
    goodsAmount: amount,
    discountAmount: 0,
    remainingCredits: Math.round(credits),
    durationMonths: durationDays === 0 ? 0 : null,
    durationMode,
    durationDays,
    expiresAt: durationDays === 0 ? null : dayjs(at).add(durationDays, 'day').format('YYYY-MM-DD HH:mm:ss'),
    last7DaysUsage: 0,
    payChannel: 'OFFLINE',
    status: 'PAID',
    remark: useFirstPurchase
      ? `线下录入（${cycle === 'YEARLY' ? '年付' : '月付'}，按首购价结算）`
      : `线下对公转账，人工核实到账后录入${cycle === 'YEARLY' ? '（年付）' : ''}`,
    paidAt: at,
    createdAt: at,
    transactions: [{ id: nextMockId(), txnNo: `PAY2026${String(20000000 + id)}`, type: 'PAY', payChannel: 'OFFLINE', amount, status: 'SUCCESS', createdAt: at }]
  }
  db.orders.unshift(order)
  recordAudit(ctx.adminId, 'order.create.manual', 'order', orderNo, null, {
    phone, planId, credits, amount, cycle,
    useFirstPurchase,
    firstPriceDeclared: useFirstPurchase ? firstPrice : null,
    durationDays
  })
  return null
})

/** 运营特批：独立授权、必填原因、金额全 0、无支付流水。 */
route('POST', '/orders/gift', (ctx) => {
  assertPerm(ctx, 'order:create')
  assertPerm(ctx, 'order:gift')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const phone = String(b.phone ?? '').trim()
  const planId = Number(b.planId)
  let durationMonths = typeof b.durationMonths === 'number' ? b.durationMonths : NaN
  const credits = b.credits
  const remark = String(b.remark ?? '').trim()
  if (!phone) throw new MockApiError(422, '请填写手机号')
  const u = findUserByPhone(phone)
  const plan = db.plans.find((p) => p.id === planId)
  if (!plan) throw new MockApiError(422, '套餐不存在')
  if (plan.planType !== 'GIFT') throw new MockApiError(422, '赠送订单只能选择赠送套餐，请先在套餐管理创建')
  if (plan.status !== 1) throw new MockApiError(422, '套餐已停用')
  if (typeof credits !== 'number' || !Number.isSafeInteger(credits) || credits < 0) throw new MockApiError(422, '赠送 AI 积分须为非负整数')
  if (!remark || remark.length > 200) throw new MockApiError(422, '运营特批须填写不超过 200 字的原因')
  const durationMode = plan.durationMode ?? (plan.durationDays === 0 ? 'LIFETIME' : 'CUSTOM_DAYS')
  const isMembership = durationMode === 'MEMBERSHIP'
  const isLifetime = durationMode === 'LIFETIME'
  if (b.durationMonths === undefined && !isMembership) {
    durationMonths = isLifetime ? 0 : Math.max(1, Math.ceil(Number(plan.durationDays ?? 30) / 30))
  }
  if (isMembership) {
    if (!['ACTIVE', 'LIFETIME'].includes(readMockMembership(u).status)) throw new MockApiError(422, '当前用户无有效会员，无法赠送会员期内有效套餐')
  } else if (isLifetime) {
    if (durationMonths !== 0) throw new MockApiError(422, '该套餐为长期有效，赠送时长固定为长期有效')
  } else if (typeof durationMonths !== 'number' || !Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 36) {
    throw new MockApiError(422, '赠送时长须为 1-36 个月')
  }
  const at = nowStr()
  const id = nextMockId()
  const order: MockOrder = {
    id,
    orderNo: `ORD2026${String(10000000 + id)}`,
    source: 'GIFT',
    userId: u.id,
    planId: plan.id,
    planName: plan.name,
    amount: 0,
    goodsAmount: 0,
    discountAmount: 0,
    remainingCredits: Math.round(credits),
    durationMode,
    durationMonths: isMembership ? null : isLifetime ? 0 : durationMonths,
    ...(isMembership ? {} : { expiresAt: isLifetime ? null : dayjs(at).add(durationMonths, 'month').format('YYYY-MM-DD HH:mm:ss') }),
    last7DaysUsage: 0,
    payChannel: 'OFFLINE',
    status: 'PAID',
    creditBatchType: 'OPS_EXCEPTION',
    remark,
    paidAt: at,
    createdAt: at,
    transactions: []
  }
  db.orders.unshift(order)
  recordAudit(ctx.adminId, 'order.create.gift', 'order', order.orderNo, null, { phone, planId, durationMode, durationMonths: order.durationMonths, credits, reason: remark, creditBatchType: 'OPS_EXCEPTION' })
  return null
})

/** 仅允许线上待支付订单更改应付价；记录折让与审计，不触及已支付流水 */
route('PUT', '/orders/:id/price', (ctx) => {
  assertPerm(ctx, 'order:price')
  const o = findOr404(db.orders, ctx.params.id, '订单')
  if (o.source !== 'ONLINE' || o.status !== 'PENDING' || o.paidAt || o.transactions.length > 0) {
    throw new MockApiError(409, '仅线上待支付且未产生支付流水的订单可改价')
  }
  // 报价有效期（规则场景 24）：过期的待支付单不可改价，应关闭后重新报价
  if (o.quoteExpireAt) {
    const qe = dayjs(o.quoteExpireAt).valueOf()
    if (Number.isFinite(qe) && qe <= Date.now()) throw new MockApiError(409, '该订单报价已过期，请关闭订单后重新创建（场景 24）')
  }
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const amount = b.amount
  const expectedAmount = b.expectedAmount
  const reason = typeof b.reason === 'string' ? b.reason.trim() : ''
  if (typeof expectedAmount !== 'number' || expectedAmount !== o.amount) throw new MockApiError(409, '订单金额已变化，请刷新后重新改价')
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > o.goodsAmount || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    throw new MockApiError(422, '改价金额须为 0 至商品金额之间的数字，最多两位小数')
  }
  if (amount === o.amount) throw new MockApiError(422, '新价格须与当前应付金额不同')
  if (!reason || reason.length > 200) throw new MockApiError(422, '请输入不超过 200 字的改价原因')
  const before = { amount: o.amount, goodsAmount: o.goodsAmount, discountAmount: o.discountAmount }
  o.amount = amount
  o.discountAmount = Math.round((o.goodsAmount - amount) * 100) / 100
  // 改价原因落订单本体：详情/导出直接可见，审计仍保留完整 before/after
  o.priceChangeReason = reason
  recordAudit(ctx.adminId, 'order.price', 'order', o.orderNo, before, { amount: o.amount, goodsAmount: o.goodsAmount, discountAmount: o.discountAmount, reason })
  return null
})

route('PUT', '/orders/:id/remark', (ctx) => {
  assertPerm(ctx, 'order:remark')
  const o = findOr404(db.orders, ctx.params.id, '订单')
  const remark = String((ctx.body as Record<string, unknown>)?.remark ?? '')
  const before = { remark: o.remark }
  o.remark = remark
  recordAudit(ctx.adminId, 'order.remark', 'order', o.orderNo, before, { remark })
  return null
})

route('GET', '/orders/export', async (ctx) => {
  assertPerm(ctx, 'order:export')
  const list = filterOrders(ctx)
  const now = Date.now()
  const headers = ['订单号', '用户ID', '用户手机号', '微信昵称', '套餐', '订单来源', '购买动作', '到期状态', '剩余积分', '套餐时长', '近7日消耗', '商品金额', '优惠金额', '实付金额', '状态', '改价原因', '支付时间', '下单时间', '到期时间', '支付渠道', '备注']
  const widths = [28, 12, 18, 22, 22, 14, 14, 20, 16, 16, 16, 16, 16, 16, 14, 30, 25, 25, 25, 14, 40]
  const columns: ExcelColumn[] = headers.map((header, index) => ({
    header, width: widths[index]!,
    kind: [11, 12, 13].includes(index) ? 'money' : [1, 8, 10].includes(index) ? 'integer' : [15, 17, 18].includes(index) ? 'datetime' : 'text'
  }))
  const ORDER_CATEGORY_EXPORT_LABELS: Record<string, string> = { FIRST_PURCHASE: '首次购买', RENEW: '同档续费', UPGRADE: '升级', SWITCH: '降级/换周期切换', PACK: '增购积分包' }
  const rows = list.map(o => {
    const item = toOrderItem(o)
    const expiry = formatOrderExpiry(item, now)
    return [
      item.orderNo,
      item.userId,
      item.phone,
      item.wechatNickname,
      item.planName,
      ORDER_SOURCE_LABELS[item.source] ?? item.source,
      item.orderCategory ? (ORDER_CATEGORY_EXPORT_LABELS[item.orderCategory] ?? item.orderCategory) : '',
      expiry.text,
      item.remainingCredits,
      formatOrderDuration(item),
      item.last7DaysUsage,
      item.goodsAmount,
      item.discountAmount,
      item.amount,
      ORDER_STATUS_LABELS[item.status] ?? item.status,
      item.priceChangeReason || '',
      item.paidAt ?? '',
      item.createdAt,
      item.expiresAt && expiry.time !== '—' ? excelDateTime(item.expiresAt) : expiry.time,
      CHANNEL_LABELS[item.payChannel] ?? item.payChannel,
      item.remark || ''
    ]
  })
  return createExcelBlob('订单列表', columns, rows)
})

// ------------------------------------------------------------------ 反馈管理（v15）
function toFeedbackItem(f: MockFeedback) {
  const u = db.users.find((x) => x.id === f.userId)
  return {
    id: f.id,
    fbNo: f.fbNo,
    userId: f.userId,
    wechatNickname: u?.wechatNickname || '',
    userStatus: u?.status ?? 0,
    content: f.content,
    images: [...f.images],
    chatRefs: f.chatRefs.map((c) => ({ ...c })),
    status: f.status,
    rewardPoints: f.rewardPoints,
    handleRemark: f.handleRemark,
    handledBy: f.handledBy,
    handledAt: f.handledAt,
    createdAt: f.createdAt
  }
}

route('GET', '/feedbacks', (ctx) => {
  assertPerm(ctx, 'feedback:view')
  const keyword = qStr(ctx.query, 'keyword')
  const status = qStr(ctx.query, 'status')
  const start = qStr(ctx.query, 'start')
  const end = qStr(ctx.query, 'end')
  let list = [...db.feedbacks]
  if (keyword) {
    list = list.filter((f) => {
      const u = db.users.find((x) => x.id === f.userId)
      return (
        f.fbNo.includes(keyword) ||
        f.content.includes(keyword) ||
        (u ? u.wechatNickname.includes(keyword) || u.phone.includes(keyword) : false)
      )
    })
  }
  if (status) list = list.filter((f) => f.status === status)
  if (start) list = list.filter((f) => f.createdAt.slice(0, 10) >= start)
  if (end) list = list.filter((f) => f.createdAt.slice(0, 10) <= end)
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const p = paginate(list, ctx.query)
  return { total: p.total, list: p.list.map(toFeedbackItem) }
})

route('GET', '/feedbacks/:id', (ctx) => {
  assertPerm(ctx, 'feedback:view')
  const f = findOr404(db.feedbacks, ctx.params.id, '反馈')
  return toFeedbackItem(f)
})

route('PUT', '/feedbacks/:id/status', (ctx) => {
  assertPerm(ctx, 'feedback:manage')
  const f = findOr404(db.feedbacks, ctx.params.id, '反馈')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const status = String(b.status ?? '')
  const rewardPoints = Number(b.rewardPoints ?? 0)
  const handleRemark = String(b.handleRemark ?? '').trim()
  if (!['ADOPTED', 'REJECTED'].includes(status)) throw new MockApiError(422, '处理状态无效')
  if (f.status !== 'PENDING') throw new MockApiError(409, '该反馈已处理，不能重复操作')
  if (status === 'ADOPTED') {
    if (!Number.isFinite(rewardPoints) || rewardPoints < 0) throw new MockApiError(422, '奖励积分无效')
    if (!handleRemark) throw new MockApiError(422, '采纳反馈须填写处理说明')
    // R02 拍板：反馈奖励属运营特批积分，非购买赠分；发放须说明特批原因（处理说明即特批原因），并留审计
    if (rewardPoints > 0 && handleRemark.length < 6) throw new MockApiError(422, '发放特批奖励须在处理说明中写明特批原因（至少 6 个字）')
  }
  const before = { status: f.status, rewardPoints: f.rewardPoints, handleRemark: f.handleRemark, handledBy: f.handledBy, handledAt: f.handledAt }
  const admin = db.admins.find((a) => a.id === ctx.adminId)
  f.status = status as MockFeedback['status']
  f.rewardPoints = status === 'ADOPTED' ? Math.round(rewardPoints) : 0
  f.handleRemark = handleRemark
  f.handledBy = admin?.username || String(ctx.adminId)
  f.handledAt = nowStr()
  recordAudit(ctx.adminId, 'feedback.handle', 'feedback', f.fbNo, before, {
    status: f.status,
    rewardPoints: f.rewardPoints,
    handleRemark: f.handleRemark,
    handledBy: f.handledBy,
    // 明确标注特批性质，便于审计区分常规购买赠分与运营特批
    rewardType: f.rewardPoints > 0 ? 'OPS_EXCEPTION' : null
  })
  return toFeedbackItem(f)
})

route('DELETE', '/feedbacks/:id', (ctx) => {
  assertPerm(ctx, 'feedback:manage')
  const idx = db.feedbacks.findIndex((x) => x.id === Number(ctx.params.id))
  if (idx === -1) throw new MockApiError(404, '反馈不存在或已删除')
  const [removed] = db.feedbacks.splice(idx, 1)
  recordAudit(ctx.adminId, 'feedback.delete', 'feedback', removed.fbNo, toFeedbackItem(removed), null)
  return null
})

// ------------------------------------------------------------------ 审计日志
route('GET', '/audit-logs', (ctx) => {
  assertPerm(ctx, 'audit:view')
  const adminUserId = qNum(ctx.query, 'adminUserId')
  const action = qStr(ctx.query, 'action')
  const objectType = qStr(ctx.query, 'objectType')
  const objectId = qStr(ctx.query, 'objectId')
  const start = qStr(ctx.query, 'start')
  const end = qStr(ctx.query, 'end')
  let list = [...db.auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
  if (adminUserId !== '') list = list.filter((l) => l.adminUserId === adminUserId)
  if (action) list = list.filter((l) => l.action.includes(action))
  if (objectType) list = list.filter((l) => l.objectType === objectType)
  if (objectId) list = list.filter((l) => l.objectId === objectId)
  if (start) list = list.filter((l) => l.createdAt.slice(0, 10) >= start)
  if (end) list = list.filter((l) => l.createdAt.slice(0, 10) <= end)
  return paginate(list, ctx.query)
})

registerConfigHandlers({ route, error:MockApiError, audit:recordAudit })
registerOperationsHandlers({ route, error:MockApiError, audit:recordAudit })
registerWorkspaceHandlers({ route, error:MockApiError, audit:recordAudit })

// ------------------------------------------------------------------ 入口
function extractToken(config: InternalAxiosRequestConfig): string {
  const auth = config.headers?.Authorization
  if (typeof auth !== 'string') return ''
  const m = /^Bearer\s+(.+)$/.exec(auth)
  return m ? m[1] : ''
}

/** mock adapter 入口：匹配路由并返回契约包装结构 */
export async function handleMockRequest(config: InternalAxiosRequestConfig): Promise<ApiResponse> {
  await sleep(120 + Math.random() * 220)
  const method = (config.method || 'get').toUpperCase()
  let url = config.url || ''
  if (url.startsWith(API_BASE)) url = url.slice(API_BASE.length)
  url = url.split('?')[0]
  const matched = [...routes].sort((a, b) => a.keys.length - b.keys.length).find((r) => r.method === method && r.pattern.test(url))
  if (!matched) return { code: 404, msg: `接口未实现：${method} ${url}`, data: null }
  const matches = url.match(matched.pattern) ?? []
  const params: Record<string, string> = {}
  matched.keys.forEach((k, i) => {
    params[k] = decodeURIComponent(matches[i + 1] ?? '')
  })
  const query: Record<string, unknown> = { ...(config.params ?? {}) }
  let body: unknown = config.data
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = {}
    }
  }
  const token = extractToken(config)
  // 前台工作台契约为 C 端只读接口（演示中按套餐参数过滤），与管理端登录态隔离，放行匿名访问
  const isPublic = (method === 'POST' && url === '/auth/login') || url.startsWith('/api/v1/workspace/')
  let adminId = 0
  if (!isPublic) {
    const adminIdOfToken = token ? db.tokens.get(token) : undefined
    const issuedAt = Number(token.slice(token.lastIndexOf('-') + 1))
    if (adminIdOfToken === undefined || !issuedAt || Date.now() - issuedAt > MOCK_TOKEN_TTL_MS) return { code: 401, msg: '未登录或登录已过期', data: null }
    const admin = db.admins.find((a) => a.id === adminIdOfToken)
    if (!admin || admin.status !== 1) return { code: 401, msg: '账号不可用，请重新登录', data: null }
    adminId = adminIdOfToken
  }
  try {
    // handler 可能为异步（如草稿预览演示引擎的人为延迟路由），统一 await
    const data = await matched.handler({ params, query, body, adminId, token })
    persistMockDB()
    return { code: 0, msg: 'ok', data: data instanceof Blob ? data : data == null ? null : JSON.parse(JSON.stringify(data)) }
  } catch (e) {
    if (e instanceof MockApiError) return { code: e.code, msg: e.message, data: null }
    return { code: 500, msg: '服务异常，请稍后重试', data: null }
  }
}
