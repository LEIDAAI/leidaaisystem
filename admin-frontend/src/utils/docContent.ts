/**
 * 知识库文档内容兼容层：
 * - 历史文档以 Markdown 纯文本存储；Tiptap 接入后新文档以 HTML 存储（所见即所得）
 * - contentToHtml 按形态自动分流：含块级 HTML 标签 = HTML，否则按 Markdown 渲染
 * - 所有输出统一经 DOMPurify 消毒：文档内容可能来自导入/粘贴，渲染前必须净化防 XSS
 */
import DOMPurify from 'dompurify'
import { renderSimpleMarkdown } from './simpleMarkdown'

/** 判断内容形态：含块级 HTML 标签视为 Tiptap 存储的 HTML；否则为 Markdown 纯文本 */
export function isHtmlContent(content: string): boolean {
  return /<(p|h[1-6]|ul|ol|table|blockquote|pre|div|img|hr|br)\b/i.test(content)
}

/** URI 白名单 = DOMPurify 默认协议 + data:image/*（Tiptap 图片以 base64 内联存储） */
const ALLOWED_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|data:image\/[a-z0-9+.\-]+;|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i

/** HTML 消毒：保留 Tiptap 表格列宽属性，剔除脚本/事件处理/危险协议 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    ADD_ATTR: ['colwidth']
  })
}

/** 文档内容 → HTML（旧 Markdown 数据用 simpleMarkdown 渲染；新数据原样返回），统一消毒后输出 */
export function contentToHtml(content: string): string {
  const c = content || ''
  if (!c.trim()) return ''
  return sanitizeHtml(isHtmlContent(c) ? c : renderSimpleMarkdown(c))
}
