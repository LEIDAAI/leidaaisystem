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
  REFUNDED: { label: '已退款', type: 'danger' },
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

/** C 端用户状态：1 正常 0 封禁 */
export const USER_STATUS: Record<string, TagItem> = {
  '1': { label: '正常', type: 'success' },
  '0': { label: '已封禁', type: 'danger' }
}

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
