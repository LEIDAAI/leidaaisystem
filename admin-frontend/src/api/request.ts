import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

import { API_BASE, USE_MOCK } from '../utils/constants'
import { readStoredToken, clearStoredToken } from '../utils/token'
import type { ApiResponse } from './types'


/** 业务错误（携带契约错误码），供调用方按需分支处理 */
export class ApiError extends Error {
  readonly code: number

  constructor(code: number, msg: string) {
    super(msg)
    this.code = code
    this.name = 'ApiError'
  }
}

/** mock 模式自定义 adapter：拦截请求交由 handlers.ts 处理，返回契约包装结构 */
const mockAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  const { handleMockRequest } = await import('./mock/handlers')
  const data = await handleMockRequest(config)
  return { data, status: 200, statusText: 'OK', headers: {}, config }
}

const http = axios.create({ baseURL: API_BASE, timeout: 15000 })
if (USE_MOCK) http.defaults.adapter = mockAdapter

/**
 * 会话失效回调：由 main.ts 注入（清 pinia 内存会话）。
 * 采用注入而非直接 import auth store，避免 auth ↔ request 循环依赖。
 */
let onSessionExpired: (() => void) | null = null
export function setSessionExpiredHandler(fn: () => void): void { onSessionExpired = fn }

function clearSessionAndRedirect(): void {
  onSessionExpired?.()
  clearStoredToken()
  // hash 路由：登录页在 /#/login，静态托管下不能改 pathname；携带 redirect 便于登录后回到原页面
  if (!window.location.hash.startsWith('#/login')) {
    const current = window.location.hash.startsWith('#/') ? window.location.hash.slice(1) : '/'
    window.location.hash = `#/login?redirect=${encodeURIComponent(current)}`
  }
}

http.interceptors.request.use((config) => {
  const token = readStoredToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/** 业务错误码差异化兜底文案（仅当后端未返回 msg 时使用） */
const CODE_FALLBACKS: Record<number, string> = {
  403: '无权限执行该操作',
  404: '资源不存在或已删除',
  409: '操作冲突，请刷新后重试',
  422: '参数校验失败'
}

http.interceptors.response.use(
  async (response) => {
    if (response.config.responseType === 'blob') {
      const blob = response.data as Blob
      if (!blob.type.includes('json')) return response
      let parsed: ApiResponse
      try { parsed = JSON.parse(await blob.text()) as ApiResponse } catch { return response }
      if (typeof parsed.code !== 'number') return response
      response.data = parsed
    }
    const res = response.data as ApiResponse
    if (res.code === 0) return response
    if (res.code === 401) {
      clearSessionAndRedirect()
    } else {
      ElMessage.error(res.msg || CODE_FALLBACKS[res.code] || '请求失败')
    }
    return Promise.reject(new ApiError(res.code, res.msg || '请求失败'))
  },
  async (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status
    let body = error.response?.data
    if (body instanceof Blob) {
      try { body = JSON.parse(await body.text()) as ApiResponse } catch { body = undefined }
    }
    if (status === 401 || body?.code === 401) {
      clearSessionAndRedirect()
    } else {
      ElMessage.error(body?.msg || error.message || '网络异常，请稍后重试')
    }
    return Promise.reject(
      new ApiError(body?.code ?? status ?? -1, body?.msg || error.message || '网络异常，请稍后重试')
    )
  }
)

export async function get<T>(url: string, params?: object): Promise<T> {
  const res = await http.get<ApiResponse<T>>(url, { params })
  return res.data.data
}

export async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<ApiResponse<T>>(url, body)
  return res.data.data
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.put<ApiResponse<T>>(url, body)
  return res.data.data
}

export async function del<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.delete<ApiResponse<T>>(url, { data: body })
  return res.data.data
}

export async function exportBlob(url: string, params?: object): Promise<Blob> {
  if (USE_MOCK) return get<Blob>(url, params)
  const res = await http.get<Blob>(url, { params, responseType: 'blob' })
  return res.data
}

/**
 * 导出接口：mock 模式返回文件描述或 XLSX Blob；
 * 真实模式以 Blob 接收 JSON / XLSX 文件，由调用方触发下载。
 */
export async function exportFile<T>(url: string, params?: object): Promise<T | Blob> {
  if (USE_MOCK) return get<T>(url, params)
  const res = await http.get<Blob>(url, { params, responseType: 'blob' })
  return res.data
}
