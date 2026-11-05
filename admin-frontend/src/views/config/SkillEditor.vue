<script setup lang="ts">
/**
 * 技能编辑器（v6.1，Open WebUI 式全屏编辑）：
 * 顶栏（返回 + 名称/编码/状态 + 自动保存指示 + 历史版本/发布版本/关闭）；
 * 元信息（描述=触发意图 + 平台多选）；左侧文件树（SKILL.md 根 + 附属文件）；
 * 右侧「编辑 | 预览」页签 + 单文件下载 + 整包 ZIP。
 * v6.1 优化（对标 Open WebUI 技能创建实测）：
 * 新建时 SKILL.md 预填标准模板（触发场景/输入/步骤/输出格式）+「插入模板」；
 * 名称自动生成编码建议（手改后不再覆盖）；新建按钮文案「保存并创建」一步语义；
 * 整包 ZIP 下载（SKILL.md + 附属文件）；描述 placeholder 给触发式示例句。
 * v6.2：左侧文件树支持按住拖动——文件拖入/拖出文件夹、文件落到另一文件前后（跨区自动移动+排序）、文件夹整组排序（仅编辑态）。
 * v10：元信息新增「所属场景」——下拉选历史场景 / 输入新名称自动注册进场景库（归属首个所选平台），对齐前台平台→场景两级。
 * 交互约定：禁止点空白关闭；关闭按钮先询问；边编辑边自动保存（skipVersion 不进版本历史，首次发布后启用）。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowLeft, CaretRight, CircleCheck, Close, Document, Folder, FolderOpened, Plus } from '@element-plus/icons-vue'
import YuqueEditor from '@/components/yuque/YuqueEditor.vue'
import { get } from '@/api/request'
import { listConfig, saveConfig, PLATFORMS, PLATFORM_META, type ConfigItem, type PlatformType } from '@/api/config'
import { ensureScenario, ensureScenarios, orderedScenarioOptions } from '@/utils/scenarios'
import { downloadTextFile, downloadBlobFile } from '@/utils/download'
import { zipFiles } from '@/utils/zip'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import VersionDrawer from './VersionDrawer.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()

/** SKILL.md 标准起始模板（对标 Open WebUI「描述即触发」实践，帮助快速写出可路由的技能） */
const SKILL_TEMPLATE = `# 技能名称

## 触发场景（何时使用）
当用户 …… 时使用本技能，例如：
- 输入「……」→ 执行 ……
- 输入「……」→ 返回 ……

## 输入
- 参数 1：说明（必填）
- 参数 2：说明（可选，默认 ……）

## 执行步骤
1. 解析用户输入，提取关键参数；
2. 按需调用已绑定的 MCP 工具获取数据；
3. 按下述格式整理并输出。

## 输出格式
- 结论：一句话回答用户问题
- 数据：以表格列出关键字段
- 建议：给出 1-3 条可执行建议

## 约束
- 数据缺失时明确说明，不编造数值；
- 标注数据来源（接口/文件名），便于追溯。
`
/** 旧版空内容占位（历史草稿可能残留，视同空白可插入模板） */
const LEGACY_PLACEHOLDER = '# 技能说明\n\n在此编写 SKILL.md（Markdown）……'
const isBlankRootContent = (): boolean => {
  const t = String(draft.value.content || '').trim()
  return !t || t === LEGACY_PLACEHOLDER.trim()
}

const draft = ref<FormDraft>({})
/** 前端可见性「指定套餐」下拉数据源（打开时懒加载，权限不足静默降级为空） */
const plans = ref<ConfigItem[]>([])
/** 编码是否被手动修改过（手改后不再随名称自动生成） */
const codeTouched = ref(false)
const saving = ref(false)
/** 当前选中文件：'root' = SKILL.md；数字 = files 下标 */
const selected = ref<string | number>('root')
/** 自动保存：首次发布拿到 id 后启用 */
const currentId = ref<number | null>(null)
const autosaveAt = ref('')
const autosaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const dirty = ref(false)
let suppress = false
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
/** 最近一次「已保存/已应用」草稿的序列化基线：deep watch 触发时与其比对，无实际变化不写盘 */
let lastSnapshot = ''
const draftSnapshot = (): string => JSON.stringify(draft.value)

// ---------------------------------------------------------------- 打开初始化
watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    currentId.value = props.item?.id ?? null
    autosaveAt.value = ''
    autosaveState.value = 'idle'
    codeTouched.value = Boolean(props.item?.id) // 新建允许名称自动生成编码；编辑存量视为已定
    void ensureScenarios().catch(() => {}) // 场景下拉数据源（共享缓存，失败不阻塞打开）
    if (!plans.value.length) listConfig('plans').then((ps) => { plans.value = ps }).catch(() => {}) // 可见性「指定套餐」数据源
    applyDraft(normalize(JSON.parse(JSON.stringify(props.item || {}))))
  },
  { immediate: true }
)

function normalize(copy: FormDraft): FormDraft {
  const isNew = !copy.id
  const d: FormDraft = { status: 1, platforms: ['1688'], files: [], content: '', ...copy }
  if (!Array.isArray(d.platforms) || !d.platforms.length) d.platforms = ['1688']
  d.platforms = d.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
  if (!Array.isArray(d.files)) d.files = []
  d.files = d.files.map((f) => ({ name: String(f?.name || ''), content: String(f?.content || '') }))
  // v14：前端可见性归一化（缺省=全员可见，与 MCP 保存归一化一致；PLAN 之外的类型清空 planIds）
  if (!d.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(d.visibility.type)) d.visibility = { type: 'PUBLIC', planIds: [] }
  else if (d.visibility.type !== 'PLAN') d.visibility = { type: d.visibility.type, planIds: [] }
  // 空内容：新建预填标准模板（快速起步）；编辑存量保持旧占位提示
  if (!String(d.content || '').trim() || d.content === LEGACY_PLACEHOLDER) {
    d.content = isNew ? SKILL_TEMPLATE : LEGACY_PLACEHOLDER
  }
  return d
}

