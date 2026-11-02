<script setup lang="ts">
/**
 * 富文本字段行（v11，编排页排版瘦身）：
 * 默认仅一行展示当前内容摘要（去 HTML 取纯文本，超长省略号），右侧「编辑 / 删除」按钮；
 * 点「编辑」在弹窗内唤起 YuqueRichEditor 编辑（v-model 实时回写，自动保存照常触发）；
 * 点「删除」确认后清空内容。空内容显示「未填写」占位。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import YuqueRichEditor from '@/components/yuque/YuqueRichEditor.vue'

const props = defineProps<{
  modelValue: string
  /** 字段名（弹窗标题 / 删除确认文案） */
  title: string
  placeholder?: string
  maxlength?: number
  canEdit?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const dlg = ref(false)
const value = computed({
  get: () => props.modelValue || '',
  set: (v) => emit('update:modelValue', v || '')
})

/** 一行摘要：去 HTML 标签取纯文本并折叠空白 */
const plain = computed(() => {
  const div = document.createElement('div')
  div.innerHTML = props.modelValue || ''
  return (div.textContent || '').replace(/\s+/g, ' ').trim()
})

async function remove(): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认清空「${props.title}」内容？`, '确认删除', { type: 'warning', confirmButtonText: '清空', cancelButtonText: '取消' })
  } catch { return }
  value.value = ''
  ElMessage.success(`已清空「${props.title}」`)
}
</script>
<template>
  <div class="rtr">
    <div class="rtr-line" :class="{ empty: !plain }">
      <span class="rtr-text" :title="plain">{{ plain || '未填写' }}</span>
    </div>
    <div v-if="canEdit" class="rtr-ops">
      <el-button link type="primary" size="small" @click="dlg = true">编辑</el-button>
      <el-button v-if="plain" link type="danger" size="small" @click="remove">删除</el-button>
    </div>

    <el-dialog v-model="dlg" :title="`编辑${title}`" width="760px" append-to-body destroy-on-close :close-on-click-modal="false">
      <YuqueRichEditor v-model="value" :maxlength="maxlength" :min-height="240" :can-edit="canEdit" :placeholder="placeholder" />
      <template #footer>
        <el-button @click="dlg = false">完成</el-button>
      </template>
    </el-dialog>
  </div>
</template>
<style scoped>
.rtr { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; background: var(--el-fill-color-lighter); }
.rtr-line { flex: 1; min-width: 0; }
.rtr-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--el-text-color-primary); }
.rtr-line.empty .rtr-text { color: var(--el-text-color-placeholder); }
.rtr-ops { flex: none; display: flex; }
</style>
