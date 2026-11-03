<script setup lang="ts">
/**
 * 专家编排页（v6，Coze 式三栏全屏编排）：
 * 左栏「人设与回复逻辑」；中栏手风琴分组（基础信息/平台/场景/模型/技能/MCP/知识库/标题/简介/介绍/开场白/核心能力/参考提示词/问题建议/能力开关）；
 * v10：标签选择升级为「场景选择」——下拉选历史场景 / 输入新名称自动注册进场景库（归属首个所选平台），对齐前台平台→场景两级。
 * v11：中栏富文本字段（专家标题/专家介绍/开场白）收起为一行摘要预览 +「编辑/删除」按钮，编辑在弹窗内唤起富文本编辑器（RichTextRow），排版更紧凑。
 * v12：专家参考提示词（Markdown 契约列表字段）同样收起为一行摘要 + 弹窗编辑（RichTextRow markdown/removable 模式），删除=移除该项。
 * 右栏对话预览（ExpertChatPreview 复用）。
 * 交互约定：全屏弹窗禁止点空白关闭；关闭按钮先询问；支持「边编辑边自动保存」（skipVersion 不进版本历史，首次发布后启用）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { get } from '@/api/request'
import { saveConfig, listConfig, listModels, listKnowledgeBases, listTools, PLATFORMS, PLATFORM_META, type ConfigItem, type KnowledgeBase, type LlmModel, type PlatformType, type Tool } from '@/api/config'
import { ensureScenario, ensureScenarios, orderedScenarioOptions, scenarioList } from '@/utils/scenarios'
import { CAPABILITY_KEYS, CAPABILITY_LABELS, defaultCapabilities } from '@/api/mock/extension-data'
import YuqueEditor from '@/components/yuque/YuqueEditor.vue'
import RichTextRow from '@/components/RichTextRow.vue'
import FilePreviewDialog from '@/components/FilePreviewDialog.vue'
import { FILE_ACCEPT, MAX_FILE_MB, uploadIntroFile, downloadIntroFile, fileKind, formatSize, type IntroFileMeta } from '@/api/files'
import ExpertChatPreview from './ExpertChatPreview.vue'
import ConfigPickerDialog from './ConfigPickerDialog.vue'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import VersionDrawer from './VersionDrawer.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()

const skills = ref<ConfigItem[]>([])
const servers = ref<ConfigItem[]>([])
const kbs = ref<KnowledgeBase[]>([])
const plans = ref<ConfigItem[]>([])
const models = ref<LlmModel[]>([])
const tools = ref<Tool[]>([]) // v9：绑定级工具裁剪候选集（按服务的已启用工具）
/** 初始即预填归一化默认草稿：打开弹窗的 async 初始化期间模板先行渲染，避免 visibility/nextQuestionConfig/capabilities 读 undefined 崩溃（须在 models 声明之后初始化） */
const draft = ref<FormDraft>(normalize({}))
const saving = ref(false)
const collapse = ref<string[]>(['base', 'platform', 'model'])
/** 自动保存：首次发布拿到 id 后启用；autosaveAt 展示「自动保存于 HH:mm:ss」 */
const currentId = ref<number | null>(null)
const autosaveAt = ref('')
const autosaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const dirty = ref(false)
let suppress = false
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
/** 最近一次「已保存/已应用」草稿的序列化基线：deep watch 触发时与其比对，无实际变化不写盘 */
let lastSnapshot = ''
const draftSnapshot = (): string => JSON.stringify(draft.value)

const enabledModels = computed(() => models.value.filter((m) => m.status === 1))
const baseModelUnavailable = computed(() => Boolean(currentId.value) && !!draft.value.baseModel && !enabledModels.value.some((m) => m.code === draft.value.baseModel))

const skillName = (id: number): string => skills.value.find((s) => s.id === id)?.name || `#${id}`
const serverName = (id: number): string => servers.value.find((s) => s.id === id)?.name || `#${id}`
const kbName = (id: number): string => kbs.value.find((k) => k.id === id)?.name || `#${id}`

// ---------------------------------------------------------------- 场景（平台 → 场景，联动场景库）
/** 场景下拉选项：所选平台场景优先置顶（对齐前台「先平台、后场景」） */
const scenarioOptions = computed(() => orderedScenarioOptions(draft.value.platforms))
/** 选择/输入场景后：把不在场景库的新名称注册进场景库（归属首个所选平台）；程序化赋值不触发 @change，打开旧数据不会误建 */
async function onScenariosChange(names: unknown[]): Promise<void> {
  const fresh = names.map((n) => String(n || '').trim()).filter((n) => n && !scenarioList().some((s) => s.name === n))
  if (!fresh.length) return
  const platformId = (draft.value.platforms || []).filter((p) => PLATFORMS.includes(p as PlatformType))[0]
  if (!platformId) { ElMessage.warning('请先选择适用平台，新场景才能归属平台并入库'); return }
  try {
    for (const nm of fresh) await ensureScenario(nm, platformId)
    ElMessage.success(`已新增场景：${fresh.join('、')}`)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '场景创建失败')
  }
}

