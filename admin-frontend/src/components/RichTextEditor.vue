<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

/**
 * Coze 式富文本编辑器（手写 contenteditable + document.execCommand，无第三方依赖）。
 * 工具栏：字号(Aa)/加粗/斜体/删除线/无序列表/有序列表/引用/链接/图片/代码/@；
 * 右下：字数 n/{maxlength} + 全屏切换。v-model 绑定 HTML 字符串。
 * 粘贴按纯文本插入，保证存储数据干净（演示级约定）。
 */
const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  /** 字数上限（按纯文本字符数统计） */
  maxlength?: number
  minHeight?: number
  disabled?: boolean
}>(), { placeholder: '请输入内容…', maxlength: 1000, minHeight: 120, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const editorEl = ref<HTMLElement | null>(null)
const textLen = ref(0)
const fullscreen = ref(false)
/** 正在输入中标记：避免外部 v-model 回写打断光标 */
let composing = false

function syncFromEditor(): void {
  if (!editorEl.value) return
  textLen.value = (editorEl.value.innerText || '').replace(/\u200b/g, '').length
  composing = true
  emit('update:modelValue', editorEl.value.innerHTML)
  // 下一微任务解除标记（同周期内 watch 触发时跳过回写）
  Promise.resolve().then(() => { composing = false })
}

function exec(cmd: string, value?: string): void {
  editorEl.value?.focus()
  document.execCommand(cmd, false, value)
  syncFromEditor()
}

/** 字号：先 execCommand('fontSize',7) 生成 font 标签再替换为带 px 的 span（跨浏览器可控） */
function setFontSize(px: number): void {
  editorEl.value?.focus()
  document.execCommand('fontSize', false, '7')
  if (editorEl.value) {
    editorEl.value.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span')
      span.style.fontSize = `${px}px`
      span.innerHTML = (f as HTMLElement).innerHTML
      f.replaceWith(span)
    })
  }
  syncFromEditor()
}

function isBlockQuoteActive(): boolean {
  const sel = window.getSelection()
  if (!sel || !sel.anchorNode) return false
  let node: Node | null = sel.anchorNode
  while (node && node !== editorEl.value) {
    if (node.nodeName === 'BLOCKQUOTE') return true
    node = node.parentNode
  }
  return false
}

function toggleQuote(): void {
  exec('formatBlock', isBlockQuoteActive() ? '<p>' : '<blockquote>')
}

function toggleCodeBlock(): void {
  const sel = window.getSelection()
  if (!sel || !editorEl.value) return
  if (!sel.rangeCount || sel.isCollapsed) { ElMessage.warning('请先选中要格式化为代码的内容'); return }
  const range = sel.getRangeAt(0)
  const code = document.createElement('code')
  code.style.cssText = 'background:#f5f7fa;border:1px solid #e4e7ed;border-radius:4px;padding:0 4px;font-family:monospace'
  try { range.surroundContents(code) } catch { code.appendChild(range.extractContents()); range.insertNode(code) }
  sel.removeAllRanges()
  syncFromEditor()
}

function insertLink(): void {
  const sel = window.getSelection()
  const text = sel && sel.rangeCount && !sel.isCollapsed ? sel.toString() : ''
  const url = window.prompt('请输入链接地址（URL）：', 'https://')
  if (!url || url === 'https://') return
  editorEl.value?.focus()
  if (text) exec('createLink', url)
  else exec('insertHTML', `<a href="${url}" target="_blank" rel="noopener">${url}</a>`)
}

function insertImage(): void {
  const url = window.prompt('请输入图片地址（URL）：', 'https://')
  if (!url || url === 'https://') return
  editorEl.value?.focus()
  exec('insertHTML', `<img src="${url}" alt="" style="max-width:100%;border-radius:6px"/>`)
}

/** @提及：插入高亮占位 span（前台渲染为成员/角色提及样式） */
function insertMention(): void {
  editorEl.value?.focus()
  exec('insertHTML', '<span data-mention="1" style="color:#4e6ef2;background:#f0f4ff;border-radius:3px;padding:0 2px">@成员</span>&nbsp;')
}

function onPaste(e: ClipboardEvent): void {
  e.preventDefault()
  const text = e.clipboardData?.getData('text/plain') || ''
  if (!text) return
  document.execCommand('insertText', false, text.slice(0, Math.max(0, props.maxlength - textLen.value)))
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && fullscreen.value) { fullscreen.value = false; e.stopPropagation() }
}

watch(
  () => props.modelValue,
  (v) => {
    if (composing || !editorEl.value) return
    if (editorEl.value.innerHTML !== v) editorEl.value.innerHTML = v || ''
    textLen.value = (editorEl.value.innerText || '').replace(/\u200b/g, '').length
  },
  { immediate: true }
)

onMounted(() => {
  if (editorEl.value) editorEl.value.innerHTML = props.modelValue || ''
})
onBeforeUnmount(() => { fullscreen.value = false })

/** 供父组件取纯文本（字数校验/摘要用） */
function plainText(): string {
  return editorEl.value?.innerText || ''
}
defineExpose({ plainText })