// ---------------------------------------------------------------- 名称 → 编码建议
/** 新建时名称自动生成编码建议（小写、非法字符转 -）；手改编码后不再覆盖 */
watch(
  () => draft.value.name,
  (name) => {
    if (suppress || !props.canEdit || currentId.value || codeTouched.value) return
    const slug = String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
    if (slug) draft.value.code = slug
  }
)

// ---------------------------------------------------------------- 场景（平台 → 场景，联动场景库）
/** 场景下拉选项：所选平台场景优先置顶（对齐前台「先平台、后场景」） */
const scenarioOptions = computed(() => orderedScenarioOptions(draft.value.platforms))
/** 场景选择/输入：选中历史项回填数值 id；allow-create 输入字符串 → 取/建场景后回填 id；清空置 null（未分组） */
async function onScenarioChange(v: unknown): Promise<void> {
  if (typeof v === 'number') { draft.value.scenarioId = v; return }
  const nm = String(v ?? '').trim()
  if (!nm) { draft.value.scenarioId = null; return }
  const platformId = (draft.value.platforms || []).filter((p) => PLATFORMS.includes(p as PlatformType))[0]
  if (!platformId) { ElMessage.warning('请先选择适用平台，新场景才能归属平台并入库'); draft.value.scenarioId = null; return }
  try {
    const s = await ensureScenario(nm, platformId)
    draft.value.scenarioId = s.id
    ElMessage.success(`已新增场景：${s.name}`)
  } catch (e) {
    draft.value.scenarioId = null
    ElMessage.error(e instanceof Error ? e.message : '场景创建失败')
  }
}

function applyDraft(next: FormDraft): void {
  suppress = true
  draft.value = next
  lastSnapshot = draftSnapshot()
  dirty.value = false
  selected.value = 'root'
  nextTick(() => { suppress = false })
}

// ---------------------------------------------------------------- 自动保存
watch(draft, () => {
  if (suppress) return
  if (draftSnapshot() === lastSnapshot) return // 序列化比对：同值赋值/改回原值不触发写盘
  dirty.value = true
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => void doAutosave(), 1500)
}, { deep: true })

/** UI 侧必填前置校验（对齐 mock 422 规则） */
const missingLabels = computed<string[]>(() => {
  const d = draft.value
  const miss: string[] = []
  if (!String(d.name || '').trim()) miss.push('名称')
  if (!/^[a-zA-Z0-9_-]+$/.test(String(d.code || '').trim())) miss.push('编码（仅字母数字_-）')
  if (!String(d.content || '').trim()) miss.push('SKILL.md 内容')
  const names = (d.files || []).map((f) => String(f.name || '').trim())
  if (names.some((n) => !n)) miss.push('附件文件名')
  if (new Set(names).size !== names.length) miss.push('附件文件名唯一')
  return miss
})
const draftComplete = computed(() => !missingLabels.value.length)

function buildPayload(): FormDraft {
  const d = draft.value
  return {
    id: currentId.value ?? d.id,
    code: d.code, name: d.name, status: d.status,
    platforms: (d.platforms || []).filter((p) => PLATFORMS.includes(p as PlatformType)),
    description: d.description, content: d.content, scenarioId: d.scenarioId ?? null, visibility: d.visibility,
    files: (d.files || []).map((f) => ({ name: String(f.name || '').trim(), content: String(f.content || '') }))
  }
}

let autosaveSeq = 0
async function doAutosave(): Promise<void> {
  if (suppress || !props.canEdit || !currentId.value || !dirty.value || !draftComplete.value) return
  if (draftSnapshot() === lastSnapshot) { dirty.value = false; return } // 定时器触发时内容已回到已保存状态
  const seq = ++autosaveSeq
  autosaveState.value = 'saving'
  try {
    await saveConfig('skills', { ...buildPayload(), skipVersion: true })
    if (seq !== autosaveSeq) return // 保存期间又有新编辑在途，交给最新一次保存收尾
    lastSnapshot = draftSnapshot()
    dirty.value = false
    autosaveState.value = 'saved'
    autosaveAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    autosaveState.value = 'error'
  }
}

const autosaveText = computed(() => {
  if (!props.canEdit) return '只读模式'
  if (!currentId.value) return '新建草稿：首次「发布」后启用自动保存'
  if (autosaveState.value === 'saving') return '自动保存中…'
  if (autosaveState.value === 'saved') return `自动保存于 ${autosaveAt.value}`
  if (autosaveState.value === 'error') return '自动保存失败，请检查填写后重试'
  if (dirty.value && !draftComplete.value) return `必填未完整（${missingLabels.value.join('、')}），暂未自动保存`
  return '自动保存已就绪'
})

// ---------------------------------------------------------------- 文件树
const fileList = computed(() => (draft.value.files || []).map((f, i) => ({ name: f.name, index: i })))
function selectRoot(): void { selected.value = 'root' }
function selectFile(index: number): void { selected.value = index }