// ---------------------------------------------------------------- 打开初始化
watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return
    // 每次打开都重拉选择器数据源，避免期间新建的技能/MCP/知识库/套餐/模型不可见
    const [sk, sv, kbList, pl, md, tl] = await Promise.all([listConfig('skills'), listConfig('mcp/servers'), listKnowledgeBases(), listConfig('plans'), listModels({ page: 1, pageSize: 200 }), listTools()])
    skills.value = sk; servers.value = sv; kbs.value = kbList; plans.value = pl; models.value = md.list; tools.value = tl
    void ensureScenarios().catch(() => {}) // 场景下拉数据源（共享缓存，失败不阻塞打开）
    currentId.value = props.item?.id ?? null
    autosaveAt.value = ''
    autosaveState.value = currentId.value ? 'idle' : 'idle'
    applyDraft(normalize(JSON.parse(JSON.stringify(props.item || {}))))
  },
  { immediate: true }
)

/** 草稿归一化（对齐旧表单防御 + v6 编排字段默认值） */
function normalize(copy: FormDraft): FormDraft {
  const d: FormDraft = {
    capabilities: defaultCapabilities(), tags: [], suggestedQuestions: [], skillIds: [], mcpServerIds: [], knowledgeBaseIds: [],
    systemPrompt: '', coreAbilities: [], referencePrompts: [], titleHtml: '', introduction: '', greeting: '', introductionFiles: [],
    baseModel: 'glm-5.3', platforms: ['1688'], visibility: { type: 'PUBLIC', planIds: [] }, status: 1, isDefault: false,
    nextQuestionConfig: { enabled: true, mode: 'default' },
    ...copy
  }
  if (!Array.isArray(d.platforms)) d.platforms = ['1688']
  d.platforms = d.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
  if (!d.platforms.length) d.platforms = ['1688']
  if (!d.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(d.visibility.type || '')) d.visibility = { type: 'PUBLIC', planIds: [] }
  if (!d.mcpToolSelection || typeof d.mcpToolSelection !== 'object' || Array.isArray(d.mcpToolSelection)) d.mcpToolSelection = {} // v9：绑定级工具裁剪防御
  if (!d.capabilities || typeof d.capabilities !== 'object') d.capabilities = defaultCapabilities()
  if (!Array.isArray(d.introductionFiles)) d.introductionFiles = []
  if (!d.nextQuestionConfig || typeof d.nextQuestionConfig !== 'object') d.nextQuestionConfig = { enabled: true, mode: 'default' }
  const nq = d.nextQuestionConfig
  if (typeof nq.enabled !== 'boolean') nq.enabled = true
  if (nq.mode !== 'default' && nq.mode !== 'custom') nq.mode = 'default'
  const mp = (d.modelParams && typeof d.modelParams === 'object' && !Array.isArray(d.modelParams)) ? (d.modelParams = { ...d.modelParams }) : (d.modelParams = {})
  if (typeof mp.temperature !== 'number' || Number.isNaN(mp.temperature)) {
    const dm = models.value.find((x) => x.code === d.baseModel)?.defaultParams
    const dt = dm && typeof dm === 'object' ? (dm as Record<string, unknown>).temperature : undefined
    mp.temperature = typeof dt === 'number' ? dt : 0.7
  }
  return d
}

function applyDraft(next: FormDraft): void {
  suppress = true
  draft.value = next
  lastSnapshot = draftSnapshot()
  dirty.value = false
  nextTick(() => { suppress = false })
}

/** 生成温度双向绑定（写入 modelParams.temperature，0–2 步进 0.1） */
const temperature = computed<number>({
  get: () => {
    const mp = draft.value.modelParams as Record<string, unknown> | undefined
    const t = mp && typeof mp === 'object' ? Number(mp.temperature) : NaN
    return Number.isFinite(t) ? t : 0.7
  },
  set: (v) => { draft.value.modelParams = { ...((draft.value.modelParams as Record<string, unknown> | undefined) || {}), temperature: v } }
})

// ---------------------------------------------------------------- 自动保存
watch(draft, () => {
  if (suppress) return
  if (draftSnapshot() === lastSnapshot) return // 序列化比对：同值赋值/改回原值不触发写盘
  dirty.value = true
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => void doAutosave(), 1500)
}, { deep: true })

/** UI 侧必填前置校验（对齐 mock 422 规则）：不完整则跳过自动保存并提示缺项 */
const missingLabels = computed<string[]>(() => {
  const d = draft.value
  const miss: string[] = []
  if (!String(d.name || '').trim()) miss.push('显示名')
  if (!/^[a-zA-Z0-9_-]+$/.test(String(d.code || '').trim())) miss.push('助手ID（仅字母数字_-）')
  if (!String(d.systemPrompt || '').trim()) miss.push('人设与回复逻辑')
  if (!enabledModels.value.some((m) => m.code === d.baseModel)) miss.push('基础模型')
  if (!String(d.description || '').trim()) miss.push('专家简介')
  if (!(d.platforms || []).length) miss.push('平台')
  if (!(d.suggestedQuestions || []).every((q) => String(q).trim())) miss.push('建议问题')
  if (!(d.tags || []).every((t) => String(t).trim())) miss.push('场景')
  if (d.nextQuestionConfig?.mode === 'custom' && !String(d.nextQuestionConfig.customPrompt || '').trim()) miss.push('问题建议·自定义提示词')
  return miss
})
const draftComplete = computed(() => !missingLabels.value.length)

