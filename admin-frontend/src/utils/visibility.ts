import type { VisibilityConfig } from '@/api/config'

/**
 * 前端可见性行内标签（Skills / Knowledge 列表共用，v14 三段可见性）：
 * PUBLIC 全员可见 / PLAN 指定套餐 / PRIVATE 内部隐藏。
 * 缺省 visibility 时回退：知识库旧数据按 legacyAccess（PRIVATE → 内部隐藏），其余视为全员可见。
 */
export function visTagOf(v: VisibilityConfig | undefined, legacyAccess?: string): { label: string; type: 'success' | 'primary' | 'warning' } {
  const eff = v || (legacyAccess === 'PRIVATE' ? { type: 'PRIVATE' as const, planIds: [] } : { type: 'PUBLIC' as const, planIds: [] })
  if (eff.type === 'PUBLIC') return { label: '全员可见', type: 'success' }
  if (eff.type === 'PLAN') return { label: `指定套餐（${eff.planIds?.length || 0} 个）`, type: 'primary' }
  return { label: '内部隐藏', type: 'warning' }
}
