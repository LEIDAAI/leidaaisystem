import dayjs from 'dayjs'
import { migrateLegacyConfig, seedExtensions, redact, type Extensions } from './extension-data'

// =====================================================================
// Mock 演示数据库：通过 localStorage 保存业务数据与会话。
// 仅用于演示，不能作为真实认证或支付凭据。
// =====================================================================

export interface MockPermission {
  id: number
  code: string
  name: string
  module: string
  type: number
  sort: number
}

export interface MockRole {
  id: number
  code: string
  name: string
  remark: string
  status: number
  permissionIds: number[]
  createdAt: string
}

export interface MockAdmin {
  id: number
  username: string
  password: string
  displayName: string
  status: number
  roleIds: number[]
  lastLoginAt: string | null
  createdAt: string
}

export interface MockEntitlement {
  resourceType: 'EXPERT' | 'SKILL' | 'MCP_TOOL'
  resourceId: number
  resourceName: string
  quotaType: string
  quotaLimit: number
  quotaPeriod?: 'DAY' | 'MONTH' | 'LIFETIME'
  used: number
}

export interface MockLoginLog {
  ip: string
  userAgent: string
  loginAt: string
}

export interface MockUser {
  id: number
  nickname: string
  phone: string
  email: string
  status: number
  planId: number
  planName: string
  chatCount: number
  registeredAt: string
  lastLoginAt: string | null
  entitlements: MockEntitlement[]
  loginLogs: MockLoginLog[]
}

export interface MockTxn {
  id: number
  txnNo: string
  type: 'PAY' | 'REFUND'
  payChannel: 'WECHAT' | 'ALIPAY'
  amount: number
  status: string
  createdAt: string
}

export interface MockOrder {
  id: number
  orderNo: string
  userId: number
  planId: number
  planName: string
  amount: number
  payChannel: 'WECHAT' | 'ALIPAY'
  status: 'PENDING' | 'PAID' | 'REFUNDED' | 'CLOSED'
  remark: string
  paidAt: string | null
  refundedAt: string | null
  createdAt: string
  transactions: MockTxn[]
}

export interface MockAudit {
  id: number
  adminUserId: number
  username: string
  action: string
  objectType: string
  objectId: string
  beforeJson: Record<string, unknown> | null
  afterJson: Record<string, unknown> | null
  ip: string
  createdAt: string
}

export const PLANS = [
  { id: 1, name: '免费版', price: 0 },
  { id: 2, name: '标准版', price: 99 },
  { id: 3, name: '专业版', price: 299 },
  { id: 4, name: '企业版', price: 2999 }
]

const NOW = dayjs()

function fmt(d: dayjs.Dayjs): string {
  return d.format('YYYY-MM-DD HH:mm:ss')
}

function minutesAgo(m: number): string {
  return fmt(NOW.subtract(m, 'minute'))
}

function daysAgo(d: number, hour = 10): string {
  return fmt(NOW.subtract(d, 'day').hour(hour).minute(20).second(0))
}

