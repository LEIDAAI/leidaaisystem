import { db } from './db'
import type { Context, Services } from './config-handlers'
import type { ConfigItem } from '../config'

/**
 * C 端工作台只读契约（附录 12.4，Mock 演示实现）：
 * - 仅返回启用（上架）资源；专家按 visibility 匹配（匿名=仅 PUBLIC，传入 userPlanIds=PUBLIC + 命中套餐）；
 * - 技能/MCP 自身无可见性字段，展示口径为"启用（上架）资源全量展示"，并在字段中回传绑定专家数 / 启用工具数供前台参考；
 * - v0.5：三个列表端点支持 `?platform=` 查询过滤（单值 1688/OZON/AMAZON/TEMU，资源 platforms 数组命中任一即返回；未传=不过滤）；
 * - 契约只读，全部为 GET，不校验管理端权限（真实接入时由 C 端网关按用户 token 鉴权）。
 */
export function registerWorkspaceHandlers({ route, error: ErrorType }: Services) {
  const fail = (message: string, code = 422): never => { throw new ErrorType(code, message) }
  const planIdsOf = (ctx: Context): number[] =>
    String(ctx.query.userPlanIds || '').split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0)
  /** 平台查询参数：任一命中即显示（未传/空 = 不过滤；非法值匹配不到任何资源返回空数组） */
  const platformOf = (ctx: Context): string => String(ctx.query.platform || '').trim()
  const hitPlatform = (platforms: string[] | undefined, plat: string): boolean => !plat || (platforms || []).includes(plat)

  const visibleExperts = (ctx: Context): ConfigItem[] => {
    const pids = planIdsOf(ctx)
    return db.experts.filter(e => {
      if (e.status !== 1) return false
      const vis = e.visibility || { type: 'PUBLIC', planIds: [] }
      if (vis.type === 'PUBLIC') return true
      if (vis.type === 'PLAN') return pids.length > 0 && vis.planIds.some(id => pids.includes(id))
      return false
    })
  }

  route('GET', '/api/v1/workspace/experts', ctx => {
    const plat = platformOf(ctx)
    return visibleExperts(ctx).filter(e => hitPlatform(e.platforms, plat)).map(e => ({
    id: e.id, code: e.code, name: e.name,
    description: e.description || e.intro || '',
    avatarUrl: e.avatarUrl || '', baseModel: e.baseModel || '',
    // v5：平台维度（1688/OZON/AMAZON/TEMU），前台按平台页签过滤
    platforms: e.platforms || [],
    tags: e.tags || [], suggestedQuestions: e.suggestedQuestions || [],
    capabilities: e.capabilities || {},
    boundSkillCount: (e.skillIds || []).length,
    boundMcpCount: (e.mcpServerIds || []).length
  }))
  })

  // 专家详情（按 code，仅返回已上架且对视角可见的专家；系统提示词全文不下发）
  route('GET', '/api/v1/workspace/experts/:code', ctx => {
    const e = visibleExperts(ctx).find(x => x.code === ctx.params.code)
    if (!e) throw new ErrorType(404, '专家不存在或未上架')
    return {
      id: e.id, code: e.code, name: e.name,
      description: e.description || e.intro || '',
      avatarUrl: e.avatarUrl || '', baseModel: e.baseModel || '',
      platforms: e.platforms || [],
      tags: e.tags || [], suggestedQuestions: e.suggestedQuestions || [],
      capabilities: e.capabilities || {},
      boundSkillCount: (e.skillIds || []).length,
      boundMcpCount: (e.mcpServerIds || []).length,
      skillNames: (e.skillIds || []).map(id => db.skills.find(s => s.id === id)?.name || `#${id}`),
      mcpNames: (e.mcpServerIds || []).map(id => db.servers.find(s => s.id === id)?.name || `#${id}`)
    }
  })

  route('GET', '/api/v1/workspace/skills', ctx => {
    const plat = platformOf(ctx)
    return db.skills.filter(s => s.status === 1 && hitPlatform(s.platforms, plat)).map(s => ({
      id: s.id, code: s.code, name: s.name, description: s.description || '',
      platforms: s.platforms || [],
      boundExpertCount: db.experts.filter(e => e.status === 1 && (e.skillIds || []).includes(s.id)).length
    }))
  })

  route('GET', '/api/v1/workspace/mcps', ctx => {
    const plat = platformOf(ctx)
    return db.servers.filter(s => s.status === 1 && hitPlatform(s.platforms, plat)).map(s => ({
      id: s.id, code: s.code, name: s.name, connType: s.connType || 'MCP',
      endpoint: s.endpoint || '', path: s.path || '',
      platforms: s.platforms || [],
      enabledToolCount: db.tools.filter(t => t.serverId === s.id && t.enabled).length
    }))
  })

  // 未实现的工作台子路径统一 404，避免落入 admin 契约路由
  route('GET', '/api/v1/workspace/:any', () => fail('工作台接口不存在', 404))
}
