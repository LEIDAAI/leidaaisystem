<script setup lang="ts">
/**
 * 语雀风格自研 contenteditable 编辑器（1:1 复刻，规格见 yuque-editor-spec.md）：
 * 三段式布局（工具栏 / 正文 / 状态栏）+ Markdown 双向序列化（内容契约：v-model 始终是 Markdown）。
 * 块级 DOM 模型：p/h1~h6/列表/引用/代码块/表格/高亮块/折叠块/分割线（约定见 markdown.ts 头注释）。
 * 交互：Markdown 快捷输入(# - 1. > [] ``` )、快捷键全表、浮动栏、块手柄拖拽、右键菜单、
 * 查找替换、大纲侧栏、字数统计、表格行/列控制器、代码块菜单条、任务复选框。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import YuqueToolbar from './YuqueToolbar.vue'
import {
  buildCallout, buildCodeblock, buildCollapse, buildHr, buildTableBlock,
  CALLOUT_ICONS, parseMarkdown, serialize
} from './markdown'
import { CODE_LANGS, CODE_THEMES, FONT_SIZES, type EditorCommand, type EditorState } from './editorTypes'

const props = defineProps<{ modelValue: string; canEdit: boolean; placeholder?: string; maxlength?: number; minHeight?: number }>()
const emit = defineEmits<{ 'update:modelValue': [string]; publish: [] }>()
/** minHeight：正文最小高度（专家页短文本场景）；maxlength：超限计数提示 + 粘贴截断（0/未传=不限） */
const bodyStyle = computed(() => (props.minHeight ? { minHeight: props.minHeight + 'px' } : undefined))
const overLimit = computed(() => !!props.maxlength && wordCount.value > props.maxlength)

// ---------------------------------------------------------------- refs / 浮层状态
const toolbarRef = ref<InstanceType<typeof YuqueToolbar> | null>(null)
const rootEl = ref<HTMLElement | null>(null)
/** 大纲侧栏（spec §8：305×400，右上角入口） */
const showOutline = ref(false)
const outlineItems = ref<{ level: number; text: string; el: HTMLElement }[]>([])
/** 字数（spec §8：左下「N字」，选区时「已选/总 字」） */
const wordCount = ref(0)
const selCount = ref(0)
/** 查找替换浮层 */
const findOpen = ref(false)
const findText = ref('')
const replaceText = ref('')
/** 划词浮动栏（AI标注 + 划词评论，70×34） */
const floatBar = reactive({ show: false, x: 0, y: 0 })
/** 块手柄（⋮⋮ 24×24，hover 块左侧显示；拖拽移动块） */
const handle = reactive({ show: false, y: 0, block: null as HTMLElement | null })
const dragLine = reactive({ show: false, y: 0 })
/** 右键菜单（cell 非空 = 表格专属菜单模式） */
const ctx = reactive({ show: false, x: 0, y: 0, cell: null as HTMLElement | null })
/** 快捷键面板（484 宽无遮罩抽屉） */
const shortcutOpen = ref(false)

// ---------------------------------------------------------------- undo/redo（自维护快照栈）
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
let lastEmitted = ''
let composing: boolean = false

const state = reactive<EditorState>({
  block: 'p', fontSize: '15px', bold: false, italic: false, strike: false, underline: false,
  code: false, sup: false, sub: false, ul: false, ol: false, task: false, quote: false,
  align: 'left', lineHeight: null, olType: 0, color: '', bg: '',
  canUndo: false, canRedo: false, tableActive: false, canMerge: false, tableBorderHidden: false, painter: false
})

/** 当前字体字号在档位表中的索引（fontStep 用） */
function fontSizeIndex(v: string): number {
  const i = FONT_SIZES.indexOf(v)
  return i < 0 ? 4 : i
}

// ---------------------------------------------------------------- 序列化与渲染
function doc(): string {
  return rootEl.value ? serialize(rootEl.value) : ''
}

function syncContent(): void {
  const md = doc()
  if (md === lastEmitted) return
  lastEmitted = md
  emit('update:modelValue', md)
}

/** Markdown → 块 DOM 全量渲染（外部值变更 / undo） */
function renderDoc(md: string): void {
  const root = rootEl.value
  if (!root) return
  root.innerHTML = ''
  const blocks = parseMarkdown(md)
  if (!blocks.length) blocks.push(makeEmptyP())
  for (const b of blocks) root.appendChild(b)
  lastEmitted = md
  // undo/redo 也走这里：必须同步 v-model，否则父级 autosave 持久化撤销前的旧内容（reload 后复现）
  emit('update:modelValue', md)
  hydrateCodeblocks()
  refreshOutline()
  updateWordCount()
  updateState()
}

function makeEmptyP(): HTMLElement {
  const p = document.createElement('p')
  p.dataset.ne = 'p'
  p.innerHTML = '<br>'
  return p
}

/** 代码块 hydrate：填充语言/主题下拉（数据来自 CODE_LANGS/CODE_THEMES） */
function hydrateCodeblocks(): void {
  const root = rootEl.value
  if (!root) return
  for (const cb of Array.from(root.querySelectorAll('.codeblock'))) {
    const lang = cb.querySelector('.cb-lang') as HTMLSelectElement | null
    if (lang && !lang.options.length) {
      for (const l of CODE_LANGS) {
        const o = document.createElement('option')
        o.value = l
        o.textContent = l
        lang.appendChild(o)
      }
      lang.value = (cb as HTMLElement).dataset.lang || 'Plain Text'
    }
    const theme = cb.querySelector('.cb-theme') as HTMLSelectElement | null
    if (theme && !theme.options.length) {
      for (const t of CODE_THEMES) {
        const o = document.createElement('option')
        o.value = t
        o.textContent = t
        theme.appendChild(o)
      }
      theme.value = (cb as HTMLElement).dataset.theme || 'Github Light'
    }
  }
}

// ---------------------------------------------------------------- 选区辅助
function sel(): Selection | null {
  return window.getSelection()
}

/** 光标所在根直接子块 */
function currentBlock(): HTMLElement | null {
  const root = rootEl.value
  const s = sel()
  if (!root || !s || !s.anchorNode || !root.contains(s.anchorNode)) return null
  let n: Node | null = s.anchorNode
  while (n && n.parentNode !== root) n = n.parentNode
  return n instanceof HTMLElement ? n : null
}

/** 光标所在最近列表项 */
function currentLi(): HTMLLIElement | null {
  const s = sel()
  if (!s || !s.anchorNode) return null
  const n = (s.anchorNode.nodeType === Node.TEXT_NODE ? s.anchorNode.parentElement : s.anchorNode) as HTMLElement | null
  return n?.closest('li') as HTMLLIElement | null
}

/** 块变换的作用目标：高亮块/折叠块/引用内取光标所在内部块（避免整体替换摧毁复合块）；代码块/表格内禁止块变换 */
function transformTarget(): HTMLElement | null {
  const blk = currentBlock()
  if (!blk) return null
  if (blk.dataset.ne === 'codeblock' || blk.dataset.ne === 'table') return null
  if (blk.dataset.ne !== 'callout' && blk.dataset.ne !== 'collapse' && blk.tagName !== 'BLOCKQUOTE') return blk
  const s = sel()
  const n = s?.anchorNode ? (s.anchorNode.nodeType === Node.TEXT_NODE ? s.anchorNode.parentElement : (s.anchorNode as HTMLElement)) : null
  let inner = n?.closest('.co-body > *, .cbb-body > *, blockquote > *') as HTMLElement | null
  // 锚点直接落在 .co-body / .cbb-body / blockquote 容器上（元素锚点）时，回落到其首个子块，避免误取整个复合块
  if (!inner && n && (n.classList.contains('co-body') || n.classList.contains('cbb-body') || n.tagName === 'BLOCKQUOTE')) {
    inner = (n.firstElementChild as HTMLElement | null)
  }
  return inner && blk.contains(inner) ? inner : blk
}

/** 把光标放到元素末尾（首个文本节点） */
function placeCaret(el: HTMLElement, atEnd = true): void {
  const r = document.createRange()
  // 空块占位 <br>：caret 必须落在 BR 之前（锚 el/0）——落在 BR 后输入会把文本追加成 "<br>T"（序列化前导换行 artifact）；
  // 也不可删除 BR：caret 变成无子元素锚点后 Chrome 键入会逃逸到前一块末尾（见 Enter 续行处注释）
  if (el.textContent === '' && el.children.length === 1 && (el.children[0] as HTMLElement).nodeName === 'BR') {
    r.selectNodeContents(el)
    r.collapse(true)
  } else if (atEnd) {
    let last: Node | null = el
    while (last.lastChild) last = last.lastChild
    if (last && last.nodeType === Node.TEXT_NODE) r.setStart(last, (last.nodeValue || '').length)
    else if (last) r.selectNodeContents(last)
    else r.selectNodeContents(el)
  } else {
    r.selectNodeContents(el)
    r.collapse(true)
  }
  r.collapse(atEnd)
  const s = sel()
  s?.removeAllRanges()
  s?.addRange(r)
}

/** 在指定块后插入新空正文块并聚焦（插入类块型共用收尾） */
function appendAfter(block: HTMLElement, node: HTMLElement): HTMLElement {
  block.parentNode?.insertBefore(node, block.nextSibling)
  return node
}

/** 输入前快照（undo 用） */
function pushUndo(): void {
  if (composing) return
  undoStack.value.push(doc())
  if (undoStack.value.length > 200) undoStack.value.shift()
  redoStack.value = []
}

function undo(): void {
  if (!undoStack.value.length) return
  redoStack.value.push(doc())
  renderDoc(undoStack.value.pop() as string)
  focusRoot()
}

function redo(): void {
  if (!redoStack.value.length) return
  undoStack.value.push(doc())
  renderDoc(redoStack.value.pop() as string)
  focusRoot()
}

function focusRoot(): void {
  const root = rootEl.value
  if (!root) return
  root.focus()
  // anchorNode === root（focus 默认落在根起点，offset 0）时 currentBlock/currentLi 均解析失败，需强制落到末块
  const a = sel()?.anchorNode
  if (!a || a === root || !root.contains(a)) placeCaret(root.lastElementChild as HTMLElement || root)
}

// ---------------------------------------------------------------- 状态回显（工具栏 prop）
function updateState(): void {
  const blk = currentBlock()
  const s = sel()
  // rangeCount 为 0（如挂载于 ElDialog 内 selection 未建立）时 getRangeAt(0) 会抛 IndexSizeError
  const r = s && s.rangeCount ? s.getRangeAt(0) : null
  state.canUndo = undoStack.value.length > 0
  state.canRedo = redoStack.value.length > 0
  if (!blk) return
  state.block = (blk.dataset.ne && /^h[1-6]$/.test(blk.dataset.ne) ? blk.dataset.ne : blk.tagName === 'BLOCKQUOTE' ? 'p' : blk.dataset.ne) || 'p'
  state.quote = !!blk.closest('blockquote')
  const li = currentLi()
  const list = li?.closest('ul,ol') as HTMLElement | null
  state.ul = !!(list?.tagName === 'UL' && !li?.classList.contains('task'))
  state.task = !!li?.classList.contains('task')
  state.ol = list?.tagName === 'OL'
  if (state.ol && list) state.olType = Number(list.dataset.oltype || 0)
  state.align = ((blk.style.textAlign || 'left') as 'left' | 'center' | 'right')
  state.lineHeight = blk.style.lineHeight || null
  state.fontSize = inlineStyleOf('font-size') || '15px'
  state.bold = document.queryCommandState('bold')
  state.italic = document.queryCommandState('italic')
  state.underline = document.queryCommandState('underline')
  state.strike = document.queryCommandState('strikeThrough')
  state.sup = !!ancestorTag('SUP')
  state.sub = !!ancestorTag('SUB')
  state.code = !!ancestorTag('CODE')
  const fc = inlineStyleOf('color')
  const bgc = inlineStyleOf('background-color')
  state.color = fc || ''
  state.bg = bgc || ''
  state.tableActive = !!ancestorClass('ne-td-content')
  state.canMerge = state.tableActive && !!r && !r.collapsed
  state.painter = !!painterStyle
}

/** Range 是否完全包含节点（Chrome 非标 containsNode 的类型安全等价实现，部分包含返回 false） */
function rangeContains(r: Range, el: Node): boolean {
  const nr = document.createRange()
  nr.selectNode(el)
  return r.compareBoundaryPoints(Range.START_TO_START, nr) <= 0 && r.compareBoundaryPoints(Range.END_TO_END, nr) >= 0
}

/** 选区公共祖先链上的指定标签 */
function ancestorTag(tag: string): HTMLElement | null {
  const s = sel()
  if (!s || !s.anchorNode) return null
  let n: Node | null = s.anchorNode
  while (n && n !== rootEl.value) {
    if (n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName === tag) return n as HTMLElement
    n = n.parentNode
  }
  return null
}

function ancestorClass(cls: string): HTMLElement | null {
  const s = sel()
  if (!s || !s.anchorNode) return null
  const el = (s.anchorNode.nodeType === Node.TEXT_NODE ? s.anchorNode.parentElement : s.anchorNode) as HTMLElement | null
  return el?.closest('.' + cls) as HTMLElement | null
}

/** 选区行内样式值（fontSize/color 等回显） */
function inlineStyleOf(prop: string): string {
  const s = sel()
  if (!s || !s.anchorNode) return ''
  let n: Node | null = s.anchorNode.nodeType === Node.TEXT_NODE ? s.anchorNode.parentElement : s.anchorNode
  while (n && n !== rootEl.value) {
    const v = (n as HTMLElement).style?.getPropertyValue(prop)
    if (v) return v
    n = n.parentNode
  }
  return ''
}

// ---------------------------------------------------------------- 块变换
/** 正文 ⇆ 标题（保留内联内容）；列表内仅转换当前项，其余项保持原列表（对齐语雀） */
function transformTo(tag: string): void {
  const blk = transformTarget()
  if (!blk || !props.canEdit) return
  const li = currentLi()
  if ((blk.tagName === 'UL' || blk.tagName === 'OL') && li && blk.contains(li)) {
    // 嵌套项先物理反嵌套（liToBlock 以根层列表宿主为前提，直接调用会把新块插进父 li 内）；单次快照覆盖整个操作
    const parentLi = li.closest('ul,ol')?.closest('li') as HTMLLIElement | null
    if (parentLi) {
      const sub0 = li.closest('ul,ol') as HTMLElement
      parentLi.parentElement?.insertBefore(li, parentLi.nextSibling)
      if (!sub0.children.length) sub0.remove()
    }
    pushUndo()
    liToBlock(li, tag)
    afterChange()
    return
  }
  pushUndo()
  const ne = document.createElement(tag)
  ne.dataset.ne = tag
  ne.innerHTML = blk.innerHTML || '<br>'
  blk.replaceWith(ne)
  placeCaret(ne)
  afterChange()
}