async function addFile(): Promise<void> {
  if (!props.canEdit) return
  try {
    const { value } = await ElMessageBox.prompt('输入文件名，可含一级文件夹路径（如 reference.md / docs/reference.md）', '新建附属文件', {
      inputValidator: (v: string) => {
        const t = String(v || '').trim()
        if (!t) return '文件名必填'
        if (t === 'SKILL.md') return 'SKILL.md 为主文档，请编辑左侧根节点'
        if ((draft.value.files || []).some((f) => f.name === t)) return '文件名已存在'
        return true
      }
    })
    draft.value.files!.push({ name: value.trim(), content: '' })
    selected.value = draft.value.files!.length - 1
  } catch { /* 取消 */ }
}

async function removeFile(index: number): Promise<void> {
  if (!props.canEdit) return
  const name = draft.value.files![index]?.name || ''
  try {
    await ElMessageBox.confirm(`删除附属文件「${name}」？`, '删除确认', { type: 'warning' })
  } catch { return }
  draft.value.files!.splice(index, 1)
  if (selected.value === index) selected.value = 'root'
  else if (typeof selected.value === 'number' && selected.value > index) selected.value = selected.value - 1
}

// ---------------------------------------------------------------- 文件树文件夹（首段路径隐式分组，如 docs/a.md → 组 docs）
const treeGroups = computed(() => {
  const folderMap = new Map<string, { name: string; index: number; subPath: string }[]>()
  const loose: { name: string; index: number; subPath: string }[] = []
  for (const f of fileList.value) {
    const i = f.name.indexOf('/')
    if (i > 0) {
      const folder = f.name.slice(0, i)
      if (!folderMap.has(folder)) folderMap.set(folder, [])
      folderMap.get(folder)!.push({ ...f, subPath: f.name.slice(i + 1) })
    } else loose.push({ ...f, subPath: f.name })
  }
  return { folders: [...folderMap.entries()].map(([folder, files]) => ({ folder, files })), loose }
})
const collapsedFolders = ref<Set<string>>(new Set())
function toggleFolder(folder: string): void {
  const s = new Set(collapsedFolders.value)
  if (s.has(folder)) s.delete(folder)
  else s.add(folder)
  collapsedFolders.value = s
}
const knownFolders = computed(() => new Set(treeGroups.value.folders.map((f) => f.folder)))

/** 新建文件夹：先命名文件夹，再创建其中第一个文件（不保留空文件夹） */
async function addFolder(): Promise<void> {
  if (!props.canEdit) return
  let folder = ''
  try {
    const { value } = await ElMessageBox.prompt('输入文件夹名（如 docs / scripts / references）', '新建文件夹', {
      inputValidator: (v: string) => {
        const t = String(v || '').trim()
        if (!t) return '文件夹名必填'
        if (t.includes('/')) return '文件夹名不能包含 /'
        if (knownFolders.value.has(t)) return '文件夹已存在'
        return true
      }
    })
    folder = value.trim()
  } catch { return }
  try {
    const { value } = await ElMessageBox.prompt(`输入「${folder}/」下的第一个文件名（如 reference.md）`, '新建文件夹内文件', {
      inputValidator: (v: string) => {
        const t = String(v || '').trim()
        if (!t) return '文件名必填'
        if (t === 'SKILL.md') return 'SKILL.md 为主文档，请编辑左侧根节点'
        if ((draft.value.files || []).some((f) => f.name === `${folder}/${t}`)) return '文件已存在'
        return true
      }
    })
    draft.value.files!.push({ name: `${folder}/${value.trim()}`, content: '' })
    selected.value = draft.value.files!.length - 1
    ElMessage.success(`已创建文件夹「${folder}/」及首个文件`)
  } catch {
    ElMessage.info('已取消：文件夹需至少包含一个文件')
  }
}

/** 删除文件夹：连同其中全部附属文件 */
async function removeFolder(folder: string): Promise<void> {
  if (!props.canEdit) return
  const count = treeGroups.value.folders.find((g) => g.folder === folder)?.files.length || 0
  try {
    await ElMessageBox.confirm(`删除文件夹「${folder}/」及其 ${count} 个文件？`, '删除确认', { type: 'warning' })
  } catch { return }
  const selectedName = typeof selected.value === 'number' ? draft.value.files![selected.value as number]?.name : null
  draft.value.files = (draft.value.files || []).filter((f) => !f.name.startsWith(`${folder}/`))
  const idx = selectedName ? (draft.value.files || []).findIndex((f) => f.name === selectedName) : -1
  selected.value = idx >= 0 ? idx : 'root'
  ElMessage.success(`已删除文件夹「${folder}/」`)
}

// ---------------------------------------------------------------- 文件树拖拽（文件/文件夹按住拖动）
type DragInfo = { kind: 'file'; index: number } | { kind: 'folder'; folder: string }
const dragInfo = ref<DragInfo | null>(null)
/** 放置目标提示：into:文件夹 | file:下标:before|after | folder:文件夹:before|after | root（拖回根级） */
const dropHint = ref('')

function startDragFile(e: DragEvent, index: number): void {
  if (!props.canEdit) return
  dragInfo.value = { kind: 'file', index }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', draft.value.files?.[index]?.name || '')
  }
}
function startDragFolder(e: DragEvent, folder: string): void {
  if (!props.canEdit) return
  dragInfo.value = { kind: 'folder', folder }
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', folder)
  }
}
function endDrag(): void {
  dragInfo.value = null
  dropHint.value = ''
}

