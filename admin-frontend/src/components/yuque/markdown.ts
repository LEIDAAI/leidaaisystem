/**
 * 语雀风格自研编辑器：Markdown ↔ 块 DOM 双向转换（内容契约：content 字段始终是 Markdown 文本）。
 * 块约定（编辑器根容器的直接子元素）：
 *  p / h1~h6[data-ne] / blockquote(>p) / ul>li(.task 任务项) / ol[data-oltype] /
 *  div.ne-hr-wrap / div.codeblock[data-lang][data-theme] / div.table-hole / div.callout[data-callout] / div.collapse-block
 */

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 富文本 token：状态标签 / 颜色span(HTML passthrough) / 行内代码 / 公式 / 图片 / 链接 / 粗体 / 删除线 / 下划线 / 斜体 / 上标 / 下标 */
const TOKEN_RE = /(<span class="(?:ne-status|status-pill)"(?: data-color="[^"]*")?>.*?<\/span>)|(<span style="[^"]*">.*?<\/span>)|(`[^`\n]+`)|(\$[^$\n]+\$)|(!\[[^\]\n]*\]\([^)\n]+\))|(\[[^\]\n]+\]\([^)\n]+\))|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(\+\+[^+\n]+\+\+)|(\*[^*\n]+\*)|(\^[^^\n]+\^)|(~[^~\n]+~)/g

/** 标签配对扫描：text[start] 处是 <span 开标签，返回真正配对的 </span> 之后的下标（未配对返回 -1）。
 *  行内 HTML 只有 span（其余行内样式均为 markdown token），只需对 span 计数。 */
function spanPairEnd(text: string, start: number): number {
  let depth = 0
  let i = start
  while (i < text.length) {
    const lt = text.indexOf('<', i)
    if (lt < 0) return -1
    if (/^<span[\s>]/.test(text.slice(lt))) {
      const gt = text.indexOf('>', lt)
      if (gt < 0) return -1
      depth++
      i = gt + 1
    } else if (text.startsWith('</span>', lt)) {
      depth--
      i = lt + 7
      if (depth === 0) return i
    } else {
      i = lt + 1
    }
  }
  return -1
}

function parseInlineInto(el: HTMLElement, text: string): void {
  let last = 0
  // 必须用局部实例：makeInlineToken 递归嵌套 token 时会重入本函数，共享的 /g 正则 lastIndex 被内层重置后，外层会反复匹配同一 token 导致死循环
  const re = new RegExp(TOKEN_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    let tok = m[0]
    let end = m.index + m[0].length
    if (tok.startsWith('<span style="')) {
      // 嵌套 span 往返修复：非贪婪匹配截断于内层 </span> 时，配对扫描找到真正闭合位置，扩展 token 并跳过已消费部分
      const real = spanPairEnd(text, m.index)
      if (real > end) {
        tok = text.slice(m.index, real)
        end = real
        re.lastIndex = end
      }
    }
    if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)))
    el.appendChild(makeInlineToken(tok))
    last = end
  }
  if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)))
}

function makeInlineToken(tok: string): Node {
  // 状态标签 / 颜色 span：serializeInlineNode 输出的原始 HTML，parse 侧必须闭环，否则 reload/undo 后按字面文本渲染
  if (tok.startsWith('<span')) {
    const pill = tok.match(/^<span class="(?:ne-status|status-pill)"(?: data-color="[^"]*")?>(.*?)<\/span>$/)
    if (pill) {
      const s = document.createElement('span')
      s.className = 'ne-status'
      s.contentEditable = 'false'
      s.textContent = pill[1]
      return s
    }
    // 开标签匹配 + 尾部校验取 inner：inner 可含嵌套 span / 状态标签（递归 parseInlineInto 处理）
    const st = tok.match(/^<span style="([^"]*)">/)
    if (st && tok.endsWith('</span>')) {
      const s = document.createElement('span')
      s.setAttribute('style', st[1].replace(/&quot;/g, '"'))
      parseInlineInto(s, tok.slice(st[0].length, tok.length - 7))
      return s
    }
  }
  if (tok.startsWith('`')) {
    const c = document.createElement('code')
    c.textContent = tok.slice(1, -1)
    return c
  }
  if (tok.startsWith('$')) {
    const s = document.createElement('span')
    s.className = 'formula'
    s.contentEditable = 'false'
    s.textContent = tok
    return s
  }
  let m = tok.match(/^!\[([^\]]*)\]\(([^)]*)\)$/)
  if (m) {
    const img = document.createElement('img')
    img.src = m[2]
    img.alt = m[1]
    return img
  }
  m = tok.match(/^\[([^\]]+)\]\(([^)]*)\)$/)
  if (m) {
    const a = document.createElement('a')
    a.href = m[2]
    a.textContent = m[1]
    a.target = '_blank'
    return a
  }
  const marks: [string, string][] = [
    ['**', 'b'], ['~~', 's'], ['++', 'u'], ['*', 'i'], ['^', 'sup'], ['~', 'sub']
  ]
  for (const [mark, tag] of marks) {
    if (tok.startsWith(mark) && tok.endsWith(mark) && tok.length > mark.length * 2) {
      const e = document.createElement(tag)
      parseInlineInto(e, tok.slice(mark.length, tok.length - mark.length))
      return e
    }
  }
  return document.createTextNode(tok)
}

