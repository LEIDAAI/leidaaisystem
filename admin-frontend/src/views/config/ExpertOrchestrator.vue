<script setup lang="ts">
/**
 * 专家编排页（v6，Coze 式三栏全屏编排）：
 * 左栏「人设与回复逻辑」；中栏手风琴分组（基础信息/平台/标签/模型/技能/MCP/标题/简介/介绍/开场白/核心能力/参考提示词/问题建议/能力开关）；
 * 右栏对话预览（ExpertChatPreview 复用）。
 * 交互约定：全屏弹窗禁止点空白关闭；关闭按钮先询问；支持「边编辑边自动保存」（skipVersion 不进版本历史，首次发布后启用）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { get } from '@/api/request'
import { saveConfig, listConfig, listModels, PLATFORMS, PLATFORM_META, type ConfigItem, type LlmModel, type PlatformType } from '@/api/config'
import { CAPABILITY_KEYS, CAPABILITY_LABELS, defaultCapabilities } from '@/api/mock/extension-data'
import RichTextEditor from '@/components/RichTextEditor.vue'
import ExpertChatPreview from './ExpertChatPreview.vue'
import ConfigPickerDialog from './ConfigPickerDialog.vue'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import VersionDrawer from './VersionDrawer.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()

const skills = ref<ConfigItem[]>([])
const servers = ref<ConfigItem[]>([])
const plans = ref<ConfigItem[]>([])
const models = ref<LlmModel[]>([])
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

const enabledModels = computed(() => models.value.filter((m) => m.status === 1))
const baseModelUnavailable = computed(() => Boolean(currentId.value) && !!draft.value.baseModel && !enabledModels.value.some((m) => m.code === draft.value.baseModel))

const skillName = (id: number): string => skills.value.find((s) => s.id === id)?.name || `#${id}`
const serverName = (id: number): string => servers.value.find((s) => s.id === id)?.name || `#${id}`

// ---------------------------------------------------------------- 打开初始化
watch(
  () => props.modelValue,
  async (v) => {
    if (!v) return
    // 每次打开都重拉选择器数据源，避免期间新建的技能/MCP/套餐/模型不可见
    const [sk, sv, pl, md] = await Promise.all([listConfig('skills'), listConfig('mcp/servers'), listConfig('plans'), listModels({ page: 1, pageSize: 200 })])
    skills.value = sk; servers.value = sv; plans.value = pl; models.value = md.list
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
    capabilities: defaultCapabilities(), tags: [], suggestedQuestions: [], skillIds: [], mcpServerIds: [],
    coreAbilities: [], referencePrompts: [], titleHtml: '', introduction: '', greeting: '',
    baseModel: 'glm-5.3', platforms: ['1688'], visibility: { type: 'PUBLIC', planIds: [] }, status: 1, isDefault: false,
    nextQuestionConfig: { enabled: true, mode: 'default' },
    ...copy
  }
  if (!Array.isArray(d.platforms)) d.platforms = ['1688']
  d.platforms = d.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
  if (!d.platforms.length) d.platforms = ['1688']
  if (!d.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(d.visibility.type || '')) d.visibility = { type: 'PUBLIC', planIds: [] }
  if (!d.capabilities || typeof d.capabilities !== 'object') d.capabilities = defaultCapabilities()
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
  if (!(d.tags || []).every((t) => String(t).trim())) miss.push('标签')
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
    systemPrompt: d.systemPrompt, skillIds: d.skillIds || [], mcpServerIds: d.mcpServerIds || [],
    suggestedQuestions: (d.suggestedQuestions || []).map((q) => String(q).trim()).filter(Boolean),
    capabilities: defaultCapabilities(d.capabilities || {}),
    modelParams: { ...((d.modelParams as Record<string, unknown> | undefined) || {}) },
    tags: (d.tags || []).map((t) => String(t).trim()).filter(Boolean),
    visibility: { type: d.visibility?.type || 'PUBLIC', planIds: d.visibility?.type === 'PLAN' ? d.visibility?.planIds || [] : [] },
    status: d.status, isDefault: Boolean(d.isDefault),
    titleHtml: d.titleHtml || '', introduction: d.introduction || '', greeting: d.greeting || '',
    coreAbilities: (d.coreAbilities || []).map((s) => String(s).trim()).filter(Boolean),
    referencePrompts: (d.referencePrompts || []).map((s) => String(s).trim()).filter(Boolean),
    nextQuestionConfig: d.nextQuestionConfig ? { ...d.nextQuestionConfig } : { enabled: true, mode: 'default' }
  }
}

let autosaveSeq = 0
async function doAutosave(): Promise<void> {
  if (suppress || !props.canEdit || !currentId.value || !dirty.value || !draftComplete.value) return
  const seq = ++autosaveSeq
  autosaveState.value = 'saving'
  try {
    await saveConfig('experts', { ...buildPayload(), skipVersion: true })
    if (seq !== autosaveSeq) return // 保存期间又有新编辑在途，交给最新一次保存收尾
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
const picker = ref<{ visible: boolean; type: 'skill' | 'mcp' }>({ visible: false, type: 'skill' })
const pickerIds = computed(() => (picker.value.type === 'skill' ? draft.value.skillIds || [] : draft.value.mcpServerIds || []))
function onPickerConfirm(ids: number[]): void {
  if (picker.value.type === 'skill') draft.value.skillIds = ids
  else draft.value.mcpServerIds = ids
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
      <aside class="col-left">
        <div class="panel-title">人设与回复逻辑</div>
        <p class="muted">作为 System Prompt 注入对话；约定角色设定、技能路由规则、工具调用纪律与输出格式。</p>
        <el-input
          v-model="draft.systemPrompt"
          type="textarea"
          :rows="24"
          :disabled="!canEdit"
          placeholder="你是一位跨境电商选品专家…"
          resize="none"
        />
      </aside>

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
              <el-form-item label="可见性">
                <el-radio-group v-model="draft.visibility!.type">
                  <el-radio-button value="PUBLIC">全员</el-radio-button>
                  <el-radio-button value="PLAN">指定套餐</el-radio-button>
                  <el-radio-button value="PRIVATE">私有</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <el-form-item v-if="draft.visibility!.type === 'PLAN'" label="可见套餐">
                <el-select v-model="draft.visibility!.planIds" multiple filterable style="width:100%"><el-option v-for="p in plans" :key="p.id" :value="p.id" :label="p.name" /></el-select>
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
            <template #title><span class="sec-title">标签选择</span></template>
            <el-select v-model="draft.tags" multiple filterable allow-create default-first-option placeholder="输入标签后回车" style="width:100%" :disabled="!canEdit">
              <el-option v-for="t in ['选品', '1688', '跨境', '抖音', '分销']" :key="t" :value="t" :label="t" />
            </el-select>
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
          </el-collapse-item>

          <el-collapse-item name="title">
            <template #title><span class="sec-title">专家标题 <small class="muted">（前台卡片大标题，支持富文本）</small></span></template>
            <RichTextEditor v-model="draft.titleHtml!" :maxlength="200" :min-height="72" :disabled="!canEdit" placeholder="如：1688 分销选品专家" />
          </el-collapse-item>

          <el-collapse-item name="intro">
            <template #title><span class="sec-title">专家简介 <small class="muted">（前台卡片副标题）</small></span></template>
            <el-input v-model="draft.description" type="textarea" :rows="2" :disabled="!canEdit" placeholder="一句话说明专家能解决什么问题" />
          </el-collapse-item>

          <el-collapse-item name="detail">
            <template #title><span class="sec-title">专家介绍 <small class="muted">（前台详情长文，支持富文本）</small></span></template>
            <RichTextEditor v-model="draft.introduction!" :maxlength="2000" :min-height="120" :disabled="!canEdit" placeholder="详细介绍专家的能力边界、适用场景与使用建议…" />
          </el-collapse-item>

          <el-collapse-item name="greeting">
            <template #title><span class="sec-title">开场白 <small class="muted">（会话首条消息，支持富文本）</small></span></template>
            <RichTextEditor v-model="draft.greeting!" :maxlength="500" :min-height="72" :disabled="!canEdit" placeholder="你好！我是…可以帮你…" />
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
              <el-input :model-value="p" type="textarea" :rows="2" :disabled="!canEdit" placeholder="如：帮我分析最近 7 天 1688 家居类目的热销趋势" @update:model-value="draft.referencePrompts![i] = $event" />
              <el-button :disabled="!canEdit" link type="danger" @click="draft.referencePrompts!.splice(i, 1)">删除</el-button>
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

      <!-- 右栏：对话预览 -->
      <aside class="col-right">
        <ExpertChatPreview :draft="draft" :models="models" />
      </aside>
    </div>

    <ConfigPickerDialog v-model="picker.visible" :type="picker.type" :platforms="(draft.platforms || []) as PlatformType[]" :selected-ids="pickerIds" :skills="skills" :servers="servers" @confirm="onPickerConfirm" />

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
.orch-layout { display: flex; gap: 14px; height: 100%; }
.col-left { flex: 0 0 320px; display: flex; flex-direction: column; min-height: 0; }
.col-left .el-textarea { flex: 1; }
.col-left :deep(.el-textarea__inner) { height: 100%; }
.panel-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.col-mid { flex: 1 1 0; min-width: 0; overflow-y: auto; }
.col-right { flex: 0 0 400px; min-height: 0; display: flex; border-left: 1px solid var(--el-border-color-light); padding-left: 14px; }
/* 窄屏压缩左右栏宽度，避免中栏（提示词编辑区）被挤成一条竖线 */
@media (max-width: 1440px) { .col-left { flex-basis: 280px; } .col-right { flex-basis: 350px; } }
@media (max-width: 1280px) { .col-left { flex-basis: 240px; } .col-right { flex-basis: 300px; } }
.sec-title { font-size: 14px; font-weight: 600; }
.plat-badge { font-size: 12px; padding: 0 8px; border-radius: 4px; border: 1px solid; line-height: 20px; }
.chip-box { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.row-list { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
.nq-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.caps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cap-item { display: flex; align-items: center; gap: 8px; }
.cap-label { font-size: 13px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