function buildPayload(): FormDraft {
  const d = draft.value
  return {
    id: currentId.value ?? d.id,
    code: d.code, name: d.name, description: d.description, avatarUrl: d.avatarUrl, baseModel: d.baseModel,
    platforms: (d.platforms || []).filter((p) => PLATFORMS.includes(p as PlatformType)),
    systemPrompt: d.systemPrompt, skillIds: d.skillIds || [], mcpServerIds: d.mcpServerIds || [], knowledgeBaseIds: d.knowledgeBaseIds || [],
    mcpToolSelection: d.mcpToolSelection || {}, // v9：绑定级工具裁剪（空对象 = 全部放开，后端归一化后不落库）
    suggestedQuestions: (d.suggestedQuestions || []).map((q) => String(q).trim()).filter(Boolean),
    capabilities: defaultCapabilities(d.capabilities || {}),
    modelParams: { ...((d.modelParams as Record<string, unknown> | undefined) || {}) },
    tags: (d.tags || []).map((t) => String(t).trim()).filter(Boolean),
    visibility: { type: d.visibility?.type || 'PUBLIC', planIds: d.visibility?.type === 'PLAN' ? d.visibility?.planIds || [] : [] },
    status: d.status, isDefault: Boolean(d.isDefault),
    titleHtml: d.titleHtml || '', introduction: d.introduction || '', greeting: d.greeting || '',
    introductionFiles: (d.introductionFiles || []).map((f) => ({ ...f })),
    coreAbilities: (d.coreAbilities || []).map((s) => String(s).trim()).filter(Boolean),
    referencePrompts: (d.referencePrompts || []).map((s) => String(s).trim()).filter(Boolean),
    nextQuestionConfig: d.nextQuestionConfig ? { ...d.nextQuestionConfig } : { enabled: true, mode: 'default' }
  }
}

