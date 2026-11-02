<script setup lang="ts">
/**
 * Tiptap 文档编辑器（语雀式所见即所得，v-model 契约 = HTML 字符串）：
 * - 中文工具栏：撤销/重做、正文/H1~H4、B/I/S/U、高亮、字色、对齐、任务列表、引用、
 *   分割线、链接、行内代码、代码块、表格(3×3)、图片(本地 base64)、清除格式
 * - 表格：右键语雀式菜单（上/下插行、左/右插列、删行/删列/删表格）+ 列宽拖拽（prosemirror-tables 内置）
 * - 内容兼容：外部传入旧 Markdown 纯文本时经 contentToHtml 转为 HTML 再进编辑器
 */
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Image from '@tiptap/extension-image'
import Underline from '@tiptap/extension-underline'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import { ElMessage, ElMessageBox } from 'element-plus'
import { contentToHtml } from '@/utils/docContent'
import { INLINE_IMAGE_MAX_MB } from '@/api/files'

const props = withDefaults(defineProps<{
  modelValue: string
  canEdit?: boolean
  placeholder?: string
  minHeight?: number
}>(), { canEdit: true, placeholder: '开始编写…', minHeight: 0 })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

// ---------------------------------------------------------------- 工具栏状态
const btn = reactive({
  bold: false, italic: false, strike: false, underline: false, highlight: false,
  code: false, codeBlock: false, quote: false, ul: false, ol: false, task: false,
  align: 'left' as 'left' | 'center' | 'right', heading: 0, canUndo: false, canRedo: false
})
const fontColor = ref('')

function syncState(): void {
  const ed = editor.value
  if (!ed) return
  btn.bold = ed.isActive('bold')
  btn.italic = ed.isActive('italic')
  btn.strike = ed.isActive('strike')
  btn.underline = ed.isActive('underline')
  btn.highlight = ed.isActive('highlight')
  btn.code = ed.isActive('code')
  btn.codeBlock = ed.isActive('codeBlock')
  btn.quote = ed.isActive('blockquote')
  btn.ul = ed.isActive('bulletList')
  btn.ol = ed.isActive('orderedList')
  btn.task = ed.isActive('taskList')
  btn.align = (['left', 'center', 'right'].find((a) => ed.isActive({ textAlign: a })) || 'left') as typeof btn.align
  btn.heading = [1, 2, 3, 4].find((l) => ed.isActive('heading', { level: l })) || 0
  btn.canUndo = ed.can().undo()
  btn.canRedo = ed.can().redo()
}

// v2 的 useEditor 直接接收 options 对象（不支持 v3 的回调写法，传函数会被展开成空 options → schema 缺 doc）
const editor = useEditor({
  content: contentToHtml(props.modelValue),
  editable: props.canEdit,
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
    Underline, Highlight, TextStyle, Color,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList, TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    Image.configure({ inline: false }),
    Placeholder.configure({ placeholder: props.placeholder }),
    Table.configure({ resizable: true }),
    TableRow, TableHeader, TableCell
  ],
  onUpdate: ({ editor: ed }) => {
    lastEmitted = ed.getHTML()
    emit('update:modelValue', lastEmitted)
  },
  onTransaction: syncState
})

let lastEmitted: string | null = null

/** 外部回写守卫：仅当与最近一次 emit 值不同才 setContent，避免光标跳动 */
watch(() => props.modelValue, (v) => {
  const ed = editor.value
  if (!ed || v === lastEmitted) return
  lastEmitted = v
  ed.commands.setContent(contentToHtml(v), false)
})

watch(() => props.canEdit, (v) => editor.value?.setEditable(v))

onBeforeUnmount(() => editor.value?.destroy())

// ---------------------------------------------------------------- 工具栏命令
function headingLabel(): string {
  return btn.heading ? `标题${btn.heading}` : '正文'
}

function setHeading(level: number | 0): void {
  editor.value?.chain().focus().run()
  const chain = editor.value?.chain().focus()
  if (!chain) return
  if (level === 0) chain.setParagraph().run()
  else chain.toggleHeading({ level: level as 1 | 2 | 3 | 4 }).run()
}

function setAlign(align: 'left' | 'center' | 'right'): void {
  editor.value?.chain().focus().setTextAlign(align).run()
}

function setColor(c: string | null): void {
  const chain = editor.value?.chain().focus()
  if (!chain) return
  if (c) chain.setColor(c).run()
  else chain.unsetColor().run()
}

function insertHr(): void {
  editor.value?.chain().focus().setHorizontalRule().run()
}

