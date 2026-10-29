<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { saveConfig, probeModels, type ConfigItem, type ProbedModel } from '@/api/config'

/**
 * 模型管理表单（v5）：基础 LLM 模型注册；专家 base_model 由此选择（显示 code+名称，存 code）。
 * api_key 保存后永不回显明文（只显掩码 ****abcd）；编辑留空=不修改。
 * 默认参数（temperature/max_tokens）以简单数字输入编辑，落库为 default_params JSON。
 * 供应商字典：智谱/OpenAI兼容/Anthropic兼容/自定义，允许输入扩展。
 * 自动发现（仅新建）：填接入地址 + Key 后探测端点 /models 列表，选中即回填编码/显示名。
 */
type ModelDraft = Partial<ConfigItem> & { apiKey?: string; temperature?: number; maxTokens?: number }
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<ModelDraft>({})

/** 自动发现：探测状态（仅新建可用） */
const probing = ref(false)
const probed = ref<ProbedModel[]>([])
const probedResolved = ref('')
const selectedProbe = ref('')
const providerTouched = ref(false)

/** 填地址 + Key 后一键拉取端点全部模型；失败由 request.ts 拦截器统一提示，此处静默 */
async function fetchModels(): Promise<void> {
  if (!props.canEdit || probing.value) return
  const endpoint = draft.value.endpoint?.trim() || ''
  if (!endpoint) { ElMessage.warning('请先填写接入地址（OpenAI 兼容 base URL）'); return }
  probing.value = true
  try {
    const res = await probeModels(endpoint, draft.value.apiKey?.trim() || '')
    probed.value = res.models
    probedResolved.value = res.resolvedUrl
    if (!res.models.length) ElMessage.warning('端点可达，但未返回任何模型')
  } catch { /* 拦截器已提示 */ } finally {
    probing.value = false
  }
}

/** 选中探测结果：自动填充编码/显示名；供应商未被手动改过时置为「OpenAI兼容」 */
function applyProbe(id: string): void {
  const m = probed.value.find(x => x.id === id)
  if (!m) return
  draft.value.code = m.id
  draft.value.name = m.displayName
  if (!providerTouched.value) draft.value.provider = 'OpenAI兼容'
}

/** 供应商字典（可扩展：allow-create） */
const PROVIDERS = ['智谱', 'OpenAI兼容', 'Anthropic兼容', '自定义']

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (!visible) return
    draft.value = {
      status: 1, provider: '智谱', endpoint: '', remark: '',
      ...JSON.parse(JSON.stringify(props.item || {}))
    }
    // API Key 明文不出接口：编辑时仅提示掩码，输入框留空
    draft.value.apiKey = ''
    // 默认参数：简单数字输入（temperature 0~2，max_tokens 正整数）；其余历史参数键保留
    const params = draft.value.defaultParams && typeof draft.value.defaultParams === 'object' && !Array.isArray(draft.value.defaultParams) ? draft.value.defaultParams : {}
    draft.value.temperature = typeof params.temperature === 'number' ? params.temperature : 0.7
    draft.value.maxTokens = typeof params.max_tokens === 'number' ? params.max_tokens : 4096
    // 重置自动发现状态（每次打开都从头探测）
    probed.value = []
    probedResolved.value = ''
    selectedProbe.value = ''
    providerTouched.value = false
  },
  { immediate: true }
)

async function save(): Promise<void> {
  if (!props.canEdit) return
  const legacy = draft.value.defaultParams && typeof draft.value.defaultParams === 'object' && !Array.isArray(draft.value.defaultParams) ? draft.value.defaultParams : {}
  const defaultParams: Record<string, unknown> = {
    ...legacy,
    temperature: typeof draft.value.temperature === 'number' ? draft.value.temperature : 0.7,
    max_tokens: typeof draft.value.maxTokens === 'number' ? Math.round(draft.value.maxTokens) : 4096
  }
  saving.value = true
  try {
    await saveConfig('models', {
      id: draft.value.id, code: draft.value.code, name: draft.value.name, provider: draft.value.provider,
      endpoint: draft.value.endpoint,
      // api_key：填写则更新，留空=不修改（服务端保留原值）
      apiKey: draft.value.apiKey?.trim() || undefined,
      defaultParams, remark: draft.value.remark, status: draft.value.status
    })
    ElMessage.success('模型已保存')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑模型' : '新建基础模型'}`" size="600px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-alert v-if="item?.id" title="模型编码（code）创建后不可修改；专家基础模型以 code 关联。" type="info" :closable="false" style="margin-bottom:12px" />
    <el-form label-width="110px" :disabled="!canEdit">
      <el-form-item label="模型编码"><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="如 glm-5.3 / qwen-max" /></el-form-item>
      <el-form-item label="显示名"><el-input v-model="draft.name" placeholder="如 GLM-5.3" /></el-form-item>
      <el-form-item label="供应商">
        <el-select v-model="draft.provider" filterable allow-create default-first-option style="width:100%" placeholder="智谱 / OpenAI兼容 / Anthropic兼容 / 自定义" @change="providerTouched = true">
          <el-option v-for="p in PROVIDERS" :key="p" :value="p" :label="p" />
        </el-select>
        <p class="muted">内置字典：智谱 / OpenAI兼容 / Anthropic兼容 / 自定义；可直接输入新供应商扩展。</p>
      </el-form-item>
      <el-form-item label="接入地址"><el-input v-model="draft.endpoint" placeholder="base URL，如 http://192.168.1.10:8080/v1" /></el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="draft.apiKey" type="password" autocomplete="new-password" :placeholder="item?.apiKeyMasked ? `已配置 ${item.apiKeyMasked}，留空表示不修改` : '仅输入演示凭据，保存后永不回显明文'" />
        <p class="muted">保存后永不回显明文，列表与编辑仅显示掩码（如 ****abcd）；编辑留空 = 不修改。</p>
      </el-form-item>
      <el-form-item v-if="!item?.id" label="自动发现">
        <div style="display:flex;gap:10px;align-items:center;width:100%">
          <el-button :loading="probing" :disabled="!draft.endpoint?.trim()" @click="fetchModels">探测模型列表</el-button>
          <el-select v-model="selectedProbe" filterable style="flex:1" placeholder="探测后从下拉选择模型" :disabled="!probed.length" @change="applyProbe">
            <el-option v-for="m in probed" :key="m.id" :value="m.id" :label="`${m.displayName}（${m.id}）`" />
          </el-select>
        </div>
        <p v-if="probed.length" class="muted">已发现 {{ probed.length }} 个模型（{{ probedResolved }}）；选中后自动填充模型编码与显示名。</p>
        <p v-else class="muted">填写接入地址与 API Key 后探测，自动列出端点全部模型；探测经后端代理转发，密钥不落盘。</p>
      </el-form-item>
      <el-form-item label="默认参数">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;width:100%">
          <span class="muted">temperature</span>
          <el-input-number v-model="draft.temperature" :min="0" :max="2" :step="0.1" :precision="2" />
          <span class="muted">max_tokens</span>
          <el-input-number v-model="draft.maxTokens" :min="1" :max="1000000" :step="256" :precision="0" />
        </div>
        <p class="muted">默认生成参数以 JSON 存入 default_params（temperature、max_tokens 等），调用方未显式指定时生效。</p>
      </el-form-item>
      <el-form-item label="备注"><el-input v-model="draft.remark" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用（专家表单不再可选）" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存模型</el-button>
    </template>
  </el-drawer>
</template>
