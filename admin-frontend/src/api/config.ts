import { get, post, put, del } from './request'
import type { PageData } from './types'
import type { IntroFileMeta } from './files'

export interface Entitlement {
  resourceType: 'EXPERT' | 'SKILL' | 'MCP_TOOL'
  resourceId: number
  resourceName?: string
  quotaType: 'CHAT_COUNT' | 'SKILL_CALL'
  quotaLimit: number
  quotaPeriod: 'DAY' | 'MONTH' | 'LIFETIME'
  used?: number
}
/** 套餐前台权限开关集（套餐/技能/MCP × 查看/创建，作用于前台工作台用户侧能力） */
export interface FrontendPerms {
  planView: boolean; planCreate: boolean
  skillView: boolean; skillCreate: boolean
  mcpView: boolean; mcpCreate: boolean
}
/** 未配置时的缺省值：全部允许 */
export const FRONTEND_PERM_DEFAULTS: FrontendPerms = {
  planView: true, planCreate: true,
  skillView: true, skillCreate: true,
  mcpView: true, mcpCreate: true
}
/** 前台权限开关展示元数据（分组 × 开关） */
export const FRONTEND_PERM_GROUPS: Array<{ label: string; items: Array<{ key: keyof FrontendPerms; label: string }> }> = [
  { label: '套餐', items: [{ key: 'planView', label: '查看套餐' }, { key: 'planCreate', label: '创建套餐' }] },
  { label: '技能', items: [{ key: 'skillView', label: '查看技能' }, { key: 'skillCreate', label: '创建技能' }] },
  { label: 'MCP', items: [{ key: 'mcpView', label: '查看 MCP' }, { key: 'mcpCreate', label: '创建 MCP' }] }
]
/** 归一化：未知/缺失键按缺省允许处理，非布尔值强制转布尔 */
export function normalizeFrontendPerms(input: unknown): FrontendPerms {
  const src = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof FrontendPerms, unknown>>
  const out = { ...FRONTEND_PERM_DEFAULTS }
  for (const k of Object.keys(FRONTEND_PERM_DEFAULTS) as Array<keyof FrontendPerms>) {
    if (typeof src[k] === 'boolean') out[k] = src[k] as boolean
  }
  return out
}
/** 专家可见性（附录 12.1：PUBLIC 全员 / PLAN 指定套餐 / PRIVATE 私有） */
export interface VisibilityConfig { type: 'PUBLIC' | 'PLAN' | 'PRIVATE'; planIds: number[] }
/** 技能附属文件（名称+内容 KV） */
export interface SkillFile { name: string; content: string }
/** MCP/OpenAPI 鉴权配置（凭据界面掩码，永不回显明文） */
export interface AuthConfig { type: 'NONE' | 'BEARER' | 'API_KEY' | 'HEADER'; headerName?: string; credential?: string }
/**
 * 平台维度（专家/技能/MCP 通用，v5）：多选 JSON 数组，至少一个；
 * AMAZON 显示「亚马逊」；无「通用」单值（覆盖全平台=多选全部，见设计文档附录 12.5）
 */
