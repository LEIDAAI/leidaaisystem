<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { getBillingSettings, saveBillingSettings, type BillingSettings } from '../../api/config'

const props = defineProps<{ settings: BillingSettings | null; canEdit: boolean; sliderOnly?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const saving = ref(false)
const formRef = ref<FormInstance>()
const draft = ref<BillingSettings>({ registerBonus: 100, upgradePolicy: 'PRORATED', creditSlider: { enabled: false, min: 0, max: 0, step: 0, defaultValue: 0, unitPrice: 0, tiers: [] } })
const savedSnapshot = ref('')
const snapshot = (value: BillingSettings) => JSON.stringify(props.sliderOnly ? value.creditSlider : value)
const dirty = computed(() => Boolean(savedSnapshot.value) && snapshot(draft.value) !== savedSnapshot.value)
const previewCredits = ref(0)
const sliderValid = computed(() => {
  const { min, max, step, defaultValue, unitPrice } = draft.value.creditSlider
  return [min, max, step].every(v => Number.isSafeInteger(v) && v > 0) && max > min && (max - min) % step === 0 && Number.isSafeInteger(defaultValue) && defaultValue >= min && defaultValue <= max && (defaultValue - min) % step === 0 && Number.isFinite(unitPrice) && unitPrice > 0
})
/** 阶梯区间：命中"≥min"的最大档单价（与前台 CUSTOM_TIERS 同口径） */
function tierRateOf(slider: BillingSettings['creditSlider'], credits: number): number {
  const tiers = [...(slider.tiers || [{ min: slider.min, rate: slider.unitPrice }])].sort((a, b) => a.min - b.min)
  let rate = tiers[0]?.rate ?? slider.unitPrice
  for (const t of tiers) { if (credits >= t.min) rate = t.rate }
  return rate
}
const tiersValid = computed(() => {
  const { min, max, tiers } = draft.value.creditSlider
  const list = tiers || []
  if (!list.length) return true
  if (!list.every(t => Number.isSafeInteger(t.min) && t.min > 0 && Number.isFinite(t.rate) && t.rate > 0)) return false
  const sorted = [...list].sort((a, b) => a.min - b.min)
  if (new Set(sorted.map(t => t.min)).size !== sorted.length) return false
  if (sorted[0].min !== min) return false
  if (sorted.some(t => (t.min - min) % Math.max(1, draft.value.creditSlider.step) !== 0)) return false
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].rate > sorted[i - 1].rate) return false
    if (Math.round(sorted[i].min * sorted[i].rate * 100) < Math.round(sorted[i - 1].min * sorted[i - 1].rate * 100)) return false
  }
  if (max < sorted[sorted.length - 1].min) return false
  if (Math.round(max * sorted[sorted.length - 1].rate * 100) < Math.round(sorted[sorted.length - 1].min * sorted[sorted.length - 1].rate * 100)) return false
  return true
})
const previewPrice = computed(() => (Math.round(previewCredits.value * tierRateOf(draft.value.creditSlider, previewCredits.value) * 100) / 100).toFixed(2))
watch(() => draft.value.creditSlider.defaultValue, (value) => { previewCredits.value = value })
watch(() => ({ ...draft.value.creditSlider }), ({ min, max, step }) => {
  if (!sliderValid.value) return
  const current = Number.isFinite(previewCredits.value) ? previewCredits.value : min
  previewCredits.value = Math.min(max, Math.max(min, min + Math.round((current - min) / step) * step))
}, { immediate: true })

const rules: FormRules = {
  'creditSlider.min': [
    { validator: (_r, v, cb) => Number.isSafeInteger(v) && v > 0 ? cb() : cb(new Error('下限须为正整数')), trigger: 'blur' }
  ],
  'creditSlider.max': [
    { validator: (_r, v, cb) => Number.isSafeInteger(v) && v > draft.value.creditSlider.min ? cb() : cb(new Error('上限须为正整数且大于下限')), trigger: 'blur' }
  ],
  'creditSlider.step': [
    { validator: (_r, v, cb) => Number.isSafeInteger(v) && v > 0 && (draft.value.creditSlider.max - draft.value.creditSlider.min) % v === 0 ? cb() : cb(new Error('步长须为正整数且能整除上下限差值')), trigger: 'blur' }
  ],
  'creditSlider.defaultValue': [
    { validator: (_r, v, cb) => {
      const { min, max, step } = draft.value.creditSlider
      return Number.isSafeInteger(v) && v >= min && v <= max && (v - min) % step === 0 ? cb() : cb(new Error('默认积分须在上下限内且从下限起按步长对齐'))
    }, trigger: 'blur' }
  ],
  'creditSlider.unitPrice': [
    { validator: (_r, v, cb) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? cb() : cb(new Error('单价须为大于 0 的数字')), trigger: 'blur' }
  ]
}