// -------------------------------------------------------------- 权限点字典（与 schema.sql seed 一致）
const PERMISSIONS: MockPermission[] = [
  { id: 1, code: 'dashboard:view', name: '仪表盘查看', module: 'dashboard', type: 1, sort: 0 },
  { id: 2, code: 'admin:manage', name: '管理员管理', module: 'admin', type: 1, sort: 10 },
  { id: 3, code: 'admin:edit', name: '管理员编辑', module: 'admin', type: 2, sort: 11 },
  { id: 4, code: 'role:manage', name: '角色管理', module: 'admin', type: 2, sort: 12 },
  { id: 5, code: 'user:view', name: '用户查看', module: 'user', type: 1, sort: 20 },
  { id: 6, code: 'user:ban', name: '用户封禁', module: 'user', type: 2, sort: 21 },
  { id: 7, code: 'user:entitlement', name: '用户权益调整', module: 'user', type: 2, sort: 22 },
  { id: 8, code: 'order:view', name: '订单查看', module: 'order', type: 1, sort: 30 },
  { id: 9, code: 'order:refund', name: '订单退款', module: 'order', type: 2, sort: 31 },
  { id: 10, code: 'order:export', name: '订单导出', module: 'order', type: 2, sort: 32 },
  { id: 19, code: 'order:remark', name: '订单备注', module: 'order', type: 2, sort: 33 },
  { id: 11, code: 'plan:manage', name: '套餐管理', module: 'plan', type: 1, sort: 40 },
  { id: 12, code: 'expert:edit', name: '专家编辑', module: 'expert', type: 2, sort: 50 },
  { id: 13, code: 'skill:edit', name: '技能编辑', module: 'skill', type: 2, sort: 60 },
  { id: 14, code: 'mcp:edit', name: 'MCP编辑', module: 'mcp', type: 2, sort: 70 },
  { id: 15, code: 'chat:view', name: '对话查看', module: 'chat', type: 1, sort: 80 },
  { id: 16, code: 'chat:delete', name: '对话删除', module: 'chat', type: 2, sort: 81 },
  { id: 17, code: 'chat:export', name: '对话导出', module: 'chat', type: 2, sort: 82 },
  { id: 18, code: 'audit:view', name: '审计查看', module: 'admin', type: 1, sort: 90 }
]

;['plan:view','plan:edit','expert:view','skill:view','mcp:view','chat:restore'].forEach((code, i) => PERMISSIONS.push({ id: 20+i, code, name: ({ 'plan:view':'套餐查看','plan:edit':'套餐编辑','expert:view':'专家查看','skill:view':'技能查看','mcp:view':'MCP查看','chat:restore':'对话恢复' } as Record<string,string>)[code], module:code.split(':')[0], type:code.endsWith(':view')?1:2, sort:100+i }))
// v4 新增：技能克隆/导出权限点（专家导出/导入按约定复用 expert:edit，不新增权限点；见 schema.sql 同步授权）
;([['skill:clone','技能克隆','skill',61],['skill:export','技能导出','skill',62]] as Array<[string,string,string,number]>).forEach(([code,name,module,sort]) => PERMISSIONS.push({ id: code==='skill:clone'?27:28, code, name, module, type: 2, sort }))
const ALL_PERM_IDS = PERMISSIONS.map((p) => p.id)
/** v4 新增权限点 id（运营角色增量授予） */
export const V4_PERMISSION_IDS = [27, 28]

// -------------------------------------------------------------- 角色
const ROLES: MockRole[] = [
  { id: 1, code: 'SUPER_ADMIN', name: '超级管理员', remark: '全部权限', status: 1, permissionIds: [...ALL_PERM_IDS], createdAt: daysAgo(300) },
  {
    id: 2,
    code: 'OPS',
    name: '运营',
    remark: '套餐/用户/订单',
    status: 1,
    permissionIds: [1, 5, 6, 7, 8, 9, 10, 11, 19],
    createdAt: daysAgo(280)
  },
  { id: 3, code: 'SUPPORT', name: '客服', remark: '用户/订单查看 + 对话查看', status: 1, permissionIds: [1, 5, 8, 15], createdAt: daysAgo(270) },
  { id: 4, code: 'VIEWER', name: '只读', remark: '仅查看', status: 1, permissionIds: [1, 5, 8, 18], createdAt: daysAgo(260) },
  { id: 5, code: 'DATA_ANALYST', name: '数据分析', remark: '数据导出与审计', status: 1, permissionIds: [1, 5, 8, 10, 18], createdAt: daysAgo(120) }
]

// -------------------------------------------------------------- 管理员
const ADMINS: MockAdmin[] = [
  { id: 1, username: 'admin', password: 'admin123', displayName: '系统管理员', status: 1, roleIds: [1], lastLoginAt: minutesAgo(35), createdAt: daysAgo(300) },
  { id: 2, username: 'liwei', password: 'admin123', displayName: '李伟', status: 1, roleIds: [2], lastLoginAt: minutesAgo(180), createdAt: daysAgo(200) },
  { id: 3, username: 'support', password: 'support123', displayName: '张敏', status: 1, roleIds: [3], lastLoginAt: daysAgo(2, 18), createdAt: daysAgo(190) },
  { id: 4, username: 'viewer', password: 'viewer123', displayName: '王芳', status: 1, roleIds: [4], lastLoginAt: daysAgo(6), createdAt: daysAgo(150) },
  { id: 5, username: 'chenjing', password: 'admin123', displayName: '陈静', status: 1, roleIds: [2, 5], lastLoginAt: daysAgo(3, 9), createdAt: daysAgo(90) },
  { id: 6, username: 'zhouqiang', password: 'admin123', displayName: '周强', status: 0, roleIds: [3], lastLoginAt: daysAgo(45), createdAt: daysAgo(120) }
]