/** 列表项 → 目标块：内联内容转出为新块，前后项各自成列表，嵌套子列表跟在新块后 */
function liToBlock(li: HTMLLIElement, tag: string): void {
  const list = li.closest('ul,ol') as HTMLElement
  const root = list.parentNode
  const sub = li.querySelector(':scope > ul, :scope > ol') as HTMLElement | null
  const ne = document.createElement(tag)
  ne.dataset.ne = tag
  for (const n of Array.from(li.childNodes)) {
    if (n !== sub && !(n.nodeType === 1 && (n as HTMLElement).classList.contains('task-box'))) ne.appendChild(n)
  }
  if (!ne.textContent?.trim() && !ne.querySelector('img')) ne.innerHTML = '<br>'
  const idx = Array.from(list.children).indexOf(li)
  // li 之后的项拆为 tail 列表；li 之前的项保留在原列表
  const rest = Array.from(list.children).slice(idx + 1)
  let tail: HTMLElement | null = null
  if (rest.length) {
    tail = document.createElement(list.tagName)
    tail.dataset.ne = list.dataset.ne
    if (list.dataset.oltype) tail.dataset.oltype = list.dataset.oltype
    for (const item of rest) tail.appendChild(item)
    root?.insertBefore(tail, list.nextSibling)
  }
  // 新块插在 li 原位置：首项在列表前，非首项在原列表之后（tail 之前）
  if (idx === 0) root?.insertBefore(ne, list)
  else root?.insertBefore(ne, tail ?? list.nextSibling)
  if (sub) root?.insertBefore(sub, ne.nextSibling)
  li.remove()
  if (!list.children.length) list.remove()
  placeCaret(ne)
}

/** 列表开关：ul / ol / task；再点一次退出为正文 */
function toggleList(kind: 'ul' | 'ol' | 'task', checked = false): void {
  const blk = transformTarget()
  if (!blk || !props.canEdit) return
  const li = currentLi()
  if (li && kind === 'task') {
    pushUndo()
    li.classList.toggle('task')
    li.classList.toggle('checked', checked)
    if (!li.querySelector('.task-box')) {
      const box = document.createElement('span')
      box.className = 'task-box'
      box.contentEditable = 'false'
      li.prepend(box)
    }
    afterChange()
    return
  }
  const inSameKind = li && ((kind === 'ul' && li.closest('ul') && !li.classList.contains('task')) || (kind === 'ol' && li.closest('ol')))
  if (li && inSameKind) {
    // 嵌套项先反嵌套一级（逐级退出，对齐语雀）；顶层项退出为正文。unwrapLi/outdentLi 均自含快照
    const parentLi = li.closest('ul,ol')?.closest('li') as HTMLLIElement | null
    if (parentLi) outdentLi(li)
    else unwrapLi(li)
    return
  }
  if (li && (li.closest('ul') || li.closest('ol'))) {
    // 列表类型切换：整个列表转换
    pushUndo()
    const list = li.closest('ul,ol') as HTMLElement
    const nList = document.createElement(kind === 'ol' ? 'ol' : 'ul')
    if (kind === 'ol') nList.dataset.ne = 'ol'
    else nList.dataset.ne = 'ul'
    for (const item of Array.from(list.children)) nList.appendChild(item)
    if (kind === 'task') for (const item of Array.from(nList.children)) { (item as HTMLElement).classList.add('task'); (item as HTMLElement).classList.toggle('checked', checked) }
    list.replaceWith(nList)
    afterChange()
    return
  }
  pushUndo()
  const list = document.createElement(kind === 'ol' ? 'ol' : 'ul')
  // 约定：无序/任务列表 data-ne 均为 'ul'（任务态由 li.task 表达），与 parse 侧一致
  list.dataset.ne = kind === 'ol' ? 'ol' : 'ul'
  if (kind === 'ol') list.dataset.oltype = String(state.olType)
  const nli = document.createElement('li')
  const hasText = !!blk.textContent
  nli.appendChild(document.createTextNode(blk.textContent || ''))
  // 空文本需 <br> 占位（防止光标无子元素锚点逃逸），且必须先设内容再插 task-box，否则 innerHTML 覆盖会丢复选框
  if (!hasText) nli.innerHTML = '<br>'
  if (kind === 'task') {
    nli.className = 'task' + (checked ? ' checked' : '')
    const box = document.createElement('span')
    box.className = 'task-box'
    box.contentEditable = 'false'
    nli.prepend(box)
  }
  list.appendChild(nli)
  blk.replaceWith(list)
  placeCaret(nli)
  afterChange()
}

/** 空列表项退出为正文（Enter / 再次切换共用）：新段落落在当前项之后（末项退出 → 列表后；中间项退出 → 拆分列表，对齐语雀） */
function unwrapLi(li: HTMLLIElement): void {
  pushUndo()
  const list = li.closest('ul,ol') as HTMLElement
  const root = list.parentNode
  const sub = li.querySelector(':scope > ul, :scope > ol') as HTMLElement | null
  const p = makeEmptyP()
  let text = ''
  for (const n of Array.from(li.childNodes)) if (n !== sub) text += n.textContent || ''
  if (text.trim()) p.textContent = text
  if (sub) root?.insertBefore(sub, list.nextSibling)
  root?.insertBefore(p, sub ? sub.nextSibling : list.nextSibling)
  const rest = Array.from(list.children).slice(Array.from(list.children).indexOf(li) + 1)
  if (rest.length) {
    const tail = document.createElement(list.tagName)
    tail.dataset.ne = list.dataset.ne
    if (list.dataset.oltype) tail.dataset.oltype = list.dataset.oltype
    for (const item of rest) tail.appendChild(item)
    root?.insertBefore(tail, p.nextSibling)
  }
  li.remove()
  if (!list.children.length) list.remove()
  placeCaret(p)
  afterChange()
}

/** 引用开关：块 ⇆ blockquote>p */
function toggleQuote(): void {
  const blk = transformTarget()
  if (!blk || !props.canEdit) return
  if (blk.tagName === 'BLOCKQUOTE') {
    pushUndo()
    const ps = Array.from(blk.children)
    for (const child of ps) {
      const p = makeEmptyP()
      p.innerHTML = (child as HTMLElement).innerHTML || '<br>'
      blk.parentNode?.insertBefore(p, blk)
    }
    blk.remove()
    afterChange()
    return
  }
  if (blk.closest('blockquote')) {
    pushUndo()
    const q = blk.closest('blockquote') as HTMLElement
    const p = makeEmptyP()
    p.innerHTML = blk.innerHTML || '<br>'
    q.parentNode?.insertBefore(p, q.nextSibling)
    blk.remove()
    if (!q.children.length) q.remove()
    placeCaret(p)
    afterChange()
    return
  }
  pushUndo()
  const q = document.createElement('blockquote')
  q.dataset.ne = 'quote'
  const p = document.createElement('p')
  p.innerHTML = blk.innerHTML || '<br>'
  q.appendChild(p)
  blk.replaceWith(q)
  placeCaret(p)
  afterChange()
}

/** 列表项 → 独立嵌入块（``` / --- 在列表项内回车触发）：当前项移出列表结构后原位替换；不 pushUndo（调用方自含） */
function liSwapNode(li: HTMLLIElement, node: HTMLElement): void {
  // 嵌套项先物理反嵌套到顶层列表（不单独快照，随调用方的 pushUndo 一并撤销）
  const sub0 = li.closest('ul,ol') as HTMLElement
  const pli = sub0.closest('li') as HTMLLIElement | null
  if (pli && pli.parentElement) {
    pli.parentElement.insertBefore(li, pli.nextSibling)
    if (!sub0.children.length) sub0.remove()
  }
  const list = li.closest('ul,ol') as HTMLElement
  const root = list.parentNode
  const sub = li.querySelector(':scope > ul, :scope > ol') as HTMLElement | null
  const idx = Array.from(list.children).indexOf(li)
  const rest = Array.from(list.children).slice(idx + 1)
  let tail: HTMLElement | null = null
  if (rest.length) {
    tail = document.createElement(list.tagName)
    tail.dataset.ne = list.dataset.ne
    if (list.dataset.oltype) tail.dataset.oltype = list.dataset.oltype
    for (const item of rest) tail.appendChild(item)
    root?.insertBefore(tail, list.nextSibling)
  }
  if (idx === 0) root?.insertBefore(node, list)
  else root?.insertBefore(node, tail ?? list.nextSibling)
  if (sub) root?.insertBefore(sub, node.nextSibling)
  li.remove()
  if (!list.children.length) list.remove()
}

/** 分割线：当前块替换为 ne-hr-wrap + 新正文块（复合块内作用于内部块；代码块/表格内禁用） */
function insertHr(): void {
  if (!props.canEdit) return
  const cur = currentBlock()
  if (cur && (cur.dataset.ne === 'codeblock' || cur.dataset.ne === 'table')) return
  const blk = transformTarget() || (rootEl.value?.lastElementChild as HTMLElement | null)
  if (!blk) return
  pushUndo()
  const hr = buildHr()
  const li = currentLi()
  if (li && blk.contains(li)) liSwapNode(li, hr)
  else blk.replaceWith(hr)
  const np = makeEmptyP()
  appendAfter(hr, np)
  placeCaret(np)
  afterChange()
}

/** 代码块插入（可带语言）：替换当前块（Markdown 触发时即移除 ``` 行；复合块内作用于内部块；代码块/表格内禁用） */
function insertCodeblock(lang = 'Plain Text', code = ''): void {
  if (!props.canEdit) return
  const cur = currentBlock()
  if (cur && (cur.dataset.ne === 'codeblock' || cur.dataset.ne === 'table')) return
  const blk = transformTarget() || (rootEl.value?.lastElementChild as HTMLElement | null)
  if (!blk) return
  pushUndo()
  const cb = buildCodeblock(lang, code)
  const li = currentLi()
  if (li && blk.contains(li)) liSwapNode(li, cb)
  else blk.replaceWith(cb)
  const np = makeEmptyP()
  appendAfter(cb, np)
  hydrateCodeblocks()
  const codeEl = cb.querySelector('.cb-pre > code') as HTMLElement | null
  if (codeEl) {
    // 空 code 需 <br> 占位并锚进 code 内：元素锚点无子节点时 Chrome 键入会逃逸到 pre 层（序列化时 BR 为空文本，无副作用）
    if (!codeEl.firstChild) codeEl.innerHTML = '<br>'
    placeCaret(codeEl)
  }
  afterChange()
}

/** 表格插入 3×3 */
function insertTable(): void {
  const blk = currentBlock() || rootEl.value?.lastElementChild as HTMLElement | null
  if (!blk || !props.canEdit) return
  pushUndo()
  const rows = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ''))
  const t = buildTableBlock(rows)
  appendAfter(blk, t)
  const np = makeEmptyP()
  appendAfter(t, np)
  placeCaret(np)
  afterChange()
}

/** 高亮块（callout）插入 */
function insertCalloutBlock(type: string): void {
  const blk = currentBlock() || rootEl.value?.lastElementChild as HTMLElement | null
  if (!blk || !props.canEdit) return
  pushUndo()
  const c = buildCallout(type, [''])
  appendAfter(blk, c)
  const np = makeEmptyP()
  appendAfter(c, np)
  const body = c.querySelector('.co-body p') as HTMLElement
  if (body) placeCaret(body)
  afterChange()
}

/** 折叠块插入 */
function insertCollapseBlock(): void {
  const blk = currentBlock() || rootEl.value?.lastElementChild as HTMLElement | null
  if (!blk || !props.canEdit) return
  pushUndo()
  const c = buildCollapse('', [''])
  appendAfter(blk, c)
  const np = makeEmptyP()
  appendAfter(c, np)
  const body = c.querySelector('.cbb-body p') as HTMLElement
  if (body) placeCaret(body)
  afterChange()
}

/** 对块设置行内级样式（对齐/行高/缩进/字号走块级 style） */
function applyBlockStyle(prop: 'textAlign' | 'lineHeight' | 'paddingLeft', value: string): void {
  const blk = currentBlock()
  if (!blk || !props.canEdit) return
  pushUndo()
  const targets = blk.tagName === 'BLOCKQUOTE' ? Array.from(blk.querySelectorAll('p')) : blk.closest('.callout') ? Array.from(blk.querySelectorAll('p')) : [blk]
  for (const el of targets) (el as HTMLElement).style.setProperty(prop, value)
  if (prop === 'paddingLeft' && !value) for (const el of targets) (el as HTMLElement).style.removeProperty('padding-left')
  afterChange()
}

/** 缩进：正文/标题 paddingLeft ±2em；列表项嵌套升降级（二级封顶：已在子列表内不可再缩进） */
function indent(dir: 1 | -1): void {
  const li = currentLi()
  if (li && props.canEdit) {
    if (dir === 1) {
      const list = li.closest('ul,ol') as HTMLElement
      const prev = li.previousElementSibling
      // 无前一项或已在二级（宿主列表嵌于 li 内）：不动作（pushUndo 前守卫，避免空操作污染 undo 栈）
      if (!prev || list.closest('li')) return
      pushUndo()
      let sub = prev.querySelector(':scope > ul, :scope > ol') as HTMLElement | null
      if (!sub) {
        sub = document.createElement(list.tagName)
        sub.dataset.ne = list.dataset.ne
        if (list.tagName === 'OL') sub.dataset.oltype = list.dataset.oltype || '0'
        prev.appendChild(sub)
      }
      sub.appendChild(li)
      placeCaret(li)
      afterChange()
      return
    }
    outdentLi(li)
    return
  }
  const cur = parseFloat(currentBlock()?.style.paddingLeft || '0')
  const next = Math.max(0, Math.min(64, cur + dir * 32))
  applyBlockStyle('paddingLeft', next ? next + 'px' : '')
}

/** 列表项反嵌套（升一级）：Shift+Tab / 二级空项回车 / toggleList 嵌套路由共用。顶层项不动作。自含快照 */
function outdentLi(li: HTMLLIElement): void {
  if (!props.canEdit) return
  const sub = li.closest('ul,ol') as HTMLElement
  const parentLi = sub.closest('li') as HTMLLIElement | null
  if (!parentLi || !parentLi.parentElement) return
  pushUndo()
  parentLi.parentElement.insertBefore(li, parentLi.nextSibling)
  if (!sub.children.length) sub.remove()
  placeCaret(li)
  afterChange()
}

