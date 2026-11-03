<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { listConfig, listKnowledgeBases, saveConfig, type ConfigItem, type FrontendPerms, type KnowledgeBase, type VisibilityConfig, FRONTEND_PERM_GROUPS, normalizeFrontendPerms } from '@/api/config'

/** 表单草稿：ConfigItem 业务字段 + 版本名称/变更说明 / 引用确认（服务层审计字段） */
export type FormDraft = Partial<ConfigItem> & { versionName?: string; note?: string; confirmReferences?: boolean; frontendPerms?: FrontendPerms }

/** 套餐表单抽屉（P1 逻辑保持不变，仅抽离为独立组件） */
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<FormDraft>({})
const formRef = ref<FormInstance>()
const rules: FormRules = {
  name: [{ required: true, message: '请输入套餐名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入唯一编码', trigger: 'blur' },
    { pattern: /^[a-zA-Z0-9_-]+$/, message: '仅限字母、数字、下划线、短横线', trigger: 'blur' }
  ]
}

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (visible) {
      draft.value = JSON.parse(JSON.stringify(props.item || {}))
      draft.value.frontendPerms = normalizeFrontendPerms(draft.value.frontendPerms)
      if (!draft.value.planType) draft.value.planType = 'NORMAL'
      // v12：AI 积分初始化（仅常规套餐配置，创建手工订单时默认带出；赠送套餐固定 0）
      if (draft.value.planType === 'GIFT') draft.value.credits = 0
      else if (draft.value.credits === undefined) draft.value.credits = 10000
      giftDurationMode.value = Number(draft.value.durationDays) === 0 ? 'lifetime' : 'custom'
      entOpen.value = []
      void loadEntitlementRefs()
      nextTick(() => formRef.value?.clearValidate())
    }
  },
  { immediate: true }
)

/** v11 赠送套餐时长模式：长期有效（durationDays=0）/ 自定义天数 */
const giftDurationMode = ref<'lifetime' | 'custom'>('custom')

// 套餐类型切换联动：GIFT 价格锁定 0 元；NORMAL 时长期有效天数回填默认 30 天
watch(
  () => draft.value.planType,
  (type) => {
    if (type === 'GIFT') {
      draft.value.price = 0
      draft.value.credits = 0
      if (Number(draft.value.durationDays) !== 0 && giftDurationMode.value === 'lifetime') {
        giftDurationMode.value = 'custom'
        draft.value.durationDays = 30
      }
    } else {
      if (draft.value.credits === undefined) draft.value.credits = 10000
      if (giftDurationMode.value === 'lifetime') draft.value.durationDays = 30
    }
  }
)

// 长期有效 / 自定义天数切换：写回 durationDays（0=长期有效）
watch(giftDurationMode, (mode) => {
  if (draft.value.planType !== 'GIFT') return
  if (mode === 'lifetime') draft.value.durationDays = 0
  else if (Number(draft.value.durationDays) === 0) draft.value.durationDays = 30
})

