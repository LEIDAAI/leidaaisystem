/**
 * HTML ↔ 编辑器 Markdown 兼容转换层。
 * 专家页 titleHtml/introduction/greeting 三个历史字段以「简单 HTML」存储（后端字段格式不变）：
 * 存量 HTML 经 htmlToEditorMd 转成编辑器 Markdown 契约喂给 YuqueEditor；
 * 编辑器输出经 editorMdToHtml 转回等价简单 HTML 持久化。
 * 稳定性约定：
 *  - span style 固定顺序（color/background-color/font-size）自产自销，保证往返字节稳定；
 *  - htmlToEditorMd 必须能消化 editorMdToHtml 的输出（li[data-task] / span.ne-status / details）；
 *  - Markdown 是纯文本契约：<>& 为字面字符不转义（parseMarkdown 用 createTextNode 天然安全），
 *    仅 span style 注入 HTML token 时按既有约定把 " 转义成 &quot;。
 */
import { escapeHtml, parseMarkdown } from './markdown'

/** execCommand fontSize(1~7) → CSS 字号（Chrome 默认映射） */
const FONT_SIZE_MAP: Record<string, string> = {
  '1': '10px', '2': '13px', '3': '16px', '4': '18px', '5': '24px', '6': '32px', '7': '48px'
}

/** span 归一化：只保留编辑器支持的三类声明，固定顺序输出（无声明返回 ''） */
function normalizeSpanStyle(style: string): string {
  const decls = String(style || '').split(';').map((d) => d.trim()).filter(Boolean)
  const get = (name: string): string => {
    const d = decls.find((x) => x.toLowerCase().startsWith(name + ':'))
    return d ? d.slice(name.length + 1).trim() : ''
  }
  const parts: string[] = []
  const color = get('color')
  const bg = get('background-color') || get('background')
  const fs = get('font-size')
  if (color) parts.push(`color: ${color}`)
  if (bg) parts.push(`background-color: ${bg}`)
  if (fs) parts.push(`font-size: ${fs}`)
  return parts.join('; ')
}

// ---------------------------------------------------------------- HTML → Markdown（读取存量字段）

function inlineToMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.tagName === 'BR') return '\n'
  const inner = (): string => Array.from(el.childNodes).map(inlineToMd).join('')
  switch (el.tagName) {
    case 'B': case 'STRONG': return `**${inner()}**`
    case 'I': case 'EM': return `*${inner()}*`
    case 'U': return `++${inner()}++`
    case 'S': case 'DEL': case 'STRIKE': return `~~${inner()}~~`
    case 'CODE': return '`' + (el.textContent || '') + '`'
    case 'SUB': return `~${inner()}~`
    case 'SUP': return `^${inner()}^`
    case 'A': return `[${inner()}](${el.getAttribute('href') || ''})`
    case 'IMG': return `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`
    default: {
      if (el.classList.contains('ne-status') || el.classList.contains('status-pill')) {
        return `<span class="ne-status">${el.textContent || ''}</span>`
      }
      if (el.tagName === 'SPAN') {
        const style = normalizeSpanStyle(el.getAttribute('style') || '')
        return style ? `<span style="${style.replace(/"/g, '&quot;')}">${inner()}</span>` : inner()
      }
      if (el.tagName === 'FONT') {
        const fs = FONT_SIZE_MAP[el.getAttribute('size') || '']
        return fs ? `<span style="font-size: ${fs}">${inner()}</span>` : inner()
      }
      return inner()
    }
  }
}

/** pre/code 文本：BR 换行（textContent 会丢 BR），尾部占位换行剥除 */
function preCodeText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement
  for (const br of Array.from(clone.querySelectorAll('br'))) br.replaceWith(document.createTextNode('\n'))
  return (clone.textContent || '').replace(/\n$/, '')
}

