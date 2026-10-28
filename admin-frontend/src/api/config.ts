import { get, post, put, del } from './request'

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
export interface ConfigItem {
  id: number; code: string; name: string; status: number; version: number; updatedAt: string
  refreshStatus: 'PENDING' | 'APPLIED' | 'FAILED'; appliedVersion: number; refreshMessage: string
  price?: number; durationDays?: number; entitlements?: Entitlement[]; salesCount?: number
  // ---- 专家（助手预设）字段（附录 12.1）----
  description?: string; avatarUrl?: string; baseModel?: string; systemPrompt?: string
  skillIds?: number[]; mcpServerIds?: number[]; suggestedQuestions?: string[]
  capabilities?: Record<string, boolean>; tags?: string[]; visibility?: VisibilityConfig; isDefault?: boolean
  // ---- 技能（SKILL.md 内容模型，附录 12.2）----
  content?: string; files?: SkillFile[]
  // ---- MCP（双类型连接模型，附录 12.3）----
  connType?: 'MCP' | 'OpenAPI'; path?: string; toolFilter?: string[]
  transport?: 'STREAMABLE_HTTP' | 'SSE' | 'STDIO'; endpoint?: string; command?: string; args?: string[]
  authConfig?: AuthConfig
  healthStatus?: string; lastHealthAt?: string; healthDetail?: string
  // ---- 旧版遗留字段（增量迁移保留，仅兼容展示，不再要求填写）----
  intro?: string; modelParams?: Record<string, unknown>; mcpToolIds?: number[]
  paramSchema?: Record<string, unknown>; execConfig?: Record<string, unknown>
}
export interface Tool { id: number; serverId: number; name: string; enabled: boolean }
export type ConfigKind = 'plans' | 'experts' | 'skills' | 'mcp/servers'
/** 保存载荷：业务字段 + 变更说明（进版本历史）+ 引用确认（409 拦截后的继续操作标记） */
export type ConfigSavePayload = Partial<ConfigItem> & { note?: string; confirmReferences?: boolean }
export const listConfig = (kind: ConfigKind) => get<ConfigItem[]>(`/${kind}`)
export const saveConfig = (kind: ConfigKind, item: ConfigSavePayload) => item.id ? put<ConfigItem>(`/${kind}/${item.id}`, item) : post<ConfigItem>(`/${kind}`, item)
export const deleteConfig = (kind: ConfigKind, id: number, body?: unknown) => del(`/${kind}/${id}`, body)
export const configAction = (kind: ConfigKind, id: number, action: string, body?: unknown) => post<ConfigItem>(`/${kind}/${id}/${action}`, body)
export const listResources = () => get<Entitlement[]>('/entitlement-resources')
export const listTools = () => get<Tool[]>('/mcp/tools')
export const toggleTool = (id: number, enabled: boolean) => put(`/mcp/tools/${id}/enabled`, { enabled })
/** 旧版提示词版本（保留兼容）；新版请使用 configVersions */
export const promptVersions = (id: number) => get<Array<{ version: number; systemPrompt: string; createdAt: string }>>(`/experts/${id}/prompt-versions`)
export const skillStats = (id: number) => get<{ calls7: number; calls30: number; successRate: number; source: string }>(`/skills/${id}/stats`)

// ---------------------------------------------------------------- 版本历史（专家全量 / 技能 SKILL.md）
export interface ConfigVersion { version: number; note: string; createdAt: string; snapshot: ConfigItem }
export const configVersions = (kind: 'experts' | 'skills', id: number) => get<ConfigVersion[]>(`/${kind}/${id}/versions`)
export const restoreConfigVersion = (kind: 'experts' | 'skills', id: number, version: number, note?: string) => post<ConfigItem>(`/${kind}/${id}/restore`, { version, note })

// ---------------------------------------------------------------- 导出 / 导入 / 克隆
export interface ExportResult { filename: string; content: string }
export const exportConfigJson = (kind: 'experts' | 'skills', id: number) => get<ExportResult>(`/${kind}/${id}/export`)
export const importExpertJson = (payload: unknown) => post<ConfigItem>('/experts/import', payload)
export const importSkillJson = (payload: unknown) => post<ConfigItem>('/skills/import', payload)
export const cloneSkill = (id: number) => post<ConfigItem>(`/skills/${id}/clone`)

// ---------------------------------------------------------------- MCP 连接测试
export interface ConnectionTestResult { healthStatus: string; healthDetail: string; lastHealthAt: string }
export const testMcpConnection = (id: number) => post<ConnectionTestResult>(`/mcp/servers/${id}/test-connection`)