let autosaveSeq = 0
async function doAutosave(): Promise<void> {
  if (suppress || !props.canEdit || !currentId.value || !dirty.value || !draftComplete.value) return
  if (draftSnapshot() === lastSnapshot) { dirty.value = false; return } // 定时器触发时内容已回到已保存状态
  const seq = ++autosaveSeq
  autosaveState.value = 'saving'
  try {
    await saveConfig('experts', { ...buildPayload(), skipVersion: true })
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

// ---------------------------------------------------------------- 技能 / MCP 选择（Coze 式弹窗）
const picker = ref<{ visible: boolean; type: 'skill' | 'mcp' | 'knowledge' }>({ visible: false, type: 'skill' })
const pickerIds = computed(() =>
  picker.value.type === 'skill' ? draft.value.skillIds || [] : picker.value.type === 'knowledge' ? draft.value.knowledgeBaseIds || [] : draft.value.mcpServerIds || []
)
function onPickerConfirm(ids: number[]): void {
  if (picker.value.type === 'skill') draft.value.skillIds = ids
  else if (picker.value.type === 'knowledge') draft.value.knowledgeBaseIds = ids
  else {
    draft.value.mcpServerIds = ids
    // v9：同步清理已移除服务的裁剪条目（悬空 key 不入库）
    const sel: Record<string, number[]> = {}
    for (const id of ids) { const v = draft.value.mcpToolSelection?.[String(id)]; if (v?.length) sel[String(id)] = v }
    draft.value.mcpToolSelection = sel
  }
}

// ---------------------------------------------------------------- v9 绑定级 MCP 工具裁剪
/** 该服务当前已启用的工具（裁剪候选集） */
function enabledToolsOf(serverId: number): Tool[] { return tools.value.filter((t) => t.serverId === serverId && t.enabled) }
/** 勾选变化：空 = 放开全部（删 key 不落配置） */
function onToolSelChange(serverId: number, ids: Array<string | number>): void {
  const numIds = ids.map(Number)
  const sel = { ...(draft.value.mcpToolSelection || {}) }
  if (numIds.length) sel[String(serverId)] = [...new Set(numIds)]
  else delete sel[String(serverId)]
  draft.value.mcpToolSelection = sel
}

// ---------------------------------------------------------------- 专家介绍附件（图片/PDF/文档 上传与预览）
const introFileInput = ref<HTMLInputElement | null>(null)
const introUploading = ref(false)
const previewFile = ref<IntroFileMeta | null>(null)
const previewVisible = ref(false)

function pickIntroFiles(): void {
  introFileInput.value?.click()
}

async function onIntroFilesChosen(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = '' // 立即清空，便于重复选择同一文件
  if (!files.length || !props.canEdit) return
  introUploading.value = true
  try {
    for (const f of files) {
      try {
        const meta = await uploadIntroFile(f)
        draft.value.introductionFiles = [...(draft.value.introductionFiles || []), meta]
      } catch (err) {
        ElMessage.error(err instanceof Error ? err.message : `「${f.name}」上传失败`)
      }
    }
  } finally {
    introUploading.value = false
  }
}

function removeIntroFile(idx: number): void {
  // 仅从配置移除元数据；文件实体保留（历史版本快照仍引用该 id，恢复版本后预览不失效）
  draft.value.introductionFiles = (draft.value.introductionFiles || []).filter((_, i) => i !== idx)
}

function previewIntroFile(f: IntroFileMeta): void {
  previewFile.value = f
  previewVisible.value = true
}

// ---------------------------------------------------------------- 用户问题建议设置弹窗（图5）
const nqDialog = ref(false)
const nqDraft = ref<{ enabled: boolean; model: string; mode: 'default' | 'custom'; customPrompt: string }>({ enabled: true, model: '', mode: 'default', customPrompt: '' })
function openNqDialog(): void {
  const nq = draft.value.nextQuestionConfig || { enabled: true, mode: 'default' as const }
  nqDraft.value = { enabled: nq.enabled, model: nq.model || '', mode: nq.mode, customPrompt: nq.customPrompt || '' }
  nqDialog.value = true
}
function saveNq(): void {
  if (nqDraft.value.mode === 'custom' && !nqDraft.value.customPrompt.trim()) {
    ElMessage.warning('自定义提示词模式下须填写提示词内容')
    return
  }
  draft.value.nextQuestionConfig = { ...nqDraft.value, customPrompt: nqDraft.value.customPrompt.trim() || undefined }
  nqDialog.value = false
}

// ---------------------------------------------------------------- 发布 / 历史版本 / 关闭
const versionDialog = ref(false)
const historyDrawer = ref(false)
function onPublishClick(): void {
  if (!props.canEdit) return
  if (!draftComplete.value) {
    ElMessage.warning(`请先完善：${missingLabels.value.join('、')}`)
    return
  }
  versionDialog.value = true
}

async function save(v: { versionName: string; note: string }): Promise<void> {
  saving.value = true
  try {
    const resp = await saveConfig('experts', { ...buildPayload(), versionName: v.versionName, note: v.note })
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
    versionDialog.value = false
    emit('saved')
  } finally {
    saving.value = false
  }
}

/** 历史版本项（VersionDrawer 按 id 拉取快照） */
const historyItem = computed<ConfigItem | null>(() => (currentId.value ? ({ ...draft.value, id: currentId.value } as ConfigItem) : null))
/** 恢复版本后以服务端最新内容重刷草稿（自动保存同步跟进） */
async function onRestored(): Promise<void> {
  if (!currentId.value) return
  const detail = await get<ConfigItem>(`/experts/${currentId.value}`)
  applyDraft(normalize(JSON.parse(JSON.stringify(detail))))
  ElMessage.success('已恢复为所选版本内容')
}

/** 关闭确认：有未发布修改（自动保存窗口内 / 必填未完整）时先询问 */
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

// ---------------------------------------------------------------- 三栏拖拽调整列宽
/** 默认列宽：两边宽、中间窄（按视口比例分配，1280 视口≈左 512 / 右 384），拖拽后以内联样式为准 */
const VW = window.innerWidth
const DEFAULT_LEFT = Math.round(VW * 0.4)
const DEFAULT_RIGHT = Math.round(VW * 0.3)
const MIN_LEFT = 200
const MAX_LEFT = Math.round(VW * 0.62)
const MIN_RIGHT = 240
const MAX_RIGHT = Math.round(VW * 0.5)

const leftWidth = ref(DEFAULT_LEFT)
const rightWidth = ref(DEFAULT_RIGHT)
const dragging = ref<'left' | 'right' | null>(null)
const dragStartX = ref(0)
const dragStartWidth = ref(0)

function onHandleMouseDown(side: 'left' | 'right', e: MouseEvent): void {
  e.preventDefault()
  dragging.value = side
  dragStartX.value = e.clientX
  dragStartWidth.value = side === 'left' ? leftWidth.value : rightWidth.value
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(e: MouseEvent): void {
  if (!dragging.value) return
  const dx = e.clientX - dragStartX.value
  if (dragging.value === 'left') {
    leftWidth.value = Math.max(MIN_LEFT, Math.min(MAX_LEFT, dragStartWidth.value + dx))
  } else {
    rightWidth.value = Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, dragStartWidth.value - dx))
  }
}

function onMouseUp(): void {
  dragging.value = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
})
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    fullscreen
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    class="orchestrator-dialog"
    append-to-body
  >
    <template #header>
      <div class="orch-header">
        <div class="orch-header-left">
          <span class="back-btn" title="关闭（先询问）" @click="tryClose">←</span>
          <el-input v-model="draft.name" class="name-input" :disabled="!canEdit" placeholder="未命名专家" />
          <el-tag v-if="draft.code" size="small" effect="plain">{{ draft.code }}</el-tag>
          <el-tag size="small" :type="draft.status === 1 ? 'success' : 'info'" effect="plain">{{ draft.status === 1 ? '已上架' : '未上架' }}</el-tag>
          <span class="autosave" :class="autosaveState">{{ autosaveText }}</span>
        </div>
        <div class="orch-header-right">
          <el-button v-if="currentId" @click="historyDrawer = true">历史版本</el-button>
          <el-button v-if="canEdit" type="primary" :loading="saving" @click="onPublishClick">发布版本</el-button>
          <el-button @click="tryClose">关闭</el-button>
        </div>
      </div>
    </template>

    <div class="orch-layout">
      <!-- 左栏：人设与回复逻辑 -->
      <aside class="col-left" :style="{ flexBasis: leftWidth + 'px' }">
        <div class="panel-title">人设与回复逻辑</div>
        <p class="muted">作为 System Prompt 注入对话；约定角色设定、技能路由规则、工具调用纪律与输出格式。</p>
        <YuqueEditor
          v-model="draft.systemPrompt!"
          :can-edit="canEdit"
          :min-height="320"
          placeholder="你是一位跨境电商选品专家…"
        />
      </aside>

      <!-- 左/中拖动手柄 -->
      <div class="resize-handle" :class="{ active: dragging === 'left' }" @mousedown="onHandleMouseDown('left', $event)">
        <div class="resize-handle-line"></div>
      </div>

      <!-- 中栏：编排手风琴 -->
      <section class="col-mid">
        <el-collapse v-model="collapse">
          <el-collapse-item name="base">
            <template #title><span class="sec-title">基础信息与上架</span></template>
            <el-form label-width="96px" :disabled="!canEdit">
              <el-form-item label="助手 ID">
                <el-input v-model="draft.code" :disabled="Boolean(currentId)" placeholder="如 product-selection-assistant（创建后不可改）" />
              </el-form-item>
              <el-form-item label="头像 URL"><el-input v-model="draft.avatarUrl" placeholder="https://..." /></el-form-item>
              <el-form-item label="上架状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用（上架到前台）" inactive-text="停用（前台不可见）" /></el-form-item>
              <el-form-item label="默认专家"><el-switch v-model="draft.isDefault" /></el-form-item>
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
                <p class="muted">仅控制 C 端工作台「专家清单」中的展示；已获授权用户的对话调用不受影响（隐藏 ≠ 不可用）。</p>
              </el-form-item>
            </el-form>
          </el-collapse-item>

          <el-collapse-item name="platform">
            <template #title><span class="sec-title">平台选择</span></template>
            <el-checkbox-group v-model="draft.platforms" :disabled="!canEdit">
              <el-checkbox v-for="p in PLATFORMS" :key="p" :value="p">
                <span class="plat-badge" :style="{ color: PLATFORM_META[p].color, background: PLATFORM_META[p].bg, borderColor: PLATFORM_META[p].border }">{{ PLATFORM_META[p].label }}</span>
              </el-checkbox>
            </el-checkbox-group>
            <p class="muted">平台维度多选（至少一个）；技能 / MCP 列表将按所选平台过滤。</p>
          </el-collapse-item>

          <el-collapse-item name="tags">
            <template #title><span class="sec-title">场景选择</span></template>
            <el-select v-model="draft.tags" multiple filterable allow-create default-first-option placeholder="选择历史场景，或输入新场景后回车" style="width:100%" :disabled="!canEdit" @change="onScenariosChange">
              <el-option v-for="s in scenarioOptions" :key="s.id" :value="s.name" :label="s.label" />
            </el-select>
            <p class="muted">对齐前台「平台 → 场景」：下拉可选历史场景，输入新名称回车自动创建并归入首个所选平台。</p>
          </el-collapse-item>

          <el-collapse-item name="model">
            <template #title><span class="sec-title">模型选择</span></template>
            <el-form label-width="96px" :disabled="!canEdit">
              <el-form-item label="基础模型">
                <el-select v-model="draft.baseModel" filterable style="width:100%">
                  <el-option v-for="m in enabledModels" :key="m.code" :value="m.code" :label="`${m.name}（${m.code}）`" />
                </el-select>
                <el-alert v-if="baseModelUnavailable" type="warning" :closable="false" style="margin-top:6px" title="当前基础模型已停用或删除，保留原值；建议更换为启用模型。" />
              </el-form-item>
              <el-form-item label="生成温度">
                <el-slider v-model="temperature" :min="0" :max="2" :step="0.1" show-input :show-input-controls="false" input-size="small" />
              </el-form-item>
            </el-form>
          </el-collapse-item>

          <el-collapse-item name="skills">
            <template #title><span class="sec-title">技能选择</span></template>
            <div class="chip-box">
              <el-tag v-for="id in draft.skillIds" :key="id" closable :disable-transitions="true" effect="plain" @close="canEdit && (draft.skillIds = draft.skillIds!.filter((x) => x !== id))">{{ skillName(id) }}</el-tag>
              <el-button size="small" :disabled="!canEdit" @click="picker = { visible: true, type: 'skill' }">＋ 添加技能</el-button>
            </div>
            <p class="muted">已选 {{ (draft.skillIds || []).length }} 项；仅显示与所选平台有交集的启用技能。</p>
          </el-collapse-item>

          <el-collapse-item name="mcp">
            <template #title><span class="sec-title">MCP 选择</span></template>
            <div class="chip-box">
              <el-tag v-for="id in draft.mcpServerIds" :key="id" closable :disable-transitions="true" type="warning" effect="plain" @close="canEdit && (draft.mcpServerIds = draft.mcpServerIds!.filter((x) => x !== id))">{{ serverName(id) }}</el-tag>
              <el-button size="small" :disabled="!canEdit" @click="picker = { visible: true, type: 'mcp' }">＋ 添加 MCP</el-button>
            </div>
            <p class="muted">已选 {{ (draft.mcpServerIds || []).length }} 项；仅显示与所选平台有交集的启用 MCP 插件。</p>
            <!-- v9 绑定级工具裁剪：按服务勾选允许调用的工具子集；不勾选 = 放开全部已启用工具（调用时取交集，隐藏的 MCP 服务不受此影响） -->
            <div v-for="sid in draft.mcpServerIds" :key="`tsel-${sid}`" class="tool-sel-row">
              <div class="tool-sel-head">
                <span class="tool-sel-name">{{ serverName(sid) }} · 工具白名单</span>
                <span class="muted">不勾选 = 放开全部已启用工具（{{ enabledToolsOf(sid).length }} 个）</span>
              </div>
              <el-checkbox-group
                v-if="enabledToolsOf(sid).length"
                :model-value="(draft.mcpToolSelection || {})[String(sid)] || []"
                :disabled="!canEdit"
                size="small"
                @change="(v: Array<string | number>) => onToolSelChange(sid, v)"
              >
                <el-checkbox v-for="t in enabledToolsOf(sid)" :key="t.id" :value="t.id">{{ t.name }}</el-checkbox>
              </el-checkbox-group>
              <p v-else class="muted">该服务暂无已启用工具，请先到「MCP 服务」页发现并启用工具。</p>
            </div>
          </el-collapse-item>

          <el-collapse-item name="knowledge">
            <template #title><span class="sec-title">知识库选择</span></template>
            <div class="chip-box">
              <el-tag v-for="id in draft.knowledgeBaseIds" :key="id" closable :disable-transitions="true" type="success" effect="plain" @close="canEdit && (draft.knowledgeBaseIds = draft.knowledgeBaseIds!.filter((x) => x !== id))">{{ kbName(id) }}</el-tag>
              <el-button size="small" :disabled="!canEdit" @click="picker = { visible: true, type: 'knowledge' }">＋ 添加知识库</el-button>
            </div>
            <p class="muted">已选 {{ (draft.knowledgeBaseIds || []).length }} 项；无平台知识库视为通用，全部可选。</p>
          </el-collapse-item>

          <el-collapse-item name="title">
            <template #title><span class="sec-title">专家标题 <small class="muted">（前台卡片大标题，支持富文本）</small></span></template>
            <RichTextRow v-model="draft.titleHtml!" title="专家标题" :maxlength="200" :can-edit="canEdit" placeholder="如：1688 分销选品专家" />
          </el-collapse-item>

          <el-collapse-item name="intro">
            <template #title><span class="sec-title">专家简介 <small class="muted">（前台卡片副标题）</small></span></template>
            <el-input v-model="draft.description" type="textarea" :rows="2" :disabled="!canEdit" placeholder="一句话说明专家能解决什么问题" />
          </el-collapse-item>

          <el-collapse-item name="detail">
            <template #title><span class="sec-title">专家介绍 <small class="muted">（前台详情长文，支持富文本）</small></span></template>
            <RichTextRow v-model="draft.introduction!" title="专家介绍" :maxlength="2000" :can-edit="canEdit" placeholder="详细介绍专家的能力边界、适用场景与使用建议…" />
            <div class="attach-box">
              <div class="attach-head">
                <span class="attach-title">介绍附件</span>
                <span class="muted">支持图片 / PDF / Word / Excel / PPT / 文本，单文件 ≤ {{ MAX_FILE_MB }}MB，可在线预览与下载</span>
              </div>
              <input ref="introFileInput" type="file" :accept="FILE_ACCEPT" multiple style="display:none" @change="onIntroFilesChosen" />
              <div v-if="(draft.introductionFiles || []).length" class="attach-list">
                <div v-for="(f, i) in draft.introductionFiles" :key="f.id" class="attach-row">
                  <span class="attach-emoji">{{ fileKind(f).emoji }}</span>
                  <span class="attach-name" :title="f.name">{{ f.name }}</span>
                  <el-tag size="small" effect="plain">{{ fileKind(f).label }}</el-tag>
                  <span class="muted attach-size">{{ formatSize(f.size) }}</span>
                  <el-button link type="primary" size="small" @click="previewIntroFile(f)">预览</el-button>
                  <el-button link type="primary" size="small" @click="downloadIntroFile(f)">下载</el-button>
                  <el-button v-if="canEdit" link type="danger" size="small" @click="removeIntroFile(i)">删除</el-button>
                </div>
              </div>
              <el-button size="small" :loading="introUploading" :disabled="!canEdit" @click="pickIntroFiles">＋ 上传附件</el-button>
            </div>
          </el-collapse-item>

          <el-collapse-item name="greeting">
            <template #title><span class="sec-title">开场白 <small class="muted">（会话首条消息，支持富文本）</small></span></template>
            <RichTextRow v-model="draft.greeting!" title="开场白" :maxlength="500" :can-edit="canEdit" placeholder="你好！我是…可以帮你…" />
          </el-collapse-item>

          <el-collapse-item name="abilities">
            <template #title><span class="sec-title">专家核心能力 <small class="muted">（前台蓝色链接列表）</small></span></template>
            <div v-for="(a, i) in draft.coreAbilities" :key="i" class="row-list">
              <el-input :model-value="a" :disabled="!canEdit" placeholder="如：热销榜选品与类目趋势分析" @update:model-value="draft.coreAbilities![i] = $event" />
              <el-button :disabled="!canEdit" link type="danger" @click="draft.coreAbilities!.splice(i, 1)">删除</el-button>
            </div>
            <el-button size="small" :disabled="!canEdit" @click="draft.coreAbilities!.push('')">添加核心能力</el-button>
          </el-collapse-item>

          <el-collapse-item name="refprompts">
            <template #title><span class="sec-title">专家参考提示词 <small class="muted">（前台紫色高亮框，可一键填入输入框）</small></span></template>
            <div v-for="(p, i) in draft.referencePrompts" :key="i" class="row-list">
              <RichTextRow :model-value="p" markdown removable title="参考提示词" placeholder="如：帮我分析最近 7 天 1688 家居类目的热销趋势" :can-edit="canEdit" @update:model-value="draft.referencePrompts![i] = $event" @remove="draft.referencePrompts!.splice(i, 1)" />
            </div>
            <el-button size="small" :disabled="!canEdit" @click="draft.referencePrompts!.push('')">添加参考提示词</el-button>
          </el-collapse-item>

          <el-collapse-item name="nq">
            <template #title><span class="sec-title">用户问题建议</span></template>
            <div class="nq-row">
              <el-switch v-model="draft.nextQuestionConfig!.enabled" :disabled="!canEdit" active-text="启用下一步问题建议" />
              <el-button size="small" :disabled="!canEdit" @click="openNqDialog">下一步问题建议设置</el-button>
            </div>
            <p class="muted">
              模型：{{ draft.nextQuestionConfig!.model ? (models.find((m) => m.code === draft.nextQuestionConfig!.model)?.name || draft.nextQuestionConfig!.model) : '跟随专家基础模型' }}
              · 提示词：{{ draft.nextQuestionConfig!.mode === 'custom' ? '自定义' : '系统默认' }}
            </p>
            <div v-for="(q, i) in draft.suggestedQuestions" :key="i" class="row-list">
              <el-input :model-value="q" :disabled="!canEdit" placeholder="前台打开专家时展示的示例任务" @update:model-value="draft.suggestedQuestions![i] = $event" />
              <el-button :disabled="!canEdit" link type="danger" @click="draft.suggestedQuestions!.splice(i, 1)">删除</el-button>
            </div>
            <el-button size="small" :disabled="!canEdit" @click="draft.suggestedQuestions!.push('')">添加建议问题</el-button>
          </el-collapse-item>

          <el-collapse-item name="caps">
            <template #title><span class="sec-title">能力选择</span></template>
            <div class="caps-grid">
              <div v-for="k in CAPABILITY_KEYS" :key="k" class="cap-item">
                <el-switch v-model="draft.capabilities![k]" :disabled="!canEdit" />
                <span class="cap-label">{{ CAPABILITY_LABELS[k] || k }}</span>
                <small class="muted">{{ k }}</small>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </section>

      <!-- 中/右拖动手柄 -->
      <div class="resize-handle" :class="{ active: dragging === 'right' }" @mousedown="onHandleMouseDown('right', $event)">
        <div class="resize-handle-line"></div>
      </div>

      <!-- 右栏：对话预览 -->
      <aside class="col-right" :style="{ flexBasis: rightWidth + 'px' }">
        <ExpertChatPreview :draft="draft" :models="models" />
      </aside>
    </div>

    <ConfigPickerDialog v-model="picker.visible" :type="picker.type" :platforms="(draft.platforms || []) as PlatformType[]" :selected-ids="pickerIds" :skills="skills" :servers="servers" :knowledge-bases="kbs" @confirm="onPickerConfirm" />

    <el-dialog v-model="nqDialog" title="下一步问题建议设置" width="560px" :close-on-click-modal="false" :close-on-press-escape="false" append-to-body>
      <el-form label-width="88px">
        <el-form-item label="生成模型">
          <el-select v-model="nqDraft.model" clearable filterable style="width:100%" placeholder="不选则跟随专家基础模型">
            <el-option v-for="m in enabledModels" :key="m.code" :value="m.code" :label="`${m.name}（${m.code}）`" />
          </el-select>
        </el-form-item>
        <el-form-item label="提示词">
          <el-radio-group v-model="nqDraft.mode">
            <el-radio value="default">系统默认</el-radio>
            <el-radio value="custom">自定义</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="nqDraft.mode === 'custom'" label="提示词内容">
          <el-input v-model="nqDraft.customPrompt" type="textarea" :rows="5" placeholder="基于本轮对话与用户输入，生成 3 条用户最可能继续追问的问题…" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="nqDialog = false">取消</el-button>
        <el-button type="primary" @click="saveNq">保存</el-button>
      </template>
    </el-dialog>

    <VersionConfirmDialog v-model="versionDialog" title="发布版本确认" description="确认后将写库、版本 +1 并生成快照（进入版本历史）。" async :loading="saving" @confirm="save" />
    <VersionDrawer v-if="currentId" v-model="historyDrawer" kind="experts" :item="historyItem" :can-edit="canEdit" @restored="onRestored" />
    <FilePreviewDialog v-model="previewVisible" :file="previewFile" />
  </el-dialog>