// -------------------------------------------------- 权益绑定只读展示（v13）
/** 权益只读行：资源名 + 依据该资源管理页可见性设置的展示标签 */
interface EntRow { name: string; tag: string; tagType: 'success' | 'primary' | 'info' }
const entLoading = ref(false)
/** v13 折叠面板：默认全部收起（抽屉重开时复位），避免资源多时整块铺开过乱 */
const entOpen = ref<string[]>([])
const experts = ref<ConfigItem[]>([])
const skills = ref<ConfigItem[]>([])
const servers = ref<ConfigItem[]>([])
const kbs = ref<KnowledgeBase[]>([])
/** 打开抽屉时并行拉取专家/技能/MCP/知识库，按各资源侧已设置的可见性计算展示标签 */
async function loadEntitlementRefs() {
  entLoading.value = true
  try {
    const [e, s, m, k] = await Promise.all([listConfig('experts'), listConfig('skills'), listConfig('mcp/servers'), listKnowledgeBases()])
    experts.value = e; skills.value = s; servers.value = m; kbs.value = k
  } finally {
    entLoading.value = false
  }
}
/** 可见性 → 标签：PUBLIC 全员可见 / PLAN 命中本套餐 / 其余不可见（新建套餐视为未命中任何 PLAN） */
function visTag(v: VisibilityConfig | undefined, planId: number | undefined): { tag: string; tagType: EntRow['tagType'] } {
  if (!v || v.type === 'PUBLIC') return { tag: '全员可见', tagType: 'success' }
  if (v.type === 'PLAN') {
    if (planId !== undefined && (v.planIds || []).includes(planId)) return { tag: '本套餐可见', tagType: 'primary' }
    return { tag: planId === undefined ? '指定套餐可见' : '指定套餐可见（不含本套餐）', tagType: 'info' }
  }
  return { tag: '私有（不可见）', tagType: 'info' }
}
/** 四个只读分组：专家 / 技能 / 知识库 / MCP 服务（仅启用资源；知识库按前端可见性展示，旧数据按 access 回退） */
const entGroups = computed(() => {
  const planId = draft.value.id
  const visRows = (items: ConfigItem[]) =>
    items.filter((i) => i.status === 1).map((i) => ({ name: i.name, ...visTag(i.visibility, planId) }))
  const kbRows: EntRow[] = kbs.value
    .filter((k) => k.status === 1)
    .map((k) => {
      const v = k.visibility || (k.access === 'PRIVATE' ? { type: 'PRIVATE' as const, planIds: [] } : { type: 'PUBLIC' as const, planIds: [] })
      return { name: k.name, ...visTag(v, planId) }
    })
  /** 分组摘要：on = 对本套餐可见的项数（全员可见 / 本套餐可见 / 知识库公开），info 类标签均不计入 */
  const group = (label: string, rows: EntRow[]) => ({ label, rows, total: rows.length, on: rows.filter((r) => r.tagType !== 'info').length })
  return [
    group('专家', visRows(experts.value)),
    group('技能', visRows(skills.value)),
    group('知识库', kbRows),
    group('MCP 服务', visRows(servers.value))
  ]
})

function toggleGroup(groupLabel: string, value: boolean): void {
  const group = FRONTEND_PERM_GROUPS.find((g) => g.label === groupLabel)
  if (!group || !draft.value.frontendPerms) return
  for (const it of group.items) draft.value.frontendPerms[it.key] = value
}

