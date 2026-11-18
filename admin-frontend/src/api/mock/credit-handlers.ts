/**
 * v40 消耗明细（对话扣点账）后台接口。
 * - GET /credit-records        列表：按手机号 / 消耗项目 / 状态 / 时间范围 / 类型筛选 + 分页
 * - GET /credit-records/summary 汇总：总量、总扣分、总成本、按类型分布（顶部卡片用）
 * - GET /credit-records/:id     详情：整条记录（含逐笔执行过程 breakdown）
 * 数据来源：db.creditRecords（Mock 演示计量）；前台只展示总扣分，后台可下钻到每一笔模型 token 与第三方工具调用成本。
 */
import { db, permissionCodesOf } from './db'
import type { Context, Services } from './config-handlers'
import type { CreditItemType, CreditRecord, CreditSummary } from '../config'

export const CREDIT_TYPE_LABEL: Record<CreditItemType, string> = {
  LLM_MODEL: 'LLM 模型',
  MCP_TOOL: 'MCP 工具',
  SKILL: '技能执行'
}

export function registerCreditHandlers({ route, error: ErrorType }: Services): void {
  const perm = (ctx: Context, code: string): void => {
    if (!permissionCodesOf(ctx.adminId).includes(code)) throw new ErrorType(403, '无权限执行该操作')
  }

  /** 时间范围解析：支持 YYYY-MM-DD 或完整 ISO；结束日含当日（按 +1 天 00:00 处理） */
  const parseRange = (ctx: Context): { from?: number; to?: number } => {
    const raw = (key: string): string => String(ctx.query[key] ?? '').trim()
    const from = raw('from'); const to = raw('to')
    const toMs = (v: string, endOfDay: boolean): number | undefined => {
      if (!v) return undefined
      const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T${endOfDay ? '23:59:59' : '00:00:00'}` : v)
      return Number.isFinite(t) ? t : undefined
    }
    return { from: toMs(from, false), to: toMs(to, true) }
  }

  /** 按当前查询条件过滤（列表与汇总共用，避免两处口径不一致） */
  const filtered = (ctx: Context): CreditRecord[] => {
    const phone = String(ctx.query.phone ?? '').trim()
    const project = String(ctx.query.project ?? '').trim()
    const status = String(ctx.query.status ?? '').trim()
    const type = String(ctx.query.type ?? '').trim() as CreditItemType | ''
    const { from, to } = parseRange(ctx)
    const phones = phone ? phone.split(/[、,，\s]+/).filter(Boolean) : []
    return db.creditRecords.filter((r) => {
      if (phones.length && !phones.some((p) => r.phone.includes(p))) return false
      if (project && r.projectName !== project) return false
      if (status && r.status !== status) return false
      if (type && !r.breakdown.some((b) => b.type === type)) return false
      const t = Date.parse(r.createdAt)
      if (from !== undefined && t < from) return false
      if (to !== undefined && t > to) return false
      return true
    })
  }

  route('GET', '/credit-records/summary', (ctx) => {
    perm(ctx, 'credit:view')
    const list = filtered(ctx)
    const byType = (['LLM_MODEL', 'MCP_TOOL', 'SKILL'] as CreditItemType[]).map((type) => {
      let credits = 0; let cost = 0; let count = 0
      for (const r of list) {
        for (const b of r.breakdown) {
          if (b.type !== type) continue
          credits += b.credits; cost += b.cost || 0; count += 1
        }
      }
      return { type, label: CREDIT_TYPE_LABEL[type], credits, cost: Number(cost.toFixed(4)), count }
    })
    const summary: CreditSummary = {
      totalRecords: list.length,
      totalCredits: list.reduce((s, r) => s + (r.status === 'REFUNDED' ? 0 : Math.abs(r.credits)), 0),
      totalCost: Number(list.reduce((s, r) => s + (r.status === 'REFUNDED' ? 0 : r.cost), 0).toFixed(4)),
      chargedRecords: list.filter((r) => r.status === 'CHARGED').length,
      freeRecords: list.filter((r) => r.status === 'FREE').length,
      refundedCredits: list.filter((r) => r.status === 'REFUNDED').reduce((s, r) => s + Math.abs(r.credits), 0),
      byType
    }
    return summary
  })

  /** 消耗项目下拉候选（按当前库内记录去重，供筛选器用） */
  route('GET', '/credit-records/projects', (ctx) => {
    perm(ctx, 'credit:view')
    return [...new Set(db.creditRecords.map((r) => r.projectName))].sort()
  })

  route('GET', '/credit-records', (ctx) => {
    perm(ctx, 'credit:view')
    const list = filtered(ctx)
    const page = Math.max(1, Number(ctx.query.page) || 1)
    const pageSize = Math.min(200, Math.max(1, Number(ctx.query.pageSize) || 20))
    const start = (page - 1) * pageSize
    return {
      list: list.slice(start, start + pageSize),
      total: list.length,
      page,
      pageSize
    }
  })

  route('GET', '/credit-records/:id', (ctx) => {
    perm(ctx, 'credit:view')
    const item = db.creditRecords.find((r) => r.id === Number(ctx.params.id))
    if (!item) throw new ErrorType(404, '消耗记录不存在')
    return item
  })
}