/** 指针位于目标上/下半 → 插入到目标之前/之后 */
function pointerAfter(e: DragEvent): boolean {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return e.clientY > rect.top + rect.height / 2
}
function allowDrop(e: DragEvent): void {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function overFolder(e: DragEvent, folder: string): void {
  const d = dragInfo.value
  if (!d) return
  if (d.kind === 'file') {
    allowDrop(e)
    dropHint.value = `into:${folder}` // 文件 → 移入文件夹
  } else if (d.folder !== folder) {
    allowDrop(e)
    dropHint.value = `folder:${folder}:${pointerAfter(e) ? 'after' : 'before'}` // 文件夹 → 排序
  } else {
    dropHint.value = ''
  }
}
function overFile(e: DragEvent, tIndex: number): void {
  const d = dragInfo.value
  if (!d) return
  if (d.kind !== 'file' || d.index === tIndex) { dropHint.value = ''; return } // 文件夹不能放到文件上；自身不提示
  allowDrop(e)
  dropHint.value = `file:${tIndex}:${pointerAfter(e) ? 'after' : 'before'}`
}
/** 拖到 SKILL.md / 树空白处 → 嵌套文件移出文件夹回到根级 */
function overRootZone(e: DragEvent): void {
  const d = dragInfo.value
  if (!d) return
  const f = d.kind === 'file' ? draft.value.files?.[d.index] : null
  if (!f || !f.name.includes('/')) { dropHint.value = ''; return } // 仅嵌套文件可拖回根级
  allowDrop(e)
  dropHint.value = 'root'
}

/** files 变更后按对象引用修正选中下标（重排/改名不换对象） */
function mutateSelected(fn: () => void): void {
  const files = draft.value.files || []
  const sel = typeof selected.value === 'number' ? files[selected.value] : null
  fn()
  if (sel) {
    const ni = (draft.value.files || []).indexOf(sel)
    selected.value = ni >= 0 ? ni : 'root'
  }
}

function dropOnFolder(e: DragEvent, folder: string): void {
  const d = dragInfo.value
  e.preventDefault()
  if (!d) return
  if (d.kind === 'file') mutateSelected(() => moveFileIntoFolder(d.index, folder))
  else if (d.folder !== folder) mutateSelected(() => moveFolderBeforeFolder(d.folder, folder, dropHint.value.endsWith(':after')))
  dropHint.value = ''
}
function dropOnFile(e: DragEvent, tIndex: number): void {
  const d = dragInfo.value
  e.preventDefault()
  if (!d || d.kind !== 'file' || d.index === tIndex) { dropHint.value = ''; return }
  mutateSelected(() => dropFileOnFile(d.index, tIndex, dropHint.value.endsWith(':after')))
  dropHint.value = ''
}
function dropOnRootZone(e: DragEvent): void {
  const d = dragInfo.value
  e.preventDefault()
  if (!d || d.kind !== 'file') { dropHint.value = ''; return }
  mutateSelected(() => moveFileToRoot(d.index))
  dropHint.value = ''
}

/** 文件拖入文件夹：name 改写为 folder/文件名，落到该组末尾；重名则取消 */
function moveFileIntoFolder(index: number, folder: string): void {
  const files = draft.value.files || []
  const f = files[index]
  if (!f) return
  const base = f.name.slice(f.name.lastIndexOf('/') + 1)
  const target = `${folder}/${base}`
  if (f.name === target) return
  if (files.some((x) => x.name === target)) { ElMessage.warning(`「${target}」已存在，取消移动`); return }
  files.splice(index, 1)
  f.name = target
  let last = -1
  for (let i = 0; i < files.length; i++) if (files[i].name.startsWith(`${folder}/`)) last = i
  files.splice(last + 1, 0, f)
}
/** 文件拖回根级：去掉首段路径前缀，放到散文件区末尾；重名则取消 */
function moveFileToRoot(index: number): void {
  const files = draft.value.files || []
  const f = files[index]
  if (!f || !f.name.includes('/')) return
  const target = f.name.slice(f.name.indexOf('/') + 1)
  if (files.some((x) => x.name === target)) { ElMessage.warning(`「${target}」已存在，取消移动`); return }
  files.splice(index, 1)
  f.name = target
  let last = -1
  for (let i = 0; i < files.length; i++) if (!files[i].name.includes('/')) last = i
  files.splice(last + 1, 0, f)
}
/** 文件拖到另一文件上：同区排序；跨区则移动到目标所在区（根级/目标文件夹）并落到目标前/后 */
function dropFileOnFile(sIndex: number, tIndex: number, after: boolean): void {
  const files = draft.value.files || []
  const s = files[sIndex]
  const t = files[tIndex]
  if (!s || !t) return
  const folderOf = (n: string): string => { const i = n.indexOf('/'); return i > 0 ? n.slice(0, i) : '' }
  const sFolder = folderOf(s.name)
  const tFolder = folderOf(t.name)
  let newName = s.name
  if (sFolder !== tFolder) {
    const base = s.name.slice(s.name.lastIndexOf('/') + 1)
    newName = tFolder ? `${tFolder}/${base}` : base
    if (files.some((x) => x.name === newName)) { ElMessage.warning(`「${newName}」已存在，取消移动`); return }
  }
  files.splice(sIndex, 1)
  s.name = newName
  let at = tIndex
  if (sIndex < tIndex) at -= 1
  files.splice(after ? at + 1 : at, 0, s)
}
/** 文件夹拖到另一文件夹上：整组移动到目标组之前/之后（组序 = 组内文件在 files 中的首现顺序） */
function moveFolderBeforeFolder(src: string, dst: string, after: boolean): void {
  const files = draft.value.files || []
  const srcIdx: number[] = []
  const dstIdx: number[] = []
  files.forEach((f, i) => {
    if (f.name.startsWith(`${src}/`)) srcIdx.push(i)
    else if (f.name.startsWith(`${dst}/`)) dstIdx.push(i)
  })
  if (!srcIdx.length || !dstIdx.length) return
  const moved = srcIdx.map((i) => files[i])
  for (let k = srcIdx.length - 1; k >= 0; k--) files.splice(srcIdx[k], 1)
  // 摘除源组后重算目标组首/末文件位置（两组成员在数组中可能交错，逐个下标平移）
  const shifted = (i: number): number => i - srcIdx.filter((x) => x < i).length
  const at = after ? shifted(dstIdx[dstIdx.length - 1]) + 1 : shifted(dstIdx[0])
  files.splice(at, 0, ...moved)
}

/** 当前编辑内容（SKILL.md ↔ content；附属文件 ↔ files[i].content） */
const currentName = computed(() => (selected.value === 'root' ? 'SKILL.md' : (draft.value.files || [])[selected.value as number]?.name || ''))
const currentContent = computed(() => (selected.value === 'root' ? String(draft.value.content || '') : String((draft.value.files || [])[selected.value as number]?.content || '')))
function setCurrentContent(v: string): void {
  if (selected.value === 'root') draft.value.content = v
  else if (draft.value.files && draft.value.files[selected.value as number]) draft.value.files![selected.value as number].content = v
}


function downloadCurrent(): void {
  if (!currentName.value) return
  downloadTextFile(currentName.value, currentContent.value, 'text/markdown;charset=utf-8')
}

/** 整包下载：SKILL.md + 附属文件 打包 ZIP（对标 Open WebUI 技能 Download） */
function downloadZip(): void {
  const code = String(draft.value.code || '').trim() || 'skill'
  const entries = [
    { name: 'SKILL.md', content: String(draft.value.content || '') },
    ...(draft.value.files || []).map((f) => ({ name: String(f.name || 'file'), content: String(f.content || '') }))
  ]
  downloadBlobFile(`${code}.zip`, zipFiles(entries))
  ElMessage.success(`已下载 ${code}.zip（SKILL.md + ${entries.length - 1} 个附属文件）`)
}

// ---------------------------------------------------------------- 语雀风格编辑器（YuqueEditor 1:1 复刻）
// 编辑器为受控组件：currentContent 下行、setCurrentContent 上行；切换文件 / 弹窗开关由其内部 watch 处理。

/** SKILL.md 空白时插入标准模板（替换旧占位/空内容） */
function insertTemplate(): void {
  if (!props.canEdit || !isBlankRootContent()) return
  draft.value.content = SKILL_TEMPLATE
  ElMessage.success('已插入 SKILL.md 标准模板，按触发场景/输入/步骤/输出格式填写')
}

// ---------------------------------------------------------------- 发布 / 历史版本 / 关闭
const versionDialog = ref(false)
const historyDrawer = ref(false)
/** 版本确认框文案：新建「保存并创建」/ 编辑「发布版本」（对标 Open WebUI 一步语义） */
const confirmProps = computed(() =>
  currentId.value
    ? { title: '发布版本确认', description: '确认后将写库、版本 +1 并生成快照（进入版本历史）。', confirmText: '确认发布' }
    : { title: '创建技能确认', description: '确认后将创建技能并生成首个版本快照；创建成功后启用自动保存。', confirmText: '保存并创建' }
)
function onPublishClick(): void {
  if (!props.canEdit) return
  if (!draftComplete.value) {
    ElMessage.warning(`请先完善：${missingLabels.value.join('、')}`)
    return
  }
  versionDialog.value = true
}

/** Ctrl+S 快捷发布：顶栏按钮已提示快捷键，这里补上实际监听并拦截浏览器默认保存 */
function onGlobalKeydown(e: KeyboardEvent): void {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
  if (!props.modelValue || !props.canEdit || saving.value) return
  e.preventDefault()
  onPublishClick()
}
onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

async function save(v: { versionName: string; note: string }): Promise<void> {
  saving.value = true
  try {
    const resp = await saveConfig('skills', { ...buildPayload(), versionName: v.versionName, note: v.note })
    if (!currentId.value && resp?.id) {
      currentId.value = resp.id
      suppress = true
      draft.value.id = resp.id
      nextTick(() => { suppress = false })
    }
    lastSnapshot = draftSnapshot()
    dirty.value = false
    autosaveState.value = 'saved'
    autosaveAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    ElMessage.success('已发布：版本 +1 并生成快照；启用状态即上架前台')
    emit('saved')
  } finally {
    saving.value = false
  }
}

const historyItem = computed<ConfigItem | null>(() => (currentId.value ? ({ ...draft.value, id: currentId.value } as ConfigItem) : null))
async function onRestored(): Promise<void> {
  if (!currentId.value) return
  const detail = await get<ConfigItem>(`/skills/${currentId.value}`)
  applyDraft(normalize(JSON.parse(JSON.stringify(detail))))
  ElMessage.success('已恢复为所选版本内容')
}

async function tryClose(): Promise<void> {
  if (dirty.value && props.canEdit) {
    try {
      await ElMessageBox.confirm('当前有尚未发布的修改。已自动保存的内容会保留在服务端（不进入版本历史）；必填未完整的编辑内容关闭后将丢失。确认关闭？', '关闭确认', {
        type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '继续编辑'
      })
    } catch { return }
  }
  emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    fullscreen
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    class="skill-editor-dialog"
    append-to-body
  >
    <template #header>
      <div class="se-header">
        <div class="se-header-left">
          <el-button class="back-btn" :icon="ArrowLeft" circle text @click="tryClose" title="关闭（Ctrl+S 发布 · 关闭前会询问）" />
          <div class="title-stack">
            <el-input v-model="draft.name" class="name-input" :disabled="!canEdit" placeholder="未命名技能" />
            <div class="title-meta">
              <el-input v-if="!currentId" v-model="draft.code" class="code-input" :disabled="!canEdit" placeholder="编码（字母数字_-）" title="根据名称自动生成建议编码；手动修改后不再自动覆盖" @input="codeTouched = true" />
              <el-tag v-else size="small" effect="plain" class="code-tag">{{ draft.code || '—' }}</el-tag>
              <span class="autosave" :class="autosaveState">
                <span class="dot" />
                {{ autosaveText }}
              </span>
            </div>
          </div>
        </div>
        <div class="se-header-right">
          <el-switch v-model="draft.status" :disabled="!canEdit" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架" />
          <el-divider direction="vertical" />
          <el-button v-if="currentId" :icon="CircleCheck" plain @click="historyDrawer = true">历史版本</el-button>
          <el-button v-if="canEdit" type="primary" :loading="saving" @click="onPublishClick">
            {{ currentId ? '发布版本' : '保存并创建' }}
            <span class="kbd-hint">Ctrl+S</span>
          </el-button>
        </div>
      </div>
    </template>

    <div class="se-layout">
      <!-- 左侧：文件树 + 元信息 -->
      <aside class="col-left">
        <div class="panel-block">
          <div class="panel-title">
            <span>技能文件</span>
            <el-tag v-if="fileList.length" size="small" type="info" effect="plain" round>{{ fileList.length }}</el-tag>
          </div>
          <div class="tree" :class="{ 'drop-root': dropHint === 'root' }" @dragover="overRootZone" @drop="dropOnRootZone">
            <div class="tree-item" :class="{ active: selected === 'root', 'drop-root': dropHint === 'root' }" @click="selectRoot" @dragover.stop="overRootZone" @drop.stop="dropOnRootZone">
              <span class="tree-icon md-badge">MD</span><span class="tree-name">SKILL.md</span>
            </div>
            <template v-for="g in treeGroups.folders" :key="g.folder">
              <div
                class="tree-item folder-item"
                :class="{ 'drop-into': dropHint === `into:${g.folder}`, 'drop-before': dropHint === `folder:${g.folder}:before`, 'drop-after': dropHint === `folder:${g.folder}:after` }"
                :draggable="canEdit"
                @dragstart="startDragFolder($event, g.folder)"
                @dragend="endDrag"
                @dragover.stop="overFolder($event, g.folder)"
                @drop.stop="dropOnFolder($event, g.folder)"
                @click="toggleFolder(g.folder)"
              >
                <el-icon class="chevron" :class="{ collapsed: collapsedFolders.has(g.folder) }"><CaretRight /></el-icon>
                <el-icon class="tree-icon"><component :is="collapsedFolders.has(g.folder) ? Folder : FolderOpened" /></el-icon>
                <span class="tree-name">{{ g.folder }}/</span>
                <span class="tree-count">{{ g.files.length }}</span>
                <el-icon v-if="canEdit" class="tree-del" title="删除文件夹及其全部文件" @click.stop="removeFolder(g.folder)"><Close /></el-icon>
              </div>
              <template v-if="!collapsedFolders.has(g.folder)">
                <div
                  v-for="f in g.files"
                  :key="f.index"
                  class="tree-item nested"
                  :class="{ active: selected === f.index, 'drop-before': dropHint === `file:${f.index}:before`, 'drop-after': dropHint === `file:${f.index}:after` }"
                  :draggable="canEdit"
                  @dragstart="startDragFile($event, f.index)"
                  @dragend="endDrag"
                  @dragover.stop="overFile($event, f.index)"
                  @drop.stop="dropOnFile($event, f.index)"
                  @click="selectFile(f.index)"
                >
                  <el-icon class="tree-icon"><Document /></el-icon><span class="tree-name">{{ f.subPath || '未命名' }}</span>
                  <el-icon v-if="canEdit" class="tree-del" title="删除文件" @click.stop="removeFile(f.index)"><Close /></el-icon>
                </div>
              </template>
            </template>
            <div
              v-for="f in treeGroups.loose"
              :key="f.index"
              class="tree-item"
              :class="{ active: selected === f.index, 'drop-before': dropHint === `file:${f.index}:before`, 'drop-after': dropHint === `file:${f.index}:after` }"
              :draggable="canEdit"
              @dragstart="startDragFile($event, f.index)"
              @dragend="endDrag"
              @dragover.stop="overFile($event, f.index)"
              @drop.stop="dropOnFile($event, f.index)"
              @click="selectFile(f.index)"
            >
              <el-icon class="tree-icon"><Document /></el-icon><span class="tree-name">{{ f.name || '未命名' }}</span>
              <el-icon v-if="canEdit" class="tree-del" title="删除文件" @click.stop="removeFile(f.index)"><Close /></el-icon>
            </div>
          </div>
          <div v-if="canEdit" class="tree-actions">
            <button class="ghost-add" @click="addFile"><el-icon><Plus /></el-icon> 新建文件</button>
            <button class="ghost-add" @click="addFolder"><el-icon><Plus /></el-icon> 新建文件夹</button>
          </div>
        </div>

        <div class="panel-block">
          <div class="panel-title"><span>元信息</span></div>
          <el-form label-position="top" size="small" :disabled="!canEdit" class="meta-form">
            <el-form-item label="描述（触发意图 · 选填）">
              <el-input v-model="draft.description" type="textarea" :rows="5" placeholder="描述技能何时被触发（路由匹配依据）。&#10;示例：当用户需要查询 1688 商品榜单时使用；输入类目/关键词，返回榜单商品与选品建议。" />
            </el-form-item>
            <el-form-item label="适用平台">
              <el-checkbox-group v-model="draft.platforms!" class="plat-group">
                <el-checkbox v-for="p in PLATFORMS" :key="p" :value="p" border>
                  <span class="plat-badge" :style="{ color: PLATFORM_META[p].color, background: PLATFORM_META[p].bg, borderColor: PLATFORM_META[p].border }">{{ PLATFORM_META[p].label }}</span>
                </el-checkbox>
              </el-checkbox-group>
            </el-form-item>
            <el-form-item label="所属场景">
              <el-select
                :model-value="draft.scenarioId ?? undefined" clearable filterable allow-create default-first-option
                placeholder="选择历史场景，或输入新场景后回车" style="width:100%"
                @change="onScenarioChange"
              >
                <el-option v-for="s in scenarioOptions" :key="s.id" :value="s.id" :label="s.label" />
              </el-select>
            </el-form-item>
            <el-form-item label="前台可见性">
              <el-radio-group v-model="draft.visibility!.type">
                <el-radio-button value="PUBLIC">全员可见</el-radio-button>
                <el-radio-button value="PLAN">指定套餐</el-radio-button>
                <el-radio-button value="PRIVATE">内部隐藏</el-radio-button>
              </el-radio-group>
              <el-select
                v-if="draft.visibility!.type === 'PLAN'"
                v-model="draft.visibility!.planIds" multiple filterable
                style="width:100%;margin-top:8px"
                placeholder="选择对哪些套餐用户可见（不选则不可见）"
              >
                <el-option v-for="p in plans" :key="p.id" :value="p.id" :label="`${p.name}（${p.code}）`" />
              </el-select>
              <p class="muted">仅控制 C 端工作台「技能清单」中的展示；已绑定该技能的专家调用不受影响（隐藏 ≠ 不可调用）。</p>
            </el-form-item>
          </el-form>
        </div>
      </aside>

      <!-- 右侧：语雀风格编辑器（1:1 复刻） -->
      <section class="col-right">
        <div class="editor-bar">
          <span class="bar-title">{{ currentName }}</span>
          <span class="bar-spacer" />
          <el-button v-if="canEdit && selected === 'root' && isBlankRootContent()" size="small" type="primary" plain @click="insertTemplate">插入标准模板</el-button>
          <el-dropdown @command="(c: string) => (c === 'zip' ? downloadZip() : downloadCurrent())">
            <el-button size="small">下载<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="current">当前文件（{{ currentName }}）</el-dropdown-item>
                <el-dropdown-item command="zip">整包 ZIP（SKILL.md + 附属）</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <YuqueEditor
          class="yu-editor"
          :model-value="currentContent"
          :can-edit="canEdit"
          :placeholder="selected === 'root' ? '输入 / 唤起快捷指令，# 空格 一级标题…' : '文件内容…'"
          @update:model-value="setCurrentContent"
        />

        <div class="status-bar">
          <span class="status-file">{{ currentName }}</span>
          <span class="bar-spacer" />
          <span>{{ currentContent.length }} 字</span>
        </div>
      </section>
    </div>

    <VersionConfirmDialog v-model="versionDialog" :title="confirmProps.title" :description="confirmProps.description" :confirm-text="confirmProps.confirmText" @confirm="save" />
    <VersionDrawer v-if="currentId" v-model="historyDrawer" kind="skills" :item="historyItem" :can-edit="canEdit" @restored="onRestored" />
  </el-dialog>
</template>
<style scoped>
/* ---------------- 外壳与顶栏 ---------------- */
.se-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; }
.se-header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.back-btn { flex: 0 0 auto; }
.title-stack { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.name-input { width: 340px; max-width: 100%; }
.name-input :deep(.el-input__wrapper) { box-shadow: none; background: transparent; padding-left: 0; }
.name-input :deep(.el-input__wrapper.is-focus),
.name-input :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px var(--el-border-color-light) inset; padding-left: 11px; }
.name-input :deep(.el-input__inner) { font-size: 17px; font-weight: 600; }
.title-meta { display: flex; align-items: center; gap: 10px; min-width: 0; }
.code-input { width: 210px; }
.code-input :deep(.el-input__wrapper) { padding: 0 8px; }
.code-input :deep(.el-input__inner) { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.code-tag { font-family: ui-monospace, Consolas, monospace; }
.autosave { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.autosave .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--el-text-color-placeholder); transition: background 0.2s; }
.autosave.saving .dot { background: var(--el-color-primary); animation: pulse 1s ease-in-out infinite; }
.autosave.saved { color: var(--el-color-success); }
.autosave.saved .dot { background: var(--el-color-success); }
.autosave.error { color: var(--el-color-danger); }
.autosave.error .dot { background: var(--el-color-danger); }
@keyframes pulse { 50% { opacity: 0.3; } }
.se-header-right { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.kbd-hint { margin-left: 6px; font-size: 11px; line-height: 1; padding: 3px 5px; border: 1px solid rgba(255, 255, 255, 0.45); border-radius: 4px; opacity: 0.9; font-weight: 400; }

/* ---------------- 布局 ---------------- */
.se-layout { display: flex; gap: 14px; height: 100%; }
.col-left { flex: 0 0 300px; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding-right: 2px; }
.col-right { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; }

/* ---------------- 左侧面板卡片 ---------------- */
.panel-block { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; background: var(--el-bg-color); }
.panel-title { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; padding: 10px 12px 8px; color: var(--el-text-color-primary); }
.tree { padding: 0 6px 6px; }
.tree-item { display: flex; align-items: center; gap: 7px; padding: 6px 8px; cursor: pointer; font-size: 13px; border-radius: 6px; color: var(--el-text-color-regular); transition: background 0.12s; }
.tree-item:hover { background: var(--el-fill-color-light); }
.tree-item.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
.tree-icon { font-size: 14px; color: var(--el-text-color-secondary); flex: 0 0 auto; }
.tree-item.active .tree-icon { color: var(--el-color-primary); }
.md-badge { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 14px; border-radius: 3px; background: var(--el-color-primary-light-8); color: var(--el-color-primary); font-size: 9px; font-weight: 700; letter-spacing: 0.5px; }
.chevron { font-size: 12px; color: var(--el-text-color-secondary); transition: transform 0.15s; }
.chevron.collapsed { transform: rotate(0deg); }
.chevron:not(.collapsed) { transform: rotate(90deg); }
.tree-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-count { font-size: 11px; color: var(--el-text-color-secondary); background: var(--el-fill-color); border-radius: 8px; padding: 0 6px; line-height: 16px; }
.tree-item.nested { margin-left: 18px; }
.tree-item.folder-item .tree-name { font-weight: 600; }
.tree-del { flex: 0 0 auto; font-size: 12px; color: var(--el-text-color-placeholder); border-radius: 4px; padding: 2px; opacity: 0; transition: opacity 0.12s, color 0.12s; }
.tree-item:hover .tree-del { opacity: 1; }
.tree-del:hover { color: var(--el-color-danger); background: var(--el-color-danger-light-9); }
/* 拖拽：可拖项抓手光标 + 放置目标高亮（拖入文件夹/拖回根级=填充框，排序=上/下沿线） */
.tree-item[draggable='true'] { cursor: grab; }
.tree-item.drop-into, .tree-item.drop-root, .tree.drop-root { background: var(--el-color-primary-light-9); box-shadow: inset 0 0 0 1px var(--el-color-primary-light-5); }
.tree-item.drop-before { box-shadow: inset 0 2px 0 var(--el-color-primary); }
.tree-item.drop-after { box-shadow: inset 0 -2px 0 var(--el-color-primary); }
.tree-actions { display: flex; gap: 8px; padding: 0 6px 10px; }
.ghost-add { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; color: var(--el-text-color-secondary); background: transparent; border: 1px dashed var(--el-border-color); border-radius: 6px; padding: 5px 0; cursor: pointer; transition: all 0.15s; }
.ghost-add:hover { color: var(--el-color-primary); border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }

/* ---------------- 元信息表单 ---------------- */
.meta-form { padding: 0 12px 12px; }
.meta-form :deep(.el-form-item) { margin-bottom: 12px; }
.meta-form :deep(.el-form-item__label) { font-size: 12px; color: var(--el-text-color-secondary); margin-bottom: 4px; }
.plat-group { display: flex; flex-direction: column; gap: 6px; width: 100%; }
.plat-group :deep(.el-checkbox) { margin-right: 0; height: auto; padding: 5px 10px; border-radius: 6px; width: 100%; }
.plat-badge { font-size: 12px; padding: 0 8px; border-radius: 4px; border: 1px solid; line-height: 20px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; line-height: 1.6; margin: 8px 0 0; }

/* ---------------- 编辑区顶栏 ---------------- */
.editor-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--el-fill-color-lighter); border-radius: 8px; }
.bar-title { font-size: 14px; font-weight: 600; color: var(--el-text-color-primary); }
.bar-spacer { flex: 1; }

