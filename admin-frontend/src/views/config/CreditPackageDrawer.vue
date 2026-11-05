<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { saveCreditPackage, type CreditPackage } from '../../api/config'

/** 加油包表单抽屉（v17）：积分加油包商品（名称/积分/赠送/价格/角标/排序/状态/备注） */
const props = defineProps<{ modelValue: boolean; item: Partial<CreditPackage> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const saving = ref(false)
const draft = ref<Partial<CreditPackage>>({})
const formRef = ref<FormInstance>()

const rules: FormRules = {
  name: [{ required: true, message: '请输入加油包名称', trigger: 'blur' }],
  credits: [
    { required: true, message: '请输入积分数', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => (v === undefined || (Number.isInteger(v) && v > 0)) ? cb() : cb(new Error('积分须为正整数')), trigger: 'blur' }
  ],
  bonusCredits: [
    { validator: (_r, v: number | undefined, cb) => (v === undefined || (Number.isInteger(v) && v >= 0)) ? cb() : cb(new Error('赠送积分须为非负整数')), trigger: 'blur' }
  ],
  price: [
    { required: true, message: '请输入售价', trigger: 'blur' },
    { validator: (_r, v: number | undefined, cb) => (v === undefined || v >= 0) ? cb() : cb(new Error('价格不能为负数')), trigger: 'blur' }
  ],
  originalPrice: [
    { validator: (_r, v: number | undefined, cb) => (v === undefined || v === null || Number(v) > Number(draft.value.price ?? 0)) ? cb() : cb(new Error('划线价须大于售价')), trigger: 'blur' }
  ],
  remark: [{ max: 200, message: '备注最多 200 字', trigger: 'blur' }]
}

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (visible) {
      draft.value = JSON.parse(JSON.stringify(props.item || {}))
      // 默认值补齐：赠送积分 0 / 排序 0 / 启用
      draft.value.bonusCredits ??= 0
      draft.value.sort ??= 0
      draft.value.status ??= 1
      draft.value.price ??= 0
      nextTick(() => formRef.value?.clearValidate())
    }
  },
  { immediate: true }
)

/** 保存：有 id 更新、无 id 新建（由 saveCreditPackage 内部判断） */
async function save(): Promise<void> {
  if (!props.canEdit) return
  try { await formRef.value?.validate() } catch { return }
  saving.value = true
  try {
    await saveCreditPackage({ ...draft.value, remark: draft.value.remark?.trim() || undefined })
    ElMessage.success(draft.value.id ? '加油包已更新' : '加油包已创建')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑加油包' : '新建加油包'}`" size="520px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-form ref="formRef" :model="draft" :rules="rules" label-width="110px" :disabled="!canEdit">
      <el-form-item label="名称" prop="name"><el-input v-model="draft.name" placeholder="如「500 积分加油包」" /></el-form-item>
      <el-form-item label="积分" prop="credits"><el-input-number v-model="draft.credits" :min="1" :step="100" :precision="0" /></el-form-item>
      <el-form-item label="赠送积分" prop="bonusCredits"><el-input-number v-model="draft.bonusCredits" :min="0" :step="50" :precision="0" /></el-form-item>
      <el-form-item label="售价（元）" prop="price"><el-input-number v-model="draft.price" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="划线价（元）" prop="originalPrice">
        <el-input-number v-model="draft.originalPrice" :min="0" :precision="2" placeholder="可空" />
        <p class="pkg-hint">可选。填写的划线价须大于售价，前台展示为删除线原价。</p>
      </el-form-item>
      <el-form-item label="营销角标"><el-input v-model="draft.badge" placeholder="如「超值」「限时」，留空则不显示" maxlength="10" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="draft.sort" :min="0" :precision="0" /><p class="pkg-hint">前台按排序值升序展示</p></el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="draft.status">
          <el-radio :value="1">启用</el-radio>
          <el-radio :value="0">停用</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注" prop="remark"><el-input v-model="draft.remark" type="textarea" :rows="3" maxlength="200" show-word-limit placeholder="内部备注，前台不可见" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.pkg-hint {
  margin: 6px 0 0;
  color: #c0c4cc;
  font-size: 12px;
}
</style>