// -------------------------------------------------------------- C 端用户
const NICKNAMES = [
  '山间清风', '柠檬不酸', '奶茶三分甜', '追风少年M', '云边小卖部', '深夜食堂常客', '橙子汽水', '北巷不夏',
  '句子收藏家', '一块小饼干', '半糖主义', '柚子茶不打烊', '不吃香菜星人', '代码搬运工', '撸猫狂魔', '凌晨四点的海',
  '粉红猪猪', '山城小面', '路过人间', '咸鱼要翻身', '木子李Li', '旺仔小馒头', '清风徐来L', '橘子汽水铺',
  '打工人小张', '热爱可抵岁月', '麦浪滚滚', '小城故事多', '拾光者South', '南巷清风', '月亮邮递员', '纸短情长',
  '美式不加糖', '橘子海岸线', '一只小海豹', '星河滚烫', '长风渡口', '晚风轻拾', '竹里馆主', '青柠气泡水'
]

const EMAIL_PREFIXES = [
  'qingfeng', 'ningmeng', 'naicha', 'zhuifeng', 'yunbian', 'shenye', 'chengzi', 'beixiang',
  'juzi', 'binggan', 'bantang', 'youzi', 'xiangcai', 'coder', 'maomao', 'haiwan',
  'zhuzhu', 'xiaomian', 'renjian', 'xianyu', 'muzi', 'wangzai', 'qf2019', 'juziqs',
  'dagong', 'reai', 'mailang', 'xiaocheng', 'shiguang', 'nanxiang', 'yueliang', 'zhiduan',
  'meishi', 'juhai', 'haibao', 'xinghe', 'changfeng', 'wanfeng', 'zhuli', 'qingning'
]

const PHONE_PREFIXES = ['138', '139', '150', '151', '152', '155', '158', '176', '186', '187', '189', '135']
const EMAIL_DOMAINS = ['qq.com', '163.com', 'gmail.com', 'outlook.com']
const UA_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Safari/604.1',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Chrome/125.0.0.0',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126.0.0.0'
]

function maskedPhone(i: number): string {
  const prefix = PHONE_PREFIXES[i % PHONE_PREFIXES.length]
  const tail = String(1000 + ((i * 373) % 9000))
  return `${prefix}****${tail}`
}

export const ENT_RESOURCE_POOL: MockEntitlement[] = [
  { resourceType: 'EXPERT', resourceId: 1, resourceName: '1688分销选品', quotaType: 'CHAT_COUNT', quotaLimit: 100, used: 32 },
  { resourceType: 'EXPERT', resourceId: 2, resourceName: '跨境电商选品', quotaType: 'CHAT_COUNT', quotaLimit: 200, used: 87 },
  { resourceType: 'EXPERT', resourceId: 3, resourceName: '抖音带货选品', quotaType: 'CHAT_COUNT', quotaLimit: 500, used: 126 },
  { resourceType: 'SKILL', resourceId: 11, resourceName: '1688选品搜索', quotaType: 'SKILL_CALL', quotaLimit: 300, used: 45 },
  { resourceType: 'SKILL', resourceId: 12, resourceName: '竞品价格监控', quotaType: 'SKILL_CALL', quotaLimit: 150, used: 150 },
  { resourceType: 'MCP_TOOL', resourceId: 21, resourceName: 'ali_product_search', quotaType: 'SKILL_CALL', quotaLimit: 800, used: 233 },
  { resourceType: 'MCP_TOOL', resourceId: 26, resourceName: 'echotik_video_search', quotaType: 'SKILL_CALL', quotaLimit: 400, used: 66 }
]

