<script setup lang="ts">
/**
 * 语雀风格编辑器工具栏（1:1 复刻 ne-ui-toolbar，32 元素顺序见 spec §2）：
 * 绿+插入卡片菜单(spec§4) / 撤销重做 / 格式刷 / 清格式 / 正文+字号选择器 /
 * B I S U 更多文本样式 / 字色背景色色板(spec§3.4) / 对齐 / 无序有序(3 种编号样式) /
 * 缩进 / 行高 / 任务 / 链接 / 引用 / 分割线 / 查找 / 翻译 / 素材库。
 * 编辑器通过 reactive EditorState(prop) 回显状态；本组件只 emit EditorCommand。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { EMOJIS, FONT_SIZES, GRADIENTS, LINE_HEIGHTS, PALETTE_ROWS, type EditorCommand, type EditorState } from './editorTypes'

defineProps<{ state: EditorState; canEdit: boolean }>()
const emit = defineEmits<{ command: [EditorCommand] }>()

/** 当前展开的下拉菜单（单开互斥；null=全部关闭） */
const openMenu = ref<string | null>(null)
const insertSearch = ref('')
const emojiOpen = ref(false)
const recentColors = ref<string[]>([])

function toggle(menu: string): void {
  if (menu === 'insert') emojiOpen.value = false
  openMenu.value = openMenu.value === menu ? null : menu
}
function closeMenus(): void { openMenu.value = null; emojiOpen.value = false }
function fire(cmd: EditorCommand): void { emit('command', cmd); closeMenus() }
function isOn(menu: string): boolean { return openMenu.value === menu }

function onDocMousedown(e: MouseEvent): void {
  const t = e.target as HTMLElement
  if (t.closest('.yuw-toolbar')) return
  closeMenus()
}
onMounted(() => document.addEventListener('mousedown', onDocMousedown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMousedown))

const BLOCK_LABELS: Record<string, string> = { p: '正文', h1: '标题 1', h2: '标题 2', h3: '标题 3', h4: '标题 4', h5: '标题 5', h6: '标题 6' }