/** 行内字号：对选区包 span（execCommand fontSize 后替换 font 标签） */
function setFontSize(px: string): void {
  if (!props.canEdit) return
  pushUndo()
  const s = sel()
  if (s && s.rangeCount && s.getRangeAt(0).collapsed) {
    // 塌陷光标：execCommand fontSize 无产出也无 typing 继承（afterChange 后 state 会被回写旧值），
    // 改为插入带 ZWSP 的字号 span 让后续输入继承；序列化剥 ZWSP，空 span 仍走 passthrough 往返
    const span = document.createElement('span')
    span.style.fontSize = px
    span.textContent = '\u200B'
    const r = s.getRangeAt(0)
    r.insertNode(span)
    const nr = document.createRange()
    if (!span.firstChild) return
    nr.setStart(span.firstChild, 1)
    nr.collapse(true)
    s.removeAllRanges()
    s.addRange(nr)
    state.fontSize = px
    afterChange()
    return
  }
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand('fontSize', false, '7')
  for (const f of Array.from(rootEl.value?.querySelectorAll('font[size="7"]') || [])) {
    const span = document.createElement('span')
    span.style.fontSize = px
    span.innerHTML = f.innerHTML
    f.replaceWith(span)
  }
  state.fontSize = px
  afterChange()
}

/** 行内颜色 / 背景色（styleWithCSS 输出 span style，序列化保留） */
function applyInlineColor(prop: 'color' | 'bg', v: string): void {
  if (!props.canEdit) return
  pushUndo()
  document.execCommand('styleWithCSS', false, 'true')
  if (prop === 'color') document.execCommand('foreColor', false, v)
  else document.execCommand('hiliteColor', false, v)
  document.execCommand('styleWithCSS', false, 'false')
  afterChange()
}

/** 渐变文字：surround span（背景渐变 + 裁切文字） */
function applyGradient(g: string): void {
  if (!props.canEdit) return
  const s = sel()
  if (!s || s.isCollapsed) return
  pushUndo()
  const span = document.createElement('span')
  span.style.backgroundImage = g
  span.style.webkitBackgroundClip = 'text'
  span.style.backgroundClip = 'text'
  span.style.color = 'transparent'
  try {
    s.getRangeAt(0).surroundContents(span)
  } catch {
    const frag = s.getRangeAt(0).extractContents()
    span.appendChild(frag)
    s.getRangeAt(0).insertNode(span)
  }
  s.removeAllRanges()
  afterChange()
}

/** 清除格式：removeFormat 让 Chrome 按选区边界拆分 span 并去 b/i/u/color/font；
 *  再对完全含于选区的 span 剥残留 style 并解包空壳（祖先 span 延伸出选区的不动，未选中部分格式保留，对齐语雀） */
function clearFormat(): void {
  if (!props.canEdit) return
  pushUndo()
  const s = sel()
  if (s && s.rangeCount && !s.isCollapsed) {
    document.execCommand('removeFormat')
    const r = s.getRangeAt(0)
    if (!r.collapsed) {
      for (const el of Array.from(rootEl.value?.querySelectorAll('span[style]') || [])) {
        if (!rangeContains(r, el)) continue
        el.removeAttribute('style')
        if (!el.attributes.length) el.replaceWith(...el.childNodes)
      }
    }
    // 块级 style 仅在块完全含于选区时清除（局部选区保留对齐/行高等块属性）
    for (const blk of Array.from(rootEl.value?.children || [])) {
      if (rangeContains(r, blk)) (blk as HTMLElement).removeAttribute('style')
    }
  } else {
    document.execCommand('removeFormat')
    const blk = currentBlock()
    if (blk) blk.removeAttribute('style')
  }
  afterChange()
}

/** 格式刷：取选区首个行内 span 样式，再次点击应用到新选区 */
let painterStyle: string | null = null
function formatPainter(): void {
  if (!props.canEdit) return
  const s = sel()
  if (!s) return
  if (painterStyle) {
    if (!s.isCollapsed) {
      pushUndo()
      const span = document.createElement('span')
      span.setAttribute('style', painterStyle)
      try {
        s.getRangeAt(0).surroundContents(span)
      } catch {
        const frag = s.getRangeAt(0).extractContents()
        span.appendChild(frag)
        s.getRangeAt(0).insertNode(span)
      }
      s.removeAllRanges()
      afterChange()
    }
    painterStyle = null
    return
  }
  if (s.isCollapsed) return
  const an = s.anchorNode
  if (!an) return
  let n: Node | null = an.nodeType === Node.TEXT_NODE ? an.parentElement : an
  while (n && n !== rootEl.value && !(n as HTMLElement).getAttribute?.('style')) n = n.parentNode
  painterStyle = (n as HTMLElement | null)?.getAttribute?.('style') || 'font-weight:bold'
  updateState() // 吸取后立刻点亮格式刷按钮
}

/** 在当前光标插入节点（emoji/状态/提及/日期/公式等） */
function insertNodeAtCaret(node: HTMLElement): void {
  const s = sel()
  if (!s || !s.rangeCount) return
  pushUndo()
  const r = s.getRangeAt(0)
  r.deleteContents()
  r.insertNode(node)
  r.setStartAfter(node)
  r.collapse(true)
  s.removeAllRanges()
  s.addRange(r)
  afterChange()
}

/** 插入 Markdown 行（外部工具调用：公式等） */
function insertMarkdownText(text: string): void {
  const blk = currentBlock()
  if (!blk || !props.canEdit) return
  pushUndo()
  if (blk.textContent && blk.textContent !== text) {
    const np = makeEmptyP()
    np.textContent = text
    appendAfter(blk, np)
    placeCaret(np)
  } else {
    blk.innerHTML = ''
    blk.appendChild(document.createTextNode(text))
    placeCaret(blk)
  }
  afterChange()
}

/** 每次内容变更后统一收尾：规范化 + 同步 v-model + 大纲/字数/状态 */
function afterChange(): void {
  normalizeRoot()
  syncContent()
  refreshOutline()
  updateWordCount()
  updateState()
}

/** 规范化根容器：裸 div → p；空 p 补 br；空列表项保留 */
function normalizeRoot(): void {
  const root = rootEl.value
  if (!root) return
  for (const n of Array.from(root.children) as HTMLElement[]) {
    if (n.tagName === 'DIV' && !n.dataset.ne) {
      const p = makeEmptyP()
      p.innerHTML = n.innerHTML || '<br>'
      n.replaceWith(p)
    } else if (/^(P|H[1-6])$/.test(n.tagName) && !n.textContent && !n.querySelector('img')) {
      if (!n.querySelector('br')) n.innerHTML = '<br>'
    }
  }
  if (!root.children.length) root.appendChild(makeEmptyP())
}


// ---------------------------------------------------------------- 工具栏命令分发（27 种，spec §2）
/** 块级结构命令：表格/代码块内不可用（此前静默失败，无任何反馈） */
const BLOCK_CMDS = new Set(['block', 'ul', 'ol', 'olType', 'task', 'indent', 'quote', 'hr', 'codeblock', 'table', 'align', 'lineHeight'])
function onCommand(c: EditorCommand): void {
  if (BLOCK_CMDS.has(c.cmd) && (state.tableActive || ancestorClass('cb-pre'))) {
    ElMessage.warning(state.tableActive ? '光标位于表格单元格内，该功能不可用' : '光标位于代码块内，该功能不可用')
    return
  }
  switch (c.cmd) {
    case 'undo': undo(); return
    case 'redo': redo(); return
    case 'formatPainter': formatPainter(); return
    case 'clearFormat': clearFormat(); return
    case 'block': transformTo(c.v); return
    case 'fontSize': setFontSize(c.v); return
    case 'fontStep': setFontSize(FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, fontSizeIndex(state.fontSize) + c.v))]); return
    case 'bold': case 'italic': case 'strike': case 'underline': {
      if (!props.canEdit) return
      pushUndo()
      document.execCommand(c.cmd === 'strike' ? 'strikeThrough' : c.cmd)
      afterChange()
      return
    }
    case 'inlineCode': toggleInlineCode(); return
    case 'sup': case 'sub': {
      if (!props.canEdit) return
      pushUndo()
      document.execCommand(c.cmd === 'sup' ? 'superscript' : 'subscript')
      afterChange()
      return
    }
    case 'color': applyInlineColor('color', c.v); return
    case 'bg': applyInlineColor('bg', c.v); return
    case 'colorDefault': applyInlineColor('color', '#333333'); return
    case 'bgDefault': applyInlineColor('bg', 'transparent'); return
    case 'gradient': applyGradient(c.v); return
    case 'align': applyBlockStyle('textAlign', c.v === 'left' ? '' : c.v); return
    case 'ul': toggleList('ul'); return
    case 'ol': toggleList('ol'); return
    case 'olType': state.olType = c.v; toggleList('ol'); return
    case 'task': toggleList('task'); return
    case 'indent': indent(c.v); return
    case 'lineHeight': applyBlockStyle('lineHeight', c.v || ''); return
    case 'quote': toggleQuote(); return
    case 'hr': insertHr(); return
    case 'link': insertLink(); return
    case 'codeblock': insertCodeblock(); return
    case 'table': insertTable(); return
    case 'filePick': onFilePicked(c.kind, c.file); return
    case 'find': findOpen.value = true; return
    case 'translate': case 'material': ElMessageBox.alert('演示环境未接入该能力', c.cmd === 'translate' ? '翻译' : '素材库', { type: 'info' }); return
    case 'tableBorder': toggleTableBorder(); return
    case 'tableMerge': mergeCells(); return
    case 'valign': alignTableCell(c.v); return
    case 'insert': doInsert(c.kind, c.value); return
    case 'unsupported': ElMessageBox.alert(`「${c.name}」为语雀会员/高级功能，本演示未实现`, '提示', { type: 'info' }); return
  }
}

/** 行内代码：选区 ⇆ code 标签 */
function toggleInlineCode(): void {
  if (!props.canEdit) return
  const s = sel()
  if (!s || s.isCollapsed) return
  pushUndo()
  if (ancestorTag('CODE')) {
    const code = ancestorTag('CODE') as HTMLElement
    const text = document.createTextNode(code.textContent || '')
    code.replaceWith(text)
  } else {
    const code = document.createElement('code')
    try { s.getRangeAt(0).surroundContents(code) } catch { code.appendChild(s.getRangeAt(0).extractContents()); s.getRangeAt(0).insertNode(code) }
  }
  s.removeAllRanges()
  afterChange()
}

/** 超链接：无选区取块文本；弹框输入 URL */
async function insertLink(): Promise<void> {
  if (!props.canEdit) return
  const s = sel()
  if (!s) return
  const initial = s.toString() || (currentBlock()?.textContent || '')
  try {
    const { value } = await ElMessageBox.prompt('链接地址（URL）', '插入链接', { inputValue: initial ? 'https://' : '' })
    if (!value) return
    pushUndo()
    const a = document.createElement('a')
    a.href = value
    a.textContent = s.isCollapsed ? initial || value : s.toString()
    if (s.isCollapsed) insertNodeAtCaret(a)
    else { s.getRangeAt(0).deleteContents(); s.getRangeAt(0).insertNode(a) }
    s.removeAllRanges()
    afterChange()
  } catch { /* 取消 */ }
}

/** 图片/附件落盘：转 dataURL 图；附件插入附件卡（演示：内存占位链接） */
function onFilePicked(kind: 'image' | 'file', file: File): void {
  if (!props.canEdit) return
  const reader = new FileReader()
  reader.onload = () => {
    if (kind === 'image') {
      const img = document.createElement('img')
      img.src = String(reader.result)
      img.alt = file.name
      insertNodeAtCaret(img)
    } else {
      const card = document.createElement('span')
      card.className = 'ne-file-card'
      card.contentEditable = 'false'
      card.textContent = `📎 ${file.name}`
      insertNodeAtCaret(card)
    }
  }
  reader.readAsDataURL(file)
}

/** 插入卡片菜单分发（spec §4 已实现项） */
function doInsert(kind: string, value?: string): void {
  switch (kind) {
    case 'callout': insertCalloutBlock(value || 'info'); return
    case 'codeblock': insertCodeblock(); return
    case 'collapse': insertCollapseBlock(); return
    case 'quote': toggleQuote(); return
    case 'hr': insertHr(); return
    case 'emoji': insertNodeAtCaret(Object.assign(document.createElement('span'), { textContent: value || '😀' })); return
    case 'math': insertMarkdownText('$$E=mc^2$$'); return
    case 'mention': { const m = document.createElement('span'); m.className = 'ne-mention'; m.contentEditable = 'false'; m.textContent = '@成员'; insertNodeAtCaret(m); return }
    case 'date': insertNodeAtCaret(Object.assign(document.createElement('span'), { textContent: new Date().toLocaleDateString('zh-CN') })); return
    case 'status': { const st = document.createElement('span'); st.className = 'ne-status'; st.contentEditable = 'false'; st.textContent = '进行中'; insertNodeAtCaret(st); return }
    case 'table': insertTable(); return
    default: ElMessageBox.alert(`「${kind}」卡片为语雀高级功能，本演示未实现`, '提示', { type: 'info' })
  }
}

/** 表格：隐藏边框开关 */
function toggleTableBorder(): void {
  const cell = ancestorClass('ne-td-content')
  const wrap = cell?.closest('.table-hole') as HTMLElement | null
  if (!wrap || !props.canEdit) return
  pushUndo()
  wrap.classList.toggle('borderless')
  state.tableBorderHidden = wrap.classList.contains('borderless')
  afterChange()
}

/** 表格：单元格垂直对齐（顶/中/底；多格选中时批量应用；md 不保留，往返拍平与语雀导出一致） */
function alignTableCell(v: 'top' | 'middle' | 'bottom'): void {
  if (!props.canEdit || !state.tableActive) return
  const selected = Array.from(rootEl.value?.querySelectorAll('.ne-td.selected') || []) as HTMLElement[]
  const cur = ancestorClass('ne-td')
  const targets = selected.length ? selected : cur ? [cur] : []
  if (!targets.length) return
  pushUndo()
  for (const td of targets) td.style.verticalAlign = v
  afterChange()
}