function buildUsers(): MockUser[] {
  const users: MockUser[] = []
  for (let i = 1; i <= 40; i++) {
    const planId = i % 7 === 0 ? 4 : i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1
    const registeredAt = i <= 3 ? minutesAgo(30 + i * 95) : daysAgo((i - 3) * 8, 9 + (i % 12))
    const lastLogin = daysAgo(i % 5, 8 + (i % 14))
    const entitlements: MockEntitlement[] =
      planId >= 3
        ? [ENT_RESOURCE_POOL[i % 3], ENT_RESOURCE_POOL[3 + (i % 2)]].map((e) => ({
            ...e,
            used: Math.min(e.quotaLimit, e.used + (i % 20))
          }))
        : []
    const loginLogs: MockLoginLog[] = [0, 1, 2].map((k) => ({
      ip: `113.64.${20 + (i % 60)}.${10 + ((i + k) % 200)}`,
      userAgent: UA_POOL[(i + k) % UA_POOL.length],
      loginAt: daysAgo((i % 5) + k * 3, 9 + ((i + k) % 12))
    }))
    users.push({
      id: i,
      nickname: NICKNAMES[i - 1],
      phone: maskedPhone(i),
      email: `${EMAIL_PREFIXES[i - 1]}${i}@${EMAIL_DOMAINS[i % EMAIL_DOMAINS.length]}`,
      status: i % 9 === 4 ? 0 : 1,
      planId,
      planName: PLANS[planId - 1].name,
      chatCount: (i * 37) % 520,
      registeredAt,
      lastLoginAt: lastLogin,
      entitlements,
      loginLogs
    })
  }
  return users
}

// -------------------------------------------------------------- 订单
const ORDER_REMARKS = ['', '', '', '', '', '客户要求开具电子发票', '', '活动赠品随单发出', '', '异常订单待核实']