/** 插入卡片菜单数据（spec §4 九个分组全条目） */
interface InsertItem { key: string; slash: string; name: string; desc: string; implemented?: boolean }
interface InsertGroup { title: string; twoCol?: boolean; items: InsertItem[] }
const INSERT_GROUPS: InsertGroup[] = [
  {
    title: '基础', twoCol: true, items: [
      { key: 'image', slash: '/tp', name: '图片', desc: '插入图片', implemented: true },
      { key: 'table', slash: '/bg', name: '表格', desc: '插入表格', implemented: true },
      { key: 'file', slash: '/fj', name: '附件', desc: '支持pdf、ppt等多种格式', implemented: true },
      { key: 'status', slash: '/zt', name: '状态', desc: '插入状态标签', implemented: true }
    ]
  },
  {
    title: '智能专区', items: [
      { key: 'ai', slash: '', name: '语雀 AI 助手-写作助手', desc: '把文本变成表格、代码块等' }
    ]
  },
  {
    title: '画板类', items: [
      { key: 'board', slash: '/hb', name: '画板', desc: '可插入图形、连线和图片等' },
      { key: 'mindmap', slash: '/swdt', name: '思维导图', desc: '用于梳理信息和头脑风暴' },
      { key: 'flowchart', slash: '/lct', name: '流程图', desc: '用于绘制流程' }
    ]
  },
  {
    title: '数据表', items: [
      { key: 'grid', slash: '/sjb', name: '数据表', desc: '支持数据的筛选、分组和排序' },
      { key: 'album', slash: '/hc', name: '画册', desc: '用于展示图片集' },
      { key: 'kanban', slash: '/kb', name: '看板', desc: '用于任务管理' }
    ]
  },
  {
    title: '程序员专区', items: [
      { key: 'codeblock', slash: '/dmk', name: '代码块', desc: '支持多种语言和主题切换', implemented: true },
      { key: 'math', slash: '/gs', name: '公式', desc: '支持 Latex 语法', implemented: true },
      { key: 'uml', slash: '/uml', name: 'UML图', desc: '支持用例图、类图、时序图等' },
      { key: 'plantuml', slash: '/wbht', name: '文本绘图', desc: '支持PlantUML、Mermaid等' }
    ]
  },
  {
    title: '布局和样式', items: [
      { key: 'callout-info', slash: '/glk', name: '高亮块', desc: '用彩色背景来高亮提示', implemented: true },
      { key: 'collapse', slash: '/zdk', name: '折叠块', desc: '可折叠内容', implemented: true },
      { key: 'columns', slash: '', name: '分栏卡片', desc: '使用分栏组织页面' },
      { key: 'quote', slash: '/yy', name: '引用', desc: '插入引用格式', implemented: true },
      { key: 'hr', slash: '/fgx', name: '插入分割线', desc: '分割线', implemented: true },
      { key: 'emoji', slash: '/bq', name: '表情', desc: '用 emoji 表情表达情绪', implemented: true },
      { key: 'gallery', slash: '/tc', name: '图册', desc: '轮播、平铺等方式展示多图' }
    ]
  },
  {
    title: '小工具', items: [
      { key: 'mention', slash: '@', name: '提及', desc: '提及人和内容', implemented: true },
      { key: 'yuque', slash: '/yq', name: '语雀内容', desc: '插入可访问的语雀内容' },
      { key: 'calendar', slash: '/rl', name: '日历', desc: '使用日历添加日程' },
      { key: 'date', slash: '/rq', name: '日期', desc: '插入日期', implemented: true },
      { key: 'vote', slash: '/toup', name: '投票', desc: '发起投票活动' },
      { key: 'clockin', slash: '/dk', name: '打卡', desc: '发起打卡活动' },
      { key: 'encrypt', slash: '/jm', name: '加密文本', desc: '支持设置密码访问' }
    ]
  },
  {
    title: '嵌入本地文件（会员）', items: [
      { key: 'localfile', slash: '/bdwj', name: '本地文件', desc: '开通语雀会员后可用 立即开通' },
      { key: 'audio', slash: '/yp', name: '本地音频', desc: '开通语雀会员后可用 立即开通' },
      { key: 'video', slash: '/sp', name: '本地视频', desc: '开通语雀会员后可用 立即开通' }
    ]
  },
  {
    title: '嵌入第三方服务', items: [
      { key: 'youku', slash: '/yk', name: '优酷', desc: '插入优酷视频' },
      { key: 'bilibili', slash: '/blbl', name: '哔哩哔哩', desc: '插入哔哩哔哩视频' },
      { key: 'music163', slash: '/wyyyy', name: '网易云音乐', desc: '插入网易云音乐' },
      { key: 'taobao', slash: '/tbsp', name: '淘宝视频', desc: '插入淘宝视频' },
      { key: 'amap', slash: '/gddt', name: '高德地图', desc: '插入高德地图' },
      { key: 'modao', slash: '/md', name: '墨刀', desc: '插入墨刀原型' },
      { key: 'figma', slash: '/fig', name: 'Figma', desc: '插入 Figma 设计稿' },
      { key: 'processon', slash: '/pro', name: 'ProcessOn', desc: '插入 ProcessOn 图形' },
      { key: 'canva', slash: '/can', name: 'Canva', desc: '插入 Canva 设计' },
      { key: 'msjj', slash: '/msjj', name: '码上掘金', desc: '插入码上掘金代码' },
      { key: 'codepen', slash: '/cod', name: 'CodePen', desc: '插入 CodePen 代码' },
      { key: 'yida', slash: '/yd', name: '宜搭', desc: '插入宜搭应用' },
      { key: 'jinshuju', slash: '/jsj', name: '金数据', desc: '插入金数据表单' }
    ]
  }
]
const filteredGroups = (): InsertGroup[] => {
  const q = insertSearch.value.trim().toLowerCase()
  if (!q) return INSERT_GROUPS
  return INSERT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((it) => it.name.toLowerCase().includes(q) || it.slash.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q))
  })).filter((g) => g.items.length)
}
function onInsert(item: InsertItem): void {
  if (!item.implemented) { fire({ cmd: 'unsupported', name: item.name }); return }
  if (item.key === 'image' || item.key === 'file') { pickFile(item.key as 'image' | 'file'); return }
  if (item.key === 'emoji') { emojiOpen.value = !emojiOpen.value; return }
  if (item.key.startsWith('callout-')) { fire({ cmd: 'insert', kind: 'callout', value: item.key.slice(8) }); return }
  fire({ cmd: 'insert', kind: item.key })
}

const imageInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
function pickFile(kind: 'image' | 'file'): void {
  ;(kind === 'image' ? imageInput : fileInput).value?.click()
  closeMenus()
}
function onPicked(kind: 'image' | 'file', e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) emit('command', { cmd: 'filePick', kind, file: f })
  ;(e.target as HTMLInputElement).value = ''
}