export type PlatformType = '1688' | 'OZON' | 'AMAZON' | 'TEMU' | 'TIKTOK' | 'SHOPEE'
export const PLATFORMS: PlatformType[] = ['1688', 'OZON', 'AMAZON', 'TEMU', 'TIKTOK', 'SHOPEE']
/** 平台显示名与徽章配色（对齐 work.html 平台徽章风格：1688绿/Ozon青绿/亚马逊橙/Temu红/TikTok黑/虾皮橘红） */
export const PLATFORM_META: Record<PlatformType, { label: string; color: string; bg: string; border: string }> = {
  '1688': { label: '1688', color: '#389e0d', bg: '#f6ffed', border: '#b7eb8f' },
  OZON: { label: 'Ozon', color: '#0e9488', bg: '#e6fffb', border: '#87e8de' },
  AMAZON: { label: '亚马逊', color: '#d46b08', bg: '#fff7e6', border: '#ffd591' },
  TEMU: { label: 'Temu', color: '#cf1322', bg: '#fff1f0', border: '#ffa39e' },
  TIKTOK: { label: 'TikTok', color: '#262626', bg: '#f5f5f5', border: '#bfbfbf' },
  SHOPEE: { label: '虾皮', color: '#d4380d', bg: '#fff2e8', border: '#ffbb96' }
}
/** 平台徽章元数据兜底（历史数据中的未知值防御显示） */
export function platformMeta(p: string): { label: string; color: string; bg: string; border: string } {
  return PLATFORM_META[p as PlatformType] || { label: p, color: '#616161', bg: '#fafafa', border: '#d9d9d9' }
}
/** URL 提取 host（模型接入地址按域名分组/展示共用；无协议等非法地址原样返回） */
export function hostOf(endpoint?: string): string {
  if (!endpoint) return ''
  try { return new URL(endpoint).host } catch { return endpoint }
}
/**
 * 基础 LLM 模型注册（模型管理，v5；专家 base_model 由此选择）。
 * api_key 保存后永不回显明文：接口只返回掩码 apiKeyMasked（如 ****abcd）；编辑留空=不修改。
 */