/** 表格合并选区单元格（rowspan/colspan 简化实现） */
function mergeCells(): void {
  if (!props.canEdit) return
  const s = sel()
  const cells = Array.from(rootEl.value?.querySelectorAll('.ne-td.selected') || []) as HTMLElement[]
  if (!s || s.isCollapsed || cells.length < 2) return
  pushUndo()
  const first = cells[0]
  const td0 = first.closest('.ne-td') as HTMLTableCellElement
  const tr0 = td0.closest('.ne-tr') as HTMLElement
  let colspan = 0
  let rowspan = 0
  const rows = new Set<HTMLElement>()
  for (const c of cells) {
    const td = c.closest('.ne-td') as HTMLElement
    if (td !== td0) {
      if (td.closest('.ne-tr') === tr0) colspan++
      else rows.add(td.closest('.ne-tr') as HTMLElement)
      td.remove()
    }
    c.classList.remove('selected')
  }
  rowspan = rows.size + 1
  td0.colSpan = Math.max(1, colspan + 1)
  if (rowspan > 1) td0.rowSpan = rowspan
  // 跨行合并后源行可能变空 tr，清理避免结构残留
  for (const tr of Array.from((td0.closest('.ne-table') as HTMLElement)?.querySelectorAll('.ne-tr') || [])) {
    if (!tr.querySelector('td')) tr.remove()
  }
  state.canMerge = false
  s.removeAllRanges()
  afterChange()
}

// ---------------------------------------------------------------- 输入事件（Markdown 快捷 + undo 快照）
function onBeforeInput(e: InputEvent): void {
  if (!props.canEdit) return
  // 输入前快照（组合输入由 compositionstart/end 单独处理）
  if (e.inputType !== 'insertCompositionText') pushUndo()
}

/** 模板内联赋值会被 TS 收窄报错，改由函数负责 */
function setComposing(v: boolean): void {
  composing = v
}

function onInput(): void {
  if (composing) return
  afterChange()
}

/** maxlength 粘贴截断：超限时改插纯文本并按剩余额度截断（execCommand 不触发 beforeinput，需手动 pushUndo） */
function onPaste(e: ClipboardEvent): void {
  if (!props.maxlength || !props.canEdit) return
  const text = e.clipboardData?.getData('text/plain') || ''
  if (!text) return
  if (wordCount.value + text.replace(/\s/g, '').length <= props.maxlength) return
  e.preventDefault()
  pushUndo()
  const remain = props.maxlength - wordCount.value
  let used = 0
  let out = ''
  for (const ch of text) {
    if (/\S/.test(ch)) { if (used >= remain) break; used++ }
    out += ch
  }
  if (out) document.execCommand('insertText', false, out)
}

// ---------------------------------------------------------------- 键盘：Markdown 快捷输入 + 快捷键全表（spec §6/§8）
/** 空格触发的块级快捷前缀 */
const MD_SPACE: Record<string, string> = { '#': 'h1', '##': 'h2', '###': 'h3', '-': 'ul', '>': 'quote', '[]': 'task', '[x]': 'task-x' }

function onKeydown(e: KeyboardEvent): void {
  if (!props.canEdit) return
  const mod = e.ctrlKey || e.metaKey
  // ---- 快捷键全表
  if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return }
  if (mod && !e.altKey && e.key === 'y') { e.preventDefault(); redo(); return }
  if (e.altKey && e.ctrlKey && /^[0-6]$/.test(e.key)) { e.preventDefault(); transformTo(e.key === '0' ? 'p' : 'h' + e.key); return }
  if (e.altKey && e.ctrlKey && (e.key === '+' || e.key === '=')) { e.preventDefault(); onCommand({ cmd: 'fontStep', v: 1 }); return }
  if (e.altKey && e.ctrlKey && e.key === '-') { e.preventDefault(); onCommand({ cmd: 'fontStep', v: -1 }); return }
  if (e.altKey && e.ctrlKey && e.key.toLowerCase() === 'h') { e.preventDefault(); onCommand({ cmd: 'bg', v: '#FBDE28' }); return }
  if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); onCommand({ cmd: 'formatPainter' }); return }
  if (mod && !e.shiftKey && e.key === '\\') { e.preventDefault(); onCommand({ cmd: 'clearFormat' }); return }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleList('ul'); return }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'c') { e.preventDefault(); toggleList('task'); return }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); toggleList('ol'); return }
  if (mod && e.key === ']') { e.preventDefault(); indent(1); return }
  if (mod && e.key === '[') { e.preventDefault(); indent(-1); return }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); onCommand({ cmd: 'strike' }); return }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); void insertLink(); return }
  if (mod && e.key === 'Enter') { e.preventDefault(); emit('publish'); return }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); emit('publish'); return }
  if (mod && e.key === '/') { e.preventDefault(); toolbarRef.value?.toggleInsert(); return }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); findOpen.value = true; return }
  if (mod && !e.shiftKey && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
    e.preventDefault()
    onCommand({ cmd: e.key.toLowerCase() === 'b' ? 'bold' : e.key.toLowerCase() === 'i' ? 'italic' : 'underline' } as EditorCommand)
    return
  }
  // ---- 表格快捷键（spec §7.2：合并 Shift+Ctrl+1 / 隐藏边框 Shift+Ctrl+\ / 垂直对齐 Alt+Shift+Ctrl+T/C/B）
  if (mod && e.shiftKey && e.key === '!' && state.tableActive) { e.preventDefault(); mergeCells(); return }
  if (mod && e.shiftKey && e.key === '\\' && state.tableActive) { e.preventDefault(); toggleTableBorder(); return }
  if (e.altKey && mod && e.shiftKey && state.tableActive) {
    const vk = { t: 'top', c: 'middle', b: 'bottom' }[e.key.toLowerCase()]
    if (vk) { e.preventDefault(); alignTableCell(vk as 'top' | 'middle' | 'bottom'); return }
  }
  // ---- 全选接管：原生 Ctrl+A 锚点会落进卡片（contenteditable=false 卡内的可编辑子树）内部，
  // 导致后续 Delete/Backspace 的卡片覆盖判定失效；改为程序化根级选区
  if (mod && e.key.toLowerCase() === 'a') {
    const root = rootEl.value
    if (root) {
      e.preventDefault()
      const rr = document.createRange()
      rr.setStart(root, 0)
      rr.setEnd(root, root.childNodes.length)
      const ss = sel()
      ss?.removeAllRanges()
      ss?.addRange(rr)
    }
    return
  }
  // ---- Delete/Backspace：选区覆盖复合卡片（contenteditable=false 的代码块/表格/高亮块等）时原生删除失效 → 手动 deleteContents
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const root = rootEl.value
    const s = sel()
    const r = s && s.rangeCount ? s.getRangeAt(0) : null
    if (root && r && !r.collapsed) {
      // 卡片视为被覆盖：选区与其相交且两端点未同时落在同一卡片内部
      // （原生 Ctrl+A 锚点可能落在卡片内但选区已延伸到卡外 → 也要整卡删除）
      const covered = (Array.from(root.children) as HTMLElement[]).filter(
        (c) => c.contentEditable === 'false' && r.intersectsNode(c) && !(c.contains(r.startContainer) && c.contains(r.endContainer))
      )
      if (covered.length) {
        e.preventDefault()
        pushUndo()
        // 先把选区扩到覆盖完整卡片（端点在卡内时 deleteContents 只会掏空卡片留残壳）
        for (const c of covered) {
          const cr = document.createRange()
          cr.selectNode(c)
          if (r.compareBoundaryPoints(Range.START_TO_START, cr) > 0) r.setStart(cr.startContainer, cr.startOffset)
          if (r.compareBoundaryPoints(Range.END_TO_END, cr) < 0) r.setEnd(cr.endContainer, cr.endOffset)
        }
        r.deleteContents() // Range API 不受 editability 限制，卡片可删
        // 空块清理：仅保留一个可聚焦块
        const kids = Array.from(root.children) as HTMLElement[]
        for (const c of kids) {
          if (!c.textContent && !c.querySelector('img') && !(c.dataset?.ne === 'codeblock') && root.children.length > 1) c.remove()
        }
        if (!root.firstElementChild) root.appendChild(makeEmptyP())
        placeCaret(root.firstElementChild as HTMLElement)
        afterChange()
        return
      }
    }
  }
  // ---- Enter：列表续行 / 空任务项退出 / ``` → 代码块 / --- → 分割线
  if (e.key === 'Enter' && !e.shiftKey && !mod) {
    const li = currentLi()
    const codePre = ancestorTag('PRE')
    const blk = currentBlock()
    // ``` → 代码块；--- → 分割线（块精确匹配；列表项内以当前项文本匹配，由 insert* 内部拆列表，遗留③修复）
    const txt = (li || blk)?.textContent?.trim() || ''
    if ((li || blk) && !codePre && (txt === '```' || txt === '---')) {
      e.preventDefault()
      // insertCodeblock/insertHr 自含 pushUndo，此处不显式快照（避免双份快照使 undo 需按两次）
      if (txt === '```') insertCodeblock()
      else insertHr()
      return
    }
    // 代码块分支必须先于列表判断：光标在 pre 内时 li 恒为 null，否则退出逻辑不可达
    if (codePre) {
      // 代码块内默认换行；末尾空行上 Enter 退出（对齐语雀：光标所在空行移除，正文段落落在代码块后）
      const s = sel()
      const r = s && s.rangeCount ? s.getRangeAt(0) : null
      if (r && r.collapsed) {
        const full = codePre.innerText || ''
        if (/\n$/.test(full)) {
          // 光标前后 innerText（br 按 1 计，pre-wrap 克隆保证 \n 文本字符按换行计）：
          // 前文以换行结尾（光标在空行上）且其后仅剩换行，即处于末尾空行 → 退出
          const pr = document.createRange()
          pr.selectNodeContents(codePre)
          pr.setEnd(r.endContainer, r.endOffset)
          const tmp = document.createElement('div')
          tmp.style.whiteSpace = 'pre-wrap'
          tmp.appendChild(pr.cloneContents())
          const pr2 = document.createRange()
          pr2.selectNodeContents(codePre)
          pr2.setStart(r.endContainer, r.endOffset)
          const tmp2 = document.createElement('div')
          tmp2.style.whiteSpace = 'pre-wrap'
          tmp2.appendChild(pr2.cloneContents())
          const before = tmp.innerText || ''
          const after = tmp2.innerText || ''
          if (before.endsWith('\n') && !/[^\n]/.test(after)) {
            e.preventDefault()
            pushUndo()
            // 按净化后行重建 code：移除光标所在尾空行（innerText 与序列化同源，br/\n 统一收敛）
            const codeEl = (codePre.querySelector('code') as HTMLElement) || codePre
            const lines = full.replace(/\n+$/, '').split('\n')
            codeEl.textContent = lines.join('\n')
            if (!lines.join('')) codeEl.innerHTML = '<br>'
            const wrap = codePre.closest('.codeblock') as HTMLElement
            const np = makeEmptyP()
            appendAfter(wrap, np)
            placeCaret(np)
            afterChange()
          }
        }
      }
      return
    }
    if (!li) return // 普通分段走默认行为，input 收尾
    e.preventDefault()
    // 空列表项（自身无文本，忽略嵌套子列表）回车：二级项反嵌套一级，一级项退出为正文（对齐语雀逐级退出）
    const subOwn = li.querySelector(':scope > ul, :scope > ol')
    let own = ''
    for (const n of Array.from(li.childNodes)) if (n !== subOwn) own += n.textContent || ''
    if (!own.trim()) {
      const parentLi = li.closest('ul,ol')?.closest('li') as HTMLLIElement | null
      if (parentLi) outdentLi(li)
      else unwrapLi(li)
      return
    }
    pushUndo()
    const nli = document.createElement('li')
    if (li.classList.contains('task')) { nli.className = 'task'; const box = document.createElement('span'); box.className = 'task-box'; box.contentEditable = 'false'; nli.prepend(box) }
    li.parentNode?.insertBefore(nli, li.nextSibling)
    // 空 li 需 <br> 占位：否则光标为无子元素锚点，Chrome 键入会逃逸到前一项末尾
    if (!nli.firstChild) nli.innerHTML = '<br>'
    placeCaret(nli)
    afterChange()
    return
  }
  // ---- 空格：Markdown 块快捷（仅行首精确前缀；列表项内以当前项文本为宿主，遗留①修复）
  if (e.key === ' ') {
    const li = currentLi()
    const blk = currentBlock()
    const host = li || blk
    if (!host) return
    const txt = (host.textContent || '').trimStart()
    if (MD_SPACE[txt]) {
      const target = MD_SPACE[txt]
      // 已是无序项：快捷无效，放行默认空格（避免 inSameKind 路由误 unwrap 退出）
      if (li && target === 'ul' && li.closest('ul') && !li.classList.contains('task')) return
      e.preventDefault()
      pushUndo()
      if (li) {
        // 列表项宿主：清空当前项自身文本（保留复选框与嵌套子列表）后再切换
        const sub = li.querySelector(':scope > ul, :scope > ol')
        for (const n of Array.from(li.childNodes)) {
          if (n === sub || (n.nodeType === 1 && (n as HTMLElement).classList.contains('task-box'))) continue
          ;(n as ChildNode).remove()
        }
        if (!li.firstChild) li.innerHTML = '<br>'
        placeCaret(li)
      } else {
        host.textContent = ''
        host.innerHTML = '<br>'
      }
      if (target === 'ul') { if (!li) host.dataset.ne = 'p'; toggleList('ul') }
      else if (target === 'task' || target === 'task-x') toggleList('task', target === 'task-x')
      else if (target === 'quote') toggleQuote()
      else transformTo(target)
      return
    }
    if (/^(\d+|\*|[a-z])[.)]$/.test(txt)) {
      if (li) {
        // 列表项内触发：整列表切换为有序（保留各项内容）；已是有序则放行默认空格
        if (li.closest('ol')) return
        e.preventDefault()
        toggleList('ol')
        return
      }
      e.preventDefault()
      pushUndo()
      host.textContent = ''
      host.innerHTML = '<br>'
      const list = document.createElement('ol')
      list.dataset.ne = 'ol'
      list.dataset.oltype = '0'
      const nli = document.createElement('li')
      nli.innerHTML = '<br>'
      list.appendChild(nli)
      host.replaceWith(list)
      placeCaret(nli)
      afterChange()
      return
    }
  }
  // ---- Tab：列表项嵌套缩进 / Shift 反嵌套（二级封顶）；表格末格 → 新增行
  if (e.key === 'Tab') {
    const li = currentLi()
    if (li) {
      e.preventDefault()
      indent(e.shiftKey ? -1 : 1)
      return
    }
    const td = ancestorClass('ne-td-content')
    if (!td) return
    const tr = td.closest('.ne-tr') as HTMLElement
    const isLast = !tr.nextElementSibling && !td.nextElementSibling
    if (isLast) { e.preventDefault(); addTableRow(tr, 'after'); placeCaret(tr.nextElementSibling!.querySelector('.ne-td-content') as HTMLElement) }
  }
}