watch(() => props.settings, (settings) => {
  if (!settings || dirty.value) return
  const value: BillingSettings = JSON.parse(JSON.stringify(settings))
  value.creditSlider.defaultValue ??= value.creditSlider.min
  // 兼容旧数据：无阶梯时按单一区间（unitPrice 为最低档）补齐，保存后升级为 tiers 结构
  if (!value.creditSlider.tiers?.length) value.creditSlider.tiers = [{ min: value.creditSlider.min, rate: value.creditSlider.unitPrice }]
  savedSnapshot.value = snapshot(value)
  draft.value = { ...value, registerBonus: 100, upgradePolicy: 'PRORATED' }
  previewCredits.value = value.creditSlider.defaultValue
  nextTick(() => formRef.value?.clearValidate())
}, { immediate: true, deep: true })

async function save(): Promise<void> {
  if (!props.canEdit || saving.value || !props.settings) return
  try { await formRef.value?.validate() } catch { return }
  if (draft.value.creditSlider.enabled && !sliderValid.value) {
    ElMessage.warning('请检查滑块范围、步长、默认积分及单价')
    return
  }
  if (draft.value.creditSlider.enabled && !tiersValid.value) {
    ElMessage.warning('阶梯区间不合法：起购量须对齐下限与步长、高档单价不高于低档、总价随数量单调不减')
    return
  }
  const sent: BillingSettings = JSON.parse(JSON.stringify(draft.value))
  const sentSnapshot = snapshot(sent)
  saving.value = true
  try {
    const latest = await getBillingSettings()
    const payload = { ...latest, registerBonus: 100, upgradePolicy: 'PRORATED' as const, creditSlider: { ...sent.creditSlider } }
    const saved = await saveBillingSettings(payload)
    savedSnapshot.value = snapshot(saved)
    if (snapshot(draft.value) === sentSnapshot) draft.value = JSON.parse(JSON.stringify(saved))
    ElMessage.success('计费设置已保存')
    emit('saved')
  } finally {
    saving.value = false
  }
}

