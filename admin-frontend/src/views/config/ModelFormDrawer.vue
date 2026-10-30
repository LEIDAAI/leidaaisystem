<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { saveConfig, probeModels, createModelsBatch, type ConfigItem, type ProbedModel } from '@/api/config'
import { USE_MOCK } from '@/utils/constants'

/**
 * 模型管理表单（v6）：新建支持两种接入方式——
 * 1. 渠道批量接入：填「接入地址 + API Key」一键拉取该渠道全部可用模型（OpenAI 兼容 /models），勾选后批量入库；
 * 2. 手动添加单个：登记编码/显示名/参数等。
 * 编辑为单模型表单。api_key 保存后永不回显明文（只显掩码 ****abcd）；编辑留空=不修改。
 * Mock 模式提供演示地址快捷填充（demo.* 域名返回模拟模型清单，不发真实网络请求）。
 */
type ModelDraft = Partial<ConfigItem> & { apiKey?: string; temperature?: number; maxTokens?: number }
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean; existingCodes?: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<ModelDraft>({})
const isEdit = computed(() => Boolean(props.item?.id))
const mode = ref<'channel' | 'manual'>('channel')

/** 自动发现状态（渠道批量勾选 与 手动单选回填 共用） */
const probing = ref(false)
const probed = ref<ProbedModel[]>([])
const probedResolved = ref('')
const probeVia = ref('')
const probeFilter = ref('')
const checkedModels = ref<string[]>([])
const selectedProbe = ref('')
const providerTouched = ref(false)

const filteredProbed = computed(() =>
  probed.value.filter((m) => !probeFilter.value || `${m.displayName} ${m.id}`.toLowerCase().includes(probeFilter.value.toLowerCase()))
)

/** 渠道拉取列表中与库内重复的编码标注（入库时服务端会跳过） */
const existingSet = computed(() => new Set(props.existingCodes || []))
function isExisting(id: string): boolean {
  return existingSet.value.has(id)
}

/** 供应商字典（可扩展：allow-create） */
const PROVIDERS = ['智谱', 'OpenAI兼容', 'Anthropic兼容', '自定义']
/** Mock 演示地址（demo.* / .local 域名由 mock 层返回模拟清单；内网网关为真实端点，点击后走真实拉取） */
const DEMO_ENDPOINTS = [
  { label: '智谱演示', provider: '智谱', endpoint: 'https://demo.bigmodel.cn/api/paas/v4' },
  { label: 'OpenAI 演示', provider: 'OpenAI', endpoint: 'https://demo.openai.local/v1' },
  { label: '聚合网关演示', provider: 'OpenAI兼容', endpoint: 'https://demo.oneapi.local/v1' },
  { label: '内网模型网关（真实）', provider: 'OpenAI兼容', endpoint: 'http://192.168.1.10:8080/v1' }
]

function fillDemo(d: (typeof DEMO_ENDPOINTS)[number]): void {
  draft.value.endpoint = d.endpoint
  draft.value.provider = d.provider
  probed.value = []; checkedModels.value = []; probedResolved.value = ''; probeVia.value = ''; probeFilter.value = ''
}

/** 「链接 + Key」拉取端点全部模型；成功后默认全选，失败由 request.ts 拦截器统一提示 */
async function fetchModels(): Promise<void> {
  if (!props.canEdit || probing.value) return
  const endpoint = draft.value.endpoint?.trim() || ''
  if (!endpoint) { ElMessage.warning('请先填写接入地址（OpenAI 兼容 base URL）'); return }
  probing.value = true
  try {
    const res = await probeModels(endpoint, draft.value.apiKey?.trim() || '')
    probed.value = res.models
    probedResolved.value = res.resolvedUrl
    probeVia.value = res.via
    checkedModels.value = res.models.filter((m) => !isExisting(m.id)).map((m) => m.id)
    probeFilter.value = ''
    if (!res.models.length) ElMessage.warning('端点可达，但未返回任何模型')
  } catch { /* 拦截器已提示 */ } finally {
    probing.value = false
  }
}

function selectAllFiltered(): void {
  checkedModels.value = Array.from(new Set([...checkedModels.value, ...filteredProbed.value.map((m) => m.id)]))
}
function clearChecked(): void {
  checkedModels.value = []
}

