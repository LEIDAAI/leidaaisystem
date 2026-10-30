import { get, post, put, del } from './request'
import type { PageData } from './types'

export interface Entitlement {
  resourceType: 'EXPERT' | 'SKILL' | 'MCP_TOOL'
  resourceId: number
  resourceName?: string
  quotaType: 'CHAT_COUNT' | 'SKILL_CALL'
  quotaLimit: number
  quotaPeriod: 'DAY' | 'MONTH' | 'LIFETIME'
  used?: number
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
export type PlatformType = '1688' | 'OZON' | 'AMAZON' | 'TEMU'
export const PLATFORMS: PlatformType[] = ['1688', 'OZON', 'AMAZON', 'TEMU']
/** 平台显示名与徽章配色（对齐 work.html 平台徽章风格：1688绿/Ozon青绿/亚马逊橙/Temu红） */
export const PLATFORM_META: Record<PlatformType, { label: string; color: string; bg: string; border: string }> = {
  '1688': { label: '1688', color: '#389e0d', bg: '#f6ffed', border: '#b7eb8f' },
  OZON: { label: 'Ozon', color: '#0e9488', bg: '#e6fffb', border: '#87e8de' },
  AMAZON: { label: '亚马逊', color: '#d46b08', bg: '#fff7e6', border: '#ffd591' },
  TEMU: { label: 'Temu', color: '#cf1322', bg: '#fff1f0', border: '#ffa39e' }
}
/** 平台徽章元数据兜底（历史数据中的未知值防御显示） */
export function platformMeta(p: string): { label: string; color: string; bg: string; border: string } {
  return PLATFORM_META[p as PlatformType] || { label: p, color: '#616161', bg: '#fafafa', border: '#d9d9d9' }
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
  // ---- 专家（助手预设）字段（附录 12.1）----
  description?: string; avatarUrl?: string; baseModel?: string; systemPrompt?: string
  skillIds?: number[]; mcpServerIds?: number[]; suggestedQuestions?: string[]
  capabilities?: Record<string, boolean>; tags?: string[]; visibility?: VisibilityConfig; isDefault?: boolean
  // ---- 专家编排扩展（Coze 式编排页，v6）----
  /** 专家标题（富文本 HTML，前台专家卡片大标题） */
  titleHtml?: string
  /** 专家介绍（富文本 HTML，前台详情页长文介绍） */
  introduction?: string
  /** 开场白（富文本 HTML，会话首条消息） */
  greeting?: string
  /** 核心能力（多条短文本，前台蓝色链接列表） */
  coreAbilities?: string[]
  /** 参考提示词（多条，前台紫色高亮框，可一键填入输入框） */
  referencePrompts?: string[]
  /** 下一步问题建议设置：开关 + 生成模型 + 系统默认/自定义提示词 */
  nextQuestionConfig?: { enabled: boolean; model?: string; mode: 'default' | 'custom'; customPrompt?: string }
  // ---- 技能（SKILL.md 内容模型，附录 12.2）----
  content?: string; files?: SkillFile[]
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
export type ConfigKind = 'plans' | 'experts' | 'skills' | 'mcp/servers' | 'models'
/** 保存载荷：业务字段 + 版本名称/变更说明（进版本历史）+ 引用确认；capabilities 在专家为布尔开关对象、在模型为标签数组 */
export type ConfigSavePayload = Partial<Omit<ConfigItem, 'capabilities'>> & { capabilities?: Record<string, boolean> | string[]; versionName?: string; note?: string; confirmReferences?: boolean; /** v6：自动保存跳过版本记录（touch 仍 version+1 但不生成快照） */ skipVersion?: boolean }
export const listConfig = (kind: ConfigKind) => get<ConfigItem[]>(`/${kind}`)
export const saveConfig = (kind: ConfigKind, item: ConfigSavePayload) => item.id ? put<ConfigItem>(`/${kind}/${item.id}`, item) : post<ConfigItem>(`/${kind}`, item)
export const deleteConfig = (kind: ConfigKind, id: number, body?: unknown) => del(`/${kind}/${id}`, body)
export const configAction = (kind: ConfigKind, id: number, action: string, body?: unknown) => post<ConfigItem>(`/${kind}/${id}/${action}`, body)
export const listResources = () => get<Entitlement[]>('/entitlement-resources')
export const listTools = () => get<Tool[]>('/mcp/tools')
export const toggleTool = (id: number, enabled: boolean, version?: { versionName: string; note: string }) => put(`/mcp/tools/${id}/enabled`, { enabled, ...version })
/** 旧版提示词版本（保留兼容）；新版请使用 configVersions */
export const promptVersions = (id: number) => get<Array<{ version: number; systemPrompt: string; createdAt: string }>>(`/experts/${id}/prompt-versions`)
export const skillStats = (id: number) => get<{ calls7: number; calls30: number; successRate: number; source: string }>(`/skills/${id}/stats`)

// ---------------------------------------------------------------- 版本历史（专家全量 / 技能 SKILL.md / MCP 连接配置）
export interface ConfigVersion { version: number; versionName?: string; operator?: string; note: string; createdAt: string; snapshot: ConfigItem }
/** 版本名称：保存（发布）与恢复前由版本确认框生成（默认 yyyyMMddHHmmss），随载荷提交 */
export const configVersions = (kind: 'experts' | 'skills' | 'mcp/servers', id: number) => get<ConfigVersion[]>(`/${kind}/${id}/versions`)
/** 恢复版本：同样走版本确认框生成新版本名（留空由服务端生成「恢复自 <源版本名>」） */
export const restoreConfigVersion = (kind: 'experts' | 'skills' | 'mcp/servers', id: number, version: number, versionName?: string, note?: string) => post<ConfigItem>(`/${kind}/${id}/restore`, { version, versionName, note })

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
