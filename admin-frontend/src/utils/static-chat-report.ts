import DOMPurify from 'dompurify'

export function escapeReportText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

const contentPolicy = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'"

/** 所有报告入口使用同一文档；离线打开也保留无权限的独立来源 iframe。 */
export function staticChatReport(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['style', 'h1', 'h2', 'h3', 'h4', 'p', 'div', 'span', 'b', 'strong', 'em', 'i', 'small', 'br', 'hr', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'code'],
    ALLOWED_ATTR: ['class', 'style', 'colspan', 'rowspan'],
    FORCE_BODY: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false
  })
  const content = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${contentPolicy}"><meta name="referrer" content="no-referrer"><title>会话分析报告</title></head><body>${clean}</body></html>`
  const policy = contentPolicy.replace("frame-src 'none'", 'frame-src about:')
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer"><title>会话分析报告（静态隔离）</title><style>html,body{margin:0;width:100%;height:100%}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe sandbox="" referrerpolicy="no-referrer" title="静态会话分析报告" srcdoc="${escapeReportText(content)}"></iframe></body></html>`
}
