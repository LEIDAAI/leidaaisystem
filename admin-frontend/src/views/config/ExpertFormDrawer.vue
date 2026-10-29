<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { exportConfigJson, saveConfig, PLATFORMS, PLATFORM_META, type ConfigItem, type LlmModel, type PlatformType } from '@/api/config'
import { downloadJsonFile } from '@/utils/jsonio'
import { CAPABILITY_KEYS, CAPABILITY_LABELS, defaultCapabilities } from '@/api/mock/extension-data'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import ExpertChatPreview from './ExpertChatPreview.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

/** 专家 = 助手预设表单（附录 12.1），按「基本信息 / 提示词与能力 / 绑定与建议问题 / 可见性与上架」分组；右侧「对话预览」随草稿实时调试 */
const props = defineProps<{
  modelValue: boolean
  item: Partial<ConfigItem> | null
  skills: ConfigItem[]
  servers: ConfigItem[]
  plans: ConfigItem[]
  models: LlmModel[]
  canEdit: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<FormDraft>({})
const activeTab = ref('base')

/** 基础模型：仅模型管理中「启用」的模型可选（显示 name，存 code） */
const enabledModels = computed(() => props.models.filter((m) => m.status === 1))
/** 编辑时原 base_model 已停用/已删除（不在启用模型中）：显示原值并提示，保存前建议更换 */
const baseModelUnavailable = computed(
  () => Boolean(props.item?.id) && !!draft.value.baseModel && !enabledModels.value.some((m) => m.code === draft.value.baseModel)
)
/** v5 平台联动：绑定技能/MCP 仅显示与所选平台有交集的项（platforms 多选求交） */
const platformSkills = computed(() => props.skills.filter((s) => (s.platforms || []).some((p) => draft.value.platforms?.includes(p))))
const platformServers = computed(() => props.servers.filter((s) => (s.platforms || []).some((p) => draft.value.platforms?.includes(p))))

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (!visible) return
    const copy = JSON.parse(JSON.stringify(props.item || {})) as FormDraft
    draft.value = {
      capabilities: defaultCapabilities(), tags: [], suggestedQuestions: [], skillIds: [], mcpServerIds: [],
      baseModel: 'glm-5.3', platforms: ['1688'], visibility: { type: 'PUBLIC', planIds: [] }, status: 1, isDefault: false,
      ...copy
    }
    if (!Array.isArray(draft.value.platforms)) draft.value.platforms = ['1688']
    draft.value.platforms = draft.value.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
    if (!draft.value.platforms.length) draft.value.platforms = ['1688']
    if (!draft.value.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(draft.value.visibility.type || '')) {
      draft.value.visibility = { type: 'PUBLIC', planIds: [] }
    }
    if (!draft.value.capabilities || typeof draft.value.capabilities !== 'object') draft.value.capabilities = defaultCapabilities()
    // 生成温度（model_params.temperature）：未设置时取所选模型默认参数，兜底 0.7；右侧对话预览/真实调用即时生效
    const mp = (draft.value.modelParams && typeof draft.value.modelParams === 'object' && !Array.isArray(draft.value.modelParams))
      ? draft.value.modelParams
      : (draft.value.modelParams = {})
    if (typeof mp.temperature !== 'number' || Number.isNaN(mp.temperature)) {
      const dm = props.models.find((x) => x.code === draft.value.baseModel)?.defaultParams
      const dt = dm && typeof dm === 'object' ? (dm as Record<string, unknown>).temperature : undefined
      mp.temperature = typeof dt === 'number' ? dt : 0.7
    }
    activeTab.value = 'base'
  },
  { immediate: true }
)

/** 生成温度双向绑定（0–2，步进 0.1；写入草稿 model_params.temperature） */
const temperature = computed<number>({
  get: () => {
    const mp = draft.value.modelParams as Record<string, unknown> | undefined
    const t = mp && typeof mp === 'object' ? Number(mp.temperature) : NaN
    return Number.isFinite(t) ? t : 0.7
  },
  set: (v) => {
    draft.value.modelParams = { ...((draft.value.modelParams as Record<string, unknown> | undefined) || {}), temperature: v }
  }
})

