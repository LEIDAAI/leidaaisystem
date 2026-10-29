<script setup lang="ts">
import { ref, watch } from 'vue'
import dayjs from 'dayjs'

/**
 * 版本确认框（v5）：专家/技能/MCP 保存（发布）与版本恢复前确认。
 * 版本名称默认按当前时间 yyyyMMddHHmmss 自动生成（如 20261028153045），可修改；
 * 变更说明可选；确认后才提交写库（version +1 并生成快照）。
 */
const props = defineProps<{
  modelValue: boolean
  title?: string
  /** 顶部说明（如"确认后将写库、版本 +1 并生成快照"） */
  description?: string
  /** 预填版本名称（恢复场景传「恢复自 <源版本名>」）；留空按当前时间生成 */
  defaultName?: string
  confirmText?: string
  /** 异步确认：点确认后不自关闭，由父组件在提交成功后关闭（失败时保留输入） */
  async?: boolean
  /** 确认按钮 loading（异步模式下父组件传入提交状态） */
  loading?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; confirm: [{ versionName: string; note: string }] }>()
const versionName = ref('')
const note = ref('')

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) return
    versionName.value = (props.defaultName || '').trim() || dayjs().format('YYYYMMDDHHmmss')
    note.value = ''
  },
  { immediate: true }
)

function onConfirm(): void {
  emit('confirm', { versionName: versionName.value.trim() || dayjs().format('YYYYMMDDHHmmss'), note: note.value.trim() })
  if (!props.async) emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog :model-value="modelValue" :title="title || '版本确认'" width="500px" append-to-body @update:model-value="emit('update:modelValue', $event)">
    <p v-if="description" class="muted" style="margin:0 0 14px">{{ description }}</p>
    <el-form label-width="90px" @submit.prevent>
      <el-form-item label="版本名称">
        <el-input v-model="versionName" maxlength="64" show-word-limit placeholder="按当前时间自动生成，如 20261028153045" />
        <p class="muted">默认按当前时间（yyyyMMddHHmmss）自动生成，可修改；该名称将展示在版本历史列表。</p>
      </el-form-item>
      <el-form-item label="变更说明">
        <el-input v-model="note" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="可选，记录本次变更目的（进入版本历史）" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="loading" @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="onConfirm">{{ confirmText || '确认并保存' }}</el-button>
    </template>
  </el-dialog>
</template>
