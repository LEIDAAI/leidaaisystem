/**
 * 全局常量与枚举（与 docs/api/admin-api.md 契约保持一致）
 */

/** 标签展示项：文案 + el-tag 颜色 */
export interface TagItem {
  label: string
  type: 'primary' | 'success' | 'warning' | 'danger' | 'info'
}

/** 订单状态 */
export const ORDER_STATUS: Record<string, TagItem> = {
  PENDING: { label: '待支付', type: 'warning' },
  PAID: { label: '已支付', type: 'success' },
  CLOSED: { label: '已关闭', type: 'info' }
}

/** 订单状态下拉选项 */
export const ORDER_STATUS_OPTIONS = Object.entries(ORDER_STATUS).map(([value, item]) => ({
  value,
  label: item.label
}))

/** 支付方式 */
export const PAY_CHANNEL: Record<string, TagItem> = {
  WECHAT: { label: '微信支付', type: 'success' },
  ALIPAY: { label: '支付宝', type: 'primary' }
}

/** 支付方式下拉选项 */
export const PAY_CHANNEL_OPTIONS = Object.entries(PAY_CHANNEL).map(([value, item]) => ({
  value,
  label: item.label
}))

/** v49 订单来源：线上 / 手工 / 赠送 */
export const ORDER_SOURCE: Record<string, TagItem> = {
  ONLINE: { label: '线上订单', type: 'primary' },
  MANUAL: { label: '手工订单', type: 'warning' },
  GIFT: { label: '赠送订单', type: 'success' }
}

export const ORDER_SOURCE_OPTIONS = Object.entries(ORDER_SOURCE).map(([value, item]) => ({
  value,
  label: item.label
}))

/** v49 购买动作（规则 §08）：首购 / 同档续费 / 升级 / 降级切换 / 增购积分包 */
export const ORDER_CATEGORY: Record<string, TagItem> = {
  FIRST_PURCHASE: { label: '首次购买', type: 'primary' },
  RENEW: { label: '同档续费', type: 'success' },
  UPGRADE: { label: '升级', type: 'warning' },
  SWITCH: { label: '降级/换周期切换', type: 'info' },
  PACK: { label: '增购积分包', type: 'info' }
}

export const ORDER_CATEGORY_OPTIONS = Object.entries(ORDER_CATEGORY).map(([value, item]) => ({
  value,
  label: item.label
}))

/** v49 到期状态筛选：与 formatOrderExpiry 的 status 一一对应 */
export const ORDER_EXPIRY_STATUS: Record<string, TagItem> = {
  ACTIVE: { label: '未到期', type: 'success' },
  EXPIRED: { label: '已到期', type: 'danger' },
  LIFETIME: { label: '长期有效', type: 'primary' },
  INACTIVE: { label: '未生效', type: 'info' },
  UNKNOWN: { label: '期限未知', type: 'info' }
}

export const ORDER_EXPIRY_STATUS_OPTIONS = Object.entries(ORDER_EXPIRY_STATUS)
  .filter(([value]) => value !== 'UNKNOWN')
  .map(([value, item]) => ({ value, label: item.label }))

/** v50 C 端用户到期状态（封禁功能已移除，用户状态列改为到期状态） */
export const USER_EXPIRY_STATUS: Record<string, TagItem> = {
  ACTIVE: { label: '未到期', type: 'success' },
  EXPIRED: { label: '已到期', type: 'danger' },
  LIFETIME: { label: '长期有效', type: 'primary' },
  NONE: { label: '无会员', type: 'info' },
  UNKNOWN: { label: '期限未知', type: 'warning' }
}

export const USER_EXPIRY_STATUS_OPTIONS = Object.entries(USER_EXPIRY_STATUS).map(([value, item]) => ({
  value,
  label: item.label
}))

/** 管理员/角色状态：1 启用 0 禁用 */
export const ADMIN_STATUS: Record<string, TagItem> = {
  '1': { label: '启用', type: 'success' },
  '0': { label: '禁用', type: 'danger' }
}

/** 管理员状态下拉选项 */
export const ADMIN_STATUS_OPTIONS = [
  { value: 1, label: '启用' },
  { value: 0, label: '禁用' }
]

/** 权益资源类型 */
export const RESOURCE_TYPE: Record<string, TagItem> = {
  EXPERT: { label: '专家', type: 'primary' },
  SKILL: { label: '技能', type: 'success' },
  MCP_TOOL: { label: 'MCP工具', type: 'warning' }
}

/** 权益资源类型下拉选项 */
export const RESOURCE_TYPE_OPTIONS = Object.entries(RESOURCE_TYPE).map(([value, item]) => ({
  value,
  label: item.label
}))

/** 配额类型 */
export const QUOTA_TYPE: Record<string, string> = {
  CHAT_COUNT: '对话次数'
}

/** 权限点模块 → 中文标题（角色权限编辑按此分组展示） */
export const PERMISSION_MODULE_LABEL: Record<string, string> = {
  dashboard: '仪表盘',
  admin: '系统管理',
  user: '用户',
  order: '订单',
  plan: '套餐',
  expert: '专家',
  skill: '技能',
  mcp: 'MCP',
  chat: '对话'
}

/** localStorage 会话存储 key */
export { AUTH_STORAGE_KEY } from '../utils/constants'
