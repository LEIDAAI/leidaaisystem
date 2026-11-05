import dayjs from 'dayjs'

const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

/** 订单级到期展示；缺失或非法数据不推断为长期有效。 */
export function formatOrderExpiry(order: { status: string; expiresAt?: string | null; durationMonths: number; durationDays?: number }, now = Date.now()): { text: string; time: string; type: 'info' | 'success' | 'danger' } {
  if (order.status === 'PENDING' || order.status === 'CLOSED') return { text: '未生效', time: '—', type: 'info' }
  if (order.status !== 'PAID') return { text: '—', time: '—', type: 'info' }
  if (order.expiresAt === null && (order.durationMonths === 0 || order.durationDays === 0)) return { text: '长期有效', time: '长期有效', type: 'success' }
  if (!order.expiresAt || !dayjs(order.expiresAt).isValid()) return { text: '—', time: '—', type: 'info' }
  const diff = dayjs(order.expiresAt).valueOf() - now
  return { text: `${diff > 0 ? '未到期' : '已到期'}${Math.ceil(Math.abs(diff) / 86400000)}天`, time: formatDateTime(order.expiresAt), type: diff > 0 ? 'success' : 'danger' }
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