export interface LlmModel {
  id: number
  code: string
  name: string
  provider: string
  endpoint?: string
  /** 仅 mock 存储层持有；任何 API 响应不得返回该字段 */
  apiKey?: string
  /** API Key 掩码回显（****abcd），未配置为空串 */
  apiKeyMasked?: string
  /** 默认生成参数 JSON：temperature、max_tokens 等 */
  defaultParams?: Record<string, unknown>
  remark?: string
  status: number
  createdAt: string
  updatedAt: string
}
export interface ConfigItem {
  id: number; code: string; name: string; status: number; version: number; updatedAt: string
  refreshStatus: 'PENDING' | 'APPLIED' | 'FAILED'; appliedVersion: number; refreshMessage: string
  price?: number; durationDays?: number; entitlements?: Entitlement[]; salesCount?: number
  /** 套餐类型（v11）：NORMAL 常规 / GIFT 赠送（赠送订单只能选 GIFT 套餐；GIFT 价格必须为 0、时长支持长期有效 durationDays=0） */
  planType?: 'NORMAL' | 'GIFT'
  /** 套餐 AI 积分数量（v12）：仅常规套餐配置，创建手工订单时默认带出；赠送套餐固定 0 */
  credits?: number
  /** 套餐前台权限（v8）：控制该套餐用户在前台工作台能否创建/查看 套餐、技能、MCP；未配置视为全部允许 */
  frontendPerms?: FrontendPerms
  // ---- 套餐营销/计费扩展（v17，仅套餐配置）----
  /** 套餐宣传语（卡片副标题，可选） */
  tagline?: string
  /** 卡片角标（如「最受欢迎」，缺省无角标） */
  badge?: string
  /** 核心卖点清单（营销展示，最多 20 条） */
  features?: string[]
  /** 月付/年付计费周期报价（GIFT 赠送套餐不配置） */
  billingCycles?: Array<{ cycle: 'MONTHLY' | 'YEARLY'; price: number; originalPrice?: number; label?: string }>
  /** 展示排序（非负整数，小值靠前，缺省 0） */
  sort?: number
  /** AI 积分发放模式（v17）：ONCE 购买一次性发放 / MONTHLY 按月发放；赠送套餐强制 ONCE */
  grantMode?: 'ONCE' | 'MONTHLY'
  /** 积分有效期策略：NEVER 永久 / MONTH_RESET 每月重置 / CUSTOM_DAYS 自定义天数 */
  creditExpiry?: 'NEVER' | 'MONTH_RESET' | 'CUSTOM_DAYS'
  /** 自定义有效期天数（creditExpiry=CUSTOM_DAYS 时必填的正整数） */
  creditValidityDays?: number
  // ---- 专家（助手预设）字段（附录 12.1）----
  description?: string; avatarUrl?: string; baseModel?: string; systemPrompt?: string
  skillIds?: number[]; mcpServerIds?: number[]; knowledgeBaseIds?: number[]; suggestedQuestions?: string[]
  capabilities?: Record<string, boolean>; tags?: string[]; isDefault?: boolean
  /** 前台可见性（v8 专家 / v9 MCP 共用）：仅控制 C 端工作台展示（PUBLIC 全员 / PLAN 指定套餐 / PRIVATE 内部隐藏）；专家绑定 MCP 调用不受此限制 */
  visibility?: VisibilityConfig
  /** 绑定级 MCP 工具裁剪（v9）：serverId → 允许调用的工具 id 列表；缺省/空 = 该服务全部已启用工具（调用取交集） */
  mcpToolSelection?: Record<string, number[]>
  // ---- 专家编排扩展（Coze 式编排页，v6）----
  /** 专家标题（富文本 HTML，前台专家卡片大标题） */
  titleHtml?: string
  /** 专家介绍（富文本 HTML，前台详情页长文介绍） */
  introduction?: string
  /** 开场白（富文本 HTML，会话首条消息） */
  greeting?: string
  /** 专家介绍附件（图片/PDF/文档）元数据；文件实体 mock 存 IndexedDB、真实模式存后端 */
  introductionFiles?: IntroFileMeta[]
  /** 核心能力（多条短文本，前台蓝色链接列表） */
  coreAbilities?: string[]
  /** 参考提示词（多条，前台紫色高亮框，可一键填入输入框） */
  referencePrompts?: string[]
  /** 下一步问题建议设置：开关 + 生成模型 + 系统默认/自定义提示词 */
  nextQuestionConfig?: { enabled: boolean; model?: string; mode: 'default' | 'custom'; customPrompt?: string }
  // ---- 技能（SKILL.md 内容模型，附录 12.2）----
  content?: string; files?: SkillFile[]
  /** 技能分组（列表归类展示，Open WebUI 式；空=未分组） */
  group?: string
  /** 技能场景分组（v7）：关联场景 ID，用于按场景维度分组 */
  scenarioId?: number | null
  // ---- MCP（双类型连接模型，附录 12.3）----
  connType?: 'MCP' | 'OpenAPI'; path?: string; toolFilter?: string[]
  transport?: 'STREAMABLE_HTTP' | 'SSE' | 'STDIO'; endpoint?: string; command?: string; args?: string[]
  authConfig?: AuthConfig
  healthStatus?: string; lastHealthAt?: string; healthDetail?: string
  // ---- 平台维度（v5，专家/技能/MCP 通用）：多选数组，至少一个 ----
  platforms?: PlatformType[]
  // ---- 模型管理（v5，模型注册行）----
  provider?: string; remark?: string
  /** API Key 掩码回显（****abcd）；明文 apiKey 仅经 saveConfig 载荷提交，响应永不回显 */
  apiKeyMasked?: string; apiKey?: string; defaultParams?: Record<string, unknown>; createdAt?: string
  // ---- 旧版遗留字段（增量迁移保留，仅兼容展示，不再要求填写）----
  intro?: string; modelParams?: Record<string, unknown>; mcpToolIds?: number[]
  paramSchema?: Record<string, unknown>; execConfig?: Record<string, unknown>
}
export interface Tool { id: number; serverId: number; name: string; enabled: boolean }
/** 场景（技能分组维度之一，平台下的细分场景） */
export interface Scenario {
  id: number
  name: string
  platformId: PlatformType
  description?: string
  createdAt: string
  updatedAt: string
}
/** 知识库（专家可绑定的知识资源；v8 对齐 Open WebUI：access 权限 + 文档管理） */
export interface KnowledgeBase {
  id: number
  name: string
  description?: string
  platform?: PlatformType
  /** 访问权限（由 visibility 派生，兼容旧消费方）：PRIVATE=内部隐藏，其余公开 */
  access?: 'PRIVATE' | 'PUBLIC'
  /** 前端可见性（v14，与专家/MCP 同款三段设置）：全员可见/指定套餐/内部隐藏；缺省视为全员可见 */
  visibility?: VisibilityConfig
  /** 场景标签（v10）：与场景库联动，对齐前台「平台 → 场景」两级筛选 */
  tags?: string[]
  /** 文档数量（按知识库文档表实时统计） */
  fileCount: number
  status: number
  createdAt: string
  updatedAt: string
}
/** 知识库文档（v8）：mock 存纯文本（.md/.txt），size 为 UTF-8 字节数 */
export interface KnowledgeFile {
  id: number
  kbId: number
  /** 文件名（含扩展名，如 realfbs-物流线路摘要.md） */
  name: string
  content: string
  size: number
  createdAt: string
  updatedAt: string
}
export type ConfigKind = 'plans' | 'experts' | 'skills' | 'mcp/servers' | 'models' | 'scenarios' | 'knowledge-bases'
/** 保存载荷：业务字段 + 版本名称/变更说明（进版本历史）+ 引用确认；capabilities 在专家为布尔开关对象、在模型为标签数组 */
export type ConfigSavePayload = Partial<Omit<ConfigItem, 'capabilities'>> & { capabilities?: Record<string, boolean> | string[]; versionName?: string; note?: string; confirmReferences?: boolean; /** v6：自动保存跳过版本记录（touch 仍 version+1 但不生成快照） */ skipVersion?: boolean }
export const listConfig = (kind: ConfigKind) => get<ConfigItem[]>(`/${kind}`)
export const saveConfig = (kind: ConfigKind, item: ConfigSavePayload) => item.id ? put<ConfigItem>(`/${kind}/${item.id}`, item) : post<ConfigItem>(`/${kind}`, item)
export const deleteConfig = (kind: ConfigKind, id: number, body?: unknown) => del(`/${kind}/${id}`, body)
export const configAction = (kind: ConfigKind, id: number, action: string, body?: unknown) => post<ConfigItem>(`/${kind}/${id}/${action}`, body)
export const listResources = () => get<Entitlement[]>('/entitlement-resources')
export const listTools = () => get<Tool[]>('/mcp/tools')
export const toggleTool = (id: number, enabled: boolean, version?: { versionName: string; note: string }) => put(`/mcp/tools/${id}/enabled`, { enabled, ...version })