// ---------------------------------------------------------------- 鼠标：划词浮动栏 / 块手柄 / cell 拖选
let mouseDownPos = { x: 0, y: 0 }
/** 表格 cell 拖选锚点 */
let cellAnchor: HTMLElement | null = null
let draggingCells = false

function onBodyMousedown(e: MouseEvent): void {
  ctx.show = false
  floatBar.show = false
  mouseDownPos = { x: e.clientX, y: e.clientY }
  // 右键不重置 cell 选区：先拖选后右键，需保留整片选区做「删除所选行/列」
  if (e.button === 2) return
  // 表格控制器条：按压后拖动转入列宽/行高拖拽；原位抬起保留 +/- 按钮 click（onRootClick）
  if (e.button === 0) {
    const t = e.target as HTMLElement
    const bar = (t.closest('.tbl-col-bar') || t.closest('.tbl-row-bar')) as HTMLElement | null
    if (bar) { startBarPending(bar, e); return }
  }
  // 表格 cell 拖选起点
  const cell = ancestorClass('ne-td-content')
  clearCellSelect()
  if (cell && e.shiftKey) { cellAnchor = cell; (cell.closest('.ne-td') as HTMLElement).classList.add('selected'); draggingCells = true }
}

function onBodyMouseup(e: MouseEvent): void {
  draggingCells = false
  // 划词浮动栏：非拖选 + 选中文本 + 焦点在编辑器（spec §5：选区末尾上方 70×34）
  const s = sel()
  if (s && s.rangeCount && !s.isCollapsed && mouseDownPos.x && Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y) < 6 && rootEl.value?.contains(s.anchorNode)) {
    const rect = s.getRangeAt(0).getBoundingClientRect()
    const host = rootEl.value.closest('.yu-content-scroll') as HTMLElement
    if (rect.width && host) {
      const hb = host.getBoundingClientRect()
      floatBar.x = Math.min(rect.right - hb.left + host.scrollLeft, host.clientWidth - 80)
      floatBar.y = Math.max(rect.top - hb.top + host.scrollTop - 42, 0)
      floatBar.show = true
      selCount.value = s.toString().length
    }
  } else {
    floatBar.show = false
    selCount.value = 0
  }
  updateWordCount()
  updateState()
}

function onBodyMouseover(e: MouseEvent): void {
  // 表格 cell 拖选扩展（spec §7.2）
  if (draggingCells && cellAnchor) {
    const over = (e.target as HTMLElement).closest('.ne-td') as HTMLElement | null
    const from = cellAnchor.closest('.ne-td') as HTMLElement
    if (over && from) {
      const trs = Array.from(from.closest('.ne-table')?.querySelectorAll('.ne-tr') || [])
      const r0 = trs.indexOf(from.closest('.ne-tr') as HTMLElement)
      const c0 = Array.from(from.closest('.ne-tr')!.children).indexOf(from)
      const r1 = trs.indexOf(over.closest('.ne-tr') as HTMLElement)
      const c1 = Array.from(over.closest('.ne-tr')!.children).indexOf(over)
      clearCellSelect()
      let count = 0
      for (const tr of trs) {
        const ri = trs.indexOf(tr)
        Array.from(tr.children).forEach((td, ci) => {
          if (ri >= Math.min(r0, r1) && ri <= Math.max(r0, r1) && ci >= Math.min(c0, c1) && ci <= Math.max(c0, c1)) { (td as HTMLElement).classList.add('selected'); count++ }
        })
      }
      state.canMerge = count > 1
      return
    }
  }
  // 块手柄：hover 编辑器块左上（⋮⋮ 24×24，跟随块顶）
  const t = e.target as HTMLElement
  const root = rootEl.value
  if (!root || !root.contains(t) || t === root) { handle.show = false; return }
  // 定位 t 所在的根直接子块（t 为目标元素；原 closest(':scope > *') 恒返回 null，手柄从不显示）
  const direct = Array.from(root.children).find((c) => c === t || c.contains(t)) as HTMLElement | null
  if (!direct) { handle.show = false; return }
  const host = root.closest('.yu-content-scroll') as HTMLElement
  if (!host) return
  handle.y = (direct as HTMLElement).offsetTop + host.scrollTop
  handle.block = direct as HTMLElement
  handle.show = true
}

/** 清除全部 cell 选中态 */
function clearCellSelect(): void {
  for (const c of Array.from(rootEl.value?.querySelectorAll('.ne-td.selected') || [])) c.classList.remove('selected')
  state.canMerge = false
}

/** 表格行/列增删（控制器 + Tab 末格共用） */
const TD_HTML = '<div class="ne-td-content" contenteditable="true"><br></div><div class="ne-td-break" contenteditable="false"></div>'

function addTableRow(tr: HTMLElement, where: 'before' | 'after'): void {
  if (!props.canEdit) return
  pushUndo()
  const ntr = document.createElement('tr')
  ntr.className = 'ne-tr'
  for (let i = 0; i < tr.children.length; i++) {
    const td = document.createElement('td')
    td.className = 'ne-td'
    td.innerHTML = TD_HTML
    ntr.appendChild(td)
  }
  // tr 实际是 tbody.ne-table-inner 的子节点（非 table 直接子节点），必须挂在同一父级下
  tr.parentNode?.insertBefore(ntr, where === 'before' ? tr : tr.nextSibling)
  const hole = tr.closest('.table-hole') as HTMLElement | null
  const table = tr.closest('.ne-table') as HTMLTableElement | null
  if (hole && table) syncRowBars(hole, table)
  afterChange()
}

function insertTableColumn(table: HTMLTableElement, ci: number, where: 'before' | 'after' = 'after'): void {
  for (const tr of Array.from(table.querySelectorAll('.ne-tr'))) {
    const ref = tr.children[ci] as HTMLElement | undefined
    if (!ref) continue
    const td = document.createElement('td')
    td.className = 'ne-td'
    td.innerHTML = TD_HTML
    if (where === 'after') ref.after(td)
    else ref.before(td)
  }
  const cg = table.querySelector('colgroup')
  if (cg) {
    const col = document.createElement('col')
    col.setAttribute('width', '250')
    // col 与 td 同位插入（原实现恒插在首个 col 后，列宽会错位）
    const ref = cg.children[ci] as Element | undefined
    if (ref) {
      if (where === 'after') ref.after(col)
      else ref.before(col)
    } else {
      cg.appendChild(col)
    }
  }
  const hole = table.closest('.table-hole') as HTMLElement | null
  if (hole) syncColBars(hole, table)
}

function deleteTableColumn(table: HTMLTableElement, ci: number): void {
  for (const tr of Array.from(table.querySelectorAll('.ne-tr'))) {
    const td = tr.children[ci] as HTMLElement | undefined
    td?.remove()
  }
  const cols = Array.from(table.querySelectorAll('colgroup col'))
  cols[ci]?.remove()
  const hole = table.closest('.table-hole') as HTMLElement | null
  if (hole) syncColBars(hole, table)
}

function deleteTableRow(table: HTMLElement, tr: HTMLElement): void {
  pushUndo()
  tr.remove()
  if (!table.querySelectorAll('.ne-tr').length) (table.closest('.table-hole') as HTMLElement)?.remove()
  const hole = table.closest('.table-hole') as HTMLElement | null
  if (hole && table.isConnected) syncRowBars(hole, table)
  afterChange()
}

/** 删除所选行（右键菜单：拖选多行时整片删除，空表时连带移除表格） */
function deleteSelectedRows(table: HTMLElement): void {
  pushUndo()
  const trs = new Set<HTMLElement>()
  for (const td of Array.from(table.querySelectorAll('.ne-td.selected'))) {
    const tr = td.closest('.ne-tr') as HTMLElement | null
    if (tr) trs.add(tr)
  }
  trs.forEach((tr) => tr.remove())
  if (!table.querySelectorAll('.ne-tr').length) (table.closest('.table-hole') as HTMLElement)?.remove()
  const hole = table.closest('.table-hole') as HTMLElement | null
  if (hole && table.isConnected) syncRowBars(hole, table)
  clearCellSelect()
  afterChange()
}

/** 删除所选列（按列索引倒序删除避免位移；全列删光时连带移除表格） */
function deleteSelectedColumns(table: HTMLTableElement): void {
  pushUndo()
  const cis = new Set<number>()
  for (const td of Array.from(table.querySelectorAll('.ne-td.selected'))) {
    const tr = td.closest('.ne-tr')
    if (tr) cis.add(Array.from(tr.children).indexOf(td))
  }
  const order = Array.from(cis).sort((a, b) => b - a)
  for (const tr of Array.from(table.querySelectorAll('.ne-tr'))) {
    for (const ci of order) (tr.children[ci] as HTMLElement | undefined)?.remove()
  }
  const cols = Array.from(table.querySelectorAll('colgroup col'))
  for (const ci of order) cols[ci]?.remove()
  if (!table.querySelector('.ne-td')) (table.closest('.table-hole') as HTMLElement)?.remove()
  const hole = table.closest('.table-hole') as HTMLElement | null
  if (hole && table.isConnected) syncColBars(hole, table)
  clearCellSelect()
  afterChange()
}

// ---------------------------------------------------------------- 表格列宽/行高拖拽（控制器条 mousedown；md 序列化不含尺寸，拖拽结果仅会话内生效）
const COL_MIN = 40
const ROW_MIN = 30
/** 拖拽期间的 document 监听清理（组件卸载兜底） */
let dragCleanup: (() => void) | null = null

/** col 当前宽度：style.width 优先，回退 width 属性（插入列走 attribute），再回退首行单元格实测 */
function colWidth(table: HTMLTableElement, ci: number): number {
  const col = table.querySelectorAll('colgroup col')[ci] as HTMLElement | undefined
  if (!col) return 0
  const sw = parseFloat(col.style.width || '')
  if (Number.isFinite(sw) && sw > 0) return sw
  const aw = parseFloat(col.getAttribute('width') || '')
  if (Number.isFinite(aw) && aw > 0) return aw
  return ((table.querySelectorAll('.ne-tr')[0] as HTMLElement | undefined)?.children[ci] as HTMLElement | undefined)?.offsetWidth || 0
}

/** 列控制器条与列一一同步（数量/索引/宽度对齐；插删列、拖拽后调用，条宽=列宽） */
function syncColBars(hole: HTMLElement, table: HTMLTableElement): void {
  const inner = hole.querySelector('.tbl-cc-inner') as HTMLElement | null
  if (!inner) return
  const n = table.querySelectorAll('colgroup col').length
  const bars = Array.from(inner.querySelectorAll('.tbl-col-bar')) as HTMLElement[]
  const MAKE = '<span class="tbl-bar-move col"></span><button type="button" class="tbl-col-add" title="右侧插入列"></button><button type="button" class="tbl-col-del" title="删除本列"></button>'
  while (bars.length < n) {
    const b = document.createElement('div')
    b.className = 'tbl-col-bar'
    b.innerHTML = MAKE
    inner.appendChild(b)
    bars.push(b)
  }
  while (bars.length > n) (bars.pop() as HTMLElement).remove()
  for (let i = 0; i < n; i++) {
    const b = bars[i] as HTMLElement
    b.dataset.col = String(i)
    const w = colWidth(table, i)
    if (w) b.style.flex = `0 0 ${w}px`
  }
}

/** 行控制器条与行一一同步（数量/索引/高度对齐；插删行、拖拽后调用，条高=行高） */
function syncRowBars(hole: HTMLElement, table: HTMLElement): void {
  const inner = hole.querySelector('.tbl-rc-inner') as HTMLElement | null
  if (!inner) return
  const trs = Array.from(table.querySelectorAll('.ne-tr')) as HTMLElement[]
  const bars = Array.from(inner.querySelectorAll('.tbl-row-bar')) as HTMLElement[]
  const MAKE = '<span class="tbl-bar-move row"></span><button type="button" class="tbl-row-add" title="下方插入行"></button><button type="button" class="tbl-row-del" title="删除本行"></button>'
  while (bars.length < trs.length) {
    const b = document.createElement('div')
    b.className = 'tbl-row-bar'
    b.innerHTML = MAKE
    inner.appendChild(b)
    bars.push(b)
  }
  while (bars.length > trs.length) (bars.pop() as HTMLElement).remove()
  for (let i = 0; i < trs.length; i++) {
    const b = bars[i] as HTMLElement
    b.dataset.row = String(i)
    b.style.height = trs[i].offsetHeight + 'px'
  }
}

/** 拖拽进行中的 move 处理（begin* 装配） */
let resizeMove: ((ev: MouseEvent) => void) | null = null

/** 控制器条按下（含 +/- 按钮上）：拖动超 4px 转入拖拽并抑制按钮 click；原位抬起保留 click */
function startBarPending(bar: HTMLElement, e: MouseEvent): void {
  const sx = e.clientX
  const sy = e.clientY
  let resizing = false
  const suppressClick = (ev: MouseEvent): void => { ev.stopPropagation(); ev.preventDefault() }
  const move = (ev: MouseEvent): void => {
    if (!resizing) {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) <= 4) return
      resizing = true
      document.addEventListener('click', suppressClick, true)
      if (bar.classList.contains('tbl-col-bar')) beginColResize(bar, ev)
      else beginRowResize(bar, ev)
    }
    resizeMove?.(ev)
  }
  const up = (): void => {
    dragCleanup = null
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
    document.removeEventListener('click', suppressClick, true)
    if (resizing) { resizeMove = null; afterChange() }
  }
  dragCleanup = () => {
    document.removeEventListener('mousemove', move)
    document.removeEventListener('mouseup', up)
    document.removeEventListener('click', suppressClick, true)
    resizeMove = null
  }
  document.addEventListener('mousemove', move)
  document.addEventListener('mouseup', up)
}