function buildPayload(): FormDraft {
  const d = draft.value
  return {
    // id 必须随载荷提交：saveConfig 依据 id 决定 PUT（编辑）/ POST（新建），漏传会把编辑当成新建而撞「编码已存在」
    id: d.id,
    code: d.code, name: d.name, description: d.description, avatarUrl: d.avatarUrl, baseModel: d.baseModel,
    platforms: (d.platforms || []).filter((p) => PLATFORMS.includes(p as PlatformType)),
    systemPrompt: d.systemPrompt, skillIds: d.skillIds || [], mcpServerIds: d.mcpServerIds || [],
    suggestedQuestions: (d.suggestedQuestions || []).map((q) => String(q).trim()).filter(Boolean),
    capabilities: defaultCapabilities(d.capabilities || {}),
    modelParams: { ...((d.modelParams as Record<string, unknown> | undefined) || {}) },
    tags: (d.tags || []).map((t) => String(t).trim()).filter(Boolean),
    visibility: { type: d.visibility?.type || 'PUBLIC', planIds: d.visibility?.type === 'PLAN' ? d.visibility?.planIds || [] : [] },
    status: d.status, isDefault: Boolean(d.isDefault)
  }
}

/** 保存（发布）：先弹版本确认框（默认时间戳版本名可改），确认后才写库 */
const versionDialog = ref(false)
function onSaveClick(): void {
  if (!props.canEdit) return
  versionDialog.value = true
}

