<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { listConfig, listKnowledgeBases, saveConfig, type ConfigItem, type FrontendPerms, type KnowledgeBase, type VisibilityConfig, FRONTEND_PERM_GROUPS, normalizeFrontendPerms } from '@/api/config'
import VersionConfirmDialog from './VersionConfirmDialog.vue'

/** 表单草稿：ConfigItem 业务字段 + 版本名称/变更说明 / 引用确认（服务层审计字段） */
export type FormDraft = Partial<ConfigItem> & { versionName?: string; note?: string; confirmReferences?: boolean; frontendPerms?: FrontendPerms }

/** 套餐表单抽屉（P1 逻辑保持不变，仅抽离为独立组件） */
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: []; 'credit-package': [] }>()
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
      giftDurationMode.value = draft.value.durationMode === 'MEMBERSHIP' ? 'membership' : Number(draft.value.durationDays) === 0 ? 'lifetime' : 'custom'
      // 常规套餐时长模式回显：0 = 长期有效，其余 = 按天数（支持自定义任意天数）
      normalDurationMode.value = Number(draft.value.durationDays) === 0 ? 'lifetime' : 'days'
      // v17 计费周期回显：拆到月付 / 年付两行（价格留空的行 = 未启用该周期）
      const mc = (draft.value.billingCycles || []).find((c) => c.cycle === 'MONTHLY')
      const yc = (draft.value.billingCycles || []).find((c) => c.cycle === 'YEARLY')
      cycleRows.value = { monthlyPrice: mc?.price, monthlyOriginal: mc?.originalPrice ?? undefined, yearlyPrice: yc?.price, yearlyOriginal: yc?.originalPrice ?? undefined }
      // v17 新字段默认值：排序 0；积分一次性发放；积分永不过期
      draft.value.sort ??= 0
      draft.value.grantMode ??= 'ONCE'
      draft.value.creditExpiry ??= 'NEVER'
      entOpen.value = []
      void loadEntitlementRefs()
      nextTick(() => formRef.value?.clearValidate())
    }
  },
  { immediate: true }
)

/** v11 赠送套餐时长模式：长期有效（durationDays=0）/ 自定义天数 */
const giftDurationMode = ref<'lifetime' | 'custom' | 'membership'>('custom')
/** 常规套餐时长模式：按天数（自定义任意天数）/ 长期有效（durationDays=0） */
const normalDurationMode = ref<'days' | 'lifetime'>('days')
/** 快捷天数档位（一键填入自定义天数输入框） */
const durationPresets = [30, 90, 180, 365]
watch(normalDurationMode, (mode) => {
  if (draft.value.planType === 'GIFT') return
  if (mode === 'lifetime') draft.value.durationDays = 0
  else if (Number(draft.value.durationDays) === 0) draft.value.durationDays = 30
})

// 套餐类型切换联动：GIFT 价格锁定 0 元；NORMAL 时长期有效天数回填默认 30 天
watch(
  () => draft.value.planType,
  (type) => {
    if (type === 'GIFT') {
      draft.value.price = 0
      draft.value.credits = 0
      // 切到赠送：0 天=长期有效保持，否则固定为自定义天数模式
      giftDurationMode.value = draft.value.durationMode === 'MEMBERSHIP' ? 'membership' : Number(draft.value.durationDays) === 0 ? 'lifetime' : 'custom'
    } else {
      if (draft.value.credits === undefined) draft.value.credits = 10000
      if (draft.value.durationMode === 'MEMBERSHIP') {
        draft.value.durationDays = 30
        draft.value.durationMode = 'CUSTOM_DAYS'
      }
      normalDurationMode.value = Number(draft.value.durationDays) === 0 ? 'lifetime' : 'days'
    }
  }
)

// 长期有效 / 自定义天数切换：写回 durationDays（0=长期有效）
watch(giftDurationMode, (mode) => {
  if (draft.value.planType !== 'GIFT') return
  draft.value.durationMode = mode === 'membership' ? 'MEMBERSHIP' : mode === 'lifetime' ? 'LIFETIME' : 'CUSTOM_DAYS'
  if (mode === 'membership') draft.value.durationDays = undefined
  else if (mode === 'lifetime') draft.value.durationDays = 0
  else if (!draft.value.durationDays) draft.value.durationDays = 30
})