/** 装配列宽拖拽（目标列与相邻列互补，总宽 750 不变；控制器条保持对齐） */
function beginColResize(bar: HTMLElement, ev: MouseEvent): void {
  const hole = bar.closest('.table-hole') as HTMLElement
  const table = hole.querySelector('.ne-table') as HTMLTableElement
  const cols = Array.from(table.querySelectorAll('colgroup col')) as HTMLElement[]
  const ci = Number(bar.dataset.col)
  const ai = ci + 1 < cols.length ? ci + 1 : ci - 1
  const w0 = colWidth(table, ci)
  const w1 = ai >= 0 ? colWidth(table, ai) : 0
  if (ci < 0 || ai < 0 || !w0 || !w1) return
  pushUndo()
  const total = w0 + w1
  resizeMove = (mv: MouseEvent): void => {
    const nw = Math.max(COL_MIN, Math.min(total - COL_MIN, w0 + mv.clientX - ev.clientX))
    cols[ci].style.width = `${nw}px`
    cols[ai].style.width = `${total - nw}px`
    syncColBars(hole, table)
  }
}

/** 装配行高拖拽（tr.style.height=最小高度，可增高；行条同步对齐） */
function beginRowResize(bar: HTMLElement, ev: MouseEvent): void {
  const hole = bar.closest('.table-hole') as HTMLElement
  const table = hole.querySelector('.ne-table') as HTMLElement
  const ri = Number(bar.dataset.row)
  const tr = table.querySelectorAll('.ne-tr')[ri] as HTMLElement | undefined
  if (!tr) return
  pushUndo()
  syncRowBars(hole, table)
  const barEl = hole.querySelectorAll('.tbl-row-bar')[ri] as HTMLElement | undefined
  const h0 = tr.offsetHeight
  resizeMove = (mv: MouseEvent): void => {
    tr.style.height = `${Math.max(ROW_MIN, h0 + mv.clientY - ev.clientY)}px`
    if (barEl) barEl.style.height = `${tr.offsetHeight}px`
  }
}

/** 删除整个表格，焦点落到相邻正文块 */
function deleteWholeTable(table: HTMLElement): void {
  pushUndo()
  const hole = table.closest('.table-hole') as HTMLElement | null
  ;(hole || table).remove()
  clearCellSelect()
  const root = rootEl.value
  if (root && !root.children.length) root.appendChild(makeEmptyP())
  if (root?.lastElementChild) placeCaret(root.lastElementChild as HTMLElement)
  afterChange()
}

// ---------------------------------------------------------------- 右键菜单 + 块拖拽（spec §5）
function onContextmenu(e: MouseEvent): void {
  // 只读不接管：保留浏览器原生菜单（复制文本等）
  if (!props.canEdit) return
  e.preventDefault()
  // 表格 cell 内 → 表格专属菜单；否则段落菜单
  const td = (e.target as HTMLElement).closest('.ne-td') as HTMLElement | null
  ctx.cell = td
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.show = true
  // 高亮落点 cell；右键落在既有拖选区域内则保留整片选区（整片删行/删列）
  if (td && !td.classList.contains('selected')) {
    clearCellSelect()
    td.classList.add('selected')
  }
}

function ctxExec(action: string): void {
  ctx.show = false
  const s = sel()
  const blk = currentBlock()
  switch (action) {
    case 'cut':
    case 'copy': {
      // execCommand 同步执行且保留富文本结构；失效时退化为纯文本写入剪贴板兜底
      if (!document.execCommand(action)) {
        const text = window.getSelection()?.toString() || ''
        if (text) void navigator.clipboard.writeText(text).catch(() => {})
      }
      return
    }
    // execCommand('paste') 已被现代浏览器禁用：读剪贴板文本后以插入命令写入（纯文本粘贴）
    case 'paste': {
      void (async () => {
        try {
          const text = await navigator.clipboard.readText()
          if (!text) return
          pushUndo()
          document.execCommand('insertText', false, text)
          afterChange()
        } catch { /* 剪贴板读取被拒/环境不可用时静默 */ }
      })()
      return
    }
    case 'selectall': document.execCommand('selectAll'); return
    // 表格专属菜单：定位右键落点 cell 后复用表格行/列函数（删行/删列/删表自带 pushUndo + afterChange，插列需显式补）
    case 'row-above':
    case 'row-below':
    case 'col-left':
    case 'col-right':
    case 'del-row':
    case 'del-col':
    case 'del-table': {
      const cell = ctx.cell
      if (!cell || !cell.isConnected) return
      const table = cell.closest('.ne-table') as HTMLTableElement | null
      const tr = cell.closest('.ne-tr') as HTMLElement | null
      if (!table || !tr) return
      const ci = Array.from(tr.children).indexOf(cell)
      if (action === 'row-above') addTableRow(tr, 'before')
      else if (action === 'row-below') addTableRow(tr, 'after')
      else if (action === 'col-left') { pushUndo(); if (ci > 0) insertTableColumn(table, ci - 1); else insertTableColumn(table, 0, 'before'); afterChange() }
      else if (action === 'col-right') { pushUndo(); insertTableColumn(table, ci); afterChange() }
      else if (action === 'del-row') deleteSelectedRows(table)
      else if (action === 'del-col') deleteSelectedColumns(table)
      else deleteWholeTable(table)
      return
    }
    case 'up': if (blk && blk.previousElementSibling) { pushUndo(); blk.previousElementSibling.before(blk); afterChange() } return
    case 'down': if (blk && blk.nextElementSibling) { pushUndo(); blk.nextElementSibling.after(blk); afterChange() } return
    case 'dup': if (blk) { pushUndo(); const clone = blk.cloneNode(true) as HTMLElement; blk.after(clone); afterChange() } return
    case 'del': if (blk) { pushUndo(); blk.remove(); if (!rootEl.value?.children.length) rootEl.value?.appendChild(makeEmptyP()); placeCaret(rootEl.value!.lastElementChild as HTMLElement); afterChange() } return
  }
  if (s) s.removeAllRanges()
}

// 块手柄拖拽
let dragBlock: HTMLElement | null = null
function onDragstart(e: DragEvent): void {
  if (!handle.block) { e.preventDefault(); return }
  dragBlock = handle.block
  e.dataTransfer?.setData('text/plain', 'block-drag')
}

function onDragover(e: DragEvent): void {
  if (!dragBlock || !rootEl.value) return
  const host = rootEl.value.closest('.yu-content-scroll') as HTMLElement
  if (!host) return
  const y = e.clientY - host.getBoundingClientRect().top + host.scrollTop
  dragLine.y = y
  dragLine.show = true
}

function onDrop(e: DragEvent): void {
  dragLine.show = false
  if (!dragBlock || !rootEl.value) return
  const host = rootEl.value.closest('.yu-content-scroll') as HTMLElement
  if (!host) return
  const y = e.clientY - host.getBoundingClientRect().top + host.scrollTop
  let target: Element | null = null
  for (const c of Array.from(rootEl.value.children)) {
    if (c === dragBlock) continue
    const top = (c as HTMLElement).offsetTop
    if (y < top + (c as HTMLElement).offsetHeight / 2) { target = c; break }
  }
  pushUndo()
  target ? rootEl.value.insertBefore(dragBlock, target) : rootEl.value.appendChild(dragBlock)
  dragBlock = null
  afterChange()
}

// ---------------------------------------------------------------- DOM 内交互委托（编辑器动态生成的控件）
function onRootClick(e: MouseEvent): void {
  const t = e.target as HTMLElement
  if (t.closest('.task-box')) {
    if (!props.canEdit) return
    pushUndo()
    ;(t.closest('li') as HTMLElement).classList.toggle('checked')
    afterChange()
    return
  }
  if (t.closest('.cbb-arrow')) {
    if (!props.canEdit) return
    pushUndo()
    ;(t.closest('.collapse-block') as HTMLElement).classList.toggle('collapsed')
    afterChange()
    return
  }
  if (t.closest('.cb-collapse-btn')) { (t.closest('.codeblock') as HTMLElement).classList.toggle('cb-collapsed'); return }
  if (t.closest('.cb-copy')) {
    const pre = t.closest('.codeblock')?.querySelector('.cb-pre')
    void navigator.clipboard?.writeText(pre?.textContent || '')
    ElMessage.success('代码已复制到剪贴板')
    return
  }
  // 高亮块类型切换（语雀行为：5 类型浮条，点击即换）
  const coBtn = t.closest('.co-type-btn') as HTMLElement | null
  if (coBtn) {
    const co = coBtn.closest('.callout') as HTMLElement
    const nv = coBtn.dataset.t || ''
    if (co && nv && co.dataset.callout !== nv) {
      pushUndo()
      co.dataset.callout = nv
      co.className = `callout co-${nv}`
      const icon = co.querySelector('.co-icon')
      if (icon) icon.textContent = CALLOUT_ICONS[nv] || 'i'
      afterChange()
    }
    return
  }
  // 表格控制器（spec §7.2）
  const colAdd = t.closest('.tbl-col-add') as HTMLElement | null
  const colDel = t.closest('.tbl-col-del') as HTMLElement | null
  const rowAdd = t.closest('.tbl-row-add') as HTMLElement | null
  const rowDel = t.closest('.tbl-row-del') as HTMLElement | null
  if (colAdd || colDel) {
    if (!props.canEdit) return
    pushUndo()
    const bar = (colAdd || colDel) as HTMLElement
    const hole = bar.closest('.table-hole') as HTMLElement
    const tableEl = hole.querySelector('.ne-table') as HTMLTableElement
    const ci = Number((bar.closest('.tbl-col-bar') as HTMLElement).dataset.col)
    if (colAdd) insertTableColumn(tableEl, ci)
    else deleteTableColumn(tableEl, ci)
    afterChange()
    return
  }
  if (rowAdd || rowDel) {
    if (!props.canEdit) return
    const bar = (rowAdd || rowDel) as HTMLElement
    const hole = bar.closest('.table-hole') as HTMLElement
    const tableEl = hole.querySelector('.ne-table') as HTMLElement
    const ri = Number((bar.closest('.tbl-row-bar') as HTMLElement).dataset.row)
    const tr = tableEl.querySelectorAll('.ne-tr')[ri] as HTMLElement
    if (!tr) return
    if (rowAdd) addTableRow(tr, 'after')
    else deleteTableRow(tableEl, tr)
    return
  }
  if (t.closest('.tbl-control-point')) {
    // 全选表格 cell（视觉选中，供合并）
    const tableEl = t.closest('.table-hole')?.querySelector('.ne-table') as HTMLElement | null
    if (!tableEl) return
    clearCellSelect()
    let count = 0
    for (const td of Array.from(tableEl.querySelectorAll('.ne-td'))) { (td as HTMLElement).classList.add('selected'); count++ }
    state.canMerge = count > 1
  }
}

/** 代码块下拉变更（语言/主题） */
function onDomChange(e: Event): void {
  const t = e.target as HTMLElement
  if (t.classList.contains('cb-lang')) (t.closest('.codeblock') as HTMLElement).dataset.lang = (t as HTMLSelectElement).value
  if (t.classList.contains('cb-theme')) (t.closest('.codeblock') as HTMLElement).dataset.theme = (t as HTMLSelectElement).value
}

// ---------------------------------------------------------------- 大纲 / 字数 / selectionchange（spec §8）
function refreshOutline(): void {
  const root = rootEl.value
  if (!root) return
  const items: { level: number; text: string; el: HTMLElement }[] = []
  for (const el of Array.from(root.children) as HTMLElement[]) {
    const m = /^h([1-6])$/.test(el.dataset.ne || '') ? Number((el.dataset.ne as string).slice(1)) : 0
    if (m) items.push({ level: m, text: el.textContent || '', el })
  }
  outlineItems.value = items
}

/** 语雀口径字数：CJK 按字符、英文按单词（简化：非空白字符计数） */
function updateWordCount(): void {
  const text = rootEl.value?.textContent || ''
  wordCount.value = text.replace(/\s/g, '').length
}

function onSelectionChange(): void {
  const s = sel()
  if (s && !s.isCollapsed && rootEl.value?.contains(s.anchorNode)) selCount.value = s.toString().length
  else selCount.value = 0
  updateState()
}

function jumpTo(el: HTMLElement): void {
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ---------------------------------------------------------------- 查找替换（find-mark 高亮，spec §8）
const findTotal = ref(0)
let findHits: HTMLElement[] = []
let findIdx = 0

/** 清除全部查找标记 */
function clearFindMarks(): void {
  for (const m of Array.from(rootEl.value?.querySelectorAll('.find-mark') || [])) {
    const parent = m.parentNode
    if (!parent) continue
    parent.replaceChild(document.createTextNode(m.textContent || ''), m)
    parent.normalize()
  }
  findHits = []
  findTotal.value = 0
}

function doFind(): void {
  clearFindMarks()
  const q = findText.value.trim()
  const root = rootEl.value
  if (!q || !root) return
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  let n = walker.nextNode()
  while (n) { nodes.push(n as Text); n = walker.nextNode() }
  const ql = q.toLowerCase()
  for (const t of nodes) {
    if (!t.parentNode || !root.contains(t)) continue
    const text = t.nodeValue || ''
    let from = 0
    let idx = text.toLowerCase().indexOf(ql, from)
    while (idx >= 0) {
      const range = document.createRange()
      range.setStart(t, idx)
      range.setEnd(t, idx + q.length)
      const mark = document.createElement('span')
      mark.className = 'find-mark'
      try { range.surroundContents(mark) } catch { break }
      findHits.push(mark)
      // surround 后原节点被拆分，余下文本在后续兄弟节点中，跳出本节点继续
      idx = -1
    }
  }
  findTotal.value = findHits.length
  findIdx = 0
  highlightFind()
}

function highlightFind(): void {
  for (const h of findHits) h.classList.remove('find-current')
  if (!findHits.length) return
  const cur = findHits[findIdx % findHits.length]
  cur.classList.add('find-current')
  cur.scrollIntoView({ block: 'center' })
}

function gotoFind(): void {
  if (!findHits.length) { doFind(); return }
  findIdx = (findIdx + 1) % findHits.length
  highlightFind()
}

function doReplace(): void {
  if (!findHits.length) return
  pushUndo()
  const cur = findHits[findIdx % findHits.length]
  cur.textContent = replaceText.value
  const parent = cur.parentNode
  cur.replaceWith(document.createTextNode(cur.textContent || ''))
  parent?.normalize()
  afterChange()
  doFind()
}

function doReplaceAll(): void {
  const q = findText.value.trim()
  if (!q || !findHits.length) return
  pushUndo()
  for (const m of findHits) {
    const parent = m.parentNode
    if (!parent) continue
    const txt = document.createTextNode(m.textContent?.replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText.value) || '')
    m.replaceWith(txt)
  }
  rootEl.value?.normalize()
  afterChange()
  clearFindMarks()
  ElMessage.success(`已替换 ${findHits.length} 处`)
}

function closeFind(): void {
  clearFindMarks()
  findOpen.value = false
}