async function save(): Promise<void> {
  if (!props.canEdit) return
  try { await formRef.value?.validate() } catch { return }
  saving.value = true
  try {
    await saveConfig('plans', { ...draft.value })
    ElMessage.success('套餐已保存，版本 +1，请执行刷新生效')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑套餐' : '新建套餐'}`" size="640px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-form ref="formRef" :model="draft" :rules="rules" label-width="110px" :disabled="!canEdit">
      <el-form-item label="名称" prop="name"><el-input v-model="draft.name" placeholder="请输入套餐名称" /></el-form-item>
      <el-form-item label="唯一编码" prop="code"><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="字母数字下划线短横线，创建后不可修改" /></el-form-item>
      <el-form-item label="启用 / 上架"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" /></el-form-item>
      <el-form-item label="套餐类型">
        <el-radio-group v-model="draft.planType" :disabled="!canEdit || Boolean(item?.id)">
          <el-radio value="NORMAL">常规套餐</el-radio>
          <el-radio value="GIFT">赠送套餐</el-radio>
        </el-radio-group>
        <p class="perm-hint">赠送套餐用于创建赠送订单：价格必须为 0 元，时长支持长期有效或自定义天数；创建后类型不可修改。</p>
      </el-form-item>
      <el-form-item label="价格（元）">
        <el-input-number v-model="draft.price" :min="0" :precision="2" :disabled="draft.planType === 'GIFT'" />
        <p v-if="draft.planType === 'GIFT'" class="perm-hint">赠送套餐价格固定为 0 元</p>
      </el-form-item>
      <el-form-item v-if="draft.planType !== 'GIFT'" label="AI 积分">
        <el-input-number v-model="draft.credits" :min="0" :step="1000" :precision="0" />
        <p class="perm-hint">创建手工订单时默认带出该积分数量</p>
      </el-form-item>
      <el-form-item v-if="draft.planType === 'GIFT'" label="赠送时长">
        <el-radio-group v-model="giftDurationMode">
          <el-radio value="lifetime">长期有效</el-radio>
          <el-radio value="custom">自定义天数</el-radio>
        </el-radio-group>
        <el-input-number v-if="giftDurationMode === 'custom'" v-model="draft.durationDays" :min="1" :precision="0" style="margin-top: 8px" />
      </el-form-item>
      <el-form-item v-else label="有效天数"><el-input-number v-model="draft.durationDays" :min="1" :precision="0" /></el-form-item>
      <el-form-item label="权益绑定">
        <div v-loading="entLoading" class="ent-groups">
          <el-collapse v-model="entOpen" class="ent-collapse">
            <el-collapse-item v-for="g in entGroups" :key="g.label" :name="g.label">
              <template #title>
                <span class="ent-label">{{ g.label }}</span>
                <el-tag size="small" :type="g.on ? 'success' : 'info'" effect="plain" round class="ent-count">{{ g.on }}/{{ g.total }} 项对本套餐可见</el-tag>
              </template>
              <div class="ent-rows">
                <template v-if="g.rows.length">
                  <div v-for="r in g.rows" :key="r.name" class="ent-row">
                    <span class="ent-name">{{ r.name }}</span>
                    <el-tag :type="r.tagType" size="small" effect="light">{{ r.tag }}</el-tag>
                  </div>
                </template>
                <span v-else class="ent-empty">暂无</span>
              </div>
            </el-collapse-item>
          </el-collapse>
          <p class="perm-hint">权益由各资源管理页设置的可见性自动决定（专家 / 技能 / MCP 按可见范围，知识库按公开 / 私有），此处仅查看、不可编辑；点击分组展开明细。</p>
        </div>
      </el-form-item>
      <el-form-item label="前台权限">
        <div class="perm-editor">
          <div v-for="group in FRONTEND_PERM_GROUPS" :key="group.label" class="perm-row">
            <span class="perm-group">{{ group.label }}</span>
            <el-checkbox
              v-for="it in group.items"
              :key="it.key"
              v-model="draft.frontendPerms![it.key]"
              :disabled="!canEdit"
              class="perm-check"
            >{{ it.label }}</el-checkbox>
            <div class="perm-quick">
              <el-button size="small" link type="primary" :disabled="!canEdit" @click="toggleGroup(group.label, true)">全开</el-button>
              <el-button size="small" link type="danger" :disabled="!canEdit" @click="toggleGroup(group.label, false)">全关</el-button>
            </div>
          </div>
          <p class="perm-hint">控制该套餐用户在前台工作台的能力：关闭「查看」后对应入口与列表不可见；关闭「创建」后不可新建该类资源。</p>
        </div>
      </el-form-item>
      <el-form-item label="变更说明"><el-input v-model="draft.note" type="textarea" :rows="2" placeholder="可选，记录本次变更目的（进入版本审计）" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.perm-editor {
  width: 100%;
}

.ent-groups {
  width: 100%;
}

.ent-collapse {
  width: 100%;
}

.ent-collapse :deep(.el-collapse-item__header) {
  height: 36px;
  line-height: 36px;
}

.ent-label {
  font-weight: 600;
  color: #606266;
  margin-right: 8px;
}

.ent-count {
  margin-left: 8px;
}

.ent-rows {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  padding: 2px 0 6px;
}

.ent-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: #fafafa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}

.ent-name {
  color: #303133;
}

.ent-empty {
  color: #c0c4cc;
  font-size: 12px;
}

.perm-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
}

.perm-group {
  width: 48px;
  font-weight: 600;
  color: #606266;
}

.perm-check {
  margin-right: 14px;
}

.perm-quick {
  margin-left: auto;
}

.perm-hint {
  margin: 8px 0 0;
  color: #c0c4cc;
  font-size: 12px;
}
</style>
