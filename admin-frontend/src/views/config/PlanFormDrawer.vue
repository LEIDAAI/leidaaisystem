<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { saveConfig, type ConfigItem, type Entitlement, type FrontendPerms, FRONTEND_PERM_GROUPS, normalizeFrontendPerms } from '@/api/config'
import EntitlementEditor from '@/components/EntitlementEditor.vue'

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
      if (!Array.isArray(draft.value.entitlements)) draft.value.entitlements = [] as Entitlement[]
      draft.value.frontendPerms = normalizeFrontendPerms(draft.value.frontendPerms)
      if (!draft.value.planType) draft.value.planType = 'NORMAL'
      giftDurationMode.value = Number(draft.value.durationDays) === 0 ? 'lifetime' : 'custom'
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
      if (Number(draft.value.durationDays) !== 0 && giftDurationMode.value === 'lifetime') {
        giftDurationMode.value = 'custom'
        draft.value.durationDays = 30
      }
    } else if (giftDurationMode.value === 'lifetime') {
      draft.value.durationDays = 30
    }
  }
)

// 长期有效 / 自定义天数切换：写回 durationDays（0=长期有效）
watch(giftDurationMode, (mode) => {
  if (draft.value.planType !== 'GIFT') return
  if (mode === 'lifetime') draft.value.durationDays = 0
  else if (Number(draft.value.durationDays) === 0) draft.value.durationDays = 30
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
      <el-form-item v-if="draft.planType === 'GIFT'" label="赠送时长">
        <el-radio-group v-model="giftDurationMode">
          <el-radio value="lifetime">长期有效</el-radio>
          <el-radio value="custom">自定义天数</el-radio>
        </el-radio-group>
        <el-input-number v-if="giftDurationMode === 'custom'" v-model="draft.durationDays" :min="1" :precision="0" style="margin-top: 8px" />
      </el-form-item>
      <el-form-item v-else label="有效天数"><el-input-number v-model="draft.durationDays" :min="1" :precision="0" /></el-form-item>
      <el-form-item label="权益绑定"><EntitlementEditor v-model="draft.entitlements!" :disabled="!canEdit" /></el-form-item>
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