// ---------------------------------------------------------------- 快捷键面板数据（spec §8 四组）
const SHORTCUT_GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: '基础操作',
    rows: [
      ['撤销', 'Ctrl+Z'], ['重做', 'Ctrl+Y / Ctrl+Shift+Z'], ['复制', 'Ctrl+C'], ['粘贴', 'Ctrl+V'],
      ['剪切', 'Ctrl+X'], ['查找替换', 'Ctrl+Shift+F'], ['插入卡片菜单', 'Ctrl+/'], ['保存并发布', 'Ctrl+S / Ctrl+Enter']
    ]
  },
  {
    title: '段落格式',
    rows: [
      ['正文', 'Alt+Ctrl+0'], ['标题 1~6', 'Alt+Ctrl+1~6'],
      ['引用', '> + 空格'], ['无序列表', '- + 空格'], ['有序列表', '1. + 空格'], ['任务列表', '[ ] + 空格'],
      ['代码块', '``` + Enter'], ['分割线', '--- + Enter']
    ]
  },
  {
    title: '文本样式',
    rows: [
      ['加粗', 'Ctrl+B'], ['斜体', 'Ctrl+I'], ['下划线', 'Ctrl+U'], ['删除线', 'Ctrl+Shift+X'],
      ['超链接', 'Ctrl+K'], ['行内代码', '` 代码 `']
    ]
  },
  {
    title: '列表与缩进',
    rows: [
      ['增加缩进', 'Ctrl+]'], ['减少缩进', 'Ctrl+['],
      ['无序列表', 'Ctrl+Shift+L'], ['有序列表', 'Ctrl+Shift+R'], ['任务列表', 'Ctrl+Shift+C'],
      ['表格下一行', 'Tab（末格自动加行）'],
      ['合并单元格', 'Shift+Ctrl+1'], ['隐藏边框', 'Shift+Ctrl+\\']
    ]
  }
]

// ---------------------------------------------------------------- v-model 同步（lastEmitted 比对）
watch(() => props.modelValue, (v) => {
  if (v !== lastEmitted) renderDoc(v)
})

// ---------------------------------------------------------------- 生命周期
onMounted(() => {
  renderDoc(props.modelValue || '')
  document.addEventListener('selectionchange', onSelectionChange)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  dragCleanup?.()
})
</script>
<template>
  <div class="yu-editor" :class="{ readonly: !canEdit }">
    <YuqueToolbar ref="toolbarRef" :state="state" :can-edit="canEdit" @command="onCommand" />
    <div class="yu-main">
      <div class="yu-body-wrap">
        <!-- 大纲入口 + 侧栏 -->
        <div class="yu-outline-entry" data-tip="大纲" @click="showOutline = !showOutline">
          <svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 4h12M3 9h8M3 14h10" stroke="currentColor" stroke-width="1.6"/></svg>
        </div>
        <div v-if="showOutline" class="yu-outline">
          <div class="yu-outline-head">大纲<i class="yu-outline-close" @click="showOutline = false">✕</i></div>
          <div class="yu-outline-body">
            <div v-for="(o, i) in outlineItems" :key="i" class="yu-outline-item" :class="'lv' + o.level" @click="jumpTo(o.el)">{{ o.text || '无标题' }}</div>
            <div v-if="!outlineItems.length" class="yu-outline-empty">空空如也~</div>
          </div>
        </div>
        <!-- 正文 -->
        <!-- drag 事件与 mouseleave 挂在滚动容器（rootEl 的父级）：块手柄是 rootEl 的兄弟节点，
             dragstart 从手柄出发不会经过 rootEl；且离开 rootEl 移向手柄会立刻隐藏手柄导致无法抓取 -->
        <div
          class="yu-content-scroll"
          @mouseleave="handle.show = false"
          @dragstart="onDragstart"
          @dragover.prevent="onDragover"
          @drop.prevent="onDrop"
          @dragend="dragLine.show = false"
        >
          <div
            ref="rootEl"
            class="yu-editor-body"
            :contenteditable="canEdit ? 'true' : 'false'"
            :style="bodyStyle"
            spellcheck="false"
            @beforeinput="onBeforeInput"
            @input="onInput"
            @keydown="onKeydown"
            @compositionstart="setComposing(true)"
            @compositionend="setComposing(false); onInput()"
            @mousedown="onBodyMousedown"
            @mouseup="onBodyMouseup"
            @mouseover="onBodyMouseover"
            @contextmenu="onContextmenu"
            @click="onRootClick"
            @change="onDomChange"
            @paste="onPaste"
          />
          <div v-if="!wordCount && placeholder" class="yu-placeholder">{{ placeholder }}</div>
          <!-- 划词浮动栏 -->
          <div v-if="floatBar.show" class="yu-floatbar" :style="{ left: floatBar.x + 'px', top: floatBar.y + 'px' }">
            <span class="fb-ai">AI标注</span><i class="fb-sep" /><span class="fb-cm">划词评论</span>
          </div>
          <!-- 块手柄 -->
          <div
            v-if="handle.show && canEdit"
            class="yu-block-handle"
            :style="{ top: handle.y + 'px' }"
            draggable="true"
            title="按住拖拽调整块位置"
            @mousedown.stop.prevent="handle.show = true"
          >⣿</div>
          <div v-if="dragLine.show" class="yu-drag-line" :style="{ top: dragLine.y + 'px' }" />
          <!-- 右键菜单：表格 cell 内为表格专属菜单，其余为段落菜单 -->
          <div v-if="ctx.show" class="yu-ctxmenu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
            <template v-if="ctx.cell">
              <div class="ctx-row" @click="ctxExec('row-above')">向上插入 1 行</div>
              <div class="ctx-row" @click="ctxExec('row-below')">向下插入 1 行</div>
              <div class="ctx-row" @click="ctxExec('col-left')">向左插入 1 列</div>
              <div class="ctx-row" @click="ctxExec('col-right')">向右插入 1 列</div>
              <i class="ctx-sep" />
              <div class="ctx-row" @click="ctxExec('del-row')">删除所选行</div>
              <div class="ctx-row" @click="ctxExec('del-col')">删除所选列</div>
              <div class="ctx-row danger" @click="ctxExec('del-table')">删除表格</div>
            </template>
            <template v-else>
              <div class="ctx-row" @click="ctxExec('cut')">剪切</div>
              <div class="ctx-row" @click="ctxExec('copy')">复制</div>
              <div class="ctx-row" @click="ctxExec('paste')">粘贴</div>
              <div class="ctx-row" @click="ctxExec('selectall')">全选</div>
              <i class="ctx-sep" />
              <div class="ctx-row" @click="ctxExec('up')">段落上移</div>
              <div class="ctx-row" @click="ctxExec('down')">段落下移</div>
              <div class="ctx-row" @click="ctxExec('dup')">复制段落</div>
              <div class="ctx-row danger" @click="ctxExec('del')">删除段落</div>
            </template>
          </div>
        </div>
        <!-- 查找替换浮层 -->
        <div v-if="findOpen" class="yu-find">
          <input v-model="findText" placeholder="查找内容" @input="doFind()" @keydown.enter="gotoFind()" />
          <input v-model="replaceText" placeholder="替换为" />
          <span class="find-count">{{ findTotal }} 处</span>
          <button type="button" @click="doReplace()">替换</button>
          <button type="button" @click="doReplaceAll()">全部替换</button>
          <button type="button" class="find-close" @click="closeFind()">✕</button>
        </div>
      </div>
      <!-- 状态栏：字数 + 快捷键入口 -->
      <div class="yu-status">
        <span :class="{ 'yu-status-over': overLimit }">{{ selCount ? `${selCount}/${wordCount} 字` : maxlength ? `${wordCount}/${maxlength} 字` : `${wordCount} 字` }}</span>
        <span class="yu-status-link" @click="shortcutOpen = true">快捷键</span>
      </div>
    </div>
    <!-- 快捷键面板（无遮罩抽屉） -->
    <div v-if="shortcutOpen" class="yu-shortcuts">
      <div class="sc-head">编辑器快捷键<i class="sc-close" @click="shortcutOpen = false">✕</i></div>
      <div class="sc-group" v-for="g in SHORTCUT_GROUPS" :key="g.title">
        <div class="sc-title">{{ g.title }}</div>
        <div class="sc-row" v-for="r in g.rows" :key="r[1]"><span>{{ r[0] }}</span><span class="sc-kbd">{{ r[1] }}</span></div>
      </div>
    </div>
  </div>
</template>
<style scoped>
/* ================= 三段式布局（spec §1） ================= */
.yu-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #fff;
  color: #1f2329;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
