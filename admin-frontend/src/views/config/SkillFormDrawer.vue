<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { saveConfig, PLATFORMS, PLATFORM_META, type ConfigItem, type PlatformType } from '@/api/config'
import { SKILL_MD_TEMPLATE } from '@/api/mock/extension-data'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

/** 技能 = SKILL.md 内容型技能表单（附录 12.2）；paramSchema/execConfig 为可选高级字段 */
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<FormDraft>({})
const advancedOpen = ref<string[]>([])
const paramSchemaText = ref('')
const execConfigText = ref('')

/** 分节模板快捷插入（与附录 12.2 的正文结构规范一致） */
const SECTIONS: Array<[string, string]> = [
  ['触发条件', '\n## 触发条件\n<!-- 什么意图/问题应路由到本技能 -->\n'],
  ['不适用范围', '\n## 不适用范围\n<!-- 明确不处理的场景，防止误路由 -->\n'],
  ['参数契约', '\n## 参数契约\n<!-- 输入参数名、类型、必填性与示例 -->\n'],
  ['执行步骤', '\n## 执行步骤\n<!-- 1. ... 2. ... -->\n'],
  ['结果校验', '\n## 结果校验\n<!-- 如何判断执行成功 -->\n'],
  ['输出约定', '\n## 输出约定\n<!-- 输出结构与展示格式 -->\n'],
  ['异常边界', '\n## 异常边界\n<!-- 超时/失败/部分成功时的行为 -->\n']
]

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (!visible) return
    draft.value = { status: 1, files: [], content: '', platforms: ['1688'], ...JSON.parse(JSON.stringify(props.item || {})) }
    if (!Array.isArray(draft.value.files)) draft.value.files = []
    if (!Array.isArray(draft.value.platforms)) draft.value.platforms = ['1688']
    draft.value.platforms = draft.value.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
    if (!draft.value.platforms.length) draft.value.platforms = ['1688']
    paramSchemaText.value = draft.value.paramSchema ? JSON.stringify(draft.value.paramSchema, null, 2) : ''
    execConfigText.value = draft.value.execConfig ? JSON.stringify(draft.value.execConfig, null, 2) : ''
    advancedOpen.value = []
  },
  { immediate: true }
)

function insertSection(title: string, text: string): void {
  const d = draft.value
  if (d.content && d.content.includes(`## ${title}`)) {
    ElMessage.warning(`正文已包含「${title}」分节`)
    return
  }
  d.content = `${d.content || ''}${text}`
}

/** 保存（发布）：先弹版本确认框（默认时间戳版本名可改），确认后才写库并生成快照 */
const versionDialog = ref(false)
function onSaveClick(): void {
  if (!props.canEdit) return
  versionDialog.value = true
}