function buildOrders(users: MockUser[]): MockOrder[] {
  const paidUserIds = users.filter((u) => u.planId >= 2).map((u) => u.id)
  const orders: MockOrder[] = []
  let txnId = 1000
  for (let i = 1; i <= 42; i++) {
    const userId = paidUserIds[i % paidUserIds.length]
    const user = users.find((u) => u.id === userId)
    const planId = user ? user.planId : 2
    const plan = PLANS[planId - 1]
    const payChannel: 'WECHAT' | 'ALIPAY' = i % 2 === 0 ? 'WECHAT' : 'ALIPAY'
    const status: MockOrder['status'] = i % 10 === 0 ? 'PENDING' : i % 10 === 1 ? 'REFUNDED' : i % 10 === 2 ? 'CLOSED' : 'PAID'
    const createdAt = daysAgo(60 - (i % 55), 8 + (i % 14))
    const paidAt = status === 'PENDING' || status === 'CLOSED' ? null : fmt(dayjs(createdAt).add(6, 'minute'))
    const refundedAt = status === 'REFUNDED' && paidAt ? fmt(dayjs(paidAt).add(1, 'day')) : null
    const transactions: MockTxn[] = []
    if (paidAt) {
      transactions.push({
        id: ++txnId,
        txnNo: `PAY2026${String(20000000 + i)}`,
        type: 'PAY',
        payChannel,
        amount: plan.price,
        status: 'SUCCESS',
        createdAt: paidAt
      })
    }
    if (refundedAt) {
      transactions.push({
        id: ++txnId,
        txnNo: `RFD2026${String(30000000 + i)}`,
        type: 'REFUND',
        payChannel,
        amount: plan.price,
        status: 'SUCCESS',
        createdAt: refundedAt
      })
    }
    orders.push({
      id: i,
      orderNo: `ORD2026${String(10000000 + i)}`,
      userId,
      planId,
      planName: plan.name,
      amount: plan.price,
      payChannel,
      status,
      remark: ORDER_REMARKS[i % ORDER_REMARKS.length],
      paidAt,
      refundedAt,
      createdAt,
      transactions
    })
  }
  return orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

// -------------------------------------------------------------- 审计日志
const AUDIT_SAMPLES: Array<{
  action: string
  objectType: string
  build: (i: number) => { before: Record<string, unknown> | null; after: Record<string, unknown>; objectId: string }
}> = [
  {
    action: 'user.ban',
    objectType: 'user',
    build: (i) => ({
      objectId: String(4 + (i % 30)),
      before: { status: 1 },
      after: { status: 0, reason: '违规使用批量注册，封禁处理' }
    })
  },
  {
    action: 'order.refund',
    objectType: 'order',
    build: (i) => ({
      objectId: `ORD2026${String(10000000 + (i % 40) + 1)}`,
      before: { status: 'PAID' },
      after: { status: 'REFUNDED', amount: [99, 299, 2999][i % 3], reason: '用户重复支付' }
    })
  },
  {
    action: 'admin.create',
    objectType: 'admin',
    build: (i) => ({
      objectId: String(5 + (i % 3)),
      before: null,
      after: { username: ['chenjing', 'zhouqiang'][i % 2], displayName: ['陈静', '周强'][i % 2], roleIds: [2, 3] }
    })
  },
  {
    action: 'role.update',
    objectType: 'role',
    build: (i) => ({
      objectId: String(2 + (i % 3)),
      before: { name: '运营', permissionIds: [1, 5, 6, 8] },
      after: { name: '运营', permissionIds: [1, 5, 6, 7, 8, 9, 10] }
    })
  },
  {
    action: 'user.entitlement.update',
    objectType: 'user',
    build: (i) => ({
      objectId: String(1 + (i % 20)),
      before: { quotaLimit: 100 },
      after: { quotaLimit: 100 + (i % 5) * 50, quotaType: 'CHAT_COUNT' }
    })
  },
  {
    action: 'order.remark',
    objectType: 'order',
    build: (i) => ({
      objectId: `ORD2026${String(10000000 + (i % 40) + 1)}`,
      before: { remark: '' },
      after: { remark: '已联系用户核实，等待补充凭证' }
    })
  },
  {
    action: 'expert.update',
    objectType: 'expert',
    build: () => ({
      objectId: '1',
      before: { name: '1688分销选品', version: 2 },
      after: { name: '1688分销选品', version: 3, systemPrompt: '调整开场引导话术' }
    })
  },
  {
    action: 'admin.password.reset',
    objectType: 'admin',
    build: (i) => ({ objectId: String(2 + (i % 4)), before: null, after: { password: '(已重置)' } })
  }
]

function buildAuditLogs(admins: MockAdmin[]): MockAudit[] {
  const logs: MockAudit[] = []
  for (let i = 0; i < 40; i++) {
    const sample = AUDIT_SAMPLES[i % AUDIT_SAMPLES.length]
    const admin = admins[i % admins.length]
    const { objectId, before, after } = sample.build(i)
    logs.push({
      id: 500 - i,
      adminUserId: admin.id,
      username: admin.username,
      action: sample.action,
      objectType: sample.objectType,
      objectId,
      beforeJson: before,
      afterJson: after,
      ip: `192.168.1.${10 + (i % 40)}`,
      createdAt: minutesAgo(i * 217 + 40)
    })
  }
  return logs
}

// -------------------------------------------------------------- 汇总
const BUILT_USERS = buildUsers()
const BUILT_ORDERS = buildOrders(BUILT_USERS)
const BUILT_AUDIT_LOGS = buildAuditLogs(ADMINS)

export interface MockDB extends Extensions {
  admins: MockAdmin[]
  roles: MockRole[]
  permissions: MockPermission[]
  users: MockUser[]
  orders: MockOrder[]
  auditLogs: MockAudit[]
  /** token -> adminId */
  tokens: Map<string, number>
}

export const db: MockDB = {
  ...seedExtensions(),
  admins: ADMINS,
  roles: ROLES,
  permissions: PERMISSIONS,
  users: BUILT_USERS,
  orders: BUILT_ORDERS,
  auditLogs: BUILT_AUDIT_LOGS,
  tokens: new Map()
}

const DB_KEY = 'leidaai-admin-demo-v1'
let idSeq = 5000
try {
  const raw = localStorage.getItem(DB_KEY)
  if (raw) {
    const saved = JSON.parse(raw)
    if ([1, 2, 3, 4].includes(saved.version)) {
      Object.assign(db, saved.data, { permissions: PERMISSIONS, tokens: new Map(saved.tokens) })
      idSeq = saved.idSeq ?? 5000
      if (saved.version === 1) {
        const remarkPermissionId = PERMISSIONS.find((p) => p.code === 'order:remark')!.id
        db.roles
          .filter((r) => r.code === 'SUPER_ADMIN' || r.code === 'OPS')
          .forEach((r) => {
            if (!r.permissionIds.includes(remarkPermissionId)) r.permissionIds.push(remarkPermissionId)
          })
      }
      // v3 → v4：附录12 模型改造（助手预设 / SKILL.md / 双类型连接）只增不删的增量迁移；
      // 已存 v4 数据同样过一遍迁移（能力键净化、旧 file 键映射等，幂等）
      if (saved.version <= 4) migrateLegacyConfig(db)
    }
  }
} catch {
  localStorage.removeItem(DB_KEY)
}

db.roles.filter(r => r.code === 'SUPER_ADMIN').forEach(r => { r.permissionIds = [...ALL_PERM_IDS] })
let storedVersion=0
try { storedVersion=Number(JSON.parse(localStorage.getItem(DB_KEY) || '{}').version || 0) } catch { storedVersion=0 }
if (storedVersion < 3) {
  db.roles.filter(r => r.code === 'OPS').forEach(r => { r.permissionIds = [...new Set([...r.permissionIds,20,21])] })
  db.users.forEach(u => u.entitlements.forEach(e => { e.quotaPeriod = e.quotaPeriod || 'MONTH' }))
}
if (storedVersion < 4) {
  // v4 新增权限点：超管强制全量，运营增量授予技能克隆/导出
  db.roles.filter(r => r.code === 'OPS').forEach(r => { r.permissionIds = [...new Set([...r.permissionIds, ...V4_PERMISSION_IDS])] })
}
db.auditLogs = db.auditLogs.map(log => ({ ...log, beforeJson:redact(log.beforeJson) as typeof log.beforeJson, afterJson:redact(log.afterJson) as typeof log.afterJson }))
persistMockDB()

export function persistMockDB(): void {
  const { tokens, permissions: _permissions, ...data } = db
  localStorage.setItem(DB_KEY, JSON.stringify({ version: 4, data, tokens: [...tokens], idSeq }))
}

export function nextMockId(): number {
  return ++idSeq
}

export function nowStr(): string {
  return fmt(dayjs())
}

/** 某管理员的全部权限点编码（按角色聚合） */
export function permissionCodesOf(adminId: number): string[] {
  const admin = db.admins.find((a) => a.id === adminId)
  if (!admin) return []
  const roleIds = new Set(admin.roleIds)
  const ids = new Set<number>()
  db.roles
    .filter((r) => roleIds.has(r.id) && r.status === 1)
    .forEach((r) => r.permissionIds.forEach((pid) => ids.add(pid)))
  return db.permissions.filter((p) => ids.has(p.id)).map((p) => p.code)
}

export function roleRefsOf(adminId: number): Array<{ id: number; name: string }> {
  const admin = db.admins.find((a) => a.id === adminId)
  if (!admin) return []
  return db.roles.filter((r) => admin.roleIds.includes(r.id)).map((r) => ({ id: r.id, name: r.name }))
}

/** 仪表盘演示统计（不涉及契约外接口，仅 mock 模式下由页面直接使用） */
export function getDashboardStats(): { userTotal: number; userToday: number; orderTotal: number; revenueTotal: number } {
  const today = NOW.format('YYYY-MM-DD')
  const userToday = db.users.filter((u) => u.registeredAt.startsWith(today)).length
  const revenueTotal = db.orders
    .filter((o) => o.status === 'PAID')
    .reduce((sum, o) => sum + o.amount, 0)
  return {
    userTotal: db.users.length,
    userToday,
    orderTotal: db.orders.length,
    revenueTotal
  }
}