function pickColor(kind: 'color' | 'bg', hex: string): void {
  recentColors.value = [hex, ...recentColors.value.filter((c) => c !== hex)].slice(0, 8)
  fire({ cmd: kind, v: '#' + hex })
}
function pickRecent(kind: 'color' | 'bg', hex: string): void { fire({ cmd: kind, v: hex }) }
function pickCustom(kind: 'color' | 'bg', e: Event): void {
  const v = (e.target as HTMLInputElement).value
  recentColors.value = [v, ...recentColors.value.filter((c) => c !== v)].slice(0, 8)
  fire({ cmd: kind, v })
}
defineExpose({ toggleInsert: () => toggle('insert') })
</script>
<template>
  <div class="yuw-toolbar" :class="{ disabled: !canEdit }">
    <!-- 0. 绿色 + 插入卡片 -->
    <div class="yw-relative">
      <button type="button" class="yt-btn insert-card" :class="{ open: isOn('insert') }" data-tip="插入卡片 Ctrl+/" @click="toggle('insert')">
        <svg viewBox="0 0 18 18" width="18" height="18"><rect x="8" y="3" width="2" height="12" rx="1" fill="#fff"/><rect x="3" y="8" width="12" height="2" rx="1" fill="#fff"/></svg>
      </button>
      <!-- §4 插入卡片菜单 -->
      <div v-if="isOn('insert')" class="yw-panel insert-menu" @mousedown.stop>
        <div class="insert-search">
          <svg viewBox="0 0 16 16" width="14" height="14"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.4"/></svg>
          <input v-model="insertSearch" placeholder="请输入要搜索的功能名称" />
        </div>
        <div class="insert-scroll">
          <template v-for="g in filteredGroups()" :key="g.title">
            <div class="insert-group-title">{{ g.title }}</div>
            <div class="insert-group" :class="{ 'two-col': g.twoCol }">
              <div v-for="it in g.items" :key="it.key" class="insert-item" :data-testid="'card-menu-item-' + it.key" @click="onInsert(it)">
                <div class="insert-item-icon">{{ it.slash || '·' }}</div>
                <div class="insert-item-text">
                  <div class="insert-item-name"><span v-if="it.slash" class="slash-key">{{ it.slash }}</span>{{ it.name }}</div>
                  <div class="insert-item-desc">{{ it.desc }}</div>
                </div>
              </div>
            </div>
          </template>
          <div v-if="emojiOpen" class="emoji-grid">
            <button v-for="em in EMOJIS" :key="em" type="button" @click="fire({ cmd: 'insert', kind: 'emoji', value: em })">{{ em }}</button>
          </div>
        </div>
      </div>
    </div>
    <i class="yt-divider" />
    <!-- 2/3 撤销重做 -->
    <button type="button" class="yt-btn" :disabled="!state.canUndo" data-tip="撤销 Ctrl+Z" @click="fire({ cmd: 'undo' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><path d="M7 4L3 8l4 4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 8h6.5a4.5 4.5 0 010 9H8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
    </button>
    <button type="button" class="yt-btn" :disabled="!state.canRedo" data-tip="重做 Shift+Ctrl+Z" @click="fire({ cmd: 'redo' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><path d="M11 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14.5 8H8a4.5 4.5 0 000 9h2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
    </button>
    <!-- 4/5 格式刷 清除格式 -->
    <button type="button" class="yt-btn" :class="{ active: state.painter }" data-tip="格式刷 Shift+Ctrl+S" @click="fire({ cmd: 'formatPainter' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><rect x="3" y="3" width="9" height="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 8v3a1 1 0 01-1 1H8v3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <button type="button" class="yt-btn" data-tip="清除格式 Ctrl+\" @click="fire({ cmd: 'clearFormat' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><path d="M6 14l-3-3 7-7h4l2 2-8 8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 15h8" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <i class="yt-divider" />
    <!-- 7 正文与标题 -->
    <div class="yw-relative">
      <button type="button" class="yt-select" data-tip="正文与标题" @click="toggle('block')">
        <span>{{ BLOCK_LABELS[state.block] || '正文' }}</span><i class="yt-caret" />
      </button>
      <div v-if="isOn('block')" class="yw-panel block-menu" @mousedown.stop>
        <div v-for="(label, b) in BLOCK_LABELS" :key="b" class="menu-row" :class="{ checked: state.block === b }" @click="fire({ cmd: 'block', v: b })">
          <i class="check-icon">{{ state.block === b ? '✓' : '' }}</i>
          <span :class="'preview-' + b">{{ label }}</span>
          <span class="kbd">Alt Ctrl {{ Number(b.slice(1) || 0) }}</span>
        </div>
      </div>
    </div>
    <!-- 8 字号 -->
    <div class="yw-relative">
      <button type="button" class="yt-select slim" data-tip="字号调整 Alt Ctrl + / -" @click="toggle('fontSize')">
        <span>{{ state.fontSize }}</span><i class="yt-caret" />
      </button>
      <div v-if="isOn('fontSize')" class="yw-panel size-menu" @mousedown.stop>
        <div v-for="fs in FONT_SIZES" :key="fs" class="menu-row" :class="{ checked: state.fontSize === fs }" @click="fire({ cmd: 'fontSize', v: fs })">
          <i class="check-icon">{{ state.fontSize === fs ? '✓' : '' }}</i><span>{{ fs }}</span>
        </div>
      </div>
    </div>
    <!-- 9-12 B I S U -->
    <button type="button" class="yt-btn" :class="{ active: state.bold }" data-tip="粗体 Ctrl+B" @click="fire({ cmd: 'bold' })"><b style="font-size:15px">B</b></button>
    <button type="button" class="yt-btn" :class="{ active: state.italic }" data-tip="斜体 Ctrl+I" @click="fire({ cmd: 'italic' })"><i style="font-size:15px;font-family:Georgia,serif">I</i></button>
    <button type="button" class="yt-btn" :class="{ active: state.strike }" data-tip="删除线 Shift+Ctrl+X" @click="fire({ cmd: 'strike' })"><s style="font-size:15px">S</s></button>
    <button type="button" class="yt-btn" :class="{ active: state.underline }" data-tip="下划线 Ctrl+U" @click="fire({ cmd: 'underline' })"><u style="font-size:15px">U</u></button>
    <!-- 13 更多文本样式 -->
    <div class="yw-relative">
      <button type="button" class="yt-btn" data-tip="更多文本样式" @click="toggle('more')">
        <svg viewBox="0 0 18 18" width="18" height="18"><path d="M4 13l4-8h1l4 8M6 10h5" fill="none" stroke="currentColor" stroke-width="1.5"/><text x="12.5" y="16" font-size="7" fill="currentColor">↓</text></svg>
      </button>
      <div v-if="isOn('more')" class="yw-panel more-menu" @mousedown.stop>
        <div class="menu-row" :class="{ checked: state.code }" @click="fire({ cmd: 'inlineCode' })"><i class="check-icon">{{ state.code ? '✓' : '' }}</i><svg viewBox="0 0 18 18" width="16" height="16"><path d="M7 5l-4 4 4 4M11 5l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><span>行内代码</span></div>
        <div class="menu-row" :class="{ checked: state.sup }" @click="fire({ cmd: 'sup' })"><i class="check-icon">{{ state.sup ? '✓' : '' }}</i><span style="font-size:12px">x²</span><span>上标</span></div>
        <div class="menu-row" :class="{ checked: state.sub }" @click="fire({ cmd: 'sub' })"><i class="check-icon">{{ state.sub ? '✓' : '' }}</i><span style="font-size:12px">x₂</span><span>下标</span></div>
      </div>
    </div>
    <i class="yt-divider" />
    <!-- 15 字体颜色（split 42×32） -->
    <div class="yw-relative">
      <div class="yt-split color-split">
        <button type="button" class="yt-btn flat" data-tip="字体颜色 Alt Ctrl C" @click="fire({ cmd: 'color', v: '#DF2A3F' })">
          <svg viewBox="0 0 18 18" width="18" height="18"><path d="M9 3l4.5 9h-9L9 3z" fill="currentColor"/><rect x="5" y="14" width="8" height="2.5" rx="1" fill="currentColor"/></svg>
          <i class="color-bar" :style="{ background: state.color }" />
        </button>
        <i class="split-sep" />
        <button type="button" class="yt-btn flat caret-only" @click="toggle('color')"><i class="yt-caret" /></button>
      </div>
      <div v-if="isOn('color')" class="yw-panel palette" @mousedown.stop>
        <div v-for="(row, ri) in PALETTE_ROWS" :key="ri" class="pal-row" :class="{ 'gray-row': ri === 0 }">
          <button v-for="hex in row" :key="hex" type="button" class="pal-cell" :class="{ sel: state.color.toUpperCase() === '#' + hex }" :style="{ background: '#' + hex }" :title="'#' + hex" @click="pickColor('color', hex)" />
        </div>
        <div class="pal-row">
          <button v-for="g in GRADIENTS" :key="g" type="button" class="pal-cell grad" :style="{ background: g }" @click="fire({ cmd: 'gradient', v: g })" />
        </div>
        <div class="pal-foot">
          <button type="button" class="pal-action" @click="fire({ cmd: 'colorDefault' })">默认</button>
          <span class="pal-label">最近使用自定义颜色</span>
          <span v-if="!recentColors.length" class="pal-none">暂无</span>
          <span v-else class="pal-recent">
            <button v-for="c in recentColors" :key="c" type="button" class="pal-cell small" :style="{ background: c }" @click="pickRecent('color', c)" />
          </span>
          <label class="pal-more">更多颜色 <input type="color" @input="pickCustom('color', $event)" /></label>
        </div>
      </div>
    </div>
    <!-- 16 背景色 -->
    <div class="yw-relative">
      <div class="yt-split color-split">
        <button type="button" class="yt-btn flat" data-tip="背景颜色 Alt Ctrl H" @click="fire({ cmd: 'bg', v: '#FBDE28' })">
          <svg viewBox="0 0 18 18" width="18" height="18"><rect x="3" y="5" width="12" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
          <i class="color-bar" :style="{ background: state.bg }" />
        </button>
        <i class="split-sep" />
        <button type="button" class="yt-btn flat caret-only" @click="toggle('bg')"><i class="yt-caret" /></button>
      </div>
      <div v-if="isOn('bg')" class="yw-panel palette" @mousedown.stop>
        <div v-for="(row, ri) in PALETTE_ROWS" :key="ri" class="pal-row">
          <button v-for="hex in row" :key="hex" type="button" class="pal-cell" :class="{ sel: state.bg.toUpperCase() === '#' + hex }" :style="{ background: '#' + hex }" :title="'#' + hex" @click="pickColor('bg', hex)" />
        </div>
        <div class="pal-foot">
          <button type="button" class="pal-action" @click="fire({ cmd: 'bgDefault' })">默认</button>
          <span class="pal-label">最近使用自定义颜色</span>
          <span v-if="!recentColors.length" class="pal-none">暂无</span>
          <span v-else class="pal-recent">
            <button v-for="c in recentColors" :key="c" type="button" class="pal-cell small" :style="{ background: c }" @click="pickRecent('bg', c)" />
          </span>
          <label class="pal-more">更多颜色 <input type="color" @input="pickCustom('bg', $event)" /></label>
        </div>
      </div>
    </div>
    <i class="yt-divider" />
    <!-- 18 对齐方式 -->
    <div class="yw-relative">
      <div class="yt-split">
        <button type="button" class="yt-btn flat" data-tip="对齐方式" @click="fire({ cmd: 'align', v: state.align })">
          <svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 5h12M3 9h8M3 13h12" stroke="currentColor" stroke-width="1.6"/></svg>
        </button>
        <i class="split-sep" />
        <button type="button" class="yt-btn flat caret-only" @click="toggle('align')"><i class="yt-caret" /></button>
      </div>
      <div v-if="isOn('align')" class="yw-panel align-menu" @mousedown.stop>
        <button type="button" class="yt-btn" data-tip="左对齐" @click="fire({ cmd: 'align', v: 'left' })"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 5h12M3 9h8M3 13h12" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <button type="button" class="yt-btn" data-tip="居中" @click="fire({ cmd: 'align', v: 'center' })"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 5h12M5 9h8M3 13h12" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <button type="button" class="yt-btn" data-tip="右对齐" @click="fire({ cmd: 'align', v: 'right' })"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 5h12M7 9h8M3 13h12" stroke="currentColor" stroke-width="1.6"/></svg></button>
        <template v-if="state.tableActive">
          <i class="yt-divider" />
          <button type="button" class="yt-btn" data-tip="顶对齐 Alt+Shift+Ctrl+T" @click="fire({ cmd: 'valign', v: 'top' })"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 4h12M6 8v6M12 8v4" stroke="currentColor" stroke-width="1.4"/></svg></button>
          <button type="button" class="yt-btn" data-tip="垂直居中 Alt+Shift+Ctrl+C" @click="fire({ cmd: 'valign', v: 'middle' })"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 9h12M6 6v6M12 7v4" stroke="currentColor" stroke-width="1.4"/></svg></button>
          <button type="button" class="yt-btn" data-tip="底对齐 Alt+Shift+Ctrl+B" @click="fire({ cmd: 'valign', v: 'bottom' })"><svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 14h12M6 4v6M12 6v4" stroke="currentColor" stroke-width="1.4"/></svg></button>
        </template>
      </div>
    </div>
    <!-- 19 无序列表 -->
    <button type="button" class="yt-btn" :class="{ active: state.ul }" data-tip="无序列表 Shift+Ctrl+8" @click="fire({ cmd: 'ul' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><circle cx="4" cy="5" r="1.4" fill="currentColor"/><circle cx="4" cy="9" r="1.4" fill="currentColor"/><circle cx="4" cy="13" r="1.4" fill="currentColor"/><path d="M7.5 5h8M7.5 9h8M7.5 13h8" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <!-- 20 有序列表（带编号样式下拉） -->
    <div class="yw-relative">
      <div class="yt-split ol-split">
        <button type="button" class="yt-btn flat" :class="{ active: state.ol }" data-tip="有序列表 Shift+Ctrl+7" @click="fire({ cmd: 'ol' })">
          <svg viewBox="0 0 18 18" width="18" height="18"><text x="1.5" y="6.5" font-size="6" fill="currentColor">1.</text><text x="1.5" y="11" font-size="6" fill="currentColor">2.</text><text x="1.5" y="15.5" font-size="6" fill="currentColor">3.</text><path d="M8 5h8M8 9h8M8 13h8" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
        <i class="split-sep" />
        <button type="button" class="yt-btn flat caret-only" @click="toggle('olType')"><i class="yt-caret" /></button>
      </div>
      <div v-if="isOn('olType')" class="yw-panel oltype-menu" @mousedown.stop>
        <div class="list-type-selector">
          <div v-for="t in [0, 1, 2]" :key="t" class="list-type-card" :class="{ active: state.olType === t }" :data-type="t" @click="fire({ cmd: 'olType', v: t })">
            <template v-if="t === 0">
              <div class="lt-row"><span class="lt-sym">1.</span><span class="lt-body">第一级列表样式</span></div>
              <div class="lt-row lv2"><span class="lt-sym">a.</span><span class="lt-body">第二级列表样式</span></div>
              <div class="lt-row lv3"><span class="lt-sym">ⅰ.</span><span class="lt-body">第三级列表样式</span></div>
            </template>
            <template v-else-if="t === 1">
              <div class="lt-row"><span class="lt-sym">一.</span><span class="lt-body">第一级列表样式</span></div>
              <div class="lt-row lv2"><span class="lt-sym">(一)</span><span class="lt-body">第二级列表样式</span></div>
              <div class="lt-row lv3"><span class="lt-sym">1.</span><span class="lt-body">第三级列表样式</span></div>
            </template>
            <template v-else>
              <div class="lt-row"><span class="lt-sym">1.</span><span class="lt-body">第一级列表样式</span></div>
              <div class="lt-row lv2"><span class="lt-sym">1.1.</span><span class="lt-body">第二级列表样式</span></div>
              <div class="lt-row lv3"><span class="lt-sym">1.2.1.</span><span class="lt-body">第三级列表样式</span></div>
            </template>
          </div>
        </div>
      </div>
    </div>
    <!-- 21 缩进 / 22 行高 -->
    <div class="yw-relative">
      <button type="button" class="yt-btn" data-tip="缩进调整 Ctrl+]" @click="toggle('indent')">
        <svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 4h12M7 8h8M7 12h8M3 8l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <div v-if="isOn('indent')" class="yw-panel indent-menu" @mousedown.stop>
        <div class="menu-row" @click="fire({ cmd: 'indent', v: 1 })"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M3 4h12M7 8h8M7 12h8M3 8l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><span>增加缩进</span></div>
        <div class="menu-row" @click="fire({ cmd: 'indent', v: -1 })"><svg viewBox="0 0 18 18" width="16" height="16"><path d="M3 4h12M7 8h8M7 12h8M5 8L3 10l2 2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><span>减少缩进</span></div>
      </div>
    </div>
    <div class="yw-relative">
      <button type="button" class="yt-btn" data-tip="行高调整 Alt Ctrl [ / ]" @click="toggle('lineHeight')">
        <svg viewBox="0 0 18 18" width="18" height="18"><path d="M4 2v14M2 4l2-2 2 2M2 14l2 2 2-2M9 5h6M9 9h6M9 13h6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
      </button>
      <div v-if="isOn('lineHeight')" class="yw-panel lh-menu" @mousedown.stop>
        <div v-for="lh in LINE_HEIGHTS" :key="lh.label" class="menu-row" :class="{ checked: state.lineHeight === lh.v }" @click="fire({ cmd: 'lineHeight', v: lh.v })">
          <i class="check-icon">{{ state.lineHeight === lh.v ? '✓' : '' }}</i><span>{{ lh.label }}</span>
        </div>
      </div>
    </div>
    <i class="yt-divider" />
    <!-- 23 任务列表 -->
    <button type="button" class="yt-btn" :class="{ active: state.task }" data-tip="任务列表 Shift+Ctrl+9" @click="fire({ cmd: 'task' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><path d="M3.5 5l1.5 1.5L7.5 4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 5.5h5" stroke="currentColor" stroke-width="1.5"/><path d="M3.5 11.5l1.5 1.5 2.5-2.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 12h5" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <!-- 24 链接 -->
    <button type="button" class="yt-btn" data-tip="插入链接 Ctrl+K" @click="fire({ cmd: 'link' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><path d="M7.5 10.5l3-3" stroke="currentColor" stroke-width="1.5"/><path d="M8 6l1.5-1.5a2.8 2.8 0 014 4L12 10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 12l-1.5 1.5a2.8 2.8 0 01-4-4L6 8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <!-- 25 引用 -->
    <button type="button" class="yt-btn" :class="{ active: state.quote }" data-tip="引用 Alt Ctrl Q" @click="fire({ cmd: 'quote' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><path d="M6.5 4.5h-2a1 1 0 00-1 1v2a1 1 0 001 1h2v-4z" fill="currentColor"/><path d="M6.5 8.5c0 2-.8 3.3-2.3 4.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M14 4.5h-2a1 1 0 00-1 1v2a1 1 0 001 1h2v-4z" fill="currentColor"/><path d="M14 8.5c0 2-.8 3.3-2.3 4.2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
    </button>
    <!-- 表格上下文按钮（spec §7.2：单元格聚焦时出现，平时隐藏） -->
    <template v-if="state.tableActive">
      <button type="button" class="yt-btn" :disabled="!state.canMerge" data-tip="合并单元格 Shift+Ctrl+1" @click="fire({ cmd: 'tableMerge' })">
        <svg viewBox="0 0 18 18" width="18" height="18"><rect x="2.5" y="3.5" width="5.5" height="5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="10" y="3.5" width="5.5" height="5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5"/><rect x="2.5" y="10.5" width="13" height="4" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
      <button type="button" class="yt-btn" :class="{ active: state.tableBorderHidden }" data-tip="隐藏边框 Shift+Ctrl+\" @click="fire({ cmd: 'tableBorder' })">
        <svg viewBox="0 0 18 18" width="18" height="18"><rect x="2.5" y="2.5" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.5 9h13M9 2.5v13" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 1.5"/></svg>
      </button>
      <i class="yt-divider" />
    </template>
    <!-- 26 分割线 -->
    <button type="button" class="yt-btn" data-tip="分割线" @click="fire({ cmd: 'hr' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><path d="M3 9h12" stroke="currentColor" stroke-width="1.6"/></svg>
    </button>
    <i class="yt-divider" />
    <!-- 27 查找替换 -->
    <button type="button" class="yt-btn" data-tip="查找替换 Shift+Ctrl+F" @click="fire({ cmd: 'find' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><circle cx="7.5" cy="7.5" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <!-- 28 翻译 -->
    <button type="button" class="yt-btn" data-tip="翻译" @click="fire({ cmd: 'translate' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><text x="1.5" y="8" font-size="6.5" fill="currentColor">中</text><path d="M8.5 13.5l2.5-6 2.5 6M9.3 11.5h3.4" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M14.5 4.5h3M16 4.5v2M14 9c1.5 1.5 2.5 2 4 2.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
    </button>
    <!-- 29 素材库 -->
    <button type="button" class="yt-btn" data-tip="素材库" @click="fire({ cmd: 'material' })">
      <svg viewBox="0 0 18 18" width="18" height="18"><rect x="2.5" y="3.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 7.5h13M7 7.5V14.5" stroke="currentColor" stroke-width="1.5"/></svg>
    </button>
    <!-- 隐藏文件选择（图片 / 附件） -->
    <input ref="imageInput" type="file" accept="image/*" style="display: none" @change="onPicked('image', $event)" />
    <input ref="fileInput" type="file" style="display: none" @change="onPicked('file', $event)" />
  </div>
</template>
<style scoped>
.yuw-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 42px;
  padding: 0 10px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  position: relative;
  z-index: 30;
  flex-shrink: 0;
  user-select: none;
}
.yuw-toolbar.disabled { opacity: .45; pointer-events: none; }

/* 普通图标按钮 26×26 */
.yt-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #33383e;
  cursor: pointer;
  padding: 0 2px;
  font-size: 13px;
}
.yt-btn:hover { background: #f2f3f5; }
.yt-btn.active { background: #e8f3ff; color: #338bff; }
.yt-btn:disabled { opacity: .35; cursor: not-allowed; background: transparent; }
.yt-btn.flat { border-radius: 0; }
.yt-divider { width: 1px; height: 24px; background: #e8e8e8; margin: 0 6px; flex-shrink: 0; }
.yt-caret {
  display: inline-block;
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid currentColor;
  opacity: .45;
}

/* 绿色插入卡片 */
.insert-card { width: 30px; height: 30px; background: #00b96b; border-radius: 6px; color: #fff; }
.insert-card:hover { background: #00c97a; }
.insert-card.open { background: #00a75f; }

/* 正文 / 字号选择器 */
.yt-select {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 71px;
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #33383e;
  font-size: 13px;
  cursor: pointer;
}
.yt-select:hover { background: #f2f3f5; }
.yt-select.slim { width: 62px; }

/* split 组合按钮（字色/背景/对齐/有序列表） */
.yt-split {
  display: inline-flex;
  align-items: stretch;
  width: 42px;
  height: 27px;
  border-radius: 4px;
}
.yt-split:hover { background: #f2f3f5; }
.yt-split .yt-btn { height: 100%; }
.split-sep { width: 1px; background: #e8e8e8; margin: 3px 0; }
.yt-split .caret-only { width: 16px; padding: 0; }
.yt-split.ol-split { width: 48px; }

/* 颜色 split 42×32：上 icon 下色条 */
.color-split { flex-direction: column; width: 42px; height: 32px; padding: 1px 0; }
.color-split .flat { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
.color-bar { display: block; width: 14px; height: 3px; border-radius: 2px; }

/* 下拉面板通用 */
.yw-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: #fff;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, .12);
  z-index: 100;
  padding: 6px;
}
.menu-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 13px;
  color: #33383e;
  cursor: pointer;
  white-space: nowrap;
}
.menu-row:hover { background: #f2f3f5; }
.menu-row.checked { color: #338bff; }
.check-icon { width: 14px; flex-shrink: 0; font-style: normal; font-size: 12px; }
.kbd { margin-left: auto; font-size: 11px; color: #b0b3b8; padding-left: 16px; }

/* 各面板尺寸 */
.block-menu { width: 235px; }
.block-menu .preview-h1 { font-size: 17px; font-weight: 700; }
.block-menu .preview-h2 { font-size: 15px; font-weight: 700; }
.block-menu .preview-h3 { font-size: 14px; font-weight: 700; }
.block-menu .preview-h4, .block-menu .preview-h5, .block-menu .preview-h6 { font-size: 13px; font-weight: 700; }
.size-menu { width: 93px; max-height: 466px; overflow: auto; }
.more-menu { width: 126px; }
.align-menu { display: flex; gap: 2px; width: 133px; justify-content: center; padding: 4px; }
.indent-menu { width: 106px; }
.lh-menu { width: 106px; }

/* 色板 */
.palette { width: 258px; padding: 10px; }
.pal-row { display: flex; gap: 4px; margin-bottom: 4px; }
.pal-row.gray-row { margin-bottom: 8px; }
.pal-cell { width: 14px; height: 14px; border-radius: 3px; border: 0; padding: 0; cursor: pointer; flex-shrink: 0; }
.pal-cell:hover { outline: 2px solid rgba(51, 139, 255, .35); }
.pal-cell.sel { outline: 2px solid #338bff; }
.pal-cell.grad { width: 18px; }
.pal-cell.small { width: 14px; height: 14px; }
.pal-recent { display: flex; gap: 3px; flex-wrap: wrap; }
.pal-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
  flex-wrap: wrap;
}
.pal-action { border: 0; background: transparent; color: #33383e; font-size: 12px; cursor: pointer; padding: 2px 4px; border-radius: 3px; }
.pal-action:hover { background: #f2f3f5; }
.pal-label { font-size: 11px; color: #b0b3b8; }
.pal-none { font-size: 11px; color: #d0d3d8; }
.pal-more { font-size: 11px; color: #338bff; cursor: pointer; margin-left: auto; }
.pal-more input { width: 0; height: 0; opacity: 0; border: 0; padding: 0; }

/* 有序列表编号样式选择 285 宽三卡预览 */
.oltype-menu { width: 285px; }
.list-type-selector { display: flex; gap: 8px; }
.list-type-card { flex: 1; border: 1px solid #e5e5e5; border-radius: 6px; padding: 8px 6px; cursor: pointer; }
.list-type-card:hover { border-color: #338bff; }
.list-type-card.active { border-color: #338bff; background: #f0f7ff; }
.lt-row { display: flex; gap: 4px; align-items: baseline; margin-bottom: 4px; overflow: hidden; }
.lt-row:last-child { margin-bottom: 0; }
.lt-sym { font-size: 10px; color: #666; min-width: 24px; text-align: right; flex-shrink: 0; }
.lt-body { font-size: 10px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lt-row.lv2 .lt-sym { padding-left: 10px; }
.lt-row.lv3 .lt-sym { padding-left: 20px; }

/* 插入卡片菜单 292×600 */
.insert-menu { width: 292px; height: 600px; display: flex; flex-direction: column; padding: 12px 0 0; }
.insert-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px 8px;
  height: 32px;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  padding: 0 8px;
  color: #b0b3b8;
}
.insert-search input { flex: 1; border: 0; outline: 0; font-size: 13px; background: transparent; }
.insert-scroll { flex: 1; overflow: auto; padding: 0 12px 12px; }
.insert-group-title { font-size: 12px; color: #b0b3b8; margin: 10px 0 6px; }
.insert-group { display: flex; flex-direction: column; gap: 2px; }
.insert-group.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
.insert-item { display: flex; align-items: center; gap: 8px; padding: 6px; border-radius: 6px; cursor: pointer; }
.insert-item:hover { background: #f2f3f5; }
.insert-item-icon {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: #f5f6f7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #666;
  flex-shrink: 0;
}
.slash-key { font-size: 10px; color: #b0b3b8; background: #f5f6f7; border-radius: 3px; padding: 1px 4px; margin-right: 4px; }
.insert-item-name { font-size: 13px; color: #33383e; line-height: 18px; }
.insert-item-desc { font-size: 11px; color: #b0b3b8; line-height: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.insert-group.two-col .insert-item-name { font-size: 12px; }
.insert-group.two-col .insert-item-desc { max-width: 90px; }
.insert-group.two-col .insert-item-icon { width: 28px; height: 28px; font-size: 9px; }

/* emoji 网格 */
.emoji-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 2px; margin-top: 8px; }
.emoji-grid button { height: 32px; border: 0; background: transparent; border-radius: 4px; font-size: 17px; cursor: pointer; }
.emoji-grid button:hover { background: #f2f3f5; }

/* 悬停提示（纯 CSS tooltip，位于按钮下方） */
[data-tip] { position: relative; }
[data-tip]:hover::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, .75);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  padding: 6px 8px;
  border-radius: 4px;
  white-space: nowrap;
  z-index: 200;
  pointer-events: none;
}
</style>

