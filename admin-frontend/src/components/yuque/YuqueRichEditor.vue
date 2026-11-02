<script setup lang="ts">
/**
 * HTML 兼容壳：历史字段（专家页 titleHtml/introduction/greeting）以「简单 HTML」存储（后端字段不变），
 * 内部转换成 YuqueEditor 的 Markdown 契约。systemPrompt/referencePrompts 等纯文本字段直接用 YuqueEditor，不经此壳。
 * lastHtml 守卫：仅当外部 html 与最近一次 emit 的值不同才回读转换，避免「父级回写 → 重转换 → 光标跳动」。
 */
import { ref, watch } from 'vue'
import YuqueEditor from './YuqueEditor.vue'
import { editorMdToHtml, htmlToEditorMd } from './htmlCompat'

const props = withDefaults(defineProps<{
  modelValue: string
  canEdit?: boolean
  placeholder?: string
  maxlength?: number
  minHeight?: number
}>(), { canEdit: false, placeholder: '', maxlength: 0, minHeight: 0 })
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const md = ref('')
let lastHtml: string | null = null

watch(() => props.modelValue, (h) => {
  if (h === lastHtml) return
  lastHtml = h
  md.value = htmlToEditorMd(h || '')
}, { immediate: true })

function onInput(v: string): void {
  // 空文档序列化为 '' 而非 '<p><br></p>'，保持空字段存储形态稳定
  const html = v.trim() ? editorMdToHtml(v) : ''
  lastHtml = html
  emit('update:modelValue', html)
}
</script>

<template>
  <YuqueEditor
    v-model="md"
    :can-edit="canEdit"
    :placeholder="placeholder"
    :maxlength="maxlength"
    :min-height="minHeight"
    @update:model-value="onInput"
  />
</template>
