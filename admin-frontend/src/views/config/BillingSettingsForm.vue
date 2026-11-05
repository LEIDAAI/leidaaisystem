<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { getBillingSettings, saveBillingSettings, type BillingSettings } from '../../api/config'

/** 全局计费设置表单（v17）：注册赠送积分 / 套餐升级补差策略 / 前台积分购买滑杆 */
const props = defineProps<{ settings: BillingSettings | null; canEdit: boolean; sliderOnly?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const saving = ref(false)
const formRef = ref<FormInstance>()
const draft = ref<BillingSettings>({ registerBonus: 0, upgradePolicy: 'FULL_PRICE', creditSlider: { enabled: false, min: 0, max: 0, step: 0, defaultValue: 0, unitPrice: 0 } })

const previewCredits = ref(0)
const sliderValid = computed(() => {
  const { min, max, step, defaultValue, unitPrice } = draft.value.creditSlider
  return [min, max, step].every(v => Number.isSafeInteger(v) && v > 0) && max > min && (max - min) % step === 0 && Number.isSafeInteger(defaultValue) && defaultValue >= min && defaultValue <= max && (defaultValue - min) % step === 0 && Number.isFinite(unitPrice) && unitPrice > 0
})
const previewPrice = computed(() => (Math.round(previewCredits.value * draft.value.creditSlider.unitPrice * 100) / 100).toFixed(2))
watch(() => draft.value.creditSlider.defaultValue, (value) => { previewCredits.value = value })
watch(() => ({ ...draft.value.creditSlider }), ({ min, max, step }) => {
  if (!sliderValid.value) return
  const current = Number.isFinite(previewCredits.value) ? previewCredits.value : min
  previewCredits.value = Math.min(max, Math.max(min, min + Math.round((current - min) / step) * step))
}, { immediate: true })

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
    { validator: (_r, v: number | undefined, cb) => (v === undefined || (Number.isSafeInteger(v) && v > 0 && (draft.value.creditSlider.max - draft.value.creditSlider.min) % v === 0)) ? cb() : cb(new Error('步长须为正整数且能整除上限与下限之差')), trigger: 'blur' }
  ],
  'creditSlider.defaultValue': [
    { required: true, message: '请输入默认积分', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => {
      const { min, max, step } = draft.value.creditSlider
      return Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max && (Number(v) - min) % step === 0 ? cb() : cb(new Error('默认积分须在上下限内且从下限起按步长对齐'))
    }, trigger: 'blur' }
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
      draft.value.creditSlider.defaultValue ??= draft.value.creditSlider.min
      previewCredits.value = draft.value.creditSlider.defaultValue
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
    if (draft.value.creditSlider.enabled && !sliderValid.value) { ElMessage.warning('请检查滑块范围、步长及单价，上下限差值必须能被步长整除'); return }
    const latest = await getBillingSettings()
    const payload = props.sliderOnly ? { ...latest, creditSlider: { ...draft.value.creditSlider } } : { ...latest, ...draft.value, creditSlider: { ...draft.value.creditSlider } }
    await saveBillingSettings(JSON.parse(JSON.stringify(payload)))
    ElMessage.success('计费设置已保存')
    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-form ref="formRef" :model="draft" :rules="rules" label-width="140px" :disabled="!canEdit" style="max-width: 640px">
    <el-form-item v-if="!sliderOnly" label="注册赠送积分" prop="registerBonus">
      <el-input-number v-model="draft.registerBonus" :min="0" :precision="0" />
      <p class="setting-hint">新用户注册成功后默认赠送的 AI 积分数量，0 表示不赠送。</p>
    </el-form-item>
    <el-form-item v-if="!sliderOnly" label="套餐升级策略" prop="upgradePolicy">
      <el-radio-group v-model="draft.upgradePolicy">
        <el-radio value="FULL_PRICE">升级补差价收全价</el-radio>
        <el-radio value="PRORATED">按剩余天数折算</el-radio>
      </el-radio-group>
      <p class="setting-hint">FULL_PRICE：升级时按目标套餐价格收取差价，旧套餐剩余价值不折算；PRORATED：按旧套餐剩余天数折算抵扣后收取差价。</p>
    </el-form-item>
    <el-form-item label="积分购买滑杆">
      <el-switch v-model="draft.creditSlider.enabled" active-text="启用" inactive-text="停用" />
      <p class="setting-hint">配置自定义积分数量；下方为后台交互预览，独立前台尚待接入此契约。统一单价，不采用前台当前硬编码的阶梯折扣。</p>
    </el-form-item>
    <template v-if="draft.creditSlider.enabled">
      <el-form-item label="滑杆下限" prop="creditSlider.min"><el-input-number v-model="draft.creditSlider.min" :min="1" :precision="0" /></el-form-item>
      <el-form-item label="滑杆上限" prop="creditSlider.max"><el-input-number v-model="draft.creditSlider.max" :min="1" :precision="0" /><p class="setting-hint">上限须大于下限。</p></el-form-item>
      <el-form-item label="滑杆步长" prop="creditSlider.step"><el-input-number v-model="draft.creditSlider.step" :min="1" :precision="0" /></el-form-item>
      <el-form-item label="默认积分" prop="creditSlider.defaultValue"><el-input-number v-model="draft.creditSlider.defaultValue" :min="draft.creditSlider.min" :max="draft.creditSlider.max" :precision="0" /><p class="setting-hint">须从下限起按步长对齐；修改后预览回到该积分数。</p></el-form-item>
      <el-form-item label="积分单价（元）" prop="creditSlider.unitPrice"><el-input-number v-model="draft.creditSlider.unitPrice" :min="0" :precision="4" :step="0.01" /></el-form-item>
    </template>
    <el-form-item v-if="draft.creditSlider.enabled && sliderValid" label="左右拖动预览">
      <div style="width:100%;padding:0 12px">
        <el-slider v-model="previewCredits" :min="draft.creditSlider.min" :max="draft.creditSlider.max" :step="draft.creditSlider.step" :disabled="false" />
        <div>{{ draft.creditSlider.min.toLocaleString() }} ～ {{ draft.creditSlider.max.toLocaleString() }} 积分 · 步长 {{ draft.creditSlider.step }}</div>
        <strong>{{ previewCredits.toLocaleString() }} 积分 / ¥{{ previewPrice }}</strong>
        <p class="setting-hint">总价 = 积分 × 统一单价，按分四舍五入。支持十万以上范围；此处不创建订单。</p>
      </div>
    </el-form-item>
    <el-alert v-if="!draft.creditSlider.enabled" title="自定义积分包已停用，不提供购买预览。" type="info" :closable="false" style="margin-bottom:16px" />
    <el-form-item>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存设置</el-button>
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