const SIZE_OPTIONS = [12, 14, 16, 18, 22, 28]
</script>

<template>
  <div class="rte" :class="{ 'is-fullscreen': fullscreen, 'is-disabled': disabled }">
    <div class="rte-toolbar">
      <el-dropdown :disabled="disabled" trigger="click" @command="setFontSize">
        <button class="rte-btn rte-btn-size" type="button" title="字号">Aa</button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="s in SIZE_OPTIONS" :key="s" :command="s" :style="{ fontSize: `${Math.min(s, 18)}px` }">{{ s }}px</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <button class="rte-btn" type="button" title="加粗" :disabled="disabled" @click="exec('bold')"><b>B</b></button>
      <button class="rte-btn" type="button" title="斜体" :disabled="disabled" @click="exec('italic')"><i>I</i></button>
      <button class="rte-btn" type="button" title="删除线" :disabled="disabled" @click="exec('strikeThrough')"><s>S</s></button>
      <span class="rte-divider" />
      <button class="rte-btn" type="button" title="无序列表" :disabled="disabled" @click="exec('insertUnorderedList')">≡</button>
      <button class="rte-btn" type="button" title="有序列表" :disabled="disabled" @click="exec('insertOrderedList')">1.</button>
      <button class="rte-btn" type="button" title="引用" :disabled="disabled" @click="toggleQuote">❝</button>
      <span class="rte-divider" />
      <button class="rte-btn" type="button" title="链接" :disabled="disabled" @click="insertLink">🔗</button>
      <button class="rte-btn" type="button" title="图片" :disabled="disabled" @click="insertImage">🖼</button>
      <button class="rte-btn" type="button" title="代码" :disabled="disabled" @click="toggleCodeBlock">&lt;/&gt;</button>
      <button class="rte-btn" type="button" title="@提及" :disabled="disabled" @click="insertMention">@</button>
      <span class="rte-flex" />
      <button class="rte-btn" type="button" :title="fullscreen ? '退出全屏' : '全屏'" @click="fullscreen = !fullscreen">
        {{ fullscreen ? '⤡' : '⤢' }}
      </button>
    </div>
    <div
      ref="editorEl"
      class="rte-editor"
      :style="{ minHeight: `${minHeight}px` }"
      contenteditable="true"
      :data-placeholder="placeholder"
      @input="syncFromEditor"
      @paste="onPaste"
      @keydown="onKeydown"
      @blur="syncFromEditor"
    />
    <div class="rte-footer">
      <span :class="{ 'is-over': textLen > maxlength }">{{ textLen }}/{{ maxlength }}</span>
    </div>
  </div>
</template>

<style scoped>
.rte { border: 1px solid var(--el-border-color); border-radius: 6px; background: #fff; display: flex; flex-direction: column; transition: border-color .15s; }
.rte:focus-within { border-color: var(--el-color-primary); }
.rte.is-fullscreen { position: fixed; inset: 24px; z-index: 3000; box-shadow: 0 8px 40px rgba(0,0,0,.18); }
.rte.is-fullscreen .rte-editor { flex: 1; overflow: auto; }
.rte.is-disabled { opacity: .6; }
.rte.is-disabled .rte-editor { pointer-events: none; }
.rte-toolbar { display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--el-border-color-lighter); background: #fafbfc; border-radius: 6px 6px 0 0; flex-wrap: wrap; }
.rte-flex { flex: 1; }
.rte-btn { min-width: 26px; height: 26px; padding: 0 6px; border: none; background: transparent; border-radius: 4px; cursor: pointer; font-size: 13px; color: var(--el-text-color-regular); line-height: 1; display: inline-flex; align-items: center; justify-content: center; }
.rte-btn:hover { background: var(--el-fill-color); color: var(--el-color-primary); }
.rte-btn:disabled { cursor: not-allowed; opacity: .4; }
.rte-btn-size { font-weight: 600; width: 34px; }
.rte-divider { width: 1px; height: 16px; background: var(--el-border-color); margin: 0 4px; }
.rte-editor { padding: 10px 12px; outline: none; font-size: 14px; line-height: 1.7; color: var(--el-text-color-primary); overflow-wrap: anywhere; }
.rte-editor:empty::before { content: attr(data-placeholder); color: var(--el-text-color-placeholder); pointer-events: none; }
.rte-editor :deep(p) { margin: 0 0 6px; }
.rte-editor :deep(ul), .rte-editor :deep(ol) { margin: 0 0 6px; padding-left: 22px; }
.rte-editor :deep(blockquote) { margin: 6px 0; padding: 4px 12px; border-left: 3px solid var(--el-color-primary); background: var(--el-fill-color-light); color: var(--el-text-color-regular); border-radius: 0 4px 4px 0; }
.rte-editor :deep(a) { color: var(--el-color-primary); }
.rte-footer { display: flex; justify-content: flex-end; padding: 4px 10px 6px; font-size: 12px; color: var(--el-text-color-secondary); }
.rte-footer .is-over { color: var(--el-color-danger); }
</style>