function listToMdLines(el: HTMLElement, ordered: boolean, depth: number): string[] {
  const lines: string[] = []
  let idx = 1
  for (const li of Array.from(el.children)) {
    if (li.tagName !== 'LI') continue
    const hli = li as HTMLElement
    const inline = Array.from(li.childNodes)
      .filter((n) => !(n.nodeType === 1 && ((n as HTMLElement).tagName === 'UL' || (n as HTMLElement).tagName === 'OL')))
      .map(inlineToMd).join('')
      .replace(/^\n/, '').replace(/\n$/, '')
    const mark = ordered
      ? `${idx++}. `
      : hli.dataset.task === '1' ? (hli.dataset.checked === '1' ? '- [x] ' : '- [ ] ') : '- '
    lines.push('  '.repeat(depth) + mark + inline)
    for (const sub of Array.from(li.children)) {
      if (sub.tagName === 'UL') lines.push(...listToMdLines(sub as HTMLElement, false, depth + 1))
      else if (sub.tagName === 'OL') lines.push(...listToMdLines(sub as HTMLElement, true, depth + 1))
    }
  }
  return lines
}

function blockToMdLines(el: HTMLElement): string[] {
  const tag = el.tagName
  if (tag === 'P' || tag === 'DIV') return inlineToMd(el).replace(/\n$/, '').split('\n')
  if (/^H[1-6]$/.test(tag)) {
    const lvl = Number(tag.slice(1))
    return ['#'.repeat(lvl) + ' ' + inlineToMd(el).replace(/\n/g, ' ').trim()]
  }
  if (tag === 'BLOCKQUOTE') {
    const lines: string[] = []
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) { const t = (c.nodeValue || '').trim(); if (t) lines.push(t) }
      else if (c.nodeType === Node.ELEMENT_NODE) lines.push(...blockToMdLines(c as HTMLElement))
    }
    return (lines.length ? lines : ['']).map((l) => '> ' + l)
  }
  if (tag === 'UL') return listToMdLines(el, false, 0)
  if (tag === 'OL') return listToMdLines(el, true, 0)
  if (tag === 'PRE') return ['```Plain Text', ...preCodeText(el).split('\n'), '```']
  if (tag === 'HR') return ['---']
  if (tag === 'TABLE') {
    return Array.from(el.querySelectorAll('tr')).map((tr) =>
      '| ' + Array.from(tr.children).map((td) => (td.textContent || '').replace(/\n/g, ' ').trim() || ' ').join(' | ') + ' |'
    )
  }
  if (tag === 'DETAILS') {
    const title = el.querySelector('summary')?.textContent?.trim() || ''
    const lines: string[] = [':::collapse', title]
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === Node.TEXT_NODE) { const t = (c.nodeValue || '').trim(); if (t) lines.push(t) }
      else if (c.nodeType === Node.ELEMENT_NODE && (c as HTMLElement).tagName !== 'SUMMARY') lines.push(...blockToMdLines(c as HTMLElement))
    }
    lines.push(':::')
    return lines
  }
  // 其余块级/行内标签散落在顶层：按段落拍平
  return inlineToMd(el).replace(/\n$/, '').split('\n')
}