// -------------------------------------------------- v17 营销信息 / 计费周期 / 积分发放
/** 卖点列表：textarea 一行一条（回显 join('\n')，提交时 split/trim/过滤空行） */
const featuresText = computed({
  get: () => (draft.value.features || []).join('\n'),
  set: (v: string) => { draft.value.features = v.split('\n').map((s) => s.trim()).filter(Boolean) }
})
/** 月 / 年付计费周期编辑行：价格留空 = 不启用该周期；划线价可空 */
const cycleRows = ref<{ monthlyPrice?: number; monthlyOriginal?: number; yearlyPrice?: number; yearlyOriginal?: number }>({})

/** 组装 billingCycles：两个周期价格全为空 → undefined（前台按基础价展示） */
function buildBillingCycles(): ConfigItem['billingCycles'] {
  const cycles: NonNullable<ConfigItem['billingCycles']> = []
  const push = (cycle: 'MONTHLY' | 'YEARLY', price?: number, originalPrice?: number) => {
    if (price === undefined || price === null) return
    cycles.push({ cycle, price, ...(originalPrice ? { originalPrice } : {}) })
  }
  push('MONTHLY', cycleRows.value.monthlyPrice, cycleRows.value.monthlyOriginal)
  push('YEARLY', cycleRows.value.yearlyPrice, cycleRows.value.yearlyOriginal)
  return cycles.length ? cycles : undefined
}

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

/** 保存（发布）：先表单校验，再弹版本确认框（默认时间戳版本名可改），确认后才写库并生成快照 */
const versionDialog = ref(false)
async function onSaveClick(): Promise<void> {
  if (!props.canEdit) return
  try { await formRef.value?.validate() } catch { return }
  versionDialog.value = true
}

