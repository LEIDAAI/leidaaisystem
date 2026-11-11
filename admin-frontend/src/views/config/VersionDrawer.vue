<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { configVersions, restoreConfigVersion, type ConfigItem, type ConfigVersion } from '@/api/config'
import { buildSnapshotEntries } from '@/utils/snapshot-entries'
import VersionConfirmDialog from './VersionConfirmDialog.vue'

/**
 * 版本历史抽屉（v27 三栏）：左栏版本列表（时间线卡片）→ 中栏该版本的条目清单（技能为 SKILL.md
 * 章节 + 附属文件，专家/MCP/套餐为快照字段）→ 右栏显示与所选条目对应的内容。
 * 底部「还原为此版本」走版本确认框，恢复以新版本形式写入，不覆盖历史。
 * v26：移除「对比上一版」开关与行级 diff，预览区只展示选中版本快照。
 */
const props = defineProps<{ modelValue: boolean; kind: 'experts' | 'skills' | 'mcp/servers' | 'plans'; item: ConfigItem | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; restored: [] }>()
const versions = ref<ConfigVersion[]>([])
const loading = ref(false)
/** 当前选中（右侧预览）的版本号，打开时默认选最新 */
const selectedVer = ref<number | null>(null)
/** v27：中栏条目清单里当前选中的条目 id（决定右栏显示哪一段内容） */
const selectedEntryId = ref<string | null>(null)
/** 恢复走版本确认框：待恢复版本与默认版本名（恢复自 <源版本名>） */
const restoreDialog = ref(false)
const restoreTarget = ref<{ version: number; defaultName: string } | null>(null)
const restoring = ref(false)

const sorted = computed(() => [...versions.value].sort((a, b) => b.version - a.version))
const selectedIndex = computed(() => sorted.value.findIndex((v) => v.version === selectedVer.value))
const selected = computed(() => (selectedIndex.value >= 0 ? sorted.value[selectedIndex.value] : null))
const isLatest = computed(() => !!selected.value && sorted.value[0]?.version === selected.value.version)
const previewTitle = computed(() =>
  props.kind === 'skills' ? 'SKILL.md 快照预览' : props.kind === 'mcp/servers' ? '连接配置快照预览（凭据已按服务端策略脱敏）' : props.kind === 'plans' ? '套餐配置快照预览（全量 JSON）' : '全量配置快照预览（凭据/提示词已按服务端策略脱敏）'
)
/** v27：当前版本的条目清单（技能=章节+附属文件，其它=快照字段） */
const entries = computed(() => buildSnapshotEntries(props.kind, selected.value?.snapshot))
const selectedEntry = computed(() => entries.value.find((e) => e.id === selectedEntryId.value) || null)
/** 右栏内容：优先显示选中条目，未选条目时回退整份快照 */
const snapText = (v?: ConfigVersion | null): string => {
  if (!v) return ''
  if (selectedEntry.value) return selectedEntry.value.content
  if (props.kind === 'skills') return String(v.snapshot.content || '')
  return JSON.stringify(v.snapshot, null, 2)
}
const shortTime = (t: string): string => (dayjs(t).isValid() ? dayjs(t).format('MM-DD HH:mm') : String(t))

watch(
  () => [props.modelValue, props.item?.id] as const,
  async ([visible]) => {
    if (!visible || !props.item) return
    loading.value = true
    try {
      versions.value = await configVersions(props.kind, props.item.id)
    } finally {
      loading.value = false
    }
    selectedVer.value = sorted.value[0]?.version ?? null
    selectedEntryId.value = null
  },
  { immediate: true }
)

/** 点击时间线卡片：切换右侧预览目标 */
function selectVersion(v: ConfigVersion): void {
  if (selectedVer.value === v.version) return
  selectedVer.value = v.version
  selectedEntryId.value = null
}
/** v27：选择条目（与右栏内容一一对应） */
function selectEntry(id: string): void {
  selectedEntryId.value = selectedEntryId.value === id ? null : id
}

