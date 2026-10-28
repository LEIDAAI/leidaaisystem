import axios, { type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { USE_MOCK } from '@/utils/constants'
import type { ApiResponse } from './types'
import type { ConfigItem } from './config'

/**
 * C 端工作台只读契约（附录 12.4）：
 * 真实前缀为 /api/v1/workspace/**（与 admin 契约 /admin/api 完全隔离）；
 * mock 模式同样按该前缀路由，保证 mock/真实 双模式路径一致。
 * 管理端"前台预览"按演示用户套餐传入 userPlanIds 过滤；真实接入时需携带 C 端用户 token。
 */
export const WORKSPACE_BASE = '/api/v1/workspace'

export interface WorkspaceExpert {
  id: number; code: string; name: string; description: string; avatarUrl: string
  baseModel: string; tags: string[]; suggestedQuestions: string[]
  capabilities?: Record<string, boolean>
  boundSkillCount: number; boundMcpCount: number
}
/** 专家详情（GET /workspace/experts/{code}）：在列表字段基础上附绑定技能/MCP 名称，仍不含系统提示词全文 */
export interface WorkspaceExpertDetail extends WorkspaceExpert { skillNames: string[]; mcpNames: string[] }
export interface WorkspaceSkill { id: number; code: string; name: string; description: string; boundExpertCount: number }
export interface WorkspaceMcp { id: number; code: string; name: string; connType: string; endpoint: string; path: string; enabledToolCount: number }

const workspaceHttp = axios.create({ timeout: 15000 })
if (USE_MOCK) {
  const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const { handleMockRequest } = await import('./mock/handlers')
    const data = await handleMockRequest(config)
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  workspaceHttp.defaults.adapter = mockAdapter
}

async function wsGet<T>(url: string, params?: object): Promise<T> {
  const res = await workspaceHttp.get<ApiResponse<T>>(url, { params })
  const body = res.data as ApiResponse<T>
  if (body.code !== 0) throw new Error(body.msg || '工作台接口调用失败')
  return body.data
}

const planParam = (userPlanIds?: number[]) =>
  userPlanIds && userPlanIds.length ? { userPlanIds: userPlanIds.join(',') } : undefined

export const workspaceExperts = (userPlanIds?: number[]) => wsGet<WorkspaceExpert[]>(`${WORKSPACE_BASE}/experts`, planParam(userPlanIds))
export const workspaceExpertDetail = (code: string, userPlanIds?: number[]) => wsGet<WorkspaceExpertDetail>(`${WORKSPACE_BASE}/experts/${encodeURIComponent(code)}`, planParam(userPlanIds))
export const workspaceSkills = (userPlanIds?: number[]) => wsGet<WorkspaceSkill[]>(`${WORKSPACE_BASE}/skills`, planParam(userPlanIds))
export const workspaceMcps = (userPlanIds?: number[]) => wsGet<WorkspaceMcp[]>(`${WORKSPACE_BASE}/mcps`, planParam(userPlanIds))

/** 前台专家卡片演示数据：管理端预览复用（含关联技能/MCP 名称，用于模拟 work.html 卡片） */
export interface WorkspaceExpertCard extends WorkspaceExpert {
  skillNames: string[]
  mcpNames: string[]
  visibility: ConfigItem['visibility']
  status: number
}