/** 阶梯档增删 */
function addTier() {
  const slider = draft.value.creditSlider
  if (!slider.tiers?.length) slider.tiers = [{ min: slider.min, rate: slider.unitPrice }]
  const last = [...slider.tiers].sort((a, b) => a.min - b.min)[slider.tiers.length - 1]
  const step = Math.max(1, slider.step)
  const nextMin = Math.min(slider.max, (last ? last.min : slider.min) + step * 10)
  slider.tiers.push({ min: nextMin, rate: last ? last.rate : slider.unitPrice })
}
function removeTier(i: number) {
  const slider = draft.value.creditSlider
  slider.tiers?.splice(i, 1)
  if (!slider.tiers?.length) { slider.tiers = [{ min: slider.min, rate: slider.unitPrice }] }
  else slider.unitPrice = [...slider.tiers].sort((a, b) => a.min - b.min)[0].rate
}
</script>
<template>
  <el-form ref="formRef" :model="draft" :rules="rules" label-width="140px" :disabled="!canEdit || saving" class="billing-form">
    <section v-if="!sliderOnly" class="setting-group">
      <h3>注册赠分</h3>
      <el-form-item label="注册赠送积分">
        <el-input-number :model-value="100" disabled :controls="false" />
        <p class="setting-hint">固定为注册成功赠送 100 分一批。常规购买不另赠积分；运营特批须通过独立权限、原因和审计操作。</p>
      </el-form-item>
    </section>

    <section v-if="!sliderOnly" class="setting-group">
      <h3>升级报价与未来期规则</h3>
      <el-form-item label="固定报价规则"><strong>按实付价折算剩余价值，补差负数取 0</strong></el-form-item>
      <ul class="billing-rules">
        <li>标准版 / 高级版 / 旗舰版功能一致，仅积分额度不同；单账号制，无席位。</li>
        <li>月转年即时转换：抵扣月付剩余价值，自转换日起按 365 天重置年付锚点。</li>
        <li>降级、年转月到期排队生效；已付未来期按付款时价格锁价、排队顺延。</li>
        <li>当期和未来期一律不退款；首版无自动续费，到期前 7 天提醒。</li>
      </ul>
      <el-alert title="以上为已拍板规则。当前保存报价策略标记，不代表实付抵扣、未来期队列、发分、提醒或支付履约引擎已落地，仍须交易服务联调验收。" type="info" :closable="false" />
    </section>

    <section class="setting-group">
      <h3>自定义积分包滑块</h3>
      <p class="setting-hint group-hint">积分包仅有效会员可购，付费积分 365 天有效，不随会员到期清零。固定包沿商品价格，自定义包按本设置单价计算。</p>
      <el-form-item label="积分购买滑块">
        <el-switch v-model="draft.creditSlider.enabled" active-text="启用" inactive-text="停用" />
        <p class="setting-hint">下方为后台交互预览；前台购买校验、有效期批次及到账须接入购买链路。</p>
      </el-form-item>
      <template v-if="draft.creditSlider.enabled">
        <el-form-item label="滑块下限" prop="creditSlider.min"><el-input-number v-model="draft.creditSlider.min" :min="1" :precision="0" /></el-form-item>
        <el-form-item label="滑块上限" prop="creditSlider.max"><el-input-number v-model="draft.creditSlider.max" :min="1" :precision="0" /></el-form-item>
        <el-form-item label="滑块步长" prop="creditSlider.step"><el-input-number v-model="draft.creditSlider.step" :min="1" :precision="0" /></el-form-item>
        <el-form-item label="默认积分" prop="creditSlider.defaultValue"><el-input-number v-model="draft.creditSlider.defaultValue" :min="draft.creditSlider.min" :max="draft.creditSlider.max" :precision="0" /><p class="setting-hint">须从下限起按步长对齐；修改后预览回到该积分数。</p></el-form-item>
        <el-form-item label="阶梯单价">
          <div class="tier-editor">
            <div v-for="(t, i) in draft.creditSlider.tiers" :key="i" class="tier-row">
              <span class="tier-label">满</span>
              <el-input-number v-model="t.min" :min="draft.creditSlider.min" :max="draft.creditSlider.max" :step="draft.creditSlider.step" :precision="0" :disabled="!canEdit || saving" controls-position="right" />
              <span class="tier-label">积分起，单价</span>
              <el-input-number v-model="t.rate" :min="0.0001" :precision="4" :step="0.001" :disabled="!canEdit || saving" controls-position="right" />
              <span class="tier-label">元 / 积分</span>
              <el-button v-if="(draft.creditSlider.tiers?.length ?? 0) > 1" link type="danger" :disabled="!canEdit || saving || t.min === draft.creditSlider.min" @click="removeTier(i)">删除</el-button>
            </div>
            <el-button v-if="canEdit && !saving" link type="primary" @click="addTier">+ 添加阶梯档</el-button>
            <p class="setting-hint">命中规则：达到某档起购量即按该档单价计算（取满足条件的最高档）。高档单价须不高于低档（量大更优惠），任意两档总价不得倒挂；最低档起购量固定为滑块下限。前台自定义包报价将按此阶梯计算。</p>
          </div>
        </el-form-item>
        <el-form-item v-if="draft.creditSlider.enabled && sliderValid && !tiersValid" label=" ">
          <el-alert title="阶梯区间当前不合法，保存将被拦截：请检查起购量对齐、单价递减与总价单调不减。" type="warning" :closable="false" />
        </el-form-item>
      </template>
      <el-form-item v-if="draft.creditSlider.enabled && sliderValid" label="拖动预览">
        <div class="slider-preview">
          <el-slider v-model="previewCredits" :min="draft.creditSlider.min" :max="draft.creditSlider.max" :step="draft.creditSlider.step" :disabled="false" />
          <div>{{ draft.creditSlider.min.toLocaleString() }} ～ {{ draft.creditSlider.max.toLocaleString() }} 积分 · 步长 {{ draft.creditSlider.step }}</div>
          <strong>{{ previewCredits.toLocaleString() }} 积分 / ¥{{ previewPrice }}</strong>
          <p class="setting-hint">总价 = 积分 × 单价，按分四舍五入。此处不创建订单。</p>
        </div>
      </el-form-item>
      <el-alert v-if="!draft.creditSlider.enabled" title="自定义积分包已停用，不提供购买预览。" type="info" :closable="false" />
    </section>

    <div class="save-bar">
      <span role="status" :class="{ dirty }">{{ saving ? '正在保存…' : dirty ? '有未保存修改' : '已保存 / 无未保存修改' }}</span>
      <el-button v-if="canEdit" type="primary" :disabled="!settings || !dirty" :loading="saving" @click="save">保存设置</el-button>
    </div>
  </el-form>
</template>

<style scoped>
.billing-form { max-width: 880px; }
.setting-group { margin-bottom: 20px; padding: 16px 20px; border: 1px solid #dcdfe6; border-radius: 8px; }
.setting-group h3 { margin: 0 0 16px; color: #303133; font-size: 16px; }
.setting-hint { width: 100%; margin: 6px 0 0; color: #606266; font-size: 13px; line-height: 1.65; }
.group-hint { margin-bottom: 18px; }
.billing-rules { padding-left: 22px; color: #303133; line-height: 1.9; }
.slider-preview { width: 100%; padding: 0 12px; }
.tier-editor { width: 100%; }
.tier-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.tier-label { color: #606266; font-size: 13px; white-space: nowrap; }
.save-bar { position: sticky; bottom: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; border-top: 1px solid #dcdfe6; background: #fff; box-shadow: 0 -4px 12px #00000008; color: #606266; }
.dirty { color: #9a6700; font-weight: 600; }
</style>
