import dayjs from 'dayjs'
import { registerConfigHandlers, validateEntitlements } from './config-handlers'
import { registerOperationsHandlers } from './operations-handlers'
import { registerWorkspaceHandlers } from './workspace-handlers'
import { redact } from './extension-data'

import type { InternalAxiosRequestConfig } from 'axios'

import type { ApiResponse } from '../types'
import { API_BASE } from '../../utils/constants'
import {
  db,
  nextMockId,
  nowStr,
  permissionCodesOf,
  persistMockDB,
  roleRefsOf,
  type MockAdmin,
  type MockOrder
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

function toOrderItem(o: MockOrder): Omit<MockOrder, 'transactions'> & { userNickname: string } {
  const { transactions: _transactions, ...rest } = o
  const user = db.users.find((u) => u.id === o.userId)
  return { ...rest, userNickname: user ? user.nickname : `用户${o.userId}` }
}

const CHANNEL_LABELS: Record<string, string> = { WECHAT: '微信支付', ALIPAY: '支付宝' }
const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: '待支付',
  PAID: '已支付',
  REFUNDED: '已退款',
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
  return { token, expiresIn: 7200, ...sessionPayload(admin) }
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

route('POST', '/admins', (ctx) => {
  assertPerm(ctx, 'admin:edit')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const username = String(b.username ?? '').trim()
  const password = String(b.password ?? '')
  const displayName = String(b.displayName ?? '').trim()
  const roleIds = Array.isArray(b.roleIds) ? (b.roleIds as number[]) : []
  if (!username || !displayName) throw new MockApiError(422, '用户名和显示名不能为空')
  if (password.length < 6) throw new MockApiError(422, '初始密码长度至少 6 位')
  if (db.admins.some((a) => a.username === username)) throw new MockApiError(422, '用户名已存在')
  if (!roleIds.length || roleIds.some(id => !db.roles.some(r => r.id === id && r.status === 1))) throw new MockApiError(422, '请选择有效的启用角色')
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
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const displayName = String(b.displayName ?? admin.displayName).trim()
  const roleIds = Array.isArray(b.roleIds) ? b.roleIds as number[] : admin.roleIds
  if (!displayName) throw new MockApiError(422, '显示名不能为空')
  if (!roleIds.length || roleIds.some(id => !db.roles.some(r => r.id === id))) throw new MockApiError(422, '请选择有效角色')
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
  const status = Number((ctx.body as Record<string, unknown>)?.status)
  if (status !== 0 && status !== 1) throw new MockApiError(422, '状态参数无效')
  if (admin.id === ctx.adminId && status === 0) throw new MockApiError(422, '不能禁用当前登录账号')
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
  const password = String((ctx.body as Record<string, unknown>)?.password ?? '')
  if (password.length < 6) throw new MockApiError(422, '新密码长度至少 6 位')
  admin.password = password
  recordAudit(ctx.adminId, 'admin.password.reset', 'admin', admin.id, null, { password: '(已重置)' })
  return null
})

route('DELETE', '/admins/:id', (ctx) => {
  assertPerm(ctx, 'admin:edit')
  const admin = findOr404(db.admins, ctx.params.id, '管理员')
  if (admin.id === ctx.adminId) throw new MockApiError(422, '不能删除当前登录账号')
  db.admins.splice(db.admins.indexOf(admin), 1)
  recordAudit(ctx.adminId, 'admin.delete', 'admin', admin.id, { username: admin.username }, null)
  return null
})

// ------------------------------------------------------------------ 角色 / 权限
route('GET', '/roles', (ctx) => {
  assertPerm(ctx, 'admin:manage')
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
  const permissionIds = Array.isArray(b.permissionIds) ? (b.permissionIds as number[]) : []
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
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const code = String(b.code ?? role.code)
  const name = String(b.name ?? role.name)
  const remark = String(b.remark ?? role.remark)
  const permissionIds = Array.isArray(b.permissionIds) ? (b.permissionIds as number[]) : [...role.permissionIds]
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
        u.nickname.includes(keyword) ||
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
      nickname: u.nickname,
      phone: u.phone,
      email: u.email,
      status: u.status,
      planName: u.planName,
      chatCount: u.chatCount,
      registeredAt: u.registeredAt,
      lastLoginAt: u.lastLoginAt
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
      nickname: u.nickname,
      phone: u.phone,
      email: u.email,
      status: u.status,
      registeredAt: u.registeredAt,
      lastLoginAt: u.lastLoginAt
    },
    plan: {
      planId: u.planId,
      planName: u.planName,
      expireAt: u.planId >= 2 ? dayjs(u.registeredAt).add(1, 'year').format('YYYY-MM-DD HH:mm:ss') : null
    },
    entitlements: u.entitlements.map((e) => ({ ...e })),
    orders: {
      totalCount: orders.length,
      totalAmount: orders.filter((o) => o.status === 'PAID').reduce((s, o) => s + o.amount, 0),
      list: orders.slice(0, 10).map((o) => toOrderItem(o))
    },
    chatStats: {
      conversationCount: Math.floor(u.chatCount / 8),
      messageCount: u.chatCount,
      lastChatAt: u.lastLoginAt
    },
    loginLogs: u.loginLogs.map((l) => ({ ...l }))
  }
})