// ---------------------------------------------------------------- 场景管理（v7）
export const listScenarios = () => get<Scenario[]>('/scenarios')
export const saveScenario = (item: Partial<Scenario> & { id?: number }) => item.id ? put<Scenario>(`/scenarios/${item.id}`, item) : post<Scenario>('/scenarios', item)
export const deleteScenario = (id: number) => del(`/scenarios/${id}`)

// ---------------------------------------------------------------- 知识库管理（v7）
export const listKnowledgeBases = () => get<KnowledgeBase[]>('/knowledge-bases')
export const saveKnowledgeBase = (item: Partial<KnowledgeBase> & { id?: number }) => item.id ? put<KnowledgeBase>(`/knowledge-bases/${item.id}`, item) : post<KnowledgeBase>('/knowledge-bases', item)
export const setKnowledgeBaseStatus = (id: number, status: number) => put<KnowledgeBase>(`/knowledge-bases/${id}/status`, { status })
export const deleteKnowledgeBase = (id: number, body?: unknown) => del(`/knowledge-bases/${id}`, body)
// v8：知识库文档管理（上传/新建/编辑/删除，Open WebUI 式）
export const listKnowledgeFiles = (kbId: number) => get<KnowledgeFile[]>(`/knowledge-bases/${kbId}/files`)
export const saveKnowledgeFile = (kbId: number, file: Partial<KnowledgeFile> & { id?: number }) =>
  file.id ? put<KnowledgeFile>(`/knowledge-bases/${kbId}/files/${file.id}`, file) : post<KnowledgeFile>(`/knowledge-bases/${kbId}/files`, file)