/** 恢复走版本确认框，默认生成新版本名「恢复自 <源版本名>」（源版本无名称则用 v{N}） */
function askRestore(): void {
  if (!props.item || !selected.value) return
  restoreTarget.value = { version: selected.value.version, defaultName: `恢复自 ${selected.value.versionName || `v${selected.value.version}`}` }
  restoreDialog.value = true
}

async function onRestoreConfirm(v: { versionName: string; note: string }): Promise<void> {
  if (!props.item || !restoreTarget.value || restoring.value) return
  restoring.value = true
  try {
    await restoreConfigVersion(props.kind, props.item.id, restoreTarget.value.version, v.versionName, v.note || undefined)
    ElMessage.success('已恢复并生成新版本')
    restoreDialog.value = false
    versions.value = await configVersions(props.kind, props.item.id)
    selectedVer.value = sorted.value[0]?.version ?? null
    selectedEntryId.value = null
    emit('restored')
  } finally {
    restoring.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`版本历史 · ${item?.name || ''}`" size="1000px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <div class="hist-wrap">
      <!-- 左：时间线版本列表（点击卡片预览该版本） -->
      <div v-loading="loading" class="hist-list">
        <el-empty v-if="!loading && !sorted.length" description="暂无版本记录" :image-size="60" />
        <div v-else class="timeline">
          <div
            v-for="v in sorted"
            :key="v.version"
            class="vitem"
            :class="{ active: v.version === selectedVer, current: v.version === sorted[0]?.version }"
            @click="selectVersion(v)"
          >
            <span class="dot" />
            <div class="vcard">
              <div class="vhead">
                <span class="badge pub">发布</span>
                <span v-if="v.version === sorted[0]?.version" class="badge cur">当前</span>
                <span class="vtime" :title="v.createdAt">{{ shortTime(v.createdAt) }}</span>
              </div>
              <div class="vname">Version: {{ v.versionName || `v${v.version}` }}</div>
              <div class="vmeta"><el-icon class="ok"><Check /></el-icon>保存成功<span v-if="v.operator"> · {{ v.operator }}</span></div>
              <div v-if="v.note" class="vnote">{{ v.note }}</div>
            </div>
          </div>
        </div>
      </div>
      <!-- 中：当前版本的条目清单（技能=SKILL.md 章节 + 附属文件；其它=快照字段） -->
      <div class="entry-list">
        <div class="col-head">
          <span class="col-title">内容条目</span>
          <span class="col-count">{{ entries.length }}</span>
        </div>
        <el-empty v-if="!selected" description="先选择版本" :image-size="48" />
        <el-empty v-else-if="!entries.length" description="该版本无可展示条目" :image-size="48" />
        <ul v-else class="entry-items">
          <li
            v-for="e in entries"
            :key="e.id"
            class="entry-item"
            :class="{ active: selectedEntryId === e.id }"
            :title="e.label"
            @click="selectEntry(e.id)"
          >
            <span class="entry-label">{{ e.label }}</span>
            <span v-if="e.hint" class="entry-hint">{{ e.hint }}</span>
          </li>
        </ul>
      </div>
      <!-- 右：选中条目对应的内容 -->
      <div class="preview">
        <template v-if="selected">
          <div class="preview-head">
            <span class="ptitle">
              <template v-if="selectedEntry">{{ selectedEntry.label }}</template>
              <template v-else>{{ previewTitle }}</template>
            </span>
            <span class="pmeta">
              <b>{{ selected.versionName || `v${selected.version}` }}</b>
              <small>{{ shortTime(selected.createdAt) }}<span v-if="selected.operator"> · {{ selected.operator }}</span></small>
            </span>
          </div>
          <div class="preview-body">{{ snapText(selected) }}</div>
        </template>
        <el-empty v-else description="点击左侧版本查看快照" :image-size="60" />
      </div>
    </div>
    <template #footer>
      <div class="drawer-footer">
        <span class="muted">恢复将以新版本写入，当前内容自动进入历史，不覆盖既有版本记录。</span>
        <el-button v-if="canEdit" type="primary" :disabled="!selected || isLatest" @click="askRestore">还原为此版本</el-button>
      </div>
    </template>
    <VersionConfirmDialog
      v-model="restoreDialog"
      title="恢复版本确认"
      description="恢复旧版本将以新版本形式写入（当前内容自动进入历史），不覆盖既有版本记录。"
      :default-name="restoreTarget?.defaultName"
      confirm-text="确认并恢复"
      async
      :loading="restoring"
      @confirm="onRestoreConfirm"
    />
  </el-drawer>
</template>
<style scoped>
/* v26：两栏之间不再留空白窄带——左侧版本列表右缘直接是 1px 分隔线，预览面板紧贴 */
.hist-wrap { display: flex; gap: 0; height: 100%; min-height: 0; }
.hist-list { width: 280px; flex-shrink: 0; overflow: auto; padding-right: 14px; border-right: 1px solid var(--el-border-color-lighter); }
/* v27：中栏条目清单 */
.entry-list { width: 230px; flex-shrink: 0; overflow: auto; padding: 0 12px; border-right: 1px solid var(--el-border-color-lighter); display: flex; flex-direction: column; }
.col-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 0 8px; position: sticky; top: 0; background: var(--el-bg-color); z-index: 1; }
.col-title { font-size: 12px; color: var(--el-text-color-regular); font-weight: 600; }
.col-count { font-size: 12px; color: var(--el-text-color-secondary); }
.entry-items { list-style: none; margin: 0; padding: 0; }
.entry-item { display: flex; align-items: center; gap: 6px; padding: 7px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--el-text-color-regular); line-height: 1.4; }
.entry-item:hover { background: var(--el-fill-color-light); }
.entry-item.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
.entry-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-hint { flex: none; font-size: 11px; color: var(--el-text-color-secondary); background: var(--el-fill-color); border-radius: 8px; padding: 1px 6px; }
.timeline { position: relative; }
.timeline::before { content: ''; position: absolute; left: 6px; top: 10px; bottom: 10px; width: 2px; background: var(--el-border-color-lighter); }
.vitem { position: relative; padding: 0 0 12px 28px; cursor: pointer; }
.vitem:last-child { padding-bottom: 4px; }
.dot { position: absolute; left: 1px; top: 14px; width: 12px; height: 12px; border-radius: 50%; background: var(--el-color-primary); border: 2px solid #fff; box-shadow: 0 0 0 1px var(--el-color-primary-light-5); z-index: 1; box-sizing: border-box; }
.vitem.current .dot { background: var(--el-color-success); box-shadow: 0 0 0 1px var(--el-color-success-light-5); }
.vcard { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 10px 12px; background: var(--el-bg-color); transition: border-color 0.2s, background 0.2s; }
.vitem:hover .vcard { border-color: var(--el-color-primary-light-5); }
.vitem.active .vcard { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.vhead { display: flex; align-items: center; gap: 6px; }
.badge { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 10px; font-size: 12px; line-height: 18px; white-space: nowrap; }
.badge.pub { background: var(--el-fill-color); color: var(--el-text-color-regular); }
.badge.cur { background: var(--el-color-warning-light-9); color: var(--el-color-warning); border: 1px solid var(--el-color-warning-light-5); }
.vtime { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); }
.vname { margin-top: 6px; font-size: 13px; color: var(--el-text-color-primary); word-break: break-all; }
.vmeta { display: flex; align-items: center; gap: 4px; margin-top: 4px; font-size: 12px; color: var(--el-color-success); }
.vmeta .ok { font-size: 14px; }
.vnote { margin-top: 4px; font-size: 12px; color: var(--el-text-color-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.preview { flex: 1; min-width: 0; display: flex; flex-direction: column; padding-left: 14px; }
.preview-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.ptitle { font-size: 13px; color: var(--el-text-color-regular); }
.pmeta { display: flex; align-items: baseline; gap: 8px; font-size: 12px; color: var(--el-text-color-secondary); }
.pmeta b { font-size: 13px; color: var(--el-text-color-primary); font-weight: 600; }
.preview-body { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; font-family: Consolas, Menlo, monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--el-text-color-primary); }
.drawer-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