async function addLink(): Promise<void> {
  const ed = editor.value
  if (!ed) return
  if (ed.state.selection.empty && !ed.isActive('link')) {
    ElMessage.warning('请先选中要加链接的文字')
    return
  }
  try {
    const { value } = await ElMessageBox.prompt('输入链接地址（https://…）', '添加链接', { inputValue: ed.getAttributes('link').href || 'https://' })
    if (!value) return
    ed.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
  } catch { /* 取消 */ }
}

function removeLink(): void {
  editor.value?.chain().focus().extendMarkRange('link').unsetLink().run()
}

function clearFormat(): void {
  editor.value?.chain().focus().clearNodes().unsetAllMarks().run()
}

// ---------------------------------------------------------------- 表格右键菜单（语雀式）
const ctx = reactive({ show: false, x: 0, y: 0 })
const rootEl = ref<HTMLDivElement | null>(null)

function onCtxMenu(e: MouseEvent): void {
  if (!props.canEdit || !editor.value) return
  const target = e.target as HTMLElement
  if (!target.closest('td, th')) return
  e.preventDefault()
  const rect = rootEl.value?.getBoundingClientRect()
  ctx.x = e.clientX - (rect?.left || 0)
  ctx.y = e.clientY - (rect?.top || 0)
  ctx.show = true
}

function runCtx(fn: () => void): void {
  fn()
  ctx.show = false
}

function onWindowMousedown(e: MouseEvent): void {
  if (ctx.show && !(e.target as HTMLElement).closest('.tdoc-ctxmenu')) ctx.show = false
}
window.addEventListener('mousedown', onWindowMousedown)
onBeforeUnmount(() => window.removeEventListener('mousedown', onWindowMousedown))

// ---------------------------------------------------------------- 图片上传（本地 base64，后续可换 OSS 接口）
const imgInput = ref<HTMLInputElement | null>(null)

function pickImage(): void {
  imgInput.value?.click()
}

async function onImgChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (file.size > INLINE_IMAGE_MAX_MB * 1024 * 1024) {
    ElMessage.warning(`图片不能超过 ${INLINE_IMAGE_MAX_MB}MB（内嵌图片转 base64 存储，过大易撑爆本地空间）`)
    return
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  editor.value?.chain().focus().setImage({ src: dataUrl, alt: file.name }).run()
}
</script>

