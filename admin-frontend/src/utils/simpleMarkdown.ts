/**
 * 手写简易 Markdown → HTML 渲染（无第三方依赖），用于技能编辑器「预览」页签。
 * 支持：标题 h1-h4、粗体、斜体、行内代码、代码块、无序/有序列表、引用、链接、分隔线、段落。
 * 输出前做 HTML 转义防注入。
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 行内处理：转义后再叠加粗体/斜体/行内代码/链接 */
function inline(text: string): string {
  let s = escapeHtml(text)
  // 行内代码（先保护，避免内部被再替换）
  const codes: string[] = []
  s = s.replace(/`([^`]+)`/g, (_, c: string) => {
    codes.push(`<code>${c}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
  // 还原行内代码
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)] || '')
  return s
}

export function renderSimpleMarkdown(md: string): string {
  const lines = (md || '').replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let i = 0
  let listType: 'ul' | 'ol' | null = null

  const closeList = (): void => {
    if (listType) { html.push(`</${listType}>`); listType = null }
  }

  while (i < lines.length) {
    const line = lines[i]
    // 代码块
    const fence = line.match(/^```(\w*)/)
    if (fence) {
      closeList()
      const lang = fence[1]
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++ // 跳过结束 ```
      html.push(`<pre><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }
    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)/)
    if (h) {
      closeList()
      html.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      i++
      continue
    }
    // 分隔线
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      closeList()
      html.push('<hr/>')
      i++
      continue
    }
    // 引用
    const q = line.match(/^>\s?(.*)/)
    if (q) {
      closeList()
      const buf: string[] = [q[1]]
      i++
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++ }
      html.push(`<blockquote>${buf.map((b) => inline(b)).join('<br/>')}</blockquote>`)
      continue
    }
    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      if (listType !== 'ul') { closeList(); html.push('<ul>'); listType = 'ul' }
      html.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`)
      i++
      continue
    }
    // 有序列表
    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (listType !== 'ol') { closeList(); html.push('<ol>'); listType = 'ol' }
      html.push(`<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ''))}</li>`)
      i++
      continue
    }
    // 空行
    if (!line.trim()) {
      closeList()
      i++
      continue
    }
    // 普通段落（连续非空非标记行合并）
    closeList()
    const buf: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    html.push(`<p>${inline(buf.join(' '))}</p>`)
  }
  closeList()
  return html.join('\n')
}
