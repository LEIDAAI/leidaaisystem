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
import { CREDIT_UNIT_PRICE } from '../../utils/credit-pricing'

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

  /** 逗号分隔 id 列表 → number[] */
  const idList = (v: unknown): number[] => String(v ?? '').trim()
    ? String(v).split(/[,，]/).map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0)
    : []

  /** 按当前查询条件过滤（列表与汇总共用，避免两处口径不一致） */
  const filtered = (ctx: Context): CreditRecord[] => {
    const phone = String(ctx.query.phone ?? '').trim()
    const project = String(ctx.query.project ?? '').trim()
    const status = String(ctx.query.status ?? '').trim()
    const type = String(ctx.query.type ?? '').trim() as CreditItemType | ''
    const content = String(ctx.query.content ?? '').trim()
    // v44：专家 / 技能 / MCP 服务多选（命中所选任一项即保留，多值之间为「或」）
    const expertIds = idList(ctx.query.expertIds)
    const skillIds = idList(ctx.query.skillIds)
    const mcpServerIds = idList(ctx.query.mcpServerIds)
    const { from, to } = parseRange(ctx)
    const phones = phone ? phone.split(/[、,，\s]+/).filter(Boolean) : []
    return db.creditRecords.filter((r) => {
      if (phones.length && !phones.some((p) => r.phone.includes(p))) return false
      if (project && r.projectName !== project) return false
      if (status && r.status !== status) return false
      if (type && !r.breakdown.some((b) => b.type === type)) return false
      if (content && !`${r.content} ${r.projectName} ${r.expertName || ''}`.toLowerCase().includes(content.toLowerCase())) return false
      if (expertIds.length && !expertIds.includes(Number(r.expertId))) return false
      if (skillIds.length && !(r.skillIds || []).some((id) => skillIds.includes(id))) return false
      if (mcpServerIds.length && !(r.mcpServerIds || []).some((id) => mcpServerIds.includes(id))) return false
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
        if (r.status === 'REFUNDED') continue
        for (const b of r.breakdown) {
          if (b.type !== type) continue
          credits += b.credits; cost += b.costPrice ?? b.cost ?? 0; count += 1
        }
      }
      const userPrice = Number((credits * CREDIT_UNIT_PRICE).toFixed(4))
      return { type, label: CREDIT_TYPE_LABEL[type], credits, cost: Number(cost.toFixed(4)), userPrice, count }
    })
    const billable = list.filter((r) => r.status !== 'REFUNDED')
    const totalCredits = billable.reduce((s, r) => s + Math.abs(r.credits), 0)
    const totalCost = Number(billable.reduce((s, r) => s + r.cost, 0).toFixed(4))
    const totalUserPrice = Number((totalCredits * CREDIT_UNIT_PRICE).toFixed(4))
    const summary: CreditSummary = {
      totalRecords: list.length,
      totalCredits,
      totalCost,
      totalUserPrice,
      grossMargin: totalUserPrice > 0 ? 1 - totalCost / totalUserPrice : undefined,
      totalPoints: billable.reduce((sum, r) => sum + (r.breakdown || []).reduce((s2, b) => s2 + (b.points || 0), 0), 0),
      chargedRecords: list.filter((r) => r.status === 'CHARGED').length,
      freeRecords: list.filter((r) => r.status === 'FREE').length,
      refundedCredits: list.filter((r) => r.status === 'REFUNDED').reduce((s, r) => s + Math.abs(r.credits), 0),
      byType
    }
    return summary
  })

  /**
   * v46：专家 / 技能 / MCP 服务下拉候选。
   * 候选来源必须是**管理模块的全量配置**（专家管理 / 技能管理 / MCP 管理），
   * 而不是反过来从消耗记录里反推——否则「已配置但还没产生消耗」的专家/技能/服务
   * 在筛选器里根本选不到（典型：绑定了但没有专家引用的 MCP 服务）。
   * 每项附带 usedCount（已产生消耗记录数）与 configured（是否已停用），
   * 便于运营区分「没数据」和「没配置」。
   */
  route('GET', '/credit-records/options', (ctx) => {
    perm(ctx, 'credit:view')
    const expertUsed = new Map<number, number>()
    const skillUsed = new Map<number, number>()
    const serverUsed = new Map<number, number>()
    for (const r of db.creditRecords) {
      if (r.expertId) expertUsed.set(r.expertId, (expertUsed.get(r.expertId) || 0) + 1)
      for (const id of r.skillIds || []) skillUsed.set(id, (skillUsed.get(id) || 0) + 1)
      for (const id of r.mcpServerIds || []) serverUsed.set(id, (serverUsed.get(id) || 0) + 1)
    }
    const build = (items: { id: number; name: string; status?: number }[], used: Map<number, number>) =>
      items
        .map((it) => ({ id: it.id, name: it.name, usedCount: used.get(it.id) || 0, status: it.status ?? 1 }))
        .sort((a, b) => b.usedCount - a.usedCount || a.id - b.id)
    return {
      experts: build(db.experts || [], expertUsed),
      skills: build(db.skills || [], skillUsed),
      mcpServers: build(db.servers || [], serverUsed)
    }
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
