import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/** 无时区的后台时间按北京时间解释；带偏移的时间转换为北京时间。 */
export function beijingTime(value: string | null | undefined): string {
  if (!value) return '—'
  const text = String(value).trim()
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)
  const date = dayjs.utc(zoned ? text : `${text.replace(' ', 'T')}+08:00`).utcOffset(480)
  return date.isValid() ? date.format('YYYY-MM-DD HH:mm:ss') : '—'
}

export function beijingDate(value: string): string {
  return beijingTime(value).slice(0, 10)
}
