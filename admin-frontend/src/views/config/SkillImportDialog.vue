<script setup lang="ts">
/**
 * 技能导入预览对话框（v7）：承接「导入文件（JSON / ZIP）」的解析结果，逐行预览后批量导入。
 * - 编码冲突 / 批内重复自动建议新编码（可编辑；导入前实时校验冲突并阻断）
 * - 勾选控制导入范围；导入后逐行回显成功/失败原因，成功行置灰锁定
 * - 任一行导入成功即 emit imported（父级刷新列表），对话框保持打开以便查看失败原因重试
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CheckboxValueType } from 'element-plus'
import { importSkillJson } from '@/api/config'
import { ApiError } from '@/api/request'
import { SKILL_CODE_RE, type SkillImportDraft } from '@/utils/skill-import'

interface ImportRow extends SkillImportDraft {
  checked: boolean
  /** 编码是否被自动调整过（与原始解析值不同） */
  suggested: boolean
  status: 'pending' | 'ok' | 'fail'
  message: string
}

const props = defineProps<{ modelValue: boolean; drafts: SkillImportDraft[]; existingCodes: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'imported'): void }>()

const rows = ref<ImportRow[]>([])
const importing = ref(false)

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

// 每次打开重建行：批内/与现有技能的编码冲突自动追加 _2/_3 后缀
watch(() => props.modelValue, (open) => {
  if (!open) return
  const taken = new Set(props.existingCodes)
  rows.value = props.drafts.map((d) => {
    let code = d.code
    let suggested = false
    if (!SKILL_CODE_RE.test(code)) {
      code = 'imported-skill'
      suggested = true
    }
    if (taken.has(code)) {
      let n = 2
      let c = `${code}_${n}`
      while (taken.has(c)) c = `${code}_${++n}`
      code = c
      suggested = true
    }
    taken.add(code)
    return { ...d, code, suggested, checked: true, status: 'pending', message: '' }
  })
})

/** 实时冲突校验（手动编辑编码后仍可发现冲突；已导入成功的行不再参与校验） */
function conflictOf(row: ImportRow): string {
  if (row.status === 'ok') return ''
  if (!SKILL_CODE_RE.test(row.code)) return '编码仅允许字母数字下划线短横线'
  if (rows.value.some((r) => r !== row && r.status !== 'ok' && r.code === row.code)) return '与本次导入的其他技能编码重复'
  if (props.existingCodes.includes(row.code)) return '与现有技能编码冲突'
  return ''
}

const selectedRows = computed(() => rows.value.filter((r) => r.checked))
const okCount = computed(() => rows.value.filter((r) => r.status === 'ok').length)
const allChecked = computed(() => rows.value.length > 0 && rows.value.every((r) => r.checked))
const someChecked = computed(() => rows.value.some((r) => r.checked) && !allChecked.value)

function toggleAll(v: CheckboxValueType): void {
  rows.value.forEach((r) => { r.checked = Boolean(v) })
}

async function doImport(): Promise<void> {
  const blocked = selectedRows.value.filter((r) => conflictOf(r))
  if (blocked.length) {
    ElMessage.warning(`${blocked.length} 行编码存在冲突，请修改后再导入`)
    return
  }
  if (!selectedRows.value.length) {
    ElMessage.warning('请至少勾选一个技能')
    return
  }
  importing.value = true
  for (const r of selectedRows.value) {
    try {
      await importSkillJson({
        code: r.code, name: r.name, description: r.description, content: r.content, files: r.files,
        ...(r.group ? { group: r.group } : {}), ...(r.platforms ? { platforms: r.platforms } : {})
      })
      r.status = 'ok'
      r.message = '导入成功'
    } catch (e) {
      r.status = 'fail'
      r.message = e instanceof ApiError ? e.message : String(e)
    }
  }
  importing.value = false
  if (okCount.value) {
    emit('imported')
    ElMessage.success(`已导入 ${okCount.value} 个技能`)
  }
}
</script>
<template>
  <el-dialog v-model="visible" title="导入技能预览" width="860px" :close-on-click-modal="false">
    <el-alert
      type="info" :closable="false" style="margin-bottom:12px"
      title="已从文件解析出以下技能；编码冲突已自动建议新编码（可编辑），勾选后批量导入"
    />
    <el-table :data="rows" max-height="420" size="small">
      <el-table-column width="44" align="center">
        <template #header>
          <el-checkbox :model-value="allChecked" :indeterminate="someChecked" @change="toggleAll" />
        </template>
        <template #default="{ row }">
          <el-checkbox v-model="(row as ImportRow).checked" :disabled="(row as ImportRow).status === 'ok'" />
        </template>
      </el-table-column>
      <el-table-column label="名称" min-width="150">
        <template #default="{ row }">
          <el-input v-model="(row as ImportRow).name" size="small" :disabled="(row as ImportRow).status === 'ok'" />
        </template>
      </el-table-column>
      <el-table-column label="编码" min-width="170">
        <template #default="{ row }">
          <el-input
            v-model="(row as ImportRow).code" size="small" :disabled="(row as ImportRow).status === 'ok'"
            :class="{ 'code-conflict': conflictOf(row as ImportRow) }"
          />
          <div class="cell-hint">
            <span v-if="(row as ImportRow).suggested && (row as ImportRow).status === 'pending'" class="hint-warn">已自动调整编码</span>
            <span v-if="conflictOf(row as ImportRow)" class="hint-err">{{ conflictOf(row as ImportRow) }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="文件数" width="70" align="center">
        <template #default="{ row }">{{ (row as ImportRow).files.length + 1 }}</template>
      </el-table-column>
      <el-table-column label="来源" min-width="120" show-overflow-tooltip>
        <template #default="{ row }">{{ (row as ImportRow).source }}</template>
      </el-table-column>
      <el-table-column label="结果" width="190">
        <template #default="{ row }">
          <span v-if="(row as ImportRow).status === 'ok'" class="hint-ok">✓ 已导入</span>
          <span v-else-if="(row as ImportRow).status === 'fail'" class="hint-err">✗ {{ (row as ImportRow).message }}</span>
          <span v-else class="hint-muted">待导入</span>
        </template>
      </el-table-column>
    </el-table>
    <template #footer>
      <span class="footer-info">已选 {{ selectedRows.length }} / {{ rows.length }}<template v-if="okCount">；成功 {{ okCount }}</template></span>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" :loading="importing" @click="doImport">开始导入</el-button>
    </template>
  </el-dialog>
</template>
<style scoped>
.code-conflict :deep(.el-input__inner) { color: var(--el-color-danger); }
.cell-hint { font-size: 12px; line-height: 16px; margin-top: 2px; min-height: 0; }
.hint-err { color: var(--el-color-danger); font-size: 12px; }
.hint-warn { color: var(--el-color-warning); font-size: 12px; margin-right: 8px; }
.hint-ok { color: var(--el-color-success); font-size: 12px; }
.hint-muted { color: var(--el-text-color-secondary); font-size: 12px; }
.footer-info { float: left; line-height: 32px; font-size: 13px; color: var(--el-text-color-regular); }
</style>
