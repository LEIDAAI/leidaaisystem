import dayjs from 'dayjs'
import type { DurationMode, MembershipInfo } from '../types'
import type { ConfigItem, BillingSettings, CreditPackage } from '../config'
import { ElMessage } from 'element-plus'
import { migrateLegacyConfig, seedExtensions, seedCreditPackages, seedBillingSettings, redact, appendAskRounds, type Extensions, type Chat } from './extension-data'

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
  phone: string
  email: string
  wechatNickname: string
  region: string
  status: number
  planId: number
  planName: string
  chatCount: number
  registeredAt: string
  lastLoginAt: string | null
  entitlements: MockEntitlement[]
  loginLogs: MockLoginLog[]
  /** 持久化演示会员期限；null 表示未知或无会员，不能据此判断终身。 */
  membershipExpireAt: string | null
  membershipIsLifetime?: boolean
  /** 封禁期间暂停权益时钟；旧订单的原始期限快照保持不变。 */
  frozenPeriods?: Array<{ startedAt: number; endedAt: number | null }>
}

/** 唯一 Mock 会员源，只读取显式会员记录；真实会员服务尚未接入。 */
export function readMockMembership(user: MockUser | undefined, now = Date.now()): MembershipInfo {
  const result = (status: MembershipInfo['status'], expiresAt: string | null = null): MembershipInfo => ({ source: 'MOCK', status, expiresAt, isLifetime: status === 'LIFETIME' })
  if (!user) return result('UNKNOWN')
  if (!user.planId || user.planId === 1) return result('NONE')
  if (user.membershipIsLifetime === true) return result('LIFETIME')
  const expiry = user.membershipExpireAt
  if (!expiry || !dayjs(expiry).isValid()) return result('UNKNOWN')
  const frozenAt = user.status === 0 ? user.frozenPeriods?.find(p => p.endedAt === null)?.startedAt : undefined
  const effectiveNow = frozenAt === undefined ? now : Math.min(now, frozenAt)
  return result(dayjs(expiry).valueOf() > effectiveNow ? 'ACTIVE' : 'EXPIRED', expiry)
}

/** 展示冻结后的权益到期日，禁止回写历史订单商品/金额/期限快照。 */
export function readMockOrderExpiry(order: MockOrder, user: MockUser | undefined, now = Date.now()): string | null | undefined {
  if (!order.expiresAt || order.status !== 'PAID' || !user?.frozenPeriods?.length) return order.expiresAt
  let expiry = dayjs(order.expiresAt).valueOf()
  const paidAt = dayjs(order.paidAt || order.createdAt).valueOf()
  if (!Number.isFinite(expiry) || !Number.isFinite(paidAt)) return order.expiresAt
  for (const period of [...user.frozenPeriods].sort((a, b) => a.startedAt - b.startedAt)) {
    const start = Math.max(period.startedAt, paidAt)
    if (expiry > start) expiry += Math.max(0, Math.min(period.endedAt ?? now, now) - start)
  }
  return fmt(dayjs(expiry))
}