function serializeInner(el: Element): string {
  return Array.from(el.childNodes).map(serializeInlineNode).join('')
}

export function serializeInlineNode(node: Node): string {
  // Markdown 是纯文本契约：<>& 为字面字符，不转义（parse 用 createTextNode 天然安全），否则往返每轮多一层实体转义
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || '').replace(/\u200B/g, '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.classList.contains('task-box') || el.classList.contains('ne-td-break')) return ''
  switch (el.tagName) {
    case 'BR': return '\n'
    case 'B': case 'STRONG': return `**${serializeInner(el)}**`
    case 'I': case 'EM': return `*${serializeInner(el)}*`
    case 'S': case 'DEL': case 'STRIKE': return `~~${serializeInner(el)}~~`
    case 'U': return `++${serializeInner(el)}++`
    case 'CODE': return '`' + (el.textContent || '') + '`'
    case 'SUB': return `~${serializeInner(el)}~`
    case 'SUP': return `^${serializeInner(el)}^`
    case 'A': return `[${serializeInner(el)}](${el.getAttribute('href') || ''})`
    case 'IMG': return `![${el.getAttribute('alt') || ''}](${el.getAttribute('src') || ''})`
    default: {
      if (el.classList.contains('formula') || el.classList.contains('mention')) return el.textContent || ''
      if (el.classList.contains('ne-status') || el.classList.contains('status-pill')) {
        // 统一输出 ne-status（旧内容中的 status-pill 读取时兼容，回写后自动迁移）
        return `<span class="ne-status">${el.textContent || ''}</span>`
      }
      const style = el.getAttribute('style')
      if (el.tagName === 'SPAN' && style) {
        return `<span style="${style.replace(/"/g, '&quot;')}">${serializeInner(el)}</span>`
      }
      return serializeInner(el)
    }
  }
}

// ---------------------------------------------------------------- 块构建器（解析与插入共用）

export const CALLOUT_ICONS: Record<string, string> = { info: 'i', success: '✓', warning: '!', danger: '!', tips: '★' }

export function buildCodeblock(lang = 'Plain Text', code = '', name = ''): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'codeblock'
  wrap.dataset.ne = 'codeblock'
  wrap.dataset.lang = lang
  wrap.dataset.theme = 'Github Light'
  if (name) wrap.dataset.name = name
  wrap.contentEditable = 'false'
  wrap.innerHTML = `
    <div class="codeblock-menu">
      <div class="cb-start">
        <button type="button" class="cb-collapse-btn" title="折叠代码块"></button>
        <input class="cb-name" placeholder="请输入代码块名称" value="${escapeHtml(name)}" />
      </div>
      <div class="cb-end">
        <select class="cb-lang"></select>
        <i class="cb-nav-divider"></i>
        <select class="cb-theme"></select>
        <i class="cb-nav-divider"></i>
        <button type="button" class="cb-copy" title="复制代码">复制</button>
        <button type="button" class="cb-more" title="更多">···</button>
      </div>
    </div>
    <pre class="cb-pre" contenteditable="true" spellcheck="false"><code>${escapeHtml(code)}</code></pre>`
  return wrap
}