/* ---------------- 语雀风格编辑器容器 ---------------- */
.yu-editor { flex: 1; min-height: 0; }

/* ---------------- 底部状态栏 ---------------- */
.status-bar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; height: 26px; font-size: 12px; color: var(--el-text-color-secondary); padding: 0 4px; }
.status-file { font-family: ui-monospace, Consolas, monospace; }
.sep { color: var(--el-border-color); }
</style>
<style>
/* 弹窗根节点由 Element Plus 内部模板渲染（不带本组件 scoped 属性），弹窗级覆盖必须用全局样式；
   类名前缀 .skill-editor-dialog 限定作用域，不会影响其它弹窗 */
/* 全局 .el-dialog{max-width:calc(100vw - 40px)} 会让全屏弹窗两侧露黑边，这里覆盖回真正全屏 */
.skill-editor-dialog.is-fullscreen { max-width: 100vw; width: 100vw; margin: 0; border-radius: 0; padding: 0; display: flex; flex-direction: column; }
.skill-editor-dialog .el-dialog__header { padding: 0; margin: 0; border-bottom: 1px solid var(--el-border-color-light); flex: 0 0 auto; }
.skill-editor-dialog .el-dialog__body { padding: 12px 16px 14px; height: auto; flex: 1 1 0; min-height: 0; overflow: hidden; }
</style>