async function save(v: { versionName: string; note: string }): Promise<void> {
  if (!props.canEdit) return
  saving.value = true
  try {
    const isGift = draft.value.planType === 'GIFT'
    await saveConfig('plans', {
      ...draft.value,
      durationMode: isGift ? (giftDurationMode.value === 'membership' ? 'MEMBERSHIP' : giftDurationMode.value === 'lifetime' ? 'LIFETIME' : 'CUSTOM_DAYS') : normalDurationMode.value === 'lifetime' ? 'LIFETIME' : 'CUSTOM_DAYS',
      durationDays: isGift && giftDurationMode.value === 'membership' ? undefined : draft.value.durationDays,
      // v17：赠送套餐不携带营销 / 计费周期 / 积分发放配置（后端亦强制 ONCE / NEVER）
      tagline: isGift ? undefined : draft.value.tagline,
      badge: isGift ? undefined : draft.value.badge,
      features: isGift ? undefined : draft.value.features,
      billingCycles: isGift ? undefined : buildBillingCycles(),
      versionName: v.versionName,
      note: v.note
    })
    ElMessage.success('套餐已保存，版本 +1，请执行刷新生效')
    versionDialog.value = false
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
        <el-radio-group :model-value="draft.planType" :disabled="!canEdit || Boolean(item?.id)" @change="(value: unknown) => value === 'CREDIT_PACKAGE' ? emit('credit-package') : draft.planType = value as 'NORMAL' | 'GIFT'">
          <el-radio value="NORMAL">常规套餐</el-radio>
          <el-radio value="CREDIT_PACKAGE">积分包套餐</el-radio>
          <el-radio value="GIFT">赠送套餐</el-radio>
        </el-radio-group>
        <p class="perm-hint">赠送套餐用于创建赠送订单：价格必须为 0 元，时长支持长期有效、自定义天数或会员期内有效（随会员续费延续，到期失效）；创建后类型不可修改。</p>
      </el-form-item>
      <!-- v17 营销信息：仅常规套餐（角标 / 标语 / 卖点列表，前台套餐卡片展示） -->
      <template v-if="draft.planType !== 'GIFT'">
        <el-divider content-position="left">营销信息</el-divider>
        <el-form-item label="营销标语"><el-input v-model="draft.tagline" placeholder="一句话卖点，如「最受欢迎的专业版」" maxlength="50" /></el-form-item>
        <el-form-item label="营销角标"><el-input v-model="draft.badge" placeholder="如「最受欢迎」，留空则不显示" maxlength="10" /></el-form-item>
        <el-form-item label="卖点列表"><el-input v-model="featuresText" type="textarea" :rows="4" placeholder="一行一条卖点，如：&#10;每月 10000 AI 积分&#10;支持 5 个专家编排" /></el-form-item>
      </template>
      <el-form-item label="价格（元）">
        <el-input-number v-model="draft.price" :min="0" :precision="2" :disabled="draft.planType === 'GIFT'" />
        <p v-if="draft.planType === 'GIFT'" class="perm-hint">赠送套餐价格固定为 0 元</p>
      </el-form-item>
      <!-- v17 月 / 年付计费周期：价格留空的周期不启用；全部留空前台按基础价展示 -->
      <el-form-item v-if="draft.planType !== 'GIFT'" label="计费周期">
        <div class="cycle-editor">
          <div class="cycle-row">
            <span class="cycle-name">月付</span>
            <el-input-number v-model="cycleRows.monthlyPrice" :min="0" :precision="2" controls-position="right" placeholder="月付价格" />
            <el-input-number v-model="cycleRows.monthlyOriginal" :min="0" :precision="2" controls-position="right" placeholder="划线价（可空）" />
          </div>
          <div class="cycle-row">
            <span class="cycle-name">年付</span>
            <el-input-number v-model="cycleRows.yearlyPrice" :min="0" :precision="2" controls-position="right" placeholder="年付价格" />
            <el-input-number v-model="cycleRows.yearlyOriginal" :min="0" :precision="2" controls-position="right" placeholder="划线价（可空）" />
          </div>
          <p class="perm-hint">价格留空表示不启用该计费周期；未配置计费周期时前台按基础价展示。</p>
        </div>
      </el-form-item>
      <el-form-item v-if="draft.planType !== 'GIFT'" label="AI 积分">
        <el-input-number v-model="draft.credits" :min="0" :step="1000" :precision="0" />
        <p class="perm-hint">创建手工订单时默认带出该积分数量</p>
      </el-form-item>
      <!-- v17 积分发放方式 / 有效期（仅常规套餐；赠送套餐固定一次性 + 永不过期） -->
      <el-form-item v-if="draft.planType !== 'GIFT'" label="发放方式">
        <el-radio-group v-model="draft.grantMode">
          <el-radio value="ONCE">一次性发放</el-radio>
          <el-radio value="MONTHLY">每月发放</el-radio>
        </el-radio-group>
        <p class="perm-hint">一次性发放：订购时积分一次到账；每月发放：按月续发套餐积分。</p>
      </el-form-item>
      <el-form-item v-if="draft.planType !== 'GIFT'" label="积分有效期">
        <el-select v-model="draft.creditExpiry" style="width: 180px">
          <el-option label="永不过期" value="NEVER" />
          <el-option label="每月重置" value="MONTH_RESET" />
          <el-option label="自定义天数" value="CUSTOM_DAYS" />
        </el-select>
        <el-input-number v-if="draft.creditExpiry === 'CUSTOM_DAYS'" v-model="draft.creditValidityDays" :min="1" :precision="0" placeholder="天数" style="margin-left: 8px" />
      </el-form-item>
      <el-form-item v-if="draft.planType === 'GIFT'" label="赠送时长">
        <el-radio-group v-model="giftDurationMode">
          <el-radio value="lifetime">长期有效</el-radio>
          <el-radio value="custom">自定义天数</el-radio>
          <el-radio value="membership">会员期内有效</el-radio>
        </el-radio-group>
        <el-input-number v-if="giftDurationMode === 'custom'" v-model="draft.durationDays" :min="1" :precision="0" style="margin-top: 8px" />
      </el-form-item>
      <el-form-item v-else label="套餐时长">
        <el-radio-group v-model="normalDurationMode">
          <el-radio value="days">按天数</el-radio>
          <el-radio value="lifetime">长期有效</el-radio>
        </el-radio-group>
        <template v-if="normalDurationMode === 'days'">
          <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
            <el-input-number v-model="draft.durationDays" :min="1" :precision="0" />
            <el-button v-for="d in durationPresets" :key="d" size="small" plain @click="draft.durationDays = d">{{ d }}天</el-button>
          </div>
          <p class="perm-hint">支持自定义任意天数，或点击快捷档位一键填入</p>
        </template>
        <p v-else class="perm-hint">购买后长期有效，订单与前台均显示「长期有效」</p>
      </el-form-item>
      <!-- v17 排序：常规与赠送套餐均支持，前台列表按升序展示 -->
      <el-form-item label="排序"><el-input-number v-model="draft.sort" :min="0" :precision="0" /><p class="perm-hint">前台套餐列表按排序值升序展示</p></el-form-item>
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
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="onSaveClick">保存</el-button>
    </template>
    <VersionConfirmDialog
      v-model="versionDialog"
      title="发布版本确认"
      description="确认后将写库、版本 +1 并生成套餐快照（含权益与前台权限，进入版本历史）。"
      async
      :loading="saving"
      @confirm="save"
    />
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

/* v17 月 / 年付计费周期编辑行 */
.cycle-editor {
  width: 100%;
}

.cycle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.cycle-name {
  flex: 0 0 36px;
  font-size: 13px;
  color: #606266;
}
</style>
