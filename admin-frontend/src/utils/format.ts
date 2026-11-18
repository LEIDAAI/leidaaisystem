import dayjs from 'dayjs'
import type { DurationMode, MembershipInfo, OrderExpiryStatus } from '../api/types'

type OrderDuration = { durationMode?: DurationMode; durationMonths: number | null; durationDays?: number; membership?: MembershipInfo }
export function formatOrderDuration(order: OrderDuration): string {
  if (order.durationMode === 'MEMBERSHIP') return order.membership?.status === 'LIFETIME' ? '会员期内有效（长期会员）' : '会员期内有效'
  if (order.durationDays !== undefined && Number.isSafeInteger(order.durationDays) && order.durationDays >= 0) {
    return order.durationDays === 0 ? '长期有效' : `${order.durationDays}天`
  }
  if (order.durationMode === 'LIFETIME') return '长期有效'
  return order.durationMonths === 0 ? '长期有效' : order.durationMonths == null ? '—' : `${order.durationMonths}个月`
}

/** 只认可显式会员状态；空日期不代表长期会员。v50 起统一用「到期状态」口径（与用户列表/订单同文案）。 */
export function formatMembership(membership?: MembershipInfo): { text: string; time: string; type: 'info' | 'success' | 'danger' | 'primary' | 'warning' } {
  if (membership?.status === 'LIFETIME') return { text: '长期有效', time: '长期有效', type: 'primary' }
  if (membership?.status === 'NONE') return { text: '无会员', time: '—', type: 'info' }
  if (!membership || membership.status === 'UNKNOWN') return { text: '期限未知', time: '—', type: 'warning' }
  const time = membership.expiresAt && dayjs(membership.expiresAt).isValid() ? formatDateTime(membership.expiresAt) : '—'
  return membership.status === 'ACTIVE'
    ? { text: '未到期', time, type: 'success' }
    : { text: '已到期', time, type: 'danger' }
}

export function isValidMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
}

const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

/** 订单级到期展示；缺失或非法数据不推断为长期有效。 */
export function formatOrderExpiry(order: OrderDuration & { status: string; expiresAt?: string | null }, now = Date.now()): { text: string; time: string; type: 'info' | 'success' | 'danger' | 'primary' | 'warning'; status: OrderExpiryStatus } {
  // v49 到期状态：与列表筛选、导出使用同一判据，避免三处口径漂移
  if (order.status === 'PENDING' || order.status === 'CLOSED') return { text: '未生效', time: '—', type: 'info', status: 'INACTIVE' }
  if (order.status !== 'PAID') return { text: '—', time: '—', type: 'info', status: 'INACTIVE' }
  if (order.durationMode === 'MEMBERSHIP') {
    const m = formatMembership(order.membership)
    const status: OrderExpiryStatus = order.membership?.status === 'LIFETIME'
      ? 'LIFETIME'
      : order.membership?.status === 'ACTIVE' ? 'ACTIVE' : order.membership?.status === 'EXPIRED' ? 'EXPIRED' : 'UNKNOWN'
    return { ...m, status }
  }
  const lifetime = order.durationDays !== undefined ? order.durationDays === 0 : order.durationMode === 'LIFETIME' || order.durationMonths === 0
  if (order.expiresAt === null && lifetime) return { text: '长期有效', time: '长期有效', type: 'success', status: 'LIFETIME' }
  if (!order.expiresAt || !dayjs(order.expiresAt).isValid()) return { text: '—', time: '—', type: 'info', status: 'UNKNOWN' }
  const diff = dayjs(order.expiresAt).valueOf() - now
  return {
    text: `${diff > 0 ? '未到期' : '已到期'}${Math.ceil(Math.abs(diff) / 86400000)}天`,
    time: formatDateTime(order.expiresAt),
    type: diff > 0 ? 'success' : 'danger',
    status: diff > 0 ? 'ACTIVE' : 'EXPIRED'
  }
}

/** 按契约格式化时间：yyyy-MM-dd HH:mm:ss，空值返回占位符 */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format(DATE_TIME_FORMAT) : String(value)
}

/** 金额展示：千分位 + 两位小数 */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-'
  return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** 状态文本映射的兜底展示 */
export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}