<template>
  <div ref="rootEl" class="tdoc" :class="{ readonly: !canEdit }">
    <!-- 工具栏 -->
    <div v-if="canEdit" class="tdoc-toolbar">
      <button class="tb" title="撤销" :disabled="!btn.canUndo" @click="editor?.chain().focus().undo().run()">↶</button>
      <button class="tb" title="重做" :disabled="!btn.canRedo" @click="editor?.chain().focus().redo().run()">↷</button>
      <span class="tb-sep" />
      <el-dropdown trigger="click" @command="setHeading">
        <button class="tb tb-wide">{{ headingLabel() }} <span class="tb-caret">▾</span></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item :command="0" :class="{ on: !btn.heading }">正文</el-dropdown-item>
            <el-dropdown-item v-for="l in 4" :key="l" :command="l" :class="{ on: btn.heading === l }">标题{{ l }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <span class="tb-sep" />
      <button class="tb tb-b" :class="{ on: btn.bold }" title="加粗" @click="editor?.chain().focus().toggleBold().run()">B</button>
      <button class="tb tb-i" :class="{ on: btn.italic }" title="斜体" @click="editor?.chain().focus().toggleItalic().run()">I</button>
      <button class="tb tb-s" :class="{ on: btn.strike }" title="删除线" @click="editor?.chain().focus().toggleStrike().run()">S</button>
      <button class="tb tb-u" :class="{ on: btn.underline }" title="下划线" @click="editor?.chain().focus().toggleUnderline().run()">U</button>
      <button class="tb tb-mark" :class="{ on: btn.highlight }" title="高亮" @click="editor?.chain().focus().toggleHighlight().run()">A</button>
      <el-color-picker
        v-model="fontColor" size="small" :predefine="['#303133', '#e6a23c', '#f56c6c', '#67c23a', '#409eff', '#9c27b0']"
        title="文字颜色" @change="setColor"
      />
      <span class="tb-sep" />
      <el-dropdown trigger="click" @command="setAlign">
        <button class="tb tb-wide">{{ btn.align === 'center' ? '居中' : btn.align === 'right' ? '右对齐' : '左对齐' }} <span class="tb-caret">▾</span></button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="left" :class="{ on: btn.align === 'left' }">左对齐</el-dropdown-item>
            <el-dropdown-item command="center" :class="{ on: btn.align === 'center' }">居中</el-dropdown-item>
            <el-dropdown-item command="right" :class="{ on: btn.align === 'right' }">右对齐</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button class="tb" :class="{ on: btn.ul }" title="无序列表" @click="editor?.chain().focus().toggleBulletList().run()">•≡</button>
      <button class="tb" :class="{ on: btn.ol }" title="有序列表" @click="editor?.chain().focus().toggleOrderedList().run()">1≡</button>
      <button class="tb" :class="{ on: btn.task }" title="任务列表" @click="editor?.chain().focus().toggleTaskList().run()">☑</button>
      <span class="tb-sep" />
      <button class="tb" :class="{ on: btn.quote }" title="引用" @click="editor?.chain().focus().toggleBlockquote().run()">❝</button>
      <button class="tb" title="分割线" @click="insertHr">—</button>
      <button class="tb" :class="{ on: btn.code }" title="行内代码" @click="editor?.chain().focus().toggleCode().run()">&lt;&gt;</button>
      <button class="tb" :class="{ on: btn.codeBlock }" title="代码块" @click="editor?.chain().focus().toggleCodeBlock().run()">⌨</button>
      <span class="tb-sep" />
      <button class="tb tb-wide" title="添加链接" @click="addLink">链接</button>
      <button v-if="editor?.isActive('link')" class="tb" title="移除链接" @click="removeLink">✕链</button>
      <button class="tb tb-wide" title="插入表格（3×3）" @click="editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">表格</button>
      <button class="tb tb-wide" title="插入图片" @click="pickImage">图片</button>
      <button class="tb tb-wide" title="清除格式" @click="clearFormat">清除</button>
      <input ref="imgInput" type="file" accept=".jpg,.jpeg,.png,.gif,.webp,.svg" style="display:none" @change="onImgChange">
    </div>

    <!-- 正文 -->
    <editor-content
      :editor="editor" class="tdoc-body"
      :style="minHeight ? { minHeight: minHeight + 'px' } : undefined"
      @contextmenu="onCtxMenu"
    />

    <!-- 表格右键菜单（语雀式） -->
    <div v-if="ctx.show" class="tdoc-ctxmenu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }" @mousedown.stop>
      <button class="ctx-item" @click="runCtx(() => editor?.chain().focus().addRowBefore().run())">上方插入行</button>
      <button class="ctx-item" @click="runCtx(() => editor?.chain().focus().addRowAfter().run())">下方插入行</button>
      <button class="ctx-item" @click="runCtx(() => editor?.chain().focus().addColumnBefore().run())">左侧插入列</button>
      <button class="ctx-item" @click="runCtx(() => editor?.chain().focus().addColumnAfter().run())">右侧插入列</button>
      <div class="ctx-sep" />
      <button class="ctx-item" @click="runCtx(() => editor?.chain().focus().deleteRow().run())">删除本行</button>
      <button class="ctx-item" @click="runCtx(() => editor?.chain().focus().deleteColumn().run())">删除本列</button>
      <div class="ctx-sep" />
      <button class="ctx-item danger" @click="runCtx(() => editor?.chain().focus().deleteTable().run())">删除表格</button>
    </div>
  </div>
</template>

<style scoped>
.tdoc { position: relative; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-bg-color); }
.tdoc.readonly { border: none; }