async function save(v: { versionName: string; note: string }): Promise<void> {
  if (!props.canEdit) return
  saving.value = true
  try {
    const payload: FormDraft = { ...draft.value }
    // 高级字段：留空=不下发（新技能）/保留原值（编辑时由服务端快照合并）；填写则须为合法 JSON 对象
    for (const [text, key] of [[paramSchemaText.value, 'paramSchema'], [execConfigText.value, 'execConfig']] as const) {
      const t = text.trim()
      if (!t) continue
      try {
        const parsed = JSON.parse(t)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
        payload[key] = parsed
      } catch {
        ElMessage.error(`高级字段 ${key === 'paramSchema' ? '入参 Schema' : '执行配置'} 须为合法 JSON 对象`)
        return
      }
    }
    if (!payload.platforms || !payload.platforms.length) {
      ElMessage.error('平台维度至少选择一个')
      return
    }
    await saveConfig('skills', { ...payload, platforms: payload.platforms.filter((p) => PLATFORMS.includes(p as PlatformType)), versionName: v.versionName, note: v.note })
    ElMessage.success('技能已保存，快照已写入版本历史')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑技能' : '新建技能'}`" size="760px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-form label-width="110px" :disabled="!canEdit">
      <el-form-item label="技能编码"><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="字母数字下划线短横线，创建后不可修改" /></el-form-item>
      <el-form-item label="名称"><el-input v-model="draft.name" /></el-form-item>
      <el-form-item label="平台">
        <el-select v-model="draft.platforms" multiple style="width:100%" placeholder="至少选择一个平台">
          <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="PLATFORM_META[p].label" />
        </el-select>
        <p class="muted">平台维度多选（至少一个）：专家按平台联动时仅显示有平台交集的技能。</p>
      </el-form-item>
      <el-form-item label="触发意图"><el-input v-model="draft.description" type="textarea" :rows="2" placeholder="描述触发意图，供助手路由判断" /></el-form-item>
    </el-form>
    <el-form label-width="110px" :disabled="!canEdit">
      <el-form-item label="SKILL.md">
        <div style="width:100%">
          <div style="margin-bottom:8px;display:flex;gap:8px;flex-wrap:wrap">
            <el-button size="small" :disabled="!canEdit" @click="draft.content = SKILL_MD_TEMPLATE.replace('{技能名称}', draft.name || '')">整段模板</el-button>
            <el-button v-for="[t, s] in SECTIONS" :key="t" size="small" :disabled="!canEdit" @click="insertSection(t, s)">+{{ t }}</el-button>
          </div>
          <el-input v-model="draft.content" type="textarea" :rows="16" placeholder="SKILL.md 正文（Markdown）：建议按 触发条件 / 不适用范围 / 参数契约 / 执行步骤 / 结果校验 / 输出约定 / 异常边界 分节" />
          <div class="editor-meta"><span>{{ (draft.content || '').length }} 字符</span></div>
        </div>
      </el-form-item>
      <el-form-item label="附属文件">
        <div style="width:100%">
          <div v-for="(f, i) in draft.files" :key="i" style="margin-bottom:8px;padding:8px;border:1px solid #eee;border-radius:4px">
            <div style="display:flex;gap:8px;margin-bottom:6px">
              <el-input v-model="f.name" placeholder="文件名，如 schema.json" style="width:240px" />
              <el-button :disabled="!canEdit" link type="danger" @click="draft.files!.splice(i, 1)">删除</el-button>
            </div>
            <el-input v-model="f.content" type="textarea" :rows="3" placeholder="文件内容（演示级）" />
          </div>
          <el-button :disabled="!canEdit" @click="draft.files!.push({ name: '', content: '' })">添加附属文件</el-button>
          <p class="muted">文件名不能重复；附属文件随导出 JSON 一起迁移。</p>
        </div>
      </el-form-item>
      <el-form-item label="状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用（被专家引用时需确认）" /></el-form-item>
    </el-form>
    <el-collapse v-model="advancedOpen" style="margin-top:4px">
      <el-collapse-item title="高级字段（可选，兼容旧版执行模型）" name="advanced">
        <el-form label-width="110px" :disabled="!canEdit">
          <el-form-item label="入参 Schema">
            <el-input v-model="paramSchemaText" type="textarea" :rows="5" placeholder='可选 JSON 对象，如 {"type":"object","properties":{"keyword":{"type":"string"}},"required":["keyword"]}' />
          </el-form-item>
          <el-form-item label="执行配置">
            <el-input v-model="execConfigText" type="textarea" :rows="4" placeholder='可选 JSON 对象，如 {"handler":"demo","timeoutMs":30000}' />
          </el-form-item>
          <p class="muted">v4 起技能核心为 SKILL.md 内容；以上两个字段仅为兼容旧执行模型的可选高级字段，留空即不修改。</p>
        </el-form>
      </el-collapse-item>
    </el-collapse>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="onSaveClick">保存技能</el-button>
    </template>
    <VersionConfirmDialog
      v-model="versionDialog"
      title="发布版本确认"
      description="确认后将写库、版本 +1 并生成 SKILL.md 快照（进入版本历史）。"
      @confirm="save"
    />
  </el-drawer>
</template>
<style scoped>
.editor-meta { display: flex; justify-content: flex-end; margin-top: 4px; }
.editor-meta span { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