.yu-main {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.yu-body-wrap {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.yu-content-scroll {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.yu-editor-body {
  width: 712px;
  margin: 0 auto;
  padding: 28px 0 240px;
  font-size: 15px;
  line-height: 1.7;
  outline: none;
  word-break: break-word;
  caret-color: #338bff;
}
.yu-editor-body :deep(p) { margin: 10px 0; }
.yu-editor-body :deep(h1) { font-size: 28px; font-weight: 600; margin: 28px 0 16px; }
.yu-editor-body :deep(h2) { font-size: 22px; font-weight: 600; margin: 24px 0 14px; }
.yu-editor-body :deep(h3) { font-size: 19px; font-weight: 600; margin: 20px 0 12px; }
.yu-editor-body :deep(h4) { font-size: 17px; font-weight: 600; margin: 18px 0 10px; }
.yu-editor-body :deep(h5) { font-size: 16px; font-weight: 600; margin: 16px 0 8px; }
.yu-editor-body :deep(h6) { font-size: 15px; font-weight: 600; color: #646a73; margin: 14px 0 8px; }
.yu-editor-body :deep(blockquote) {
  margin: 12px 0;
  padding: 4px 12px;
  border-left: 3px solid #dfe1e6;
  color: #646a73;
}
.yu-editor-body :deep(code) {
  background: rgba(51,139,255,.09);
  color: #338bff;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 13px;
}
.yu-editor-body :deep(a) { color: #117cee; text-decoration: none; }
.yu-editor-body :deep(a:hover) { text-decoration: underline; }
.yu-editor-body :deep(img) { max-width: 100%; border-radius: 4px; }
.yu-editor-body :deep(ul), .yu-editor-body :deep(ol) { padding-left: 24px; margin: 8px 0; }
.yu-editor-body :deep(ol) { list-style: none; }
.yu-editor-body :deep(ol[data-oltype='0']) { counter-reset: ol0; }
.yu-editor-body :deep(ol[data-oltype='1']) { counter-reset: ol1; }
.yu-editor-body :deep(ol[data-oltype='2']) { counter-reset: ol2; }
.yu-editor-body :deep(ol li) { position: relative; }
.yu-editor-body :deep(ol[data-oltype='0'] > li)::before {
  counter-increment: ol0;
  content: counter(ol0) '. ';
  position: absolute;
  left: -24px;
  color: #1f2329;
}
.yu-editor-body :deep(ol[data-oltype='1'] > li)::before {
  counter-increment: ol1;
  content: '(' counter(ol1) ') ';
  position: absolute;
  left: -30px;
}
.yu-editor-body :deep(ol[data-oltype='2'] > li)::before {
  counter-increment: ol2;
  content: counter(ol2, lower-alpha) '. ';
  position: absolute;
  left: -26px;
}

/* ================= 大纲侧栏（305×400，spec §8） ================= */
.yu-outline-entry {
  position: absolute;
  right: 18px;
  top: 14px;
  z-index: 20;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #646a73;
  cursor: pointer;
}
.yu-outline-entry:hover { background: #f2f3f5; }
.yu-outline {
  position: absolute;
  right: 10px;
  top: 52px;
  z-index: 19;
  width: 305px;
  height: 400px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(31,35,41,.1);
  display: flex;
  flex-direction: column;
}
.yu-outline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #f2f3f5;
}
.yu-outline-close { cursor: pointer; font-style: normal; color: #8f959e; font-size: 12px; }
.yu-outline-body { flex: 1; overflow-y: auto; padding: 6px 4px; }
.yu-outline-item {
  padding: 5px 10px;
  font-size: 13px;
  color: #1f2329;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: 4px;
}
.yu-outline-item:hover { background: #f7f8fa; }
.yu-outline-item.lv1 { padding-left: 10px; font-weight: 600; }
.yu-outline-item.lv2 { padding-left: 26px; }
.yu-outline-item.lv3 { padding-left: 42px; }
.yu-outline-item.lv4 { padding-left: 58px; }
.yu-outline-item.lv5 { padding-left: 74px; }
.yu-outline-item.lv6 { padding-left: 90px; }
.yu-outline-empty { padding: 24px; text-align: center; color: #8f959e; font-size: 13px; }

/* ================= 划词浮动栏（70×34）/ 块手柄 / 拖拽线（spec §5） ================= */
.yu-floatbar {
  position: absolute;
  z-index: 30;
  height: 34px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  box-shadow: 0 4px 10px rgba(31,35,41,.12);
  font-size: 12px;
  color: #1f2329;
  white-space: nowrap;
  transform: translate(-100%, -100%);
  margin-top: -6px;
}
.yu-floatbar span { cursor: pointer; }
.yu-floatbar .fb-ai { color: #646a73; }
.yu-floatbar .fb-ai:hover { color: #338bff; }
.yu-floatbar .fb-cm:hover { color: #338bff; }
.fb-sep { width: 1px; height: 14px; background: #e5e6eb; }
.yu-block-handle {
  position: absolute;
  left: 0;
  transform: translate(-100%, 0);
  z-index: 15;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bbbfc4;
  cursor: grab;
  font-size: 14px;
  border-radius: 4px;
}
.yu-block-handle:hover { background: #f2f3f5; color: #646a73; }
.yu-drag-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: #338bff;
  border-radius: 1px;
  z-index: 25;
  pointer-events: none;
}
.yu-drag-line::before {
  content: '';
  position: absolute;
  left: -4px;
  top: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #338bff;
}

/* ================= 右键菜单 / 查找替换 / 状态栏（spec §5/§8） ================= */
.yu-ctxmenu {
  position: fixed;
  z-index: 300;
  min-width: 132px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-shadow: 0 6px 16px rgba(31,35,41,.14);
  padding: 4px;
}
.ctx-row {
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
}
.ctx-row:hover { background: #f2f3f5; }
.ctx-row.danger { color: #d83931; }
.ctx-sep { display: block; height: 1px; background: #f2f3f5; margin: 4px 6px; }
.yu-find {
  position: absolute;
  right: 16px;
  top: 12px;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(31,35,41,.12);
  padding: 8px 10px;
}
.yu-find input {
  width: 140px;
  height: 28px;
  border: 1px solid #dfe1e6;
  border-radius: 4px;
  padding: 0 8px;
  font-size: 12px;
  outline: none;
}
.yu-find input:focus { border-color: #338bff; }
.find-count { font-size: 12px; color: #8f959e; white-space: nowrap; }
.yu-find button {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  border: none;
  background: #f2f3f5;
  border-radius: 4px;
  cursor: pointer;
}
.yu-find button:hover { background: #e5e6eb; }
.yu-find .find-close { width: 28px; padding: 0; }
.yu-status-over { color: #f54a45; }
.yu-status {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
  padding: 0 16px;
  font-size: 12px;
  color: #8f959e;
  border-top: 1px solid #f2f3f5;
  background: #fff;
}
.yu-status-link { cursor: pointer; }
.yu-status-link:hover { color: #338bff; }

/* ================= 快捷键面板（484 宽抽屉，spec §8） ================= */
.yu-shortcuts {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 484px;
  background: #fff;
  box-shadow: -4px 0 16px rgba(31,35,41,.12);
  z-index: 500;
  padding: 20px 24px;
  overflow-y: auto;
}
.sc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}
.sc-close { cursor: pointer; font-style: normal; color: #8f959e; }
.sc-group { margin-bottom: 18px; }
.sc-title { font-size: 13px; font-weight: 600; color: #646a73; margin-bottom: 8px; }
.sc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
  border-bottom: 1px dashed #f2f3f5;
}
.sc-kbd {
  background: #f2f3f5;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
  font-family: inherit;
  color: #1f2329;
}

/* ================= 空文档占位 / 只读态（spec §8） ================= */
.yu-placeholder {
  position: absolute;
  top: 38px;
  left: 50%;
  transform: translateX(-50%);
  width: 712px;
  font-size: 15px;
  line-height: 1.7;
  color: #b8b9bf;
  pointer-events: none;
  user-select: none;
}
.yu-editor.readonly .yu-outline-entry { display: none; }

/* ================= 查找高亮（spec §8） ================= */
.yu-editor-body :deep(.find-mark) { background: #fff3d4; border-radius: 2px; }
.yu-editor-body :deep(.find-mark.find-current) { background: #ffcf8b; }

/* ================= 高亮块 callout（spec §6，五色） ================= */
.yu-editor-body :deep(.callout) {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 4px;
  padding: 12px 14px;
  margin: 10px 0;
  position: relative;
}
/* 类型切换浮条（语雀：hover / 聚焦块内时显示） */
.yu-editor-body :deep(.co-types) {
  position: absolute;
  top: -30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  padding: 3px;
  background: #fff;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(31, 35, 41, .15);
  opacity: 0;
  pointer-events: none;
  transition: opacity .12s;
  z-index: 5;
}
.yu-editor-body :deep(.callout:hover .co-types),
.yu-editor-body :deep(.callout:focus-within .co-types) { opacity: 1; pointer-events: auto; }
.yu-editor-body :deep(.co-type-btn) {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 3px;
  background: transparent;
  font-size: 12px;
  line-height: 22px;
  text-align: center;
  cursor: pointer;
  color: #646a73;
}
.yu-editor-body :deep(.co-type-btn:hover) { background: #eff0f1; color: #1f2329; }
.yu-editor-body :deep(.callout[data-callout="info"] .co-type-btn[data-t="info"]),
.yu-editor-body :deep(.callout[data-callout="success"] .co-type-btn[data-t="success"]),
.yu-editor-body :deep(.callout[data-callout="warning"] .co-type-btn[data-t="warning"]),
.yu-editor-body :deep(.callout[data-callout="danger"] .co-type-btn[data-t="danger"]),
.yu-editor-body :deep(.callout[data-callout="tips"] .co-type-btn[data-t="tips"]) { background: #e8e9eb; color: #1f2329; }
.yu-editor-body :deep(.callout .co-icon) {
  flex: none;
  width: 20px;
  height: 20px;
  margin-top: 3px;
  border-radius: 50%;
  font-size: 12px;
  font-style: normal;
  line-height: 20px;
  text-align: center;
  color: #fff;
}
.yu-editor-body :deep(.callout .co-body) { flex: 1; min-width: 0; outline: none; }
.yu-editor-body :deep(.callout .co-body p) { margin: 4px 0; }
.yu-editor-body :deep(.co-info) { background: #e8f3ff; }
.yu-editor-body :deep(.co-info .co-icon) { background: #338bff; }
.yu-editor-body :deep(.co-success) { background: #e8f7ee; }
.yu-editor-body :deep(.co-success .co-icon) { background: #00b365; }
.yu-editor-body :deep(.co-warning) { background: #fff3e5; }
.yu-editor-body :deep(.co-warning .co-icon) { background: #ff9214; }
.yu-editor-body :deep(.co-danger) { background: #ffeceb; }
.yu-editor-body :deep(.co-danger .co-icon) { background: #f54a45; }
.yu-editor-body :deep(.co-tips) { background: #fdfbe8; }
.yu-editor-body :deep(.co-tips .co-icon) { background: #d09c17; }

/* ================= 折叠块（spec §6） ================= */
.yu-editor-body :deep(.collapse-block) { margin: 10px 0; border-radius: 4px; background: #f7f8fa; }
.yu-editor-body :deep(.cbb-summary) { display: flex; align-items: center; gap: 8px; padding: 8px 12px; cursor: pointer; }
.yu-editor-body :deep(.cbb-arrow) { flex: none; font-size: 12px; color: #646a73; transition: transform .15s; }
.yu-editor-body :deep(.collapse-block.collapsed .cbb-arrow) { transform: rotate(-90deg); }
.yu-editor-body :deep(.cbb-title) { flex: 1; font-size: 14px; font-weight: 500; outline: none; }
.yu-editor-body :deep(.cbb-body) { padding: 4px 12px 12px; outline: none; }
.yu-editor-body :deep(.collapse-block.collapsed .cbb-body) { display: none; }

/* ================= 任务列表（spec §3.2） ================= */
.yu-editor-body :deep(li.task) { list-style: none; display: flex; align-items: flex-start; }
.yu-editor-body :deep(li.task)::marker { content: none; }
.yu-editor-body :deep(.task-box) {
  flex: none;
  width: 14px;
  height: 14px;
  margin: 5px 8px 0 0;
  border: 1px solid #bbbfc4;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  position: relative;
}
.yu-editor-body :deep(li.task.checked .task-box) { background: #338bff; border-color: #338bff; }
.yu-editor-body :deep(li.task.checked .task-box)::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 1.5px 1.5px 0;
  transform: rotate(45deg);
}
.yu-editor-body :deep(li.task.checked) { color: #8f959e; }

/* ================= 分割线（spec §6） ================= */
.yu-editor-body :deep(.ne-hr-wrap) { margin: 16px 0; padding: 8px 0; cursor: default; }
.yu-editor-body :deep(.ne-hr-wrap hr) { border: none; border-top: 1px solid #e5e6eb; margin: 0; }

/* ================= 代码块（spec §6.2：菜单条 + 等宽正文） ================= */
.yu-editor-body :deep(.codeblock) {
  margin: 10px 0;
  border: 1px solid #e5e6eb;
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}
.yu-editor-body :deep(.codeblock-menu) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 40px;
  padding: 0 10px;
  border-bottom: 1px solid #f2f3f5;
  background: #fafbfc;
}
.yu-editor-body :deep(.cb-start) { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
.yu-editor-body :deep(.cb-end) { display: flex; align-items: center; gap: 6px; flex: none; }
.yu-editor-body :deep(.cb-collapse-btn) {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #646a73;
  font-size: 12px;
  cursor: pointer;
}
.yu-editor-body :deep(.cb-collapse-btn)::before { content: '▾'; }
.yu-editor-body :deep(.codeblock.cb-collapsed .cb-pre) { display: none; }
.yu-editor-body :deep(.cb-name) {
  flex: 1;
  min-width: 0;
  height: 26px;
  border: none;
  background: transparent;
  font-size: 13px;
  color: #1f2329;
  outline: none;
}
.yu-editor-body :deep(.cb-name::placeholder) { color: #bbbfc4; }
.yu-editor-body :deep(.cb-lang), .yu-editor-body :deep(.cb-theme) {
  height: 26px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: #646a73;
  outline: none;
  cursor: pointer;
}
.yu-editor-body :deep(.cb-nav-divider) { width: 1px; height: 14px; background: #e5e6eb; }
.yu-editor-body :deep(.cb-copy), .yu-editor-body :deep(.cb-more) {
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  font-size: 12px;
  color: #646a73;
  cursor: pointer;
}
.yu-editor-body :deep(.cb-copy:hover), .yu-editor-body :deep(.cb-more:hover) { background: #f2f3f5; }
.yu-editor-body :deep(.cb-pre) {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  background: #fafbfc;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 13px;
  line-height: 1.6;
  outline: none;
}
.yu-editor-body :deep(.cb-pre code) {
  font-family: inherit;
  background: none;
  padding: 0;
  border-radius: 0;
  color: #1f2329;
}

/* ================= 表格（spec §7：列/行控制器、全选点、单元格选区） ================= */
.yu-editor-body :deep(.table-hole) { position: relative; margin: 10px 0; }
.yu-editor-body :deep(.tbl-col-controller) {
  position: absolute;
  top: -24px;
  left: 24px;
  width: 750px;
  height: 20px;
  display: flex;
  opacity: 0;
  transition: opacity .15s;
}
.yu-editor-body :deep(.tbl-cc-inner) { display: flex; width: 100%; }
.yu-editor-body :deep(.tbl-col-bar) { flex: 1; position: relative; height: 20px; cursor: grab; }
.yu-editor-body :deep(.tbl-col-bar::before) {
  content: '';
  position: absolute;
  left: 4px;
  right: 4px;
  top: 9px;
  height: 2px;
  border-radius: 1px;
  background: transparent;
}
.yu-editor-body :deep(.tbl-col-bar:hover::before) { background: #338bff; }
.yu-editor-body :deep(.tbl-col-add), .yu-editor-body :deep(.tbl-col-del),
.yu-editor-body :deep(.tbl-row-add), .yu-editor-body :deep(.tbl-row-del) {
  position: absolute;
  width: 16px;
  height: 16px;
  visibility: hidden;
  border: none;
  border-radius: 4px;
  background: #fff;
  color: #646a73;
  font-size: 12px;
  line-height: 14px;
  text-align: center;
  cursor: pointer;
  opacity: 0;
  box-shadow: 0 1px 4px rgba(31,35,41,.16);
}
.yu-editor-body :deep(.tbl-col-add)::before { content: '+'; }
.yu-editor-body :deep(.tbl-col-del)::before { content: '−'; }
.yu-editor-body :deep(.tbl-row-add)::before { content: '+'; }
.yu-editor-body :deep(.tbl-row-del)::before { content: '−'; }
.yu-editor-body :deep(.tbl-col-add) { right: 24px; top: 2px; }
.yu-editor-body :deep(.tbl-col-del) { right: 4px; top: 2px; }
.yu-editor-body :deep(.tbl-col-bar:hover .tbl-col-add), .yu-editor-body :deep(.tbl-col-bar:hover .tbl-col-del) { opacity: 1; visibility: visible; }
.yu-editor-body :deep(.tbl-col-add:hover), .yu-editor-body :deep(.tbl-col-del:hover),
.yu-editor-body :deep(.tbl-row-add:hover), .yu-editor-body :deep(.tbl-row-del:hover) { color: #338bff; }
.yu-editor-body :deep(.tbl-flex) { display: flex; }
.yu-editor-body :deep(.tbl-row-controller) { position: relative; width: 24px; flex: none; opacity: 0; transition: opacity .15s; }
.yu-editor-body :deep(.table-hole:hover .tbl-col-controller), .yu-editor-body :deep(.table-hole:hover .tbl-row-controller) { opacity: 1; }
.yu-editor-body :deep(.tbl-rc-inner) { height: 100%; }
.yu-editor-body :deep(.tbl-row-bar) { position: relative; height: 40px; cursor: grab; }
.yu-editor-body :deep(.tbl-row-bar::before) {
  content: '';
  position: absolute;
  left: 8px;
  top: 19px;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: transparent;
}
.yu-editor-body :deep(.tbl-row-bar:hover::before) { background: #338bff; }
.yu-editor-body :deep(.tbl-row-add) { left: 2px; top: 2px; }
.yu-editor-body :deep(.tbl-row-del) { left: 2px; top: 20px; }
.yu-editor-body :deep(.tbl-row-bar:hover .tbl-row-add), .yu-editor-body :deep(.tbl-row-bar:hover .tbl-row-del) { opacity: 1; visibility: visible; }
.yu-editor-body :deep(.table-wrap) { flex: 1; min-width: 0; overflow-x: auto; }
.yu-editor-body :deep(.ne-table) { border-collapse: collapse; table-layout: fixed; }
.yu-editor-body :deep(.ne-td) { border: 1px solid #e5e6eb; padding: 0; vertical-align: top; }
.yu-editor-body :deep(.ne-td-content) { padding: 8px 10px; outline: none; font-size: 14px; min-height: 20px; }
.yu-editor-body :deep(.ne-td-content p) { margin: 2px 0; }
.yu-editor-body :deep(.ne-td.selected) { background: rgba(51,139,255,.12); }
.yu-editor-body :deep(.ne-td-break) { display: none; }
.yu-editor-body :deep(.tbl-control-point) {
  position: absolute;
  right: -18px;
  bottom: -18px;
  width: 14px;
  height: 14px;
  border-radius: 4px;
  background: #646a73;
  cursor: pointer;
}
.yu-editor-body :deep(.table-hole.borderless .ne-td) { border-color: transparent; }

/* ================= 行内卡片：提及/状态/附件/公式 ================= */
.yu-editor-body :deep(.ne-mention) { background: #e8f3ff; color: #338bff; border-radius: 3px; padding: 0 4px; margin: 0 1px; }
.yu-editor-body :deep(.ne-status), .yu-editor-body :deep(.status-pill) {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 12px;
  background: #e8f7ee;
  color: #00b365;
  margin: 0 1px;
}
.yu-editor-body :deep(.ne-file-card) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #f7f8fa;
  border: 1px solid #e5e6eb;
  border-radius: 4px;
  font-size: 13px;
  margin: 0 1px;
}
.yu-editor-body :deep(.formula) { font-style: italic; background: #f7f8fa; border-radius: 3px; padding: 0 4px; margin: 0 1px; }
</style>
