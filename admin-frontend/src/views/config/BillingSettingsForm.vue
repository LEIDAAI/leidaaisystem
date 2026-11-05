<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { saveBillingSettings, type BillingSettings } from '../../api/config'

/** 全局计费设置表单（v17）：注册赠送积分 / 套餐升级补差策略 / 前台积分购买滑杆 */
const props = defineProps<{ settings: BillingSettings | null; canEdit: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const saving = ref(false)
const formRef = ref<FormInstance>()
const draft = ref<BillingSettings>({ registerBonus: 0, upgradePolicy: 'FULL_PRICE', creditSlider: { enabled: false, min: 0, max: 0, step: 0, unitPrice: 0 } })

const rules: FormRules = {
  registerBonus: [
    { required: true, message: '请输入注册赠送积分', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => (v === undefined || (Number.isInteger(v) && v >= 0)) ? cb() : cb(new Error('须为非负整数')), trigger: 'blur' }
  ],
  'creditSlider.min': [
    { required: true, message: '请输入下限', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => (v === undefined || (Number.isInteger(v) && v > 0)) ? cb() : cb(new Error('须为正整数')), trigger: 'blur' }
  ],
  'creditSlider.max': [
    { required: true, message: '请输入上限', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => (v === undefined || (Number.isInteger(v) && v > draft.value.creditSlider.min)) ? cb() : cb(new Error('须为正整数且大于下限')), trigger: 'blur' }
  ],
  'creditSlider.step': [
    { required: true, message: '请输入步长', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => (v === undefined || (Number.isInteger(v) && v > 0)) ? cb() : cb(new Error('须为正整数')), trigger: 'blur' }
  ],
  'creditSlider.unitPrice': [
    { required: true, message: '请输入单价', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => (v === undefined || v > 0) ? cb() : cb(new Error('单价须大于 0')), trigger: 'blur' }
  ]
}

watch(
  () => props.settings,
  (s) => {
    if (s) {
      draft.value = JSON.parse(JSON.stringify(s))
      nextTick(() => formRef.value?.clearValidate())
    }
  },
  { immediate: true, deep: true }
)

async function save(): Promise<void> {
  if (!props.canEdit) return
  try { await formRef.value?.validate() } catch { return }
  saving.value = true
  try {
    await saveBillingSettings(JSON.parse(JSON.stringify(draft.value)))
    ElMessage.success('计费设置已保存')
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-form ref="formRef" :model="draft" :rules="rules" label-width="140px" :disabled="!canEdit" style="max-width: 640px">
    <el-form-item label="注册赠送积分" prop="registerBonus">
      <el-input-number v-model="draft.registerBonus" :min="0" :precision="0" />
      <p class="setting-hint">新用户注册成功后默认赠送的 AI 积分数量，0 表示不赠送。</p>
    </el-form-item>
    <el-form-item label="套餐升级策略" prop="upgradePolicy">
      <el-radio-group v-model="draft.upgradePolicy">
        <el-radio value="FULL_PRICE">升级补差价收全价</el-radio>
        <el-radio value="PRORATED">按剩余天数折算</el-radio>
      </el-radio-group>
      <p class="setting-hint">FULL_PRICE：升级时按目标套餐价格收取差价，旧套餐剩余价值不折算；PRORATED：按旧套餐剩余天数折算抵扣后收取差价。</p>
    </el-form-item>
    <el-form-item label="积分购买滑杆">
      <el-switch v-model="draft.creditSlider.enabled" active-text="启用" inactive-text="停用" />
      <p class="setting-hint">启用后前台「购买积分」支持滑杆自定义数量（在步长档位内滑动选择）。</p>
    </el-form-item>
    <template v-if="draft.creditSlider.enabled">
      <el-form-item label="滑杆下限" prop="creditSlider.min"><el-input-number v-model="draft.creditSlider.min" :min="1" :precision="0" /></el-form-item>
      <el-form-item label="滑杆上限" prop="creditSlider.max"><el-input-number v-model="draft.creditSlider.max" :min="1" :precision="0" /><p class="setting-hint">上限须大于下限。</p></el-form-item>
      <el-form-item label="滑杆步长" prop="creditSlider.step"><el-input-number v-model="draft.creditSlider.step" :min="1" :precision="0" /></el-form-item>
      <el-form-item label="积分单价（元）" prop="creditSlider.unitPrice"><el-input-number v-model="draft.creditSlider.unitPrice" :min="0" :precision="4" :step="0.01" /></el-form-item>
    </template>
    <el-form-item>
      <el-button type="primary" :loading="saving" @click="save">保存设置</el-button>
    </el-form-item>
  </el-form>
</template>

<style scoped>
.setting-hint {
  margin: 6px 0 0;
  color: #c0c4cc;
  font-size: 12px;
}
</style>
