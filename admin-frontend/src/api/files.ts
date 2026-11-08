import { exportBlob, post } from './request'
import { USE_MOCK } from '../utils/constants'

/**
 * 专家介绍附件：图片 / PDF / Word / Excel / PPT / 文本类。
 * 元数据（id/名称/类型/大小/时间）随专家配置一起保存（进入版本快照可恢复）；
 * 文件实体 mock 模式存 IndexedDB（见 mock/fileStore.ts），真实模式走后端 /files 接口。
 */
export interface IntroFileMeta { id: string; name: string; type: string; size: number; uploadedAt: string; url?: string }
export interface UploadedFileResponse { id: string | number; name?: string; type?: string; size?: number; uploadedAt?: string; url?: string }

/** 允许上传的文件类型（图片/PDF/文档/表格/演示/文本） */
export const FILE_ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv'
/** 单文件大小上限 */
export const MAX_FILE_MB = 10
/** 富文本内嵌图片大小上限（HTML 转 base64 存 localStorage，过大易撑爆配额） */
export const INLINE_IMAGE_MAX_MB = 1.5

const genId = () => `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/** 上传介绍附件，返回元数据（调用方追加到 draft.introductionFiles 后随专家保存） */
export async function uploadIntroFile(file: File): Promise<IntroFileMeta> {
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`「${file.name}」超过单文件上限 ${MAX_FILE_MB}MB`)
  const meta: IntroFileMeta = { id: genId(), name: file.name, type: file.type || guessType(file.name), size: file.size, uploadedAt: new Date().toISOString() }
  if (USE_MOCK) {
    const { putFileRecord } = await import('./mock/fileStore')
    await putFileRecord({ id: meta.id, name: meta.name, type: meta.type, blob: file })
  } else {
    const fd = new FormData()
    fd.append('file', file)
    const uploaded = await post<UploadedFileResponse>('/files', fd)
    if (!uploaded || !['string', 'number'].includes(typeof uploaded.id) || !String(uploaded.id).trim() || (typeof uploaded.id === 'number' && !Number.isFinite(uploaded.id))) {
      throw new Error('上传响应缺少有效的文件 ID，未保存附件引用，请联系服务端检查 /files 响应')
    }
    return {
      id: String(uploaded.id),
      name: uploaded.name || file.name,
      type: uploaded.type || file.type || guessType(file.name),
      size: typeof uploaded.size === 'number' && Number.isFinite(uploaded.size) && uploaded.size >= 0 ? uploaded.size : file.size,
      uploadedAt: uploaded.uploadedAt || meta.uploadedAt,
      ...(uploaded.url ? { url: uploaded.url } : {})
    }
  }
  return meta
}

/** 取文件 Blob URL（mock：IndexedDB → createObjectURL；真实模式由后端 GET /files/:id 提供） */
export async function introFileObjectUrl(id: string): Promise<string> {
  if (USE_MOCK) {
    const { getFileRecord } = await import('./mock/fileStore')
    const rec = await getFileRecord(id)
    if (!rec) throw new Error('文件不存在或已被清理')
    return URL.createObjectURL(rec.blob)
  }
  const blob = await exportBlob(`/files/${encodeURIComponent(id)}`)
  return URL.createObjectURL(blob)
}

/** 读取文本类文件内容（txt/md/csv 等在线预览用） */
export async function introFileText(id: string): Promise<string> {
  const url = await introFileObjectUrl(id)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('文件读取失败，请重试')
    return await res.text()
  } finally { if (url.startsWith('blob:')) URL.revokeObjectURL(url) }
}

/** 读取二进制文件 ArrayBuffer（Excel 等在线预览用） */
export async function introFileArrayBuffer(id: string): Promise<ArrayBuffer> {
  const url = await introFileObjectUrl(id)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error('文件读取失败，请重试')
    return await res.arrayBuffer()
  } finally { if (url.startsWith('blob:')) URL.revokeObjectURL(url) }
}

/** 删除附件实体（元数据由调用方从 draft.introductionFiles 移除后随专家保存） */
export async function deleteIntroFile(id: string): Promise<void> {
  if (!USE_MOCK) return
  const { deleteFileRecord } = await import('./mock/fileStore')
  await deleteFileRecord(id)
}

/** 触发浏览器下载 */
export async function downloadIntroFile(meta: IntroFileMeta): Promise<void> {
  const url = await introFileObjectUrl(meta.id)
  const a = document.createElement('a')
  a.href = url
  a.download = meta.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** 字节数可读化（1024 → 1.0 KB） */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** 预览方式分类：图片内嵌 / PDF iframe / 文本高亮 / 表格在线预览 / 其他兜底下载 */
export function previewKind(meta: { type: string; name: string }): 'image' | 'pdf' | 'text' | 'spreadsheet' | 'other' {
  const t = meta.type || ''
  const name = meta.name.toLowerCase()
  if (t.startsWith('image/')) return 'image'
  if (t === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (t.startsWith('text/') || /\.(txt|md|csv|json|log)$/i.test(name)) return 'text'
  if (t.includes('spreadsheet') || t.includes('excel') || /\.(xls|xlsx)$/i.test(name)) return 'spreadsheet'
  return 'other'
}

/** 附件类别标签 + 图标（列表展示用） */
export function fileKind(meta: { type: string; name: string }): { label: string; emoji: string } {
  const k = previewKind(meta)
  if (k === 'image') return { label: '图片', emoji: '🖼' }
  if (k === 'pdf') return { label: 'PDF', emoji: '📕' }
  if (k === 'text') return { label: '文本', emoji: '📝' }
  if (k === 'spreadsheet') return { label: '表格', emoji: '📊' }
  const ext = meta.name.split('.').pop()?.toLowerCase() || ''
  if (ext === 'doc' || ext === 'docx') return { label: '文档', emoji: '📘' }
  if (ext === 'ppt' || ext === 'pptx') return { label: '演示', emoji: '📽' }
  return { label: '文件', emoji: '📎' }
}

/** 后缀 → MIME 兜底（浏览器 File.type 为空时） */
function guessType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv'
  }
  return map[ext] || 'application/octet-stream'
}
