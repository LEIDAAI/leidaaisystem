/**
 * 二进制/图片工具：技能附属文件的图片支持（导入 → 存储 → 预览 → 导出 共用）。
 * 图片以 base64 文本随 SkillFile.content 存储（encoding='base64'），不引入 Blob/IndexedDB，
 * 这样 localStorage 持久化、版本快照、JSON 导出三条链路保持同一形态。
 */

/** 图片扩展名 → MIME（导入时据此判定是否走 base64 通道） */
export const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon'
}

/** 单个图片上限（原始字节）：超过则跳过导入，避免撑爆浏览器本地存储 */
export const MAX_IMAGE_BYTES = 1024 * 1024

/** 取文件扩展名（小写，无点） */
export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(String(name || ''))
  return m ? m[1].toLowerCase() : ''
}

/** 是否图片文件（按扩展名判定） */
export function isImageName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMAGE_MIME, extOf(name))
}

/** 按文件名推断 MIME */
export function mimeOfName(name: string): string {
  return IMAGE_MIME[extOf(name)] || 'application/octet-stream'
}

/** 字节 → base64（分块拼接，避免超长字符串爆栈） */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

/** base64 → 字节（容忍 data URL 前缀） */
export function base64ToBytes(b64: string): Uint8Array {
  const raw = String(b64 || '').replace(/^data:[^;,]*;base64,/i, '')
  const bin = atob(raw)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** base64 文本的近似字节数（去掉换行等空白后按 4/3 折算） */
export function base64ByteSize(b64: string): number {
  const clean = String(b64 || '').replace(/\s/g, '')
  if (!clean) return 0
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((clean.length * 3) / 4) - pad)
}

/** 字节数 → 人类可读 */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
