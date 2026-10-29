import { db } from './db'
import type { ConfigItem } from '../config'

// =====================================================================
// 专家草稿对话预览演示引擎（Mock）：基于左侧表单草稿的确定性仿真。
// 回复全部由草稿配置（system_prompt 角色与关键词 / 技能绑定 / MCP 工具 /
// model_params.temperature / capabilities）推导，不假装真实 LLM 输出。
// =====================================================================

/** 预览引擎入参的草稿形状（来自请求体 draft，字段均为可选） */
export interface PreviewDraftLike {
  name?: unknown
  baseModel?: unknown
  systemPrompt?: unknown
  skillIds?: unknown
  mcpServerIds?: unknown
  capabilities?: unknown
  modelParams?: unknown
}

export interface PreviewSkillHit { id: number; code: string; name: string }
export interface PreviewToolCall { server: string; tool: string; args: Record<string, unknown> }
export interface PreviewTrace { matchedSkills: PreviewSkillHit[]; toolCalls: PreviewToolCall[]; model: string; latencyMs: number }
export interface PreviewChatResult { reply: string; trace: PreviewTrace }

/** 种子技能的路由关键词表（演示引擎口径；自定义技能回退到 name/description 分词匹配） */
const SKILL_KEYWORDS: Record<string, string[]> = {
  'dld-selection-search': ['搜索', '找货', '找品', '候选', '关键词', '货源', '竞争度'],
  'competitor-price-monitor': ['竞品', '价格', '监控', '比价', '波动', '对比'],
  'category-trend-analysis': ['趋势', '类目', '大盘', '榜单', '机会'],
  'product-detail-parse': ['详情', '链接', 'sku', '商品档案', '卖点'],
  'shop-rank-analysis': ['店铺', '排行', '对标'],
  'profit-calc': ['利润', '毛利', '测算', '费用', '售价'],
  'selection-report-gen': ['报告', '汇总', '总结']
}