route('PUT', '/users/:id/status', (ctx) => {
  assertPerm(ctx, 'user:ban')
  const u = findOr404(db.users, ctx.params.id, '用户')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const banned = Boolean(b.banned)
  const reason = String(b.reason ?? '')
  if (!reason.trim()) throw new MockApiError(422, '请填写封禁或解封原因')
  const before = { status: u.status }
  u.status = banned ? 0 : 1
  recordAudit(ctx.adminId, banned ? 'user.ban' : 'user.unban', 'user', u.id, before, {
    status: u.status,
    reason
  })
  return null
})

route('PUT', '/users/:id/entitlements', (ctx) => {
  assertPerm(ctx, 'user:entitlement')
  const u = findOr404(db.users, ctx.params.id, '用户')
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

route('POST', '/orders/:id/refund', (ctx) => {
  assertPerm(ctx, 'order:refund')
  const o = findOr404(db.orders, ctx.params.id, '订单')
  const b = (ctx.body ?? {}) as Record<string, unknown>
  const reason = String(b.reason ?? '').trim()
  const amount = Number(b.amount)
  if (!reason) throw new MockApiError(422, '请填写退款原因')
  if (!Number.isFinite(amount) || amount <= 0) throw new MockApiError(422, '退款金额无效')
  if (o.status !== 'PAID') throw new MockApiError(422, '当前订单状态不支持退款')
  if (amount !== o.amount) throw new MockApiError(422, '演示模式仅支持全额退款')
  const before = { status: o.status }
  o.status = 'REFUNDED'
  o.refundedAt = nowStr()
  o.transactions.push({
    id: nextMockId(),
    txnNo: `RFD2026${String(30000000 + nextMockId())}`,
    type: 'REFUND',
    payChannel: o.payChannel,
    amount,
    status: 'SUCCESS',
    createdAt: nowStr()
  })
  recordAudit(ctx.adminId, 'order.refund', 'order', o.orderNo, before, { status: 'REFUNDED', amount, reason })
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

route('GET', '/orders/export', (ctx) => {
  assertPerm(ctx, 'order:export')
  const list = filterOrders(ctx)
  const header = '订单号,用户ID,用户昵称,套餐,金额,支付渠道,状态,备注,支付时间,下单时间'
  const rows = list.map((o) => {
    const item = toOrderItem(o)
    return [
      item.orderNo,
      item.userId,
      item.userNickname,
      item.planName,
      item.amount.toFixed(2),
      CHANNEL_LABELS[item.payChannel] ?? item.payChannel,
      ORDER_STATUS_LABELS[item.status] ?? item.status,
      item.remark || '',
      item.paidAt ?? '',
      item.createdAt
    ].map(value => {
      const text = String(value)
      return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`
    }).join(',')
  })
  return {
    filename: `orders-${dayjs().format('YYYYMMDDHHmmss')}.csv`,
    content: [header, ...rows].join('\n')
  }
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
  let list = [...db.auditLogs].sort((a, b) => b.id - a.id)
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
    if (adminIdOfToken === undefined || !issuedAt || Date.now() - issuedAt > 7200_000) return { code: 401, msg: '未登录或登录已过期', data: null }
    const admin = db.admins.find((a) => a.id === adminIdOfToken)
    if (!admin || admin.status !== 1) return { code: 401, msg: '账号不可用，请重新登录', data: null }
    adminId = adminIdOfToken
  }
  try {
    // handler 可能为异步（如草稿预览演示引擎的人为延迟路由），统一 await
    const data = await matched.handler({ params, query, body, adminId, token })
    persistMockDB()
    return { code: 0, msg: 'ok', data: data == null ? null : JSON.parse(JSON.stringify(data)) }
  } catch (e) {
    if (e instanceof MockApiError) return { code: e.code, msg: e.message, data: null }
    return { code: 500, msg: '服务异常，请稍后重试', data: null }
  }
}
