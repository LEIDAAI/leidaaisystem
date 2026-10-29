<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { configVersions, restoreConfigVersion, type ConfigItem, type ConfigVersion } from '@/api/config'
import { simpleLineDiff, type DiffLine } from '@/utils/jsonio'
import VersionConfirmDialog from './VersionConfirmDialog.vue'

/** 版本历史抽屉：专家全量快照 / 技能 SKILL.md 快照 / MCP 连接配置快照，支持两版本行级 diff 与恢复（v5 补齐 MCP） */
const props = defineProps<{ modelValue: boolean; kind: 'experts' | 'skills' | 'mcp/servers'; item: ConfigItem | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; restored: [] }>()
const versions = ref<ConfigVersion[]>([])
const loading = ref(false)
const oldVer = ref<number | null>(null)
const newVer = ref<number | null>(null)
/** 恢复走版本确认框：待恢复版本与默认版本名（恢复自 <源版本名>） */
const restoreDialog = ref(false)
const restoreTarget = ref<{ version: number; defaultName: string } | null>(null)

const sorted = computed(() => [...versions.value].sort((a, b) => b.version - a.version))
const oldSnap = computed(() => versions.value.find((v) => v.version === oldVer.value))
const newSnap = computed(() => versions.value.find((v) => v.version === newVer.value))
const snapText = (v?: ConfigVersion): string => {
  if (!v) return ''
  if (props.kind === 'skills') return String(v.snapshot.content || '')
  return JSON.stringify(v.snapshot, null, 2)
}
const diffLines = computed<DiffLine[]>(() => {
  if (!oldSnap.value || !newSnap.value) return []
  return simpleLineDiff(snapText(oldSnap.value), snapText(newSnap.value))
})
const diffTitle = computed(() => (props.kind === 'skills' ? 'SKILL.md 正文差异' : props.kind === 'mcp/servers' ? '连接配置 JSON 差异（含工具绑定；凭据已按服务端策略脱敏）' : '全量配置 JSON 差异（凭据/提示词已按服务端策略脱敏）'))

watch(
  () => [props.modelValue, props.item?.id] as const,
  async ([visible]) => {
    if (!visible || !props.item) return
    loading.value = true
    try {
      versions.value = await configVersions(props.kind, props.item.id)
      oldVer.value = sorted.value[1]?.version ?? null
      newVer.value = sorted.value[0]?.version ?? null
    } finally {
      loading.value = false
    }
  },
  { immediate: true }
)

function askRestore(version: number, sourceName?: string): void {
  if (!props.item) return
  // v5：恢复同样走版本确认框，默认生成新版本名「恢复自 <源版本名>」（源版本无名称则用 v{N}）
  restoreTarget.value = { version, defaultName: `恢复自 ${sourceName || `v${version}`}` }
  restoreDialog.value = true
}

async function onRestoreConfirm(v: { versionName: string; note: string }): Promise<void> {
  if (!props.item || !restoreTarget.value) return
  await restoreConfigVersion(props.kind, props.item.id, restoreTarget.value.version, v.versionName, v.note || undefined)
  ElMessage.success('已恢复并生成新版本')
  versions.value = await configVersions(props.kind, props.item.id)
  emit('restored')
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`版本历史 · ${item?.name || ''}`" size="820px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-alert title="每次保存生成快照；恢复旧版本会以新版本形式写入，不覆盖历史。" type="info" :closable="false" style="margin-bottom:12px" />
    <el-table v-loading="loading" :data="sorted" size="small">
      <el-table-column prop="version" label="版本" width="70"><template #default="{ row }">v{{ row.version }}</template></el-table-column>
      <el-table-column prop="versionName" label="版本名称" min-width="140" show-overflow-tooltip><template #default="{ row }">{{ row.versionName || '—' }}</template></el-table-column>
      <el-table-column prop="operator" label="操作人" width="90"><template #default="{ row }">{{ row.operator || '—' }}</template></el-table-column>
      <el-table-column prop="createdAt" label="保存时间" width="165" />
      <el-table-column prop="note" label="变更说明" min-width="150" show-overflow-tooltip />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" @click="newVer = row.version; oldVer = sorted.find((v) => v.version < row.version)?.version ?? row.version">对比</el-button>
          <el-button v-if="canEdit" link type="warning" @click="askRestore(row.version, row.versionName)">恢复</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div style="display:flex;gap:12px;align-items:center;margin:16px 0 8px">
      <span>对比：</span>
      <el-select v-model="oldVer" placeholder="旧版本" style="width:140px"><el-option v-for="v in sorted" :key="`o${v.version}`" :value="v.version" :label="`v${v.version} ${v.versionName || ''}`" /></el-select>
      <span>→</span>
      <el-select v-model="newVer" placeholder="新版本" style="width:140px"><el-option v-for="v in sorted" :key="`n${v.version}`" :value="v.version" :label="`v${v.version} ${v.versionName || ''}`" /></el-select>
      <span class="muted">{{ diffTitle }}</span>
    </div>
    <div v-if="diffLines.length" class="diff-box">
      <div v-for="(l, i) in diffLines" :key="i" :class="['diff-line', l.type]">
        <template v-if="l.type !== 'same'">{{ l.type === 'add' ? '+ ' : '- ' }}{{ l.text }}</template>
        <template v-else>&nbsp;{{ l.text }}</template>
      </div>
    </div>
    <el-empty v-else description="选择两个版本查看差异" :image-size="60" />
    <VersionConfirmDialog
      v-model="restoreDialog"
      title="恢复版本确认"
      description="恢复旧版本将以新版本形式写入（当前内容自动进入历史），不覆盖既有版本记录。"
      :default-name="restoreTarget?.defaultName"
      confirm-text="确认并恢复"
      @confirm="onRestoreConfirm"
    />
  </el-drawer>
</template>
<style scoped>
.diff-box { border: 1px solid var(--el-border-color); border-radius: 4px; max-height: 420px; overflow: auto; font-family: Consolas, Menlo, monospace; font-size: 12px; }
.diff-line { padding: 1px 8px; white-space: pre-wrap; word-break: break-all; }
.diff-line.add { background: #f0f9eb; color: #67c23a; }
.diff-line.del { background: #fef0f0; color: #f56c6c; text-decoration: line-through; }
.diff-line.same { color: #909399; }
</style>