export const deleteKnowledgeFile = (kbId: number, fileId: number) => del(`/knowledge-bases/${kbId}/files/${fileId}`)

// ---------------------------------------------------------------- 套餐营销/计费扩展（v17：积分加油包商品 + 全局计费设置）
/** 积分加油包商品（C 端充值卡片） */
export interface CreditPackage {
  id: number
  name: string
  credits: number
  bonusCredits: number
  price: number
  originalPrice?: number
  badge?: string
  sort: number
  status: 0 | 1
  remark?: string
  createdAt: string
  updatedAt: string
}
/** 全局计费设置（注册赠送积分 / 套餐升级差价策略 / 自定义积分滑杆） */
export interface BillingSettings {
  registerBonus: number
  upgradePolicy: 'FULL_PRICE' | 'PRORATED'
  creditSlider: { enabled: boolean; min: number; max: number; step: number; unitPrice: number }
}
export const listCreditPackages = () => get<CreditPackage[]>('/credit-packages')
/** 保存积分加油包：有 id 走 PUT 更新，无 id 走 POST 新建；返回保存后的对象 */
export const saveCreditPackage = (item: Partial<CreditPackage> & { id?: number }) => item.id ? put<CreditPackage>(`/credit-packages/${item.id}`, item) : post<CreditPackage>('/credit-packages', item)
export const deleteCreditPackage = (id: number) => del(`/credit-packages/${id}`)
export const getBillingSettings = () => get<BillingSettings>('/billing-settings')
/** 保存全局计费设置（整体覆盖式 PUT），返回保存后的对象 */
export const saveBillingSettings = (body: Partial<BillingSettings>) => put<BillingSettings>('/billing-settings', body)
/** 旧版提示词版本（保留兼容）；新版请使用 configVersions */
export const promptVersions = (id: number) => get<Array<{ version: number; systemPrompt: string; createdAt: string }>>(`/experts/${id}/prompt-versions`)
export const skillStats = (id: number) => get<{ calls7: number; calls30: number; successRate: number; source: string }>(`/skills/${id}/stats`)

// ---------------------------------------------------------------- 版本历史（专家全量 / 技能 SKILL.md / MCP 连接配置 / v17 套餐）
export interface ConfigVersion { version: number; versionName?: string; operator?: string; note: string; createdAt: string; snapshot: ConfigItem }
/** 版本名称：保存（发布）与恢复前由版本确认框生成（默认 yyyyMMddHHmmss），随载荷提交 */
export const configVersions = (kind: 'plans' | 'experts' | 'skills' | 'mcp/servers', id: number) => get<ConfigVersion[]>(`/${kind}/${id}/versions`)
/** 恢复版本：同样走版本确认框生成新版本名（留空由服务端生成「恢复自 <源版本名>」） */
export const restoreConfigVersion = (kind: 'plans' | 'experts' | 'skills' | 'mcp/servers', id: number, version: number, versionName?: string, note?: string) => post<ConfigItem>(`/${kind}/${id}/restore`, { version, versionName, note })

// ---------------------------------------------------------------- 模型管理（基础 LLM 模型注册，v5）
/** GET /models 为分页契约：keyword（名称/编码模糊）/ status / domain（接入地址 host）服务端筛选 + page/pageSize 分页；domains 为全量域名清单（筛选项） */
export interface ModelQuery { keyword?: string; status?: number | ''; domain?: string; page?: number; pageSize?: number }
export type ModelPageData = PageData<LlmModel> & { domains?: string[] }
export const listModels = (q: ModelQuery = {}) => get<ModelPageData>('/models', { ...q })
export const saveModelStatus = (id: number, status: number) => put<LlmModel>(`/models/${id}/status`, { status })
/** 模型连通测试（Mock 演示模拟，不发真实网络请求） */
export interface ModelTestResult { result: 'SUCCESS' | 'FAILED'; detail: string; latencyMs: number; testedAt: string }
export const testModelConnection = (id: number) => post<ModelTestResult>(`/models/${id}/test`)
/** 渠道批量接入：探测清单勾选后一次落库（共享 endpoint/apiKey/provider，重复编码由服务端跳过） */
export interface BatchCreateModelsPayload { endpoint: string; apiKey?: string; provider: string; remark?: string; status?: number; items: Array<{ code: string; name: string }> }
export interface BatchCreateModelsResult { created: number; skipped: string[]; list: LlmModel[] }
export const createModelsBatch = (payload: BatchCreateModelsPayload) => post<BatchCreateModelsResult>('/models/batch', payload)