export function buildTableBlock(rows: string[][]): HTMLElement {
  const n = Math.max(rows[0]?.length || 3, 1)
  const unit = Math.floor(750 / n)
  const hole = document.createElement('div')
  hole.className = 'table-hole'
  hole.dataset.ne = 'table'
  hole.contentEditable = 'false'
  const cols = Array.from({ length: n }, (_, ci) => `<col style="width:${ci === n - 1 ? 750 - unit * (n - 1) : unit}px">`).join('')
  const body = rows.map((r) => {
    const cells = Array.from({ length: n }, (_, ci) => r[ci] || '')
    return `<tr class="ne-tr">${cells.map((c) => `<td class="ne-td"><div class="ne-td-content" contenteditable="true">${c ? escapeHtml(c) : '<br>'}</div><div class="ne-td-break" contenteditable="false"></div></td>`).join('')}</tr>`
  }).join('')
  const colBars = Array.from({ length: n }, (_, ci) => `
    <div class="tbl-col-bar" data-col="${ci}"><span class="tbl-bar-move col"></span>
      <button type="button" class="tbl-col-add" title="右侧插入列"></button>
      <button type="button" class="tbl-col-del" title="删除本列"></button>
    </div>`).join('')
  const rowBars = rows.map((_, ri) => `
    <div class="tbl-row-bar" data-row="${ri}"><span class="tbl-bar-move row"></span>
      <button type="button" class="tbl-row-add" title="下方插入行"></button>
      <button type="button" class="tbl-row-del" title="删除本行"></button>
    </div>`).join('')
  hole.innerHTML = `
    <div class="tbl-col-controller"><div class="tbl-cc-inner">${colBars}</div></div>
    <div class="tbl-flex">
      <div class="tbl-row-controller"><div class="tbl-rc-inner">${rowBars}</div></div>
      <div class="table-wrap"><div class="ne-ui-table">
        <table class="ne-table" style="width:750px"><colgroup>${cols}</colgroup><tbody class="ne-table-inner">${body}</tbody></table>
        <div class="tbl-control-point" title="全选表格"></div>
      </div></div>
    </div>`
  return hole
}

export function buildCallout(type: string, lines: string[]): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = `callout co-${type}`
  wrap.dataset.ne = 'callout'
  wrap.dataset.callout = type
  wrap.contentEditable = 'false'
  const types = Object.keys(CALLOUT_ICONS)
  const typeBtns = types.map((t) => `<button type="button" class="co-type-btn" data-t="${t}" contenteditable="false">${CALLOUT_ICONS[t]}</button>`).join('')
  wrap.innerHTML = `<div class="co-types">${typeBtns}</div><div class="co-icon">${CALLOUT_ICONS[type] || 'i'}</div><div class="co-body" contenteditable="true"></div>`
  const body = wrap.querySelector('.co-body') as HTMLElement
  const ps = lines.length ? lines : ['']
  for (const line of ps) {
    const p = document.createElement('p')
    if (line) parseInlineInto(p, line)
    else p.innerHTML = '<br>'
    body.appendChild(p)
  }
  return wrap
}

export function buildCollapse(title: string, lines: string[]): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'collapse-block'
  wrap.dataset.ne = 'collapse'
  wrap.contentEditable = 'false'
  wrap.innerHTML = `
    <div class="cbb-summary"><span class="cbb-arrow">▶</span><span class="cbb-title" contenteditable="true">${escapeHtml(title || '请输入折叠块标题')}</span></div>
    <div class="cbb-body" contenteditable="true"></div>`
  const body = wrap.querySelector('.cbb-body') as HTMLElement
  const ps = lines.length ? lines : ['']
  for (const line of ps) {
    const p = document.createElement('p')
    if (line) parseInlineInto(p, line)
    else p.innerHTML = '<br>'
    body.appendChild(p)
  }
  return wrap
}

export function buildHr(): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'ne-hr-wrap'
  wrap.dataset.ne = 'hr'
  wrap.contentEditable = 'false'
  wrap.innerHTML = '<hr>'
  return wrap
}

// ---------------------------------------------------------------- Markdown → 块 DOM

