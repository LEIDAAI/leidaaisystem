<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Check } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import { configVersions, restoreConfigVersion, type ConfigItem, type ConfigVersion } from '@/api/config'
import VersionConfirmDialog from './VersionConfirmDialog.vue'

/**
 * 版本历史抽屉（v6 Coze 风格改版）：左侧时间线卡片列表（最新版本带橙色「当前」徽章 + 绿勾保存结果行），
 * 点击卡片在右侧预览该版本快照（技能为 SKILL.md 正文，专家/MCP 为 JSON）；
 * 底部「还原为此版本」走版本确认框，恢复以新版本形式写入，不覆盖历史。
 * v26：移除「对比上一版」开关与行级 diff，预览区只展示选中版本快照。
 */
const props = defineProps<{ modelValue: boolean; kind: 'experts' | 'skills' | 'mcp/servers' | 'plans'; item: ConfigItem | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; restored: [] }>()
const versions = ref<ConfigVersion[]>([])
const loading = ref(false)
/** 当前选中（右侧预览）的版本号，打开时默认选最新 */
const selectedVer = ref<number | null>(null)
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
const snapText = (v?: ConfigVersion | null): string => {
  if (!v) return ''
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
  },
  { immediate: true }
)

/** 点击时间线卡片：切换右侧预览目标 */
function selectVersion(v: ConfigVersion): void {
  if (selectedVer.value === v.version) return
  selectedVer.value = v.version
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
    emit('restored')
  } finally {
    restoring.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`版本历史 · ${item?.name || ''}`" size="900px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
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
      <!-- 右：选中版本快照预览 -->
      <div class="preview">
        <template v-if="selected">
          <div class="preview-head">
            <span class="ptitle">{{ previewTitle }}</span>
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
.hist-wrap { display: flex; gap: 16px; height: 100%; min-height: 0; }
.hist-list { width: 330px; flex-shrink: 0; overflow: auto; padding-right: 4px; }
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
.preview { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.preview-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.ptitle { font-size: 13px; color: var(--el-text-color-regular); }
.preview-body { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; padding: 10px 12px; font-family: Consolas, Menlo, monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap; word-break: break-all; color: var(--el-text-color-primary); }
.drawer-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.muted { color: var(--el-text-color-secondary); font-size: 12px; }
</style>