export interface MockTxn {
  id: number
  txnNo: string
  type: 'PAY'
  /** v11：手工订单使用 OFFLINE（线下录入）渠道 */
  payChannel: 'WECHAT' | 'ALIPAY' | 'OFFLINE'
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
  /** 实付金额 */
  amount: number
  goodsAmount: number
  discountAmount: number
  remainingCredits: number
  durationMonths: number | null
  durationMode?: DurationMode
  membership?: MembershipInfo
  durationDays?: number
  expiresAt?: string | null
  last7DaysUsage: number
  /** 订单来源：ONLINE 线上订单 / MANUAL 手工订单 / GIFT 赠送订单 */
  source: 'ONLINE' | 'MANUAL' | 'GIFT'
  creditBatchType?: 'OPS_EXCEPTION'
  payChannel: 'WECHAT' | 'ALIPAY' | 'OFFLINE'
  status: 'PENDING' | 'PAID' | 'CLOSED'
  remark: string
  paidAt: string | null
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

/** v15 反馈引用的对话快照（前台用户提交反馈时可挂载最多 4 条会话） */
export interface FeedbackChatRef {
  chatId: number
  summary: string
}

export interface MockFeedback {
  id: number
  /** 反馈编号 FB2026xxxxxx */
  fbNo: string
  userId: number
  /** 反馈内容（必填文本） */
  content: string
  /** 附图文件名列表（前台最多 4 张） */
  images: string[]
  /** 引用对话快照 */
  chatRefs: FeedbackChatRef[]
  status: 'PENDING' | 'ADOPTED' | 'REJECTED'
  /** 采纳时的积分奖励 */
  rewardPoints: number
  /** 处理说明（采纳必填，驳回可留空） */
  handleRemark: string
  handledBy: string
  handledAt: string | null
  createdAt: string
}

export const PLANS = [
  { id: 1, name: '无会员', price: 0 },
  { id: 2, name: '标准版', price: 99 },
  { id: 3, name: '高级版', price: 299 },
  { id: 4, name: '旗舰版', price: 499 }
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
// v4 新增：技能克隆/导出权限点（专家导出独立权限点见下方 v6；专家导入仍复用 expert:edit）
;([['skill:clone','技能克隆','skill',61],['skill:export','技能导出','skill',62]] as Array<[string,string,string,number]>).forEach(([code,name,module,sort]) => PERMISSIONS.push({ id: code==='skill:clone'?27:28, code, name, module, type: 2, sort }))
// v5 新增：模型管理权限点（超管全量、运营增量授予；viewer 不授予）
;([['model:view','模型查看','model',71,1],['model:edit','模型编辑','model',72,2]] as Array<[string,string,string,number,number]>).forEach(([code,name,module,sort,type],i) => PERMISSIONS.push({ id: 29+i, code, name, module, type, sort }))
// v6 新增：专家导出独立权限点（与技能导出 skill:export 对齐；导入仍走 expert:edit）
;([['expert:export','专家导出','expert',52]] as Array<[string,string,string,number]>).forEach(([code,name,module,sort]) => PERMISSIONS.push({ id: 31, code, name, module, type: 2, sort }))
// v7 新增：知识库管理权限点
;([['knowledge:view','知识库查看','knowledge',80,1],['knowledge:edit','知识库编辑','knowledge',81,2]] as Array<[string,string,string,number,number]>).forEach(([code,name,module,sort,type],i) => PERMISSIONS.push({ id: 32+i, code, name, module, type, sort }))
// v11 新增：手工/赠送订单创建权限点（授予 OPS 运营角色）
;([['order:create','订单创建','order',45]] as Array<[string,string,string,number]>).forEach(([code,name,module,sort]) => PERMISSIONS.push({ id: 34, code, name, module, type: 2, sort }))
// v15 新增：反馈管理权限点（对话管理下的前台反馈处理页；授予 OPS/SUPPORT，见版本迁移）
;([['feedback:view','反馈查看','feedback',83,1],['feedback:manage','反馈处理','feedback',84,2]] as Array<[string,string,string,number,number]>).forEach(([code,name,module,sort,type],i) => PERMISSIONS.push({ id: 35+i, code, name, module, type, sort }))
// 改价为独立金额写权限，避免备注或查看权限间接修改金额
PERMISSIONS.push({ id: 37, code: 'order:price', name: '订单改价', module: 'order', type: 2, sort: 34 })
// 运营赠送为特批权限，不随已有 order:create 自动授予。
PERMISSIONS.push({ id: 38, code: 'order:gift', name: '运营特批赠送', module: 'order', type: 2, sort: 35 })
const ALL_PERM_IDS = PERMISSIONS.map((p) => p.id)
/** v4 新增权限点 id（运营角色增量授予） */
export const V4_PERMISSION_IDS = [27, 28]
/** v5 新增权限点 id（运营角色增量授予） */
export const V5_PERMISSION_IDS = [29, 30]
/** v6 新增权限点 id（专家导出；授予所有已持有 expert:edit 的角色） */
export const V6_PERMISSION_IDS = [31]
/** v7 新增权限点 id（知识库管理；授予所有已持有 expert:edit 的角色） */
export const V7_PERMISSION_IDS = [32, 33]
/** v11 新增权限点 id（订单创建；授予 OPS 运营角色） */
export const V11_PERMISSION_IDS = [34]
/** v15 新增权限点 id（反馈管理；授予 OPS/SUPPORT 角色） */
export const V15_PERMISSION_IDS = [35, 36]

// -------------------------------------------------------------- 角色
const ROLES: MockRole[] = [
  { id: 1, code: 'SUPER_ADMIN', name: '超级管理员', remark: '全部权限', status: 1, permissionIds: [...ALL_PERM_IDS], createdAt: daysAgo(300) },
  {
    id: 2,
    code: 'OPS',
    name: '运营',
    remark: '套餐/用户/订单',
    status: 1,
    permissionIds: [1, 5, 6, 7, 8, 10, 11, 19, 34, 37],
    createdAt: daysAgo(280)
  },
  // v5：模型管理仅超管/运营持有；客服与只读均不授予（无模型菜单，见下方无条件回收）
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

const REGIONS = [
  '广东深圳', '广东广州', '浙江杭州', '浙江宁波', '江苏南京', '江苏苏州', '上海', '北京',
  '四川成都', '湖北武汉', '陕西西安', '福建厦门', '山东青岛', '湖南长沙', '河南郑州', '重庆',
  '天津', '安徽合肥', '辽宁沈阳', '河北石家庄'
]
/** 微信昵称生成（buildUsers 与 v9 存量迁移共用） */
export function userWechatNickname(i: number): string {
  return NICKNAMES[(i + 13) % NICKNAMES.length]
}
export function userRegion(i: number): string {
  return REGIONS[i % REGIONS.length]
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
    const entitlements: MockEntitlement[] = []
    const loginLogs: MockLoginLog[] = [0, 1, 2].map((k) => ({
      ip: `113.64.${20 + (i % 60)}.${10 + ((i + k) % 200)}`,
      userAgent: UA_POOL[(i + k) % UA_POOL.length],
      loginAt: daysAgo((i % 5) + k * 3, 9 + ((i + k) % 12))
    }))
    users.push({
      id: i,
      phone: maskedPhone(i),
      email: `${EMAIL_PREFIXES[i - 1]}${i}@${EMAIL_DOMAINS[i % EMAIL_DOMAINS.length]}`,
      wechatNickname: userWechatNickname(i),
      region: userRegion(i),
      status: i % 9 === 4 ? 0 : 1,
      planId,
      planName: PLANS[planId - 1].name,
      chatCount: (i * 37) % 520,
      registeredAt,
      membershipExpireAt: planId >= 2 ? fmt(dayjs(registeredAt).add(1, 'year')) : null,
      membershipIsLifetime: false,
      lastLoginAt: lastLogin,
      entitlements,
      loginLogs
    })
  }
  return users
}

// -------------------------------------------------------------- 订单
const ORDER_REMARKS = ['', '', '', '', '', '客户要求开具电子发票', '', '活动赠品随单发出', '', '异常订单待核实']

/** 订单金额/积分扩展字段（buildOrders 与 v10 存量迁移共用，i 为订单 id） */
export function orderDiscountAmount(i: number): number {
  return [0, 10, 20, 30, 50][i % 5]
}
export function orderRemainingCredits(i: number): number {
  return ((i * 137) % 18 + 2) * 100
}
export function orderDurationMonths(planId: number): number {
  return [0, 1, 3, 12][planId - 1] ?? 1
}
export function orderLast7DaysUsage(i: number): number {
  return (i * 53) % 480 + 20
}

function buildOrders(users: MockUser[]): MockOrder[] {
  const paidUserIds = users.filter((u) => u.planId >= 2).map((u) => u.id)
  const orders: MockOrder[] = []
  let txnId = 1000
  for (let i = 1; i <= 42; i++) {
    const userId = paidUserIds[i % paidUserIds.length]
    const user = users.find((u) => u.id === userId)
    const planId = user ? user.planId : 2
    const plan = PLANS[planId - 1]
    const payChannel: MockTxn['payChannel'] = i % 2 === 0 ? 'WECHAT' : 'ALIPAY'
    const status: MockOrder['status'] = i % 10 === 0 ? 'PENDING' : i % 10 === 2 ? 'CLOSED' : 'PAID'
    const createdAt = daysAgo(60 - (i % 55), 8 + (i % 14))
    const paidAt = status === 'PENDING' || status === 'CLOSED' ? null : fmt(dayjs(createdAt).add(6, 'minute'))
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
    orders.push({
      id: i,
      orderNo: `ORD2026${String(10000000 + i)}`,
      source: 'ONLINE',
      userId,
      planId,
      planName: plan.name,
      amount: plan.price,
      goodsAmount: plan.price + orderDiscountAmount(i),
      discountAmount: orderDiscountAmount(i),
      remainingCredits: orderRemainingCredits(i),
      durationMonths: orderDurationMonths(planId),
      expiresAt: paidAt ? fmt(dayjs(paidAt).add(orderDurationMonths(planId), 'month')) : null,
      last7DaysUsage: orderLast7DaysUsage(i),
      payChannel,
      status,
      remark: ORDER_REMARKS[i % ORDER_REMARKS.length],
      paidAt,
      createdAt,
      transactions
    })
  }
  return orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

// -------------------------------------------------------------- 反馈（v15：前台「提供反馈」入口）
const FEEDBACK_CONTENTS = [
  '网页版分析报告在手机浏览器打开后表格排版错位，横屏也显示不全，希望适配一下移动端。',
  '1688选品搜索经常在 200 元预算档位漏掉部分候选商品，两个账号测试都复现了，麻烦排查下召回逻辑。',
  '希望支持把多个专家的分析结果合并对比，现在要来回切换会话截图比对，比较麻烦。',
  '技能「竞品价格监控」的告警邮件偶尔延迟两三个小时才收到，做亚马逊跟卖监控会错过调价时机。',
  '免费版每天 5 次对话根本不够用，建议增加邀请好友得额外次数的活动。',
  '分析的毛利率和实际普遍偏差在 5 个点以上，建议把头程运费计入成本估算。',
  '网页加载到第三步「数据分析」时经常卡住，刷新后要重新问一遍，白白消耗积分。',
  'MCP 工具 ali_product_search 返回的商品图片链接经常失效，能不能换成带时效签名的地址。',
  '建议给报告增加一键导出 PPT 的功能，我们每周选品会要用。',
  '支付成功后积分到账延迟了十分钟，客服响应很快已解决，建议优化到账速度。',
  '抖音带货选品专家给出的达人匹配建议太泛了，希望支持按类目和佣金率筛选达人。',
  '知识库上传 PDF 后解析不到表格内容，纯文本部分没问题，表格被整段丢掉了。',
  '套餐升级后旧套餐的剩余积分没有折算，咨询客服说是规则如此，希望能折算或保留。',
  '对话记录只能整段删除，希望能只删除其中某一次追问，保留前面的分析结果。',
  '深色模式下左侧导航文字和背景几乎融为一体，看不清，切回浅色才正常。'
]
/** 与 FEEDBACK_CONTENTS 对齐的附图（0-4 张，存文件名演示） */
const FEEDBACK_IMAGES: string[][] = [
  ['fb-shot-01.png'],
  ['fb-shot-02-1.png', 'fb-shot-02-2.png'],
  [],
  [],
  [],
  ['fb-shot-06-1.png', 'fb-shot-06-2.png', 'fb-shot-06-3.png'],
  ['fb-shot-07-1.png', 'fb-shot-07-2.png'],
  [],
  [],
  ['fb-shot-10.png'],
  [],
  ['fb-shot-12-1.png', 'fb-shot-12-2.png', 'fb-shot-12-3.png', 'fb-shot-12-4.png'],
  [],
  ['fb-shot-14.png'],
  []
]
const FEEDBACK_STATUS: MockFeedback['status'][] = ['PENDING', 'ADOPTED', 'PENDING', 'REJECTED', 'PENDING', 'PENDING', 'ADOPTED', 'PENDING', 'REJECTED', 'PENDING', 'ADOPTED', 'PENDING', 'PENDING', 'REJECTED', 'PENDING']

function buildFeedbacks(users: MockUser[], chats: Chat[]): MockFeedback[] {
  const activeChats = chats.filter((c) => !c.deletedAt)
  const list: MockFeedback[] = []
  for (let i = 0; i < FEEDBACK_CONTENTS.length; i++) {
    const status = FEEDBACK_STATUS[i]
    const handled = status !== 'PENDING'
    const user = users[(i * 3 + 2) % users.length]
    // 引用对话：每 4 条中 1 条不引用、1 条引用 2 条会话，其余引用 1 条
    const refCount = i % 4 === 1 ? 0 : i % 4 === 3 ? 2 : 1
    const refs: FeedbackChatRef[] = Array.from({ length: refCount }, (_, k) => {
      const chat = activeChats[(i * 2 + k) % activeChats.length]
      return { chatId: chat.id, summary: String(redact(chat.messages[0]?.content.slice(0, 80) || '')) }
    })
    const createdAt = i === 0 ? minutesAgo(26) : daysAgo(1 + i * 2, 9 + (i % 12))
    list.push({
      id: 7000 + i,
      fbNo: `FB2026${String(100001 + i)}`,
      userId: user.id,
      content: FEEDBACK_CONTENTS[i],
      images: FEEDBACK_IMAGES[i],
      chatRefs: refs,
      status,
      rewardPoints: status === 'ADOPTED' ? [200, 500, 300, 200][i % 4] : 0,
      handleRemark: handled
        ? status === 'ADOPTED'
          ? ['问题已复现并纳入本周迭代，感谢反馈', '已修复上线，补偿积分已发放至账户', '需求已评估通过，预计下个版本支持'][i % 3]
          : ['与现有功能重复，暂不单独迭代', '经核实为个别场景问题，暂不处理'][i % 2]
        : '',
      handledBy: handled ? ['admin', 'liwei', 'support'][i % 3] : '',
      handledAt: handled ? fmt(dayjs(createdAt).add(1, 'day').hour(15).minute(30)) : null,
      createdAt
    })
  }
  return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
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
      // 权限 id 必须真实存在于字典（9 已废弃，订单备注为 19），避免前端按 id 反查展示悬空
      after: { name: '运营', permissionIds: [1, 5, 6, 7, 8, 19, 10] }
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
const BUILT_EXTENSIONS = seedExtensions()
const BUILT_USERS = buildUsers()
const BUILT_ORDERS = buildOrders(BUILT_USERS)
const BUILT_AUDIT_LOGS = buildAuditLogs(ADMINS)
const BUILT_FEEDBACKS = buildFeedbacks(BUILT_USERS, BUILT_EXTENSIONS.chats)

export const MOCK_COMMERCE_RULES = {
  registerBonus: 100,
  sameFeaturesAcrossTiers: true,
  seatsEnabled: false,
  upgradeBasis: 'ACTUAL_PAID',
  upgradeMinimumAmount: 0,
  monthlyToYearly: 'IMMEDIATE_RESET_ANCHOR',
  yearlyToMonthly: 'AT_EXPIRY',
  downgrade: 'AT_EXPIRY',
  futurePeriods: 'QUEUE_LOCKED_PRICE',
  refundsEnabled: false,
  autoRenewEnabled: false,
  expiryReminderDays: 7,
  paidCreditPackage: { validityDays: 365, requiresActiveAccount: true, allowedMembershipStatuses: ['ACTIVE', 'LIFETIME'], survivesMembershipExpiry: true, bonusCredits: 0 },
  operationsGift: { permission: 'order:gift', reasonRequired: true, batchType: 'OPS_EXCEPTION' }
} as const

export interface MockDB extends Extensions {
  commerceRules: typeof MOCK_COMMERCE_RULES
  /** 规则升级前的配置留档；订单及历史版本不重写。 */
  legacyRuleSettings?: { plans: ConfigItem[]; billingSettings: BillingSettings; creditPackages: CreditPackage[] }

  admins: MockAdmin[]
  roles: MockRole[]
  permissions: MockPermission[]
  users: MockUser[]
  orders: MockOrder[]
  auditLogs: MockAudit[]
  feedbacks: MockFeedback[]
  /** token -> adminId */
  tokens: Map<string, number>
}

export const db: MockDB = {
  ...BUILT_EXTENSIONS,
  commerceRules: MOCK_COMMERCE_RULES,
  admins: ADMINS,
  roles: ROLES,
  permissions: PERMISSIONS,
  users: BUILT_USERS,
  orders: BUILT_ORDERS,
  auditLogs: BUILT_AUDIT_LOGS,
  feedbacks: BUILT_FEEDBACKS,
  tokens: new Map()
}

const DB_KEY = 'leidaai-admin-demo-v1'
let idSeq = 5000
try {
  const raw = localStorage.getItem(DB_KEY)
  if (raw) {
    const saved = JSON.parse(raw)
    if (Number.isInteger(saved.version) && saved.version >= 1 && saved.version <= 19 && saved.data && typeof saved.data === 'object') {
      // 结构校验：仅恢复对象/数组型集合，损坏条目丢弃回退种子数据
      const restored: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(saved.data)) {
        if (value !== null && typeof value === 'object') restored[key] = value
      }
      Object.assign(db, restored, { permissions: PERMISSIONS, tokens: new Map(Array.isArray(saved.tokens) ? saved.tokens : []) })
      idSeq = saved.idSeq ?? 5000
      if (saved.version === 1) {
        const remarkPermissionId = PERMISSIONS.find((p) => p.code === 'order:remark')!.id
        db.roles
          .filter((r) => r.code === 'SUPER_ADMIN' || r.code === 'OPS')
          .forEach((r) => {
            if (!r.permissionIds.includes(remarkPermissionId)) r.permissionIds.push(remarkPermissionId)
          })
      }
      // v3 → v4 → v5：附录12 助手体系模型改造与模型管理/平台维度/版本名称（只增不删的增量迁移，幂等）；
      // 已存 v5/v6 数据同样过一遍迁移（能力键净化、平台/版本名称回填等；v6 仅新增权限点，配置结构未变）
      if (saved.version <= 5) migrateLegacyConfig(db)
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
if (storedVersion < 5) {
  // v5 新增权限点：运营增量授予模型管理查看/编辑
  db.roles.filter(r => r.code === 'OPS').forEach(r => { r.permissionIds = [...new Set([...r.permissionIds, ...V5_PERMISSION_IDS])] })
}
if (storedVersion < 6) {
  // v6 新增权限点：专家导出授予所有已持有 expert:edit(id 12) 的角色（能力不回退；超管由上方全量覆盖自动获得）
  db.roles.filter(r => r.permissionIds.includes(12)).forEach(r => { r.permissionIds = [...new Set([...r.permissionIds, ...V6_PERMISSION_IDS])] })
}
if (storedVersion < 7) {
  // v7 新增权限点：知识库管理授予所有已持有 expert:edit(id 12) 的角色
  db.roles.filter(r => r.permissionIds.includes(12)).forEach(r => { r.permissionIds = [...new Set([...r.permissionIds, ...V7_PERMISSION_IDS])] })
  // v7 新增场景与知识库集合（幂等：已存在则跳过；seedExtensions 已在顶部导入）
  if (!db.scenarios || !db.knowledgeBases) {
    const ext = seedExtensions()
    if (!db.scenarios) db.scenarios = ext.scenarios
    if (!db.knowledgeBases) db.knowledgeBases = ext.knowledgeBases
  }
}
if (storedVersion < 8) {
  // v8 知识库文档：kbFiles 集合兜底（旧数据恢复时无此集合则取种子）、knowledgeBases 补 access 默认公开、fileCount 按真实文档数同步
  if (!Array.isArray(db.kbFiles)) db.kbFiles = seedExtensions().kbFiles
  ;(db.knowledgeBases || []).forEach((kb) => {
    if (kb.access !== 'PRIVATE' && kb.access !== 'PUBLIC') kb.access = 'PUBLIC'
    kb.fileCount = db.kbFiles.filter((f) => f.kbId === kb.id).length
  })
}
if (storedVersion < 9) {
  // v9 用户字段扩展：微信昵称/客户地区（存量数据按 id 幂等回填，与新种子同一生成函数）
  db.users.forEach((u) => {
    if (!u.wechatNickname) u.wechatNickname = userWechatNickname(u.id)
    if (!u.region) u.region = userRegion(u.id)
  })
}
if (storedVersion < 10) {
  // v10 订单字段扩展：商品金额/优惠金额/剩余积分/套餐时长/近7日消耗（存量按 id 幂等回填，与新种子同一生成函数）
  db.orders.forEach((o) => {
    o.discountAmount = orderDiscountAmount(o.id)
    o.goodsAmount = o.amount + o.discountAmount
    o.remainingCredits = orderRemainingCredits(o.id)
    o.durationMonths = orderDurationMonths(o.planId)
    o.last7DaysUsage = orderLast7DaysUsage(o.id)
  })
}
if (storedVersion < 11) {
  // v11 订单来源（线上/手工/赠送）+ 赠送套餐体系（与套餐管理联动）：
  // 1) 存量订单幂等回填 source='ONLINE'；存量套餐幂等回填 planType='NORMAL'
  db.orders.forEach((o) => { if (!o.source) o.source = 'ONLINE' })
  db.plans.forEach((p) => { if (!p.planType) p.planType = 'NORMAL' })
  // 2) 注入内置赠送套餐 plan_gift（幂等；fresh 库种子已含则跳过）：价格 0、长期有效（durationDays=0）
  if (!db.plans.some((p) => p.code === 'plan_gift')) {
    db.plans.push({
      id: 5, code: 'plan_gift', name: '赠送体验包', price: 0, durationDays: 0,
      entitlements: [], planType: 'GIFT', status: 1, version: 1,
      updatedAt: nowStr(), refreshStatus: 'PENDING', appliedVersion: 1, refreshMessage: ''
    })
  }
  // 3) 幂等种演示单：1 笔手工订单 + 1 笔赠送订单（unshift 置顶便于演示）
  const activeUsers = db.users.filter((u) => u.status === 1)
  const manualUser = activeUsers[1] || activeUsers[0]
  const manualPlan = db.plans.find((p) => (p.planType || 'NORMAL') !== 'GIFT' && p.status === 1 && Number(p.price) > 0)
  if (manualUser && manualPlan && !db.orders.some((o) => o.source === 'MANUAL')) {
    const mid = nextMockId()
    const mat = nowStr()
    db.orders.unshift({
      id: mid, orderNo: `ORD2026${String(10000000 + mid)}`, source: 'MANUAL', userId: manualUser.id,
      planId: manualPlan.id, planName: manualPlan.name, amount: Number(manualPlan.price), goodsAmount: Number(manualPlan.price), discountAmount: 0,
      remainingCredits: 5000, durationMonths: Number(manualPlan.durationDays) === 0 ? 0 : Math.max(1, Math.ceil(Number(manualPlan.durationDays) / 30)), last7DaysUsage: 0,
      payChannel: 'OFFLINE', status: 'PAID', remark: '线下对公转账，人工核实到账后录入',
      durationDays: Number(manualPlan.durationDays),
      expiresAt: Number(manualPlan.durationDays) === 0 ? null : fmt(dayjs(mat).add(Number(manualPlan.durationDays), 'day')),
      paidAt: mat, createdAt: mat,
      transactions: [{ id: nextMockId(), txnNo: `PAY2026${String(20000000 + mid)}`, type: 'PAY', payChannel: 'OFFLINE', amount: Number(manualPlan.price), status: 'SUCCESS', createdAt: mat }]
    })
  }
  // 历史赠送单原样保留；新库不再自动生成常规促销赠送单。
  // 4) 新权限点 order:create：授予 OPS 运营角色（原基于已下线的 order:refund，能力不回退；超管由上方全量覆盖自动获得）
  db.roles.filter((r) => r.code === 'OPS').forEach((r) => { r.permissionIds = [...new Set([...r.permissionIds, ...V11_PERMISSION_IDS])] })
}
if (storedVersion < 12) {
  // v12 知识库前端可见性（v14 与专家/MCP 同款三段设置）：存量按 access 幂等回填 visibility（PRIVATE→内部隐藏，其余→全员可见）
  ;(db.knowledgeBases || []).forEach((kb) => {
    if (!kb.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(kb.visibility.type)) {
      kb.visibility = kb.access === 'PRIVATE' ? { type: 'PRIVATE', planIds: [] } : { type: 'PUBLIC', planIds: [] }
    }
  })
}
if (storedVersion < 13) {
  // v13 会话多轮问话：存量会话幂等追加第 2 轮用户追问（种子已含 2 轮则自动跳过），支撑展开区按问话查看分析
  db.chats.forEach(c => appendAskRounds(c))
}
if (storedVersion < 14) {
  // v14 专家场景分组：存量未分组专家按种子 id 幂等回填演示场景（不覆盖用户已设分组）
  const ext14 = seedExtensions()
  db.experts.forEach((e) => {
    if (e.scenarioId !== undefined) return
    const seeded = ext14.experts.find((x) => x.id === e.id)
    if (seeded?.scenarioId !== undefined) e.scenarioId = seeded.scenarioId
  })
}
if (storedVersion < 15) {
  // v15 反馈管理（对话管理下的前台反馈处理页）：feedbacks 集合兜底（旧数据恢复时无此集合则取种子）；
  // 反馈权限授予 OPS/SUPPORT（超管由上方全量覆盖自动获得）
  if (!Array.isArray(db.feedbacks)) db.feedbacks = buildFeedbacks(db.users, db.chats)
  db.roles.filter(r => r.code === 'OPS' || r.code === 'SUPPORT').forEach(r => { r.permissionIds = [...new Set([...r.permissionIds, ...V15_PERMISSION_IDS])] })
}
if (storedVersion < 16) {
  // v16 对话标题：存量会话按首条用户消息幂等回填（取首个标点前的主题短句、截断 24 字，避免带出「，预算…」尾巴）
  db.chats.forEach(c => {
    if (c.title) return
    const first = c.messages.find(m => m.role === 'user')?.content || ''
    c.title = first.split(/[，。！？；;,.!?：:、]/)[0].trim().slice(0, 24) || `会话 #${c.id}`
  })
}
if (storedVersion < 17) {
  // v17 套餐营销/计费扩展：planVersions 版本快照、creditPackages 加油包商品、billingSettings 计费设置集合兜底
  // （旧库存量 plans 无营销新字段属正常，不强制回填，保存套餐时按表单增量写入）
  db.planVersions ||= {}
  db.creditPackages ||= seedCreditPackages()
  db.billingSettings ||= seedBillingSettings()
}
if (storedVersion < 18) {
  // 既有运营角色获得订单改价权限；只读、客服和数据分析角色不授权
  db.roles.filter(r => r.code === 'OPS').forEach(r => { r.permissionIds = [...new Set([...r.permissionIds, 37])] })
}
if (storedVersion < 19) {
  const seedPlans = db.plans.filter(p => (p.id >= 1 && p.id <= 4 && p.code === `plan_${p.id}`) || p.code === 'plan_gift')
  db.legacyRuleSettings = {
    plans: structuredClone(seedPlans),
    billingSettings: structuredClone(db.billingSettings),
    creditPackages: structuredClone(db.creditPackages)
  }
  const features = ['全部专家与技能', '全平台商品分析', '高级报告与批量分析', '单账号使用']
  const tiers = [
    { id: 2, name: '标准版', oldPrice: 99, price: 99, oldCredits: 10000, credits: 5600, yearly: 949, oldYearly: 990 },
    { id: 3, name: '高级版', oldPrice: 299, price: 299, oldCredits: 30000, credits: 22000, yearly: 2870, oldYearly: 2990 },
    { id: 4, name: '旗舰版', oldPrice: 2999, price: 499, oldCredits: 100000, credits: 52500, yearly: 4788, oldYearly: undefined }
  ]
  for (const plan of seedPlans) {
    const before = structuredClone(plan)
    const tier = tiers.find(t => t.id === plan.id)
    if (tier) {
      plan.name = tier.name
      // 仅替换旧种子默认报价，保留已编辑的价格及首购价（含显式 0）。
      if (plan.price === tier.oldPrice) plan.price = tier.price
      if (plan.credits === tier.oldCredits || plan.credits === undefined) plan.credits = tier.credits
      plan.tagline = '三档功能一致，仅每月积分额度不同'
      plan.features = [...features]
      plan.frontendPerms = { planView: true, planCreate: true, skillView: true, skillCreate: true, mcpView: true, mcpCreate: true }
      plan.grantMode = 'MONTHLY'
      plan.creditExpiry = 'MONTH_RESET'
      const cycles = plan.billingCycles
      if (cycles?.length) {
        plan.billingCycles = cycles.map(cycle => ({
          ...cycle,
          price: cycle.cycle === 'MONTHLY' && cycle.price === tier.oldPrice ? tier.price
            : cycle.cycle === 'YEARLY' && cycle.price === tier.oldYearly ? tier.yearly : cycle.price
        }))
        if (tier.id === 4 && !cycles.some(c => c.cycle === 'YEARLY')) plan.billingCycles.push({ cycle: 'YEARLY', price: tier.yearly })
      } else if (cycles === undefined) {
        plan.billingCycles = [{ cycle: 'MONTHLY', price: plan.price ?? tier.price }, { cycle: 'YEARLY', price: tier.yearly }]
      }
    } else if (plan.id === 1) {
      plan.name = '历史免费版（停售）'
      plan.status = 0
      plan.tagline = '仅保留旧数据引用，新注册赠送 100 积分'
    } else if (plan.code === 'plan_gift') {
      plan.name = '运营特批赠送'
      plan.tagline = '仅限有权限的运营特批，必须填写原因并审计'
      plan.features = ['运营特批专用']
    }
    if (JSON.stringify(before) !== JSON.stringify(plan)) {
      plan.version += 1
      plan.updatedAt = nowStr()
      plan.refreshStatus = 'PENDING'
      ;(db.planVersions[plan.id] ||= []).push({
        version: plan.version, versionName: 'v19（已拍板规则迁移）', operator: 'system',
        note: '统一三档与运营特批规则，历史订单及原版本保留', createdAt: plan.updatedAt, snapshot: structuredClone(plan)
      })
    }
  }
  db.users.forEach(user => {
    const tier = tiers.find(t => t.id === user.planId)
    if (tier && ['标准版', '专业版', '企业版'].includes(user.planName)) user.planName = tier.name
    if (user.planId === 1 && user.planName === '免费版') user.planName = '无会员'
  })
  db.billingSettings.registerBonus = MOCK_COMMERCE_RULES.registerBonus
  db.billingSettings.upgradePolicy = 'PRORATED'
  // 历史促销配置已留档；付费包不再夹带常规赠分。
  db.creditPackages.forEach(pack => { pack.bonusCredits = 0 })
}
db.commerceRules = MOCK_COMMERCE_RULES
db.users.forEach(user => {
  user.frozenPeriods ||= []
  // 旧封禁缺少可靠起点，从迁移时开始冻结，不猜测历史封禁时长。
  if (user.status === 0 && !user.frozenPeriods.some(p => p.endedAt === null)) {
    user.frozenPeriods.push({ startedAt: Date.now(), endedAt: null })
  }
})
db.billingSettings.creditSlider.defaultValue ??= db.billingSettings.creditSlider.min
if (storedVersion < 20) {
  // v20：写接口同步强制已拍板规则——付费包赠分 0、注册赠分固定 100、升级固定 PRORATED。
  // 页面固定值与 v19 迁移不能约束直接调接口的路径，这里仅归一存量配置；此后 PUT 校验拦截非拍板值。
  db.creditPackages.forEach(pack => { pack.bonusCredits = 0 })
  if (db.billingSettings) {
    db.billingSettings.registerBonus = 100
    db.billingSettings.upgradePolicy = 'PRORATED'
  }
}
// R9 幂等增量迁移：历史演示回填非真实权益；仅补缺失字段，保留已有期限（含 null）。
// 兼容早期 R9 的显式 mockMembership 记录；读取时不再按注册日期临时推算。
db.users.forEach((user) => {
  const legacy = (user as MockUser & { mockMembership?: { expiresAt: string | null; isLifetime?: boolean } }).mockMembership
  if (!Object.prototype.hasOwnProperty.call(user, 'membershipExpireAt')) {
    user.membershipExpireAt = legacy ? legacy.expiresAt : PLANS.some((plan) => plan.id === user.planId && plan.price > 0) && dayjs(user.registeredAt).isValid() ? fmt(dayjs(user.registeredAt).add(1, 'year')) : null
  }
  if (!Object.prototype.hasOwnProperty.call(user, 'membershipIsLifetime')) user.membershipIsLifetime = legacy?.isLifetime === true
})
// v17 订单到期增量迁移：仅补缺失字段，历史月数按日历月演示回填，不读取当前套餐。
db.orders.forEach((order) => {
  if (order.durationMode === 'MEMBERSHIP') return
  if (Object.prototype.hasOwnProperty.call(order, 'expiresAt')) return
  if (order.status !== 'PAID') {
    order.expiresAt = null
  } else if (order.durationMonths === 0 || order.durationDays === 0) {
    order.expiresAt = null
  } else if (order.paidAt && dayjs(order.paidAt).isValid()) {
    if (Number.isFinite(order.durationDays) && Number(order.durationDays) > 0) order.expiresAt = fmt(dayjs(order.paidAt).add(Number(order.durationDays), 'day'))
    else if (Number.isInteger(order.durationMonths) && Number(order.durationMonths) > 0) order.expiresAt = fmt(dayjs(order.paidAt).add(Number(order.durationMonths), 'month'))
  }
})
// v17 幂等兜底：套餐版本快照集合任何路径漏初始化时补空对象（防旧库直跳或数据损坏）
db.planVersions ||= {}
// v5 权限修正（无条件幂等，兼容此前已存 v5 数据）：模型管理仅超管/运营持有，客服/只读一律回收 model:view、model:edit
db.roles.filter(r => r.code === 'SUPPORT' || r.code === 'VIEWER').forEach(r => { r.permissionIds = r.permissionIds.filter(id => !V5_PERMISSION_IDS.includes(id)) })
db.auditLogs = db.auditLogs.map(log => ({ ...log, beforeJson:redact(log.beforeJson) as typeof log.beforeJson, afterJson:redact(log.afterJson) as typeof log.afterJson })).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
// 旧库序列号可能落后于日志/反馈，恢复后不能复用已有记录 ID。
idSeq = Math.max(idSeq, ...db.auditLogs.map(log => log.id), ...db.orders.flatMap(order => [order.id, ...order.transactions.map(txn => txn.id)]), ...db.feedbacks.map(item => item.id))
/** 持久化上限：审计日志与版本快照仅保留最近 N 条，防止 localStorage 无限增长 */
const PERSIST_AUDIT_LIMIT = 500
const PERSIST_VERSION_LIMIT = 20

/** 配额告警节流：写满后仅提示一次，写入恢复成功后复位 */
let quotaWarned = false

/** mock 登录态 TTL 唯一真源（2h）：handlers 的 expiresIn（秒）与 401 校验均由此换算，避免多处硬编码漂移 */
export const MOCK_TOKEN_TTL_MS = 7200_000
function pruneExpiredTokens(): void {
  const now = Date.now()
  for (const tk of [...db.tokens.keys()]) {
    const issuedAt = Number(tk.slice(tk.lastIndexOf('-') + 1))
    if (!issuedAt || now - issuedAt > MOCK_TOKEN_TTL_MS) db.tokens.delete(tk)
  }
}

pruneExpiredTokens() // 恢复自 localStorage 的历史 token 先清理一次过期条目
persistMockDB()

export function persistMockDB(): void {
  try {
    pruneExpiredTokens()
    const { tokens, permissions: _permissions, auditLogs, expertVersions, skillVersions, mcpVersions, planVersions, promptHistory, ...data } = db
    const trimMap = <T>(map: Record<string, T[]>): Record<string, T[]> =>
      Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.slice(-PERSIST_VERSION_LIMIT)]))
    localStorage.setItem(
      DB_KEY,
      JSON.stringify({
        version: 20,
        data: {
          ...data,
          auditLogs: Array.isArray(auditLogs) ? [...auditLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id).slice(0, PERSIST_AUDIT_LIMIT) : [],
          expertVersions: trimMap(expertVersions || {}),
          skillVersions: trimMap(skillVersions || {}),
          mcpVersions: trimMap(mcpVersions || {}),
          planVersions: trimMap(planVersions || {}),
          promptHistory: trimMap(promptHistory || {})
        },
        tokens: [...tokens],
        idSeq
      })
    )
    quotaWarned = false
  } catch {
    // localStorage 满/被禁用时降级：本次变更仅保留在内存，并提示用户可能丢失
    if (!quotaWarned) {
      quotaWarned = true
      ElMessage.warning('本地存储空间不足或被禁用，本次改动刷新后可能丢失')
    }
  }
}

export function nextMockId(): number {
  return ++idSeq
}

export function nowStr(): string {
  return fmt(dayjs())
}

/** 版本名称自动生成戳：yyyyMMddHHmmss（本地时间，v5） */
export function stampStr(): string {
  return dayjs().format('YYYYMMDDHHmmss')
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