function hashOf(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

function strOf(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function numIds(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []
}

/** 角色线索：优先「你是XXX」句式，其次提示词首行，最后回退显示名 */
function roleOf(draft: PreviewDraftLike): string {
  const prompt = strOf(draft.systemPrompt)
  const m = /你(?:是|为)\s*([^\n，。,.；;！!？?"“」』']{2,24})/.exec(prompt)
  if (m) return m[1].trim()
  const firstLine = prompt.split('\n').map((s) => s.trim()).find(Boolean)
  if (firstLine) return firstLine.slice(0, 24)
  return strOf(draft.name).trim() || '未命名助手'
}

/** 技能关键词：code 命中专表 + name/description 分词（长度 2–8）兜底 */
function skillKeywords(skill: ConfigItem): string[] {
  const words = `${skill.name || ''} ${skill.description || ''}`
    .split(/[^\u4e00-\u9fa5A-Za-z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && w.length <= 8)
  return [...new Set([...(SKILL_KEYWORDS[skill.code] || []), ...words])].map((w) => w.toLowerCase())
}

function matchSkills(boundSkills: ConfigItem[], message: string): ConfigItem[] {
  const text = message.toLowerCase()
  return boundSkills.filter((s) => skillKeywords(s).some((k) => text.includes(k)))
}

/** 绑定 MCP 连接（启用）下的已启用工具池 */
function boundTools(draft: PreviewDraftLike): Array<{ toolName: string; serverName: string }> {
  const serverIds = numIds(draft.mcpServerIds)
  const servers = db.servers.filter((s) => serverIds.includes(s.id) && s.status === 1)
  return db.tools
    .filter((t) => t.enabled && servers.some((s) => s.id === t.serverId))
    .map((t) => ({ toolName: t.name, serverName: servers.find((s) => s.id === t.serverId)!.name }))
}

/** 示例参数：引号内容优先提取为关键词，按工具名特征给参数形状（确定性） */
function argsFor(toolName: string, message: string): Record<string, unknown> {
  const quoted = /["“「『'](.+?)["”」』']/.exec(message)?.[1]
  const stripped = message.replace(/^(帮我|请|麻烦|我想)?(分析|对比|看看|查一下|查询|搜索|找一下|生成|测算|监控)?/, '').slice(0, 16).trim()
  const keyword = quoted || stripped || message.slice(0, 16)
  const name = toolName.toLowerCase()
  if (/search|list|billboard|rank/.test(name)) return { keyword, page_size: 20 }
  if (/trend|history|price/.test(name)) return { keyword, days: 30 }
  return { query: keyword }
}

/** 命中技能时从工具池确定性轮转挑 1–2 个（同工具去重） */
function toolCallsFor(draft: PreviewDraftLike, message: string, seed: number): PreviewToolCall[] {
  const pool = boundTools(draft)
  if (!pool.length) return []
  const count = Math.min(pool.length, 1 + (seed % 2))
  const calls: PreviewToolCall[] = []
  const seen = new Set<string>()
  for (let i = 0; i < count; i++) {
    const pick = pool[(seed + i * 7) % pool.length]
    if (seen.has(pick.toolName)) continue
    seen.add(pick.toolName)
    calls.push({ server: pick.serverName, tool: pick.toolName, args: argsFor(pick.toolName, message) })
  }
  return calls
}

/**
 * 确定性仿真：同一草稿 + 同一消息（+同一上下文长度）输出一致。
 * 人为延迟由 trace.latencyMs（400–900ms）给出，由 mock 路由 sleep 后返回。
 */
export function simulatePreviewChat(input: { draft: PreviewDraftLike; message: string; history: Array<{ role: string; content: string }> }): PreviewChatResult {
  const { draft, message, history } = input
  const seed = hashOf(`${message}||${strOf(draft.systemPrompt)}`)
  const latencyMs = 400 + (seed % 501)

  // 未选基础模型（或不在模型注册表）：拒绝生成
  const modelCode = strOf(draft.baseModel).trim()
  const model = db.models.find((m) => m.code === modelCode)
  if (!modelCode || !model) {
    return {
      reply: '〔模拟回复（演示引擎）〕\n未选择基础模型，已拒绝生成：请先在左侧「基本信息 → 基础模型」中选择模型管理中已注册的模型，再发起对话调试。',
      trace: { matchedSkills: [], toolCalls: [], model: modelCode, latencyMs }
    }
  }

  const role = roleOf(draft)
  const prompt = strOf(draft.systemPrompt)
  const mp = draft.modelParams && typeof draft.modelParams === 'object' ? (draft.modelParams as Record<string, unknown>) : undefined
  const temperature = typeof mp?.temperature === 'number' && Number.isFinite(mp.temperature) ? mp.temperature : NaN

  const openers = [`你好，我是${role}（草稿配置已生效）。`, `收到，这里是${role}。`, `我是${role}，正在按左侧草稿运行。`]
  const lines: string[] = [openers[seed % openers.length]]
  if (history.length) lines.push(`已结合本次调试的前 ${history.length} 条上下文。`)
  lines.push(`已理解你的消息：「${message.slice(0, 40)}${message.length > 40 ? '…' : ''}」。`)

  // 技能路由：消息与绑定技能 name/description 关键词匹配
  const boundSkills = db.skills.filter((s) => numIds(draft.skillIds).includes(s.id))
  const hits = matchSkills(boundSkills, message)
  if (hits.length) {
    lines.push(`已加载技能：${hits.map((s) => s.name).join('、')}（按触发意图完成路由，共 ${hits.length} 个命中）。`)
  } else if (!boundSkills.length) {
    lines.push('当前专家未配置技能（草稿绑定技能为空），本次仅基于系统提示词直接回答，无工具调用。')
  } else {
    lines.push('绑定技能均未命中该消息的触发意图，本次仅基于系统提示词直接回答。')
  }

  // 回复结构随提示词关键词变化（草稿即时生效）
  if (/选品/.test(prompt)) lines.push('执行路径：理解选品意图 → 技能路由 → 工具取数 → 结构化结论。')
  if (/1688/.test(prompt)) lines.push('数据口径以 1688 平台（含聚合网关）为准。')
  if (/报告/.test(prompt)) lines.push('按提示词约定，结论前置，按「市场 / 竞品 / 利润 / 风险」章节组织输出。')
  if (/风险/.test(prompt)) lines.push('风险提示：结论需附数据来源、样本量与异常波动标注，不臆造数据。')
  if (/幽默|活泼/.test(prompt)) lines.push('轻松一点：咱们边聊边挑好货～')
  if (/严谨|专业|正式/.test(prompt)) lines.push('我会保持严谨、可溯源的表达方式。')

  // 工具调用：命中技能时从绑定 MCP 连接的已启用工具模拟 1–2 次
  const toolCalls = hits.length ? toolCallsFor(draft, message, seed) : []
  if (toolCalls.length) {
    lines.push(`已模拟调用 ${toolCalls.length} 个工具（${toolCalls.map((t) => t.tool).join('、')}），参数依据消息关键词生成，详见下方「工具调用轨迹」。`)
  } else if (hits.length) {
    lines.push('命中技能但绑定 MCP 连接暂无已启用工具，本次跳过工具调用。')
  }

  if ((draft.capabilities as Record<string, boolean> | undefined)?.web_search) {
    lines.push('联网搜索能力已开启（草稿 capabilities），正式运行时可引用外部信息。')
  }
  if (temperature > 1) {
    lines.push(`〔元话语提示：当前生成温度 ${temperature}（草稿 model_params.temperature），高温度=更具发散性，输出稳定性下降。〕`)
  }
  lines.push(`—— 模拟回复（演示引擎）：基于左侧草稿确定性生成，非真实 LLM 输出；模型 ${model.name}（${model.code}），模拟延迟 ${latencyMs}ms。`)

  return {
    reply: lines.join('\n'),
    trace: {
      matchedSkills: hits.map((s) => ({ id: s.id, code: s.code, name: s.name })),
      toolCalls,
      model: model.code,
      latencyMs
    }
  }
}
