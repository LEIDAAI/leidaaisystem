<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { exportConfigJson, saveConfig, type ConfigItem } from '@/api/config'
import { downloadJsonFile } from '@/utils/jsonio'
import { CAPABILITY_KEYS, defaultCapabilities } from '@/api/mock/extension-data'
import type { FormDraft } from './PlanFormDrawer.vue'

/** 专家 = 助手预设表单（附录 12.1），按「基本信息 / 提示词与能力 / 绑定与建议问题 / 可见性与上架」分组 */
const props = defineProps<{
  modelValue: boolean
  item: Partial<ConfigItem> | null
  skills: ConfigItem[]
  servers: ConfigItem[]
  plans: ConfigItem[]
  canEdit: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<FormDraft>({})
const activeTab = ref('base')

const BASE_MODELS = ['GLM-5.3', 'GLM-4.7', 'DeepSeek-V3.2', 'Qwen-Max', 'GPT-4o', 'Claude-Sonnet-4.5']
const CAPABILITY_LABELS: Record<string, string> = {
  file_context: '文件上下文', file_upload: '文件上传', vision: '图片理解', web_search: '联网搜索',
  image_generation: '图像生成', code_interpreter: '代码解释器', terminal: '终端执行',
  citations: '引用来源', status_updates: '状态推送', memory: '长期记忆', builtin_tools: '内置工具', usage: '用量统计'
}

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (!visible) return
    const copy = JSON.parse(JSON.stringify(props.item || {})) as FormDraft
    draft.value = {
      capabilities: defaultCapabilities(), tags: [], suggestedQuestions: [], skillIds: [], mcpServerIds: [],
      baseModel: 'GLM-5.3', visibility: { type: 'PUBLIC', planIds: [] }, status: 1, isDefault: false,
      ...copy
    }
    if (!draft.value.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(draft.value.visibility.type || '')) {
      draft.value.visibility = { type: 'PUBLIC', planIds: [] }
    }
    if (!draft.value.capabilities || typeof draft.value.capabilities !== 'object') draft.value.capabilities = defaultCapabilities()
    activeTab.value = 'base'
  },
  { immediate: true }
)

function buildPayload(): FormDraft {
  const d = draft.value
  return {
    code: d.code, name: d.name, description: d.description, avatarUrl: d.avatarUrl, baseModel: d.baseModel,
    systemPrompt: d.systemPrompt, skillIds: d.skillIds || [], mcpServerIds: d.mcpServerIds || [],
    suggestedQuestions: (d.suggestedQuestions || []).map((q) => String(q).trim()).filter(Boolean),
    capabilities: defaultCapabilities(d.capabilities || {}),
    tags: (d.tags || []).map((t) => String(t).trim()).filter(Boolean),
    visibility: { type: d.visibility?.type || 'PUBLIC', planIds: d.visibility?.type === 'PLAN' ? d.visibility?.planIds || [] : [] },
    status: d.status, isDefault: Boolean(d.isDefault), note: d.note
  }
}

async function save(): Promise<void> {
  if (!props.canEdit) return
  saving.value = true
  try {
    await saveConfig('experts', buildPayload())
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
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑助手预设' : '新建助手预设（专家）'}`" size="760px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-alert v-if="item?.id" title="助手 ID（code）创建后不可修改；导入导出与前台 API 均以 code 为标识。" type="info" :closable="false" style="margin-bottom:12px" />
    <el-tabs v-model="activeTab">
      <el-tab-pane label="基本信息" name="base">
        <el-form label-width="110px" :disabled="!canEdit">
          <el-form-item label="助手 ID"><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="如 product-selection-assistant" /></el-form-item>
          <el-form-item label="显示名"><el-input v-model="draft.name" /></el-form-item>
          <el-form-item label="能力摘要"><el-input v-model="draft.description" type="textarea" :rows="2" placeholder="前台选择器展示的能力摘要" /></el-form-item>
          <el-form-item label="基础模型"><el-select v-model="draft.baseModel" filterable allow-create default-first-option style="width:100%"><el-option v-for="m in BASE_MODELS" :key="m" :value="m" :label="m" /></el-select></el-form-item>
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
          <el-form-item label="绑定技能"><el-select v-model="draft.skillIds" multiple filterable style="width:100%"><el-option v-for="s in skills" :key="s.id" :value="s.id" :label="`${s.name}（${s.code}）`" :disabled="s.status !== 1" /></el-select></el-form-item>
          <el-form-item label="绑定 MCP"><el-select v-model="draft.mcpServerIds" multiple filterable style="width:100%"><el-option v-for="s in servers" :key="s.id" :value="s.id" :label="`${s.name}（${s.connType}）`" :disabled="s.status !== 1" /></el-select></el-form-item>
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
          <el-form-item label="变更说明"><el-input v-model="draft.note" type="textarea" :rows="2" placeholder="可选，记录本次变更目的（进入版本历史）" /></el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="item?.id" @click="exportPreset">导出预设JSON</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存预设</el-button>
    </template>
  </el-drawer>
</template>
