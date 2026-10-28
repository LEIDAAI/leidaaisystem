<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { saveConfig, type ConfigItem, type Entitlement } from '@/api/config'
import EntitlementEditor from '@/components/EntitlementEditor.vue'

/** 表单草稿：ConfigItem 业务字段 + 变更说明 / 引用确认（服务层审计字段） */
export type FormDraft = Partial<ConfigItem> & { note?: string; confirmReferences?: boolean }

/** 套餐表单抽屉（P1 逻辑保持不变，仅抽离为独立组件） */
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<FormDraft>({})

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (visible) {
      draft.value = JSON.parse(JSON.stringify(props.item || {}))
      if (!Array.isArray(draft.value.entitlements)) draft.value.entitlements = [] as Entitlement[]
    }
  },
  { immediate: true }
)

async function save(): Promise<void> {
  if (!props.canEdit) return
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
    <el-form label-width="110px" :disabled="!canEdit">
      <el-form-item label="名称"><el-input v-model="draft.name" /></el-form-item>
      <el-form-item label="唯一编码"><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="字母数字下划线短横线，创建后不可修改" /></el-form-item>
      <el-form-item label="启用 / 上架"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" /></el-form-item>
      <el-form-item label="价格（元）"><el-input-number v-model="draft.price" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="有效天数"><el-input-number v-model="draft.durationDays" :min="1" :precision="0" /></el-form-item>
      <el-form-item label="权益绑定"><EntitlementEditor v-model="draft.entitlements!" :disabled="!canEdit" /></el-form-item>
      <el-form-item label="变更说明"><el-input v-model="draft.note" type="textarea" :rows="2" placeholder="可选，记录本次变更目的（进入版本审计）" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存配置</el-button>
    </template>
  </el-drawer>
</template>