</template>
<style scoped>
/* append-to-body 后 scoped data-v 不落在 .el-dialog 上，:deep(.el-dialog__body) 匹配不到，
   弹窗会整体滚动（左右栏跟着滚）。改用 :global 精确命中本弹窗结构：
   弹窗纵向 flex 锁死高度，只有中栏（.col-mid）滚动。 */
:global(.el-dialog.orchestrator-dialog) { display: flex; flex-direction: column; overflow: hidden; }
:global(.el-dialog.orchestrator-dialog .el-dialog__header) { padding: 0; margin: 0; border-bottom: 1px solid var(--el-border-color-light); flex: none; }
:global(.el-dialog.orchestrator-dialog .el-dialog__body) { padding: 12px 16px; flex: 1; min-height: 0; overflow: hidden; }
.orch-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; }
.orch-header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.back-btn { font-size: 20px; cursor: pointer; color: var(--el-text-color-regular); padding: 0 6px; line-height: 1; }
.back-btn:hover { color: var(--el-color-primary); }
.name-input { width: 260px; }
.name-input :deep(.el-input__wrapper) { box-shadow: none; background: transparent; }
.name-input :deep(.el-input__inner) { font-size: 16px; font-weight: 600; }
.autosave { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.autosave.saved { color: var(--el-color-success); }
.autosave.error { color: var(--el-color-danger); }
.orch-header-right { display: flex; gap: 8px; }
.orch-layout { display: flex; gap: 0; height: 100%; }
/* min-width:0 + overflow:hidden 关键：flex 项默认 min-width:auto 会被编辑器内容的 min-content（工具栏≈991px）撑破列宽，导致拖拽调宽失效 */
.col-left { flex: 0 0 260px; min-width: 0; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
.col-left .el-textarea { flex: 1; }
.col-left :deep(.el-textarea__inner) { height: 100%; }
/* 左栏编辑器：工具栏允许换行、正文横向滚动，配合列宽收缩 */
.col-left :deep(.yuw-toolbar) { flex-wrap: wrap; height: auto; min-height: 42px; }
.col-left :deep(.yu-content-scroll) { overflow-x: auto; }
.panel-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.col-mid { flex: 1 1 0; min-width: 0; overflow-y: auto; }
.col-right { flex: 0 0 300px; min-width: 0; min-height: 0; display: flex; border-left: 1px solid var(--el-border-color-light); padding-left: 14px; }
/* 拖动手柄 */
.resize-handle { flex: 0 0 12px; display: flex; align-items: center; justify-content: center; cursor: col-resize; position: relative; z-index: 2; transition: background 0.15s; }
.resize-handle:hover, .resize-handle.active { background: var(--el-color-primary-light-9); }
.resize-handle-line { width: 2px; height: 32px; border-radius: 1px; background: var(--el-border-color); transition: background 0.15s, height 0.15s; }
.resize-handle:hover .resize-handle-line, .resize-handle.active .resize-handle-line { background: var(--el-color-primary); height: 48px; }
.sec-title { font-size: 14px; font-weight: 600; }
.plat-badge { font-size: 12px; padding: 0 8px; border-radius: 4px; border: 1px solid; line-height: 20px; }
.chip-box { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.tool-sel-row { margin-top: 8px; padding: 8px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; }
.tool-sel-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
.tool-sel-name { font-weight: 600; font-size: 13px; }
.row-list { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
.nq-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.caps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cap-item { display: flex; align-items: center; gap: 8px; }
.cap-label { font-size: 13px; }
.attach-box { margin-top: 10px; padding: 10px 12px; border: 1px dashed var(--el-border-color); border-radius: 6px; background: var(--el-fill-color-lighter); }
.attach-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.attach-title { font-size: 13px; font-weight: 600; }
.attach-list { margin-bottom: 8px; }
.attach-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--el-border-color-lighter); }
.attach-row:last-child { border-bottom: none; }
.attach-emoji { font-size: 15px; flex: none; }
.attach-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.attach-size { flex: none; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
