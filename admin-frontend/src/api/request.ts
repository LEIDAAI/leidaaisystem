import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'

import { API_BASE, AUTH_STORAGE_KEY, USE_MOCK } from '../utils/constants'
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

function clearSessionAndRedirect(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
  // hash 路由：登录页在 /#/login，静态托管下不能改 pathname
  if (!window.location.hash.startsWith('#/login')) {
    window.location.hash = '#/login'
  }
}

http.interceptors.request.use((config) => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY)
  if (raw) {
    try {
      const session = JSON.parse(raw) as { token?: string }
      if (session.token) config.headers.Authorization = `Bearer ${session.token}`
    } catch {
      // 会话数据损坏时按未登录处理
    }
  }
  return config
})

http.interceptors.response.use(
  async (response) => {
    if (response.config.responseType === 'blob') {
      const blob = response.data as Blob
      if (!blob.type.includes('json')) return response
      const parsed = JSON.parse(await blob.text())
      if (typeof parsed.code !== 'number') return response
      response.data = parsed
    }
    const res = response.data as ApiResponse
    if (res.code === 0) return response
    if (res.code === 401) {
      clearSessionAndRedirect()
    } else {
      ElMessage.error(res.msg || '请求失败')
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

/**
 * 导出接口：mock 模式返回 {filename, content} 由前端生成 Blob 下载；
 * 真实模式请求 CSV 流（blob），由调用方触发下载。
 */
export async function exportCsv<T>(url: string, params?: object): Promise<T | Blob> {
  if (USE_MOCK) return get<T>(url, params)
  const res = await http.get<Blob>(url, { params, responseType: 'blob' })
  return res.data
}