/** 手动模式单选探测结果：自动填充编码/显示名；供应商未被手动改过时置为「OpenAI兼容」 */
function applyProbe(id: string): void {
  const m = probed.value.find((x) => x.id === id)
  if (!m) return
  draft.value.code = m.id
  draft.value.name = m.displayName
  if (!providerTouched.value) draft.value.provider = 'OpenAI兼容'
}

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
    const params = draft.value.defaultParams && typeof draft.value.defaultParams === 'object' && !Array.isArray(draft.value.defaultParams) ? draft.value.defaultParams : {}
    draft.value.temperature = typeof params.temperature === 'number' ? params.temperature : 0.7
    draft.value.maxTokens = typeof params.max_tokens === 'number' ? params.max_tokens : 4096
    mode.value = 'channel'
    probed.value = []; probedResolved.value = ''; probeVia.value = ''; probeFilter.value = ''
    checkedModels.value = []; selectedProbe.value = ''; providerTouched.value = false
  },
  { immediate: true }
)

/** 渠道批量入库：所选模型共享 endpoint/apiKey/provider（重复编码由服务端跳过） */
async function saveBatch(): Promise<void> {
  if (!props.canEdit) return
  if (!draft.value.endpoint?.trim()) { ElMessage.warning('请先填写接入地址'); return }
  if (!checkedModels.value.length) { ElMessage.warning('请勾选要添加的模型'); return }
  const items = checkedModels.value.map((id) => {
    const m = probed.value.find((x) => x.id === id)
    return { code: id, name: m?.displayName || id }
  })
  saving.value = true
  try {
    const r = await createModelsBatch({
      endpoint: draft.value.endpoint!.trim(),
      apiKey: draft.value.apiKey?.trim() || undefined,
      provider: String(draft.value.provider || '').trim() || 'OpenAI兼容',
      remark: draft.value.remark || '',
      items
    })
    ElMessage.success(`已添加 ${r.created} 个模型${r.skipped.length ? `；跳过已存在：${r.skipped.join('、')}` : ''}`)
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}

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
  <el-drawer :model-value="modelValue" :title="isEdit ? '编辑模型' : '新建模型'" size="640px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-alert v-if="isEdit" title="模型编码（code）创建后不可修改；专家基础模型以 code 关联。" type="info" :closable="false" style="margin-bottom:12px" />
    <el-form label-width="110px" :disabled="!canEdit">
      <el-form-item v-if="!isEdit" label="接入方式">
        <el-radio-group v-model="mode">
          <el-radio-button value="channel">渠道批量接入</el-radio-button>
          <el-radio-button value="manual">手动添加单个</el-radio-button>
        </el-radio-group>
        <p class="muted">填「链接 + 密钥」拉取该渠道全部可用模型，勾选后一次入库；也可手动登记单个模型。</p>
      </el-form-item>

      <el-form-item label="渠道 / 供应商">
        <el-select v-model="draft.provider" filterable allow-create default-first-option style="width:100%" placeholder="智谱 / OpenAI兼容 / Anthropic兼容 / 自定义" @change="providerTouched = true">
          <el-option v-for="p in PROVIDERS" :key="p" :value="p" :label="p" />
        </el-select>
      </el-form-item>
      <el-form-item label="接入地址">
        <el-input v-model="draft.endpoint" placeholder="OpenAI 兼容 base URL，如 https://api.example.com/v1" />
        <p v-if="!isEdit" class="muted">填好后点「拉取该渠道全部模型」即可展示该地址下所有可用模型。</p>
      </el-form-item>
      <el-form-item label="API Key">
        <el-input v-model="draft.apiKey" type="password" autocomplete="new-password" :placeholder="isEdit && item?.apiKeyMasked ? `已配置 ${item.apiKeyMasked}，留空表示不修改` : '该渠道密钥，将复用到批量添加的每个模型'" />
        <p class="muted">保存后永不回显明文，仅显示掩码（如 ****abcd）；编辑留空 = 不修改。</p>
      </el-form-item>

      <template v-if="!isEdit && mode === 'channel'">
        <el-form-item v-if="USE_MOCK" label="演示地址">
          <div class="demo-chips">
            <el-tag v-for="d in DEMO_ENDPOINTS" :key="d.endpoint" class="demo-chip" type="info" @click="fillDemo(d)">{{ d.label }}</el-tag>
          </div>
          <p class="muted">点击演示地址一键填充；demo.* / .local 返回模拟清单（不发真实请求），「内网模型网关」为真实端点，将实际拉取可用模型。</p>
        </el-form-item>
        <el-form-item label="拉取模型">
          <div style="display:flex;gap:10px;width:100%">
            <el-button type="primary" plain :loading="probing" :disabled="!draft.endpoint?.trim()" @click="fetchModels">{{ probed.length ? '重新拉取' : '拉取该渠道全部模型' }}</el-button>
            <el-input v-if="probed.length" v-model="probeFilter" clearable placeholder="按名称 / 编码过滤" style="width:220px" />
          </div>
        </el-form-item>
        <el-form-item v-if="probed.length" label="可用模型">
          <div class="probe-panel">
            <div class="probe-toolbar">
              <span>共 <b>{{ probed.length }}</b> 个可用模型 · 已选 <b>{{ checkedModels.length }}</b> 个</span>
              <span>
                <el-button link type="primary" size="small" @click="selectAllFiltered">全选</el-button>
                <el-button link size="small" @click="clearChecked">清空</el-button>
              </span>
            </div>
            <el-checkbox-group v-model="checkedModels" class="probe-grid">
              <el-checkbox v-for="m in filteredProbed" :key="m.id" :value="m.id" class="probe-item">
                <span class="probe-name">{{ m.displayName }}<el-tag v-if="isExisting(m.id)" size="small" type="info" effect="plain" class="probe-exist">已存在</el-tag></span>
                <small class="muted">{{ m.id }}</small>
              </el-checkbox>
            </el-checkbox-group>
            <p v-if="!filteredProbed.length" class="muted" style="margin:6px 0 0">无匹配模型</p>
            <div class="probe-meta">来源 {{ probedResolved }}<template v-if="probeVia"> · {{ probeVia }}</template></div>
          </div>
        </el-form-item>
      </template>

      <template v-else>
        <el-form-item label="模型编码" required><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="如 glm-5.3 / qwen-max" /></el-form-item>
        <el-form-item label="显示名" required><el-input v-model="draft.name" placeholder="如 GLM-5.3" /></el-form-item>
        <el-form-item v-if="!isEdit" label="自动发现">
          <div style="display:flex;gap:10px;align-items:center;width:100%">
            <el-button :loading="probing" :disabled="!draft.endpoint?.trim()" @click="fetchModels">探测模型列表</el-button>
            <el-select v-model="selectedProbe" filterable style="flex:1" placeholder="探测后从下拉选择模型" :disabled="!probed.length" @change="applyProbe">
              <el-option v-for="m in probed" :key="m.id" :value="m.id" :label="`${m.displayName}（${m.id}）`" />
            </el-select>
          </div>
          <p v-if="probed.length" class="muted">已发现 {{ probed.length }} 个模型（{{ probedResolved }}）；选中后自动填充模型编码与显示名。</p>
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
      </template>

      <el-form-item label="备注"><el-input v-model="draft.remark" type="textarea" :rows="2" /></el-form-item>
      <el-form-item label="状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用（专家表单不再可选）" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="canEdit && !isEdit && mode === 'channel'" type="primary" :loading="saving" :disabled="!checkedModels.length" @click="saveBatch">添加所选 {{ checkedModels.length }} 个模型</el-button>
      <el-button v-else-if="canEdit" type="primary" :loading="saving" @click="save">保存模型</el-button>
    </template>
  </el-drawer>
</template>
<style scoped>
.demo-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.demo-chip { cursor: pointer; }
.probe-panel { width: 100%; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 12px; background: var(--el-fill-color-lighter); }
.probe-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 13px; color: var(--el-text-color-secondary); }
.probe-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 10px; width: 100%; }
.probe-item { margin: 0; height: 34px; }
.probe-item :deep(.el-checkbox__label) { display: inline-flex; flex-direction: column; white-space: normal; line-height: 1.25; padding-left: 6px; overflow: hidden; }
.probe-name { font-size: 13px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.probe-exist { margin-left: 6px; flex: 0 0 auto; }
.probe-meta { margin-top: 8px; font-size: 12px; color: var(--el-text-color-secondary); word-break: break-all; }
</style>