async function save(v: { versionName: string; note: string }): Promise<void> {
  if (!props.canEdit) return
  saving.value = true
  try {
    await saveConfig('experts', { ...buildPayload(), versionName: v.versionName, note: v.note })
    ElMessage.success('助手预设已保存，版本 +1；启用状态即上架到前台选择器')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}

/** 导出预设 JSON（下载，含全部业务字段；凭据类按服务端策略脱敏，权限复用 expert:edit） */
async function exportPreset(): Promise<void> {
  if (!props.item?.id) return
  const { filename, content } = await exportConfigJson('experts', props.item.id)
  downloadJsonFile(filename, content)
  ElMessage.success(`已导出 ${filename}，可直接导入 OpenWebUI/AgentScope 或本系统`)
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑助手预设' : '新建助手预设（专家）'}`" size="1100px" class="expert-edit-drawer" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <div class="expert-layout">
      <div class="form-col">
        <el-alert v-if="item?.id" title="助手 ID（code）创建后不可修改；导入导出与前台 API 均以 code 为标识。" type="info" :closable="false" style="margin-bottom:12px" />
        <el-tabs v-model="activeTab">
          <el-tab-pane label="基本信息" name="base">
            <el-form label-width="110px" :disabled="!canEdit">
              <el-form-item label="助手 ID"><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="如 product-selection-assistant" /></el-form-item>
              <el-form-item label="显示名"><el-input v-model="draft.name" /></el-form-item>
              <el-form-item label="平台">
                <el-select v-model="draft.platforms" multiple style="width:100%" placeholder="至少选择一个平台">
                  <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="PLATFORM_META[p].label" />
                </el-select>
                <p class="muted">平台维度多选（至少一个）；「绑定技能 / MCP」仅显示与所选平台有交集的项。</p>
              </el-form-item>
              <el-form-item label="能力摘要"><el-input v-model="draft.description" type="textarea" :rows="2" placeholder="前台选择器展示的能力摘要" /></el-form-item>
              <el-form-item label="基础模型">
                <el-select v-model="draft.baseModel" filterable clearable default-first-option style="width:100%" placeholder="请选择基础模型（右侧预览未选模型将拒绝生成）">
                  <el-option v-for="m in enabledModels" :key="m.code" :value="m.code" :label="`${m.name}（${m.code}）`" />
                </el-select>
                <el-alert
                  v-if="baseModelUnavailable"
                  type="warning"
                  :closable="false"
                  style="margin-top:6px"
                  :title="`当前基础模型「${draft.baseModel}」已停用或已从模型管理删除，此处保留原值；建议更换为启用模型（模型停用不影响已绑定专家运行）。`"
                />
                <p class="muted">仅模型管理中启用的基础模型可选；如需新增模型请前往「模型管理」。</p>
              </el-form-item>
              <el-form-item label="生成温度">
                <div style="width:100%">
                  <el-slider v-model="temperature" :min="0" :max="2" :step="0.1" :disabled="!canEdit" show-input :show-input-controls="false" input-size="small" />
                  <p class="muted">写入草稿 model_params.temperature（0–2）：即时作用于右侧「对话预览 / 真实调用」；&gt;1 时演示引擎附「高温度=更具发散性」提示。打开抽屉时默认取所选模型的默认参数。</p>
                </div>
              </el-form-item>
              <el-form-item label="头像 URL"><el-input v-model="draft.avatarUrl" placeholder="https://..." /></el-form-item>
              <el-form-item label="标签">
                <el-select v-model="draft.tags" multiple filterable allow-create default-first-option placeholder="输入标签后回车" style="width:100%">
                  <el-option v-for="t in ['选品', '1688', '跨境', '抖音', '分销']" :key="t" :value="t" :label="t" />
                </el-select>
              </el-form-item>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="提示词与能力" name="prompt">
            <el-form label-width="110px" :disabled="!canEdit">
              <el-form-item label="系统提示词"><el-input v-model="draft.systemPrompt" type="textarea" :rows="10" placeholder="角色设定、技能路由规则、工具调用纪律、输出格式约定" /></el-form-item>
              <el-form-item label="能力开关">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%">
                  <div v-for="k in CAPABILITY_KEYS" :key="k" style="display:flex;align-items:center;gap:8px">
                    <el-switch v-model="draft.capabilities![k]" />
                    <span>{{ CAPABILITY_LABELS[k] || k }}</span><small class="muted">{{ k }}</small>
                  </div>
                </div>
              </el-form-item>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="绑定与建议问题" name="bind">
            <el-form label-width="110px" :disabled="!canEdit">
              <el-form-item label="绑定技能"><el-select v-model="draft.skillIds" multiple filterable style="width:100%"><el-option v-for="s in platformSkills" :key="s.id" :value="s.id" :label="`${s.name}（${s.code}）`" :disabled="s.status !== 1" /></el-select></el-form-item>
              <el-form-item label="绑定 MCP"><el-select v-model="draft.mcpServerIds" multiple filterable style="width:100%"><el-option v-for="s in platformServers" :key="s.id" :value="s.id" :label="`${s.name}（${s.connType}）`" :disabled="s.status !== 1" /></el-select></el-form-item>
              <el-form-item label="建议问题">
                <div style="width:100%">
                  <div v-for="(q, i) in draft.suggestedQuestions" :key="i" style="display:flex;gap:8px;margin-bottom:8px">
                    <el-input :model-value="q" placeholder="前台打开助手时展示的示例任务" @update:model-value="draft.suggestedQuestions![i] = $event" />
                    <el-button :disabled="!canEdit" link type="danger" @click="draft.suggestedQuestions!.splice(i, 1)">删除</el-button>
                  </div>
                  <el-button :disabled="!canEdit" @click="draft.suggestedQuestions!.push('')">添加建议问题</el-button>
                </div>
              </el-form-item>
            </el-form>
          </el-tab-pane>
          <el-tab-pane label="可见性与上架" name="visibility">
            <el-form label-width="110px" :disabled="!canEdit">
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
              <el-form-item label="上架状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用（上架到前台）" inactive-text="停用（前台不可见）" /></el-form-item>
              <el-form-item label="默认专家"><el-switch v-model="draft.isDefault" /></el-form-item>
            </el-form>
          </el-tab-pane>
        </el-tabs>
      </div>
      <aside class="preview-col">
        <ExpertChatPreview :draft="draft" :models="models" />
      </aside>
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="item?.id" @click="exportPreset">导出预设JSON</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="onSaveClick">保存预设</el-button>
    </template>
    <VersionConfirmDialog
      v-model="versionDialog"
      title="发布版本确认"
      description="确认后将写库、版本 +1 并生成快照（进入版本历史）。"
      @confirm="save"
    />
  </el-drawer>
</template>
<style scoped>
/* 左右分栏：左表单可滚动，右侧对话预览随草稿实时生效 */
.expert-edit-drawer :deep(.el-drawer__body) { display: flex; overflow: hidden; }
.expert-layout { display: flex; gap: 16px; flex: 1; min-height: 0; width: 100%; }
.form-col { flex: 1 1 0; min-width: 0; overflow-y: auto; padding-right: 6px; }
.preview-col { flex: 0 0 400px; min-height: 0; display: flex; border-left: 1px solid var(--el-border-color); padding-left: 16px; }
</style>