export function htmlToEditorMd(html: string): string {
  if (!html) return ''
  const holder = document.createElement('div')
  holder.innerHTML = html
  const lines: string[] = []
  const pushBlock = (blk: string[]): void => {
    if (lines.length) lines.push('')
    lines.push(...blk)
  }
  for (const node of Array.from(holder.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.nodeValue || '').trim()
      if (t) pushBlock(t.split('\n'))
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    pushBlock(blockToMdLines(node as HTMLElement))
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').replace(/\n+$/, '')
}

// ---------------------------------------------------------------- Markdown → HTML（编辑输出持久化）

function attr(v: string): string {
  return escapeHtml(v).replace(/"/g, '&quot;')
}

function inlineToHtml(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.nodeValue || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.tagName === 'BR') return '<br>'
  const inner = (): string => Array.from(el.childNodes).map(inlineToHtml).join('')
  switch (el.tagName) {
    case 'B': case 'STRONG': return `<strong>${inner()}</strong>`
    case 'I': case 'EM': return `<em>${inner()}</em>`
    case 'U': return `<u>${inner()}</u>`
    case 'S': case 'DEL': case 'STRIKE': return `<del>${inner()}</del>`
    case 'CODE': return `<code>${escapeHtml(el.textContent || '')}</code>`
    case 'SUB': return `<sub>${inner()}</sub>`
    case 'SUP': return `<sup>${inner()}</sup>`
    case 'A': return `<a href="${attr(el.getAttribute('href') || '')}" target="_blank" rel="noopener">${inner()}</a>`
    case 'IMG': return `<img src="${attr(el.getAttribute('src') || '')}" alt="${attr(el.getAttribute('alt') || '')}">`
    default: {
      if (el.classList.contains('ne-status') || el.classList.contains('status-pill')) {
        return `<span class="ne-status">${escapeHtml(el.textContent || '')}</span>`
      }
      const style = el.getAttribute('style')
      if (el.tagName === 'SPAN' && style) return `<span style="${attr(style)}">${inner()}</span>`
      return inner()
    }
  }
}

function domToHtml(el: HTMLElement): string {
  const ne = el.dataset.ne || el.tagName.toLowerCase()
  switch (ne) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const inner = Array.from(el.childNodes).map(inlineToHtml).join('')
      return `<${ne}>${inner || '<br>'}</${ne}>`
    }
    case 'quote': {
      const kids = Array.from(el.children).map((c) => domToHtml(c as HTMLElement)).join('')
      return `<blockquote>${kids || '<p><br></p>'}</blockquote>`
    }
    case 'ul': case 'ol': {
      const tag = ne
      const lis = Array.from(el.children).filter((c) => c.tagName === 'LI').map((li) => {
        const hli = li as HTMLElement
        const inline = Array.from(li.childNodes)
          .filter((n) => !(n.nodeType === 1 && ((n as HTMLElement).tagName === 'UL' || (n as HTMLElement).tagName === 'OL')))
          .map(inlineToHtml).join('')
        const subs = Array.from(li.children)
          .filter((c) => c.tagName === 'UL' || c.tagName === 'OL')
          .map((c) => domToHtml(c as HTMLElement)).join('')
        if (hli.classList.contains('task')) {
          return `<li data-task="1"${hli.classList.contains('checked') ? ' data-checked="1"' : ''}>${inline}${subs}</li>`
        }
        return `<li>${inline}${subs}</li>`
      }).join('')
      return `<${tag}>${lis}</${tag}>`
    }
    case 'hr': return '<hr>'
    case 'codeblock': {
      const codeEl = el.querySelector('.cb-pre code') as HTMLElement | null
      return `<pre><code>${escapeHtml(preCodeText(codeEl || el))}</code></pre>`
    }
    case 'callout': {
      const body = el.querySelector('.co-body')
      const kids = body ? Array.from(body.children).map((c) => domToHtml(c as HTMLElement)).join('') : ''
      return `<blockquote>${kids || '<p><br></p>'}</blockquote>`
    }
    case 'collapse': {
      const title = el.querySelector('.cbb-title')?.textContent || ''
      const body = el.querySelector('.cbb-body')
      const kids = body ? Array.from(body.children).map((c) => domToHtml(c as HTMLElement)).join('') : ''
      return `<details><summary>${escapeHtml(title)}</summary>${kids}</details>`
    }
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tbody tr')).map((tr) =>
        '<tr>' + Array.from(tr.children).map((td) => {
          const content = (td as HTMLElement).querySelector('.ne-td-content')
          const inner = content ? Array.from(content.childNodes).map(inlineToHtml).join('') : escapeHtml((td as HTMLElement).textContent || '')
          return `<td>${inner || '<br>'}</td>`
        }).join('') + '</tr>'
      ).join('')
      return `<table><tbody>${rows}</tbody></table>`
    }
    default: {
      const inner = Array.from(el.childNodes).map(inlineToHtml).join('')
      return `<p>${inner || '<br>'}</p>`
    }
  }
}

export function editorMdToHtml(md: string): string {
  const holder = document.createElement('div')
  for (const b of parseMarkdown(md || '')) holder.insertAdjacentHTML('beforeend', domToHtml(b))
  return holder.innerHTML
}