const TASK_RE = /^[-*]\s+\[( |x)\]\s+(.*)$/
const UL_RE = /^[-*]\s+(.*)$/
const OL_RE = /^\d{1,3}\.\s+(.*)$/
const HEADING_RE = /^(#{1,6})\s+(.*)$/
const TABLE_RE = /^\s*\|.*\|\s*$/
const QUOTE_RE = /^>\s?(.*)$/

function makeParagraph(line: string): HTMLElement {
  const p = document.createElement('p')
  p.dataset.ne = 'p'
  if (line) parseInlineInto(p, line)
  else p.innerHTML = '<br>'
  return p
}

function makeListItem(kind: 'ul' | 'ol' | 'task', text: string, checked: boolean): HTMLLIElement {
  const li = document.createElement('li')
  if (kind === 'task') {
    li.className = 'task' + (checked ? ' checked' : '')
    const box = document.createElement('span')
    box.className = 'task-box'
    box.contentEditable = 'false'
    li.appendChild(box)
    if (text) parseInlineInto(li, text)
    else li.appendChild(document.createElement('br'))
  } else if (text) parseInlineInto(li, text)
  else li.innerHTML = '<br>'
  return li
}

export function parseMarkdown(md: string): HTMLElement[] {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n')
  const out: HTMLElement[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // ``` 代码块
    const fence = line.match(/^```([^`]*)\s*$/)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++
      out.push(buildCodeblock(fence[1].trim() || 'Plain Text', buf.join('\n')))
      continue
    }
    // ::: 提示框 / 折叠块（体内容按块级语法解析，支持列表/标题/引用等）
    const co = line.match(/^:::(info|success|warning|danger|tips|collapse)\s*$/)
    if (co) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) { buf.push(lines[i]); i++ }
      i++
      const title = co[1] === 'collapse' ? buf.shift() || '' : ''
      const box = co[1] === 'collapse' ? buildCollapse(title, []) : buildCallout(co[1], [])
      const body = box.querySelector('.cbb-body, .co-body') as HTMLElement
      body.innerHTML = ''
      for (const b of parseMarkdown(buf.join('\n'))) body.appendChild(b)
      out.push(box)
      continue
    }
    // 分割线
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push(buildHr()); i++; continue }
    // 标题（空文本如「# 」也必须消费，否则游标不前进导致死循环）
    const h = line.match(HEADING_RE)
    if (h) {
      const el = document.createElement('h' + h[1].length)
      el.dataset.ne = 'h' + h[1].length
      if (h[2].trim()) parseInlineInto(el, h[2])
      else el.innerHTML = '<br>'
      out.push(el)
      i++
      continue
    }
    // 表格
    if (TABLE_RE.test(line)) {
      const raw: string[] = []
      while (i < lines.length && TABLE_RE.test(lines[i])) { raw.push(lines[i].trim()); i++ }
      const rows = raw
        // 分隔行必须含 -（如 | --- | --- |）：合并单元格拍平矩阵全空格行不能误判成分隔行
        .filter((r) => !/^\|[\s:|-]*-[\s:|-]*\|$/.test(r))
        .map((r) => r.slice(1, -1).split('|').map((c) => c.trim()))
      out.push(buildTableBlock(rows.length ? rows : [['', '', ''], ['', '', ''], ['', '', '']]))
      continue
    }
    // 引用
    const q = line.match(QUOTE_RE)
    if (q) {
      const buf: string[] = []
      while (i < lines.length) {
        const qm = lines[i].match(QUOTE_RE)
        if (!qm) break
        buf.push(qm[1])
        i++
      }
      const bq = document.createElement('blockquote')
      bq.dataset.ne = 'quote'
      for (const el of parseMarkdown(buf.join('\n'))) bq.appendChild(el)
      out.push(bq)
      continue
    }
    // 列表（连续同类项合并；二级嵌套：子项行首缩进 ≥2 空格挂到上一项的子列表）。
    // 入口必须按「去前导空格」探测：缩进列表行（如 3 空格 + "- "）不命中锚定行首的列表正则，
    // 而下方段落分支又通过 {2,}[-*\d] 排除该行不消费，游标将永不前进 → parseMarkdown 死循环（整页假死）
    const probe = line.replace(/^ +/, '')
    if (TASK_RE.test(probe) || UL_RE.test(probe) || OL_RE.test(probe)) {
      type Item = { kind: 'ul' | 'ol' | 'task'; text: string; checked: boolean; depth: 0 | 1 }
      const items: Item[] = []
      while (i < lines.length) {
        const indented = /^ {2,}(.*)$/.exec(lines[i])
        // 3+ 空格缩进时捕获组仍带前导空格，必须剥掉才能命中列表正则
        const body = indented ? indented[1].replace(/^ +/, '') : lines[i]
        const depth: 0 | 1 = indented && items.length ? 1 : 0
        const tm = body.match(TASK_RE)
        const om = body.match(OL_RE)
        const um = body.match(UL_RE)
        if (tm) items.push({ kind: 'task', text: tm[2], checked: tm[1] === 'x', depth })
        else if (om) items.push({ kind: 'ol', text: om[1], checked: false, depth })
        else if (um) items.push({ kind: 'ul', text: um[1], checked: false, depth })
        else break
        i++
      }
      // 扁平项 → 嵌套 DOM：顶层连续同 kind 合并为一个列表；depth-1 子项按 kind 连续段挂到前一项
      let k = 0
      while (k < items.length) {
        const top = items[k]
        if (top.depth === 1) { k++; continue } // 防御：孤儿子项丢弃（首项 depth 恒为 0，正常不触发）
        const list = document.createElement(top.kind === 'ol' ? 'ol' : 'ul')
        list.dataset.ne = top.kind === 'ol' ? 'ol' : 'ul'
        if (top.kind === 'ol') list.dataset.oltype = '0'
        while (k < items.length && items[k].depth === 0 && items[k].kind === top.kind) {
          const it = items[k]
          const li = makeListItem(it.kind, it.text, it.checked)
          k++
          while (k < items.length && items[k].depth === 1) {
            const subKind = items[k].kind
            const sub = document.createElement(subKind === 'ol' ? 'ol' : 'ul')
            sub.dataset.ne = subKind === 'ol' ? 'ol' : 'ul'
            if (subKind === 'ol') sub.dataset.oltype = '0'
            while (k < items.length && items[k].depth === 1 && items[k].kind === subKind) {
              sub.appendChild(makeListItem(items[k].kind, items[k].text, items[k].checked))
              k++
            }
            li.appendChild(sub)
          }
          list.appendChild(li)
        }
        out.push(list)
      }
      continue
    }
    // 空行
    if (!line.trim()) { i++; continue }
    // 段落（连续非空行合并为一段，行间 <br>）。
    // 首行必须无条件消费：凡落到本分支的行均未被上方任何分支消费，若再被排除正则拦下
    // （如缺右管道的残表行 |foo），游标不前进 → 主循环死循环；先保底消费一行，后续行才按排除规则续段
    const buf: string[] = []
    buf.push(lines[i++])
    while (i < lines.length && lines[i].trim() && !/^(```|:::|#{1,6}\s|>\s?|[-*]\s|\d+\.\s|\s*\|| {2,}[-*\d])/.test(lines[i]) && !/^\s*-{3,}\s*$/.test(lines[i])) {
      buf.push(lines[i])
      i++
    }
    const p = document.createElement('p')
    p.dataset.ne = 'p'
    buf.forEach((ln, idx) => {
      if (idx) p.appendChild(document.createElement('br'))
      parseInlineInto(p, ln)
    })
    out.push(p)
  }
  if (!out.length) out.push(makeParagraph(''))
  return out
}

// ---------------------------------------------------------------- 块 DOM → Markdown

function serializeTableCells(td: HTMLTableCellElement): string {
  const content = td.querySelector('.ne-td-content')
  return serializeInner(content || td).replace(/\n/g, ' ')
}

function serializeBlockLines(el: HTMLElement): string[] {
  const ne = el.dataset.ne || el.tagName.toLowerCase()
  switch (ne) {
    case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
      const lvl = Number(ne.slice(1))
      return ['#'.repeat(lvl) + ' ' + serializeInner(el)]
    }
    case 'quote': {
      const lines: string[] = []
      for (const child of Array.from(el.children)) {
        for (const ln of serializeBlockLines(child as HTMLElement)) lines.push('> ' + ln)
      }
      return lines.length ? lines : ['>']
    }
    case 'ul': case 'ol': {
      // 嵌套子列表递归序列化（缩进 2 空格）；li 行内内容排除子列表节点（默认分支会把子列表按 inline 拍平）
      const lines: string[] = []
      const kids = Array.from(el.children) as HTMLElement[]
      kids.forEach((li, idx) => {
        const mark = ne === 'ol'
          ? `${idx + 1}. `
          : li.classList.contains('task') ? (li.classList.contains('checked') ? '- [x] ' : '- [ ] ') : '- '
        let inline = Array.from(li.childNodes)
          .filter((n) => !(n.nodeType === 1 && ((n as HTMLElement).tagName === 'UL' || (n as HTMLElement).tagName === 'OL')))
          .map(serializeInlineNode).join('')
        // 占位 <br> 序列化成换行：空项会输出 "- \n" 断裂成两行破坏结构；caret 落在 BR 后输入产生的 "- \nT" 前导换行、
        // caret 落在 BR 前输入产生的 "- T\n" 尾部换行一并剥除（行尾 BR 无视觉意义）
        if (inline === '\n') inline = ''
        else if (inline.startsWith('\n')) inline = inline.slice(1)
        if (inline.endsWith('\n')) inline = inline.slice(0, -1)
        lines.push(mark + inline)
        for (const sub of Array.from(li.children)) {
          if (sub.tagName === 'UL' || sub.tagName === 'OL') {
            for (const ln of serializeBlockLines(sub as HTMLElement)) lines.push('  ' + ln)
          }
        }
      })
      return lines
    }
    case 'hr': return ['---']
    case 'codeblock': {
      const lang = el.dataset.lang || 'Plain Text'
      const name = el.dataset.name || ''
      // innerText 保留 BR 为 \n（textContent 会丢掉代码块内换行）；尾 \n 由占位 BR 产生，去除
      const code = ((el.querySelector('.cb-pre code') as HTMLElement | null)?.innerText || '').replace(/\n$/, '')
      const pre: string[] = ['```' + lang]
      if (name) pre.push('<!-- ' + name + ' -->')
      pre.push(...code.split('\n'), '```')
      return pre
    }
    case 'callout': {
      const type = el.dataset.callout || 'info'
      const body = el.querySelector('.co-body')
      const lines: string[] = [`:::${type}`]
      for (const child of Array.from(body?.children || [])) lines.push(...serializeBlockLines(child as HTMLElement))
      lines.push(':::')
      return lines
    }
    case 'collapse': {
      const title = el.querySelector('.cbb-title')?.textContent || ''
      const body = el.querySelector('.cbb-body')
      const lines: string[] = [':::collapse', title]
      for (const child of Array.from(body?.children || [])) lines.push(...serializeBlockLines(child as HTMLElement))
      lines.push(':::')
      return lines
    }
    case 'table': {
      // 合并单元格（colSpan/rowSpan）展开成矩形矩阵占位空格（语雀导出 md 同样拍平），保证往返形状稳定
      const trs = Array.from(el.querySelectorAll('tbody tr'))
      const spanned: number[] = [] // spanned[col] = 上方 rowSpan 尚需占位几行
      const rows: string[][] = []
      let maxCols = 0
      for (const tr of trs) {
        const row: string[] = []
        let c = 0
        for (const td of Array.from(tr.children) as HTMLTableCellElement[]) {
          while ((spanned[c] || 0) > 0) { row.push(' '); spanned[c]--; c++ }
          const cs = td.colSpan || 1
          const rs = td.rowSpan || 1
          row.push(serializeTableCells(td) || ' ')
          for (let k = 1; k < cs; k++) row.push(' ')
          if (rs > 1) for (let k = 0; k < cs; k++) spanned[c + k] = Math.max(spanned[c + k] || 0, rs - 1)
          c += cs
        }
        while ((spanned[c] || 0) > 0) { row.push(' '); spanned[c]--; c++ }
        rows.push(row)
        if (row.length > maxCols) maxCols = row.length
      }
      // rowSpan 延伸超过实际行数（全表合并后源行被清理）时补空行，保持矩阵完整
      while (spanned.some((v) => v > 0)) {
        for (let c = 0; c < spanned.length; c++) if ((spanned[c] || 0) > 0) spanned[c]--
        rows.push(new Array(maxCols).fill(' '))
      }
      return rows.map((row) => '| ' + row.join(' | ') + ' |')
    }
    default: {
      // p（含 <br> 换行 → 多行）；块尾占位 BR 产生的行尾换行剥除（caret 在 BR 前输入后遗留 "T<br>"），否则 split 出空尾行
      return serializeInner(el).replace(/\n$/, '').split('\n')
    }
  }
}

export function serialize(root: HTMLElement): string {
  const lines: string[] = []
  for (const el of Array.from(root.children)) {
    if (el.classList?.contains('find-tmp-wrap')) continue
    // 块间空行：parse 把连续非空行合并为一段（标准 md），相邻 p 不加空行会在往返中粘连成一段
    if (lines.length) lines.push('')
    lines.push(...serializeBlockLines(el as HTMLElement))
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '')
}