/* ---------------- 工具栏 ---------------- */
.tdoc-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--el-border-color-extra-light); }
.tb { min-width: 28px; height: 28px; padding: 0 6px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--el-text-color-regular); line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
.tb:hover { background: var(--el-fill-color); }
.tb.on { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.tb:disabled { opacity: 0.35; cursor: default; }
.tb-wide { min-width: 0; }
.tb-caret { font-size: 10px; color: var(--el-text-color-secondary); margin-left: 2px; }
.tb-sep { width: 1px; height: 16px; background: var(--el-border-color-extra-light); margin: 0 6px; }
.tb-b { font-weight: 700; }
.tb-i { font-style: italic; font-family: Georgia, serif; }
.tb-s { text-decoration: line-through; }
.tb-u { text-decoration: underline; }
.tb-mark { background: linear-gradient(transparent 55%, #fde68a 55%); font-weight: 600; }
.tb-mark.on { background: var(--el-color-primary-light-9); }
.tdoc-toolbar :deep(.el-color-picker--small .el-color-picker__trigger) { width: 24px; height: 24px; border: none; background: transparent; }

/* ---------------- 正文排版 ---------------- */
.tdoc-body :deep(.tiptap) { outline: none; padding: 14px 18px; min-height: 120px; font-size: 14px; line-height: 1.75; color: var(--el-text-color-primary); word-break: break-word; }
.tdoc-body :deep(.tiptap p) { margin: 8px 0; }
.tdoc-body :deep(.tiptap h1) { font-size: 22px; margin: 18px 0 12px; font-weight: 600; }
.tdoc-body :deep(.tiptap h2) { font-size: 18px; margin: 16px 0 10px; font-weight: 600; }
.tdoc-body :deep(.tiptap h3) { font-size: 16px; margin: 14px 0 8px; font-weight: 600; }
.tdoc-body :deep(.tiptap h4) { font-size: 14px; margin: 12px 0 6px; font-weight: 600; }
.tdoc-body :deep(.tiptap ul), .tdoc-body :deep(.tiptap ol) { padding-left: 22px; margin: 8px 0; }
.tdoc-body :deep(.tiptap blockquote) { margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--el-color-primary-light-5); background: var(--el-fill-color-lighter); color: var(--el-text-color-regular); border-radius: 0 4px 4px 0; }
.tdoc-body :deep(.tiptap code) { background: var(--el-fill-color); padding: 1px 6px; border-radius: 4px; font-size: 13px; font-family: Consolas, Monaco, monospace; }
.tdoc-body :deep(.tiptap pre) { background: var(--el-fill-color-darker); padding: 12px 14px; border-radius: 6px; overflow-x: auto; margin: 10px 0; }
.tdoc-body :deep(.tiptap pre code) { background: transparent; padding: 0; color: inherit; }
.tdoc-body :deep(.tiptap hr) { border: none; border-top: 1px solid var(--el-border-color-lighter); margin: 14px 0; }
.tdoc-body :deep(.tiptap a) { color: var(--el-color-primary); }
.tdoc-body :deep(.tiptap img) { max-width: 100%; border-radius: 4px; margin: 6px 0; }
.tdoc-body :deep(.tiptap mark) { background: #fde68a; padding: 0 2px; border-radius: 2px; }
.tdoc-body :deep(.tiptap p.is-editor-empty:first-child)::before { content: attr(data-placeholder); color: var(--el-text-color-placeholder); float: left; height: 0; pointer-events: none; }

/* 任务列表 */
.tdoc-body :deep(.tiptap ul[data-type="taskList"]) { list-style: none; padding-left: 2px; }
.tdoc-body :deep(.tiptap ul[data-type="taskList"] li) { display: flex; gap: 8px; align-items: flex-start; }
.tdoc-body :deep(.tiptap ul[data-type="taskList"] li > label) { flex: 0 0 auto; margin-top: 5px; }
.tdoc-body :deep(.tiptap ul[data-type="taskList"] li > div) { flex: 1 1 0; }
.tdoc-body :deep(.tiptap ul[data-type="taskList"] input[type="checkbox"]) { accent-color: var(--el-color-primary); }

/* ---------------- 表格（含 prosemirror-tables 拖拽） ---------------- */
.tdoc-body :deep(.tiptap .tableWrapper) { overflow-x: auto; margin: 12px 0; }
.tdoc-body :deep(.tiptap table) { border-collapse: collapse; table-layout: fixed; width: 100%; overflow: hidden; }
.tdoc-body :deep(.tiptap td), .tdoc-body :deep(.tiptap th) { border: 1px solid var(--el-border-color-lighter); padding: 7px 11px; vertical-align: top; position: relative; box-sizing: border-box; min-width: 2em; }
.tdoc-body :deep(.tiptap th) { background: var(--el-fill-color-light); font-weight: 600; text-align: left; }
.tdoc-body :deep(.tiptap .selectedCell)::after { content: ''; position: absolute; inset: 0; background: rgba(64, 158, 255, 0.14); pointer-events: none; z-index: 2; }
.tdoc-body :deep(.tiptap .column-resize-handle) { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: var(--el-color-primary); z-index: 3; }
.tdoc-body :deep(.tiptap.resize-cursor), .tdoc-body :deep(.tiptap .resize-cursor) { cursor: col-resize; }

/* ---------------- 表格右键菜单 ---------------- */
.tdoc-ctxmenu { position: absolute; z-index: 30; min-width: 132px; padding: 5px; background: var(--el-bg-color-overlay); border: 1px solid var(--el-border-color-lighter); border-radius: 8px; box-shadow: var(--el-box-shadow-light); }
.ctx-item { display: block; width: 100%; border: none; background: transparent; text-align: left; padding: 7px 12px; border-radius: 5px; font-size: 13px; color: var(--el-text-color-primary); cursor: pointer; }
.ctx-item:hover { background: var(--el-fill-color); }
.ctx-item.danger { color: var(--el-color-danger); }
.ctx-sep { height: 1px; background: var(--el-border-color-extra-light); margin: 4px 8px; }
</style>