// ---------------------------------------------------------------- 模型端点探测（填地址 + Key 自动发现模型列表）
/** 端点返回的单个模型：id 为 OpenAI 兼容模型标识（存为模型编码），displayName 取 display_name/name 兜底 id */
export interface ProbedModel { id: string; displayName: string; ownedBy?: string }
export interface ProbeModelsResult { models: ProbedModel[]; resolvedUrl: string; via: string }
/**
 * 探测 OpenAI 兼容端点全部模型：GET {baseUrl}/models（404 时回退 {baseUrl}/v1/models）。
 * Mock/开发模式经 Vite 本地代理 /__llm-proxy 转发绕过 CORS（Key 仅随请求头透传不落盘）；
 * 真实模式由 Java 后端代理（POST /admin/api/models/probe，Key 不出后端）。
 */
export const probeModels = (baseUrl: string, apiKey: string) => post<ProbeModelsResult>('/models/probe', { baseUrl, apiKey })

// ---------------------------------------------------------------- 导出 / 导入 / 克隆
export interface ExportResult { filename: string; content: string }
export const exportConfigJson = (kind: 'experts' | 'skills', id: number) => get<ExportResult>(`/${kind}/${id}/export`)
export const importExpertJson = (payload: unknown) => post<ConfigItem>('/experts/import', payload)
export const importSkillJson = (payload: unknown) => post<ConfigItem>('/skills/import', payload)
export const cloneSkill = (id: number) => post<ConfigItem>(`/skills/${id}/clone`)

// ---------------------------------------------------------------- MCP 连接测试
export interface ConnectionTestResult { healthStatus: string; healthDetail: string; lastHealthAt: string }
export const testMcpConnection = (id: number) => post<ConnectionTestResult>(`/mcp/servers/${id}/test-connection`)

// ---------------------------------------------------------------- 专家草稿对话预览（编辑抽屉右侧实时调试）
/** 技能路由命中（按消息与绑定技能 name/description 关键词匹配） */
export interface PreviewSkillHit { id: number; code: string; name: string }
/** 模拟工具调用轨迹（server=连接名称，tool=工具名，args=示例参数） */
export interface PreviewToolCall { server: string; tool: string; args: Record<string, unknown> }
export interface PreviewChatTrace { matchedSkills: PreviewSkillHit[]; toolCalls: PreviewToolCall[]; model: string; latencyMs: number }
export interface PreviewChatPayload {
  /** 专家草稿全量（左侧表单未保存状态，实时生效） */
  draft: Record<string, unknown>
  sessionId: string
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}
export interface PreviewChatResult { reply: string; trace: PreviewChatTrace }
/**
 * 草稿对话预览：Mock 为演示引擎（确定性仿真，标注「模拟回复（演示引擎）」）；
 * 真实模式由 Java 后端按模型管理配置代理转发（OpenAI 兼容，Key 不出后端）。
 */
export const previewChat = (payload: PreviewChatPayload) => post<PreviewChatResult>('/experts/preview-chat', payload)
/** 演示专用：返回模型明文 apiKey 供预览面板「真实调用」浏览器直连（仅超管；生产环境不提供该端点，走后端代理） */
export const revealModelKey = (id: number) => post<{ apiKey: string }>(`/models/${id}/reveal-key`)
