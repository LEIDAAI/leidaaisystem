<script setup lang="ts">
/**
 * 技能导入预览对话框（v7）：承接「导入文件（JSON / ZIP）」的解析结果，逐行预览后批量导入。
 * - 编码冲突 / 批内重复自动建议新编码（可编辑；导入前实时校验冲突并阻断）
 * - 勾选控制导入范围；导入后逐行回显成功/失败原因，成功行置灰锁定
 * - 任一行导入成功即 emit imported（父级刷新列表），对话框保持打开以便查看失败原因重试
 * - v32：导入时可批量设置「归属智能体 / 适用平台 / 所属场景」，应用到勾选行后写入导入请求
 * - v35：新增「附件预览」列——图片附件以缩略图展示（点击可放大），导入后可在技能编辑器中预览
 * - v36：导入设置改为「选中即生效」——选智能体/平台/场景后立即写入勾选行，
 *   不再必须额外点「应用到勾选」；行内「归属设置」显示生效值，导入时按生效值提交
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { CheckboxValueType } from 'element-plus'
import { importSkillJson, listAgents, listScenarios, PLATFORMS, platformMeta, type Agent, type PlatformType, type Scenario } from '@/api/config'
import { ApiError } from '@/api/request'
import { SKILL_CODE_RE, type SkillImportDraft } from '@/utils/skill-import'
import { isImageName, mimeOfName } from '@/utils/binary'
import type { SkillFile } from '@/api/config'

interface ImportRow extends SkillImportDraft {
  checked: boolean
  /** 编码是否被自动调整过（与原始解析值不同） */
  suggested: boolean
  status: 'pending' | 'ok' | 'fail'
  message: string
  /** v32：归属智能体（必填：技能必须归属一个智能体） */
  agentId?: number | null
  /** v32：所属场景（null = 未分组） */
  scenarioId?: number | null
}

const props = defineProps<{ modelValue: boolean; drafts: SkillImportDraft[]; existingCodes: string[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'imported'): void }>()

const rows = ref<ImportRow[]>([])
const importing = ref(false)

// -------------------------------------------------------------- v32 导入设置：智能体 / 平台 / 场景
const agents = ref<Agent[]>([])
const scenarios = ref<Scenario[]>([])
/** 批量设置值（应用到勾选行） */
const bulkAgentId = ref<number | null>(null)
const bulkPlatforms = ref<PlatformType[]>(['1688'])
const bulkScenarioId = ref<number | null>(null)

const agentNameOf = (id?: number | null): string => (id ? agents.value.find((a) => a.id === id)?.name || '—' : '待选择智能体')
/** 场景下拉：按所选平台过滤（未选平台则给全部） */
const scenarioOptions = computed<Scenario[]>(() => {
  const picked = bulkPlatforms.value
  return picked.length ? scenarios.value.filter((s) => picked.includes(s.platformId)) : scenarios.value.slice()
})
const platformLabel = (list?: PlatformType[]): string => (list && list.length ? list.map((p) => platformMeta(p).label).join('、') : '未设置')
const scenarioNameOf = (id?: number | null): string => (id ? scenarios.value.find((s) => s.id === id)?.name || '—' : '未分组')

/** v35：行内图片附件（缩略图预览 + 点击放大） */
const imagesOf = (row: ImportRow): SkillFile[] => row.files.filter((f) => f.encoding === 'base64' || isImageName(f.name))
const thumbOf = (f: SkillFile): string => `data:${f.mime || mimeOfName(f.name)};base64,${f.content}`

function loadOptions(): Promise<void> {
  return Promise.all([listAgents(), listScenarios()])
    .then(([agentList, sceneList]) => { agents.value = agentList; scenarios.value = sceneList })
    .catch(() => { agents.value = []; scenarios.value = [] })
}

/** v36：把批量设置写入勾选行；silent=true 表示「选中即生效」的自动应用（不弹提示） */
function applyBulk(silent = false): void {
  const targets = rows.value.filter((r) => r.checked && r.status !== 'ok')
  // v34：智能体必选——未选择时阻断
  if (!bulkAgentId.value) {
    if (!silent) ElMessage.warning('请选择归属智能体（技能必须归属一个智能体）')
    return
  }
  targets.forEach((r) => {
    r.agentId = bulkAgentId.value
    r.platforms = bulkPlatforms.value.length ? [...bulkPlatforms.value] : (r.platforms || [])
    r.scenarioId = bulkScenarioId.value
  })
  if (!silent && targets.length) ElMessage.success(`已把导入设置应用到 ${targets.length} 个技能`)
}

/** v36：生效值——行自身值优先，未设置时回退到顶部「导入设置」当前选择 */
const rowAgentId = (r: ImportRow): number | null | undefined => r.agentId ?? bulkAgentId.value
const rowPlatforms = (r: ImportRow): PlatformType[] | undefined => (r.platforms && r.platforms.length) ? r.platforms : bulkPlatforms.value
const rowScenarioId = (r: ImportRow): number | null | undefined => r.scenarioId ?? bulkScenarioId.value

// v36：选中即生效——改「导入设置」里的任意一项，立即写入勾选行（不再要求手动点「应用到勾选」）
watch(bulkAgentId, () => applyBulk(true))
watch(bulkPlatforms, () => {
  // 平台变化后原场景可能已不在候选里，自动清空避免写入非法场景
  if (bulkScenarioId.value && !scenarioOptions.value.some((s) => s.id === bulkScenarioId.value)) bulkScenarioId.value = null
  applyBulk(true)
})
watch(bulkScenarioId, () => applyBulk(true))

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
    return { ...d, code, suggested, checked: true, status: 'pending', message: '', agentId: null, scenarioId: null }
  })
  // v36：重新打开时沿用上次「导入设置」的选择并直接落到行上（避免用户选了智能体却没点「应用到勾选」）
  if (bulkScenarioId.value && !scenarioOptions.value.some((s) => s.id === bulkScenarioId.value)) bulkScenarioId.value = null
  applyBulk(true)
  void loadOptions()
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
  // v34：每个导入的技能都必须已指定归属智能体；v36：行未设置时回退取顶部「导入设置」的当前选择
  const noAgent = selectedRows.value.filter((r) => !rowAgentId(r))
  if (noAgent.length) {
    ElMessage.warning(`有 ${noAgent.length} 个技能未指定归属智能体，请在「导入设置」中选择归属智能体（选择后会自动应用到勾选行）`)
    return
  }
  importing.value = true
  for (const r of selectedRows.value) {
    const agentId = rowAgentId(r) ?? null
    const platforms = rowPlatforms(r)
    const scenarioId = rowScenarioId(r) ?? null
    try {
      await importSkillJson({
        code: r.code, name: r.name, description: r.description, content: r.content, files: r.files,
        ...(r.group ? { group: r.group } : {}), ...(platforms && platforms.length ? { platforms } : {}),
        agentId, scenarioId
      })
      // v36：导入成功后回写生效值，行内展示与实际入库一致
      r.agentId = agentId
      r.platforms = platforms ? [...platforms] : r.platforms
      r.scenarioId = scenarioId
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
  <el-dialog v-model="visible" title="导入技能预览" width="1180px" :close-on-click-modal="false">
    <el-alert
      type="info" :closable="false" style="margin-bottom:12px"
      title="已从文件解析出以下技能；编码冲突已自动建议新编码（可编辑），勾选后批量导入。图片附件随技能一并导入，导入后可在编辑器中预览。"
    />

    <!-- v32 导入设置：智能体 / 平台 / 场景，应用到勾选行 -->
    <div class="import-settings">
      <span class="settings-label">导入设置</span>
      <el-select v-model="bulkAgentId" placeholder="归属智能体（必选）" style="width:220px">
        <el-option v-for="a in agents" :key="a.id" :value="a.id" :label="a.name" />
      </el-select>
      <el-select v-model="bulkPlatforms" multiple collapse-tags placeholder="适用平台" style="width:220px">
        <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="platformMeta(p).label" />
      </el-select>
      <el-select v-model="bulkScenarioId" clearable placeholder="所属场景（不选 = 未分组）" style="width:200px">
        <el-option v-for="s in scenarioOptions" :key="s.id" :value="s.id" :label="`${s.name}（${platformMeta(s.platformId).label}）`" />
      </el-select>
      <el-button type="primary" plain :disabled="!selectedRows.length" @click="applyBulk()">应用到勾选（{{ selectedRows.length }}）</el-button>
      <span class="settings-hint">选择后<b>立即生效</b>，自动写入勾选行（每个技能必须归属唯一一个智能体；设置会写入导入后的技能：智能体归属、适用平台、所属场景）</span>
    </div>
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
      <el-table-column label="附件预览" min-width="190">
        <template #default="{ row }">
          <div class="attach-cell">
            <el-image
              v-for="(f, i) in imagesOf(row as ImportRow).slice(0, 4)"
              :key="i"
              :src="thumbOf(f)"
              :preview-src-list="imagesOf(row as ImportRow).map(thumbOf)"
              fit="cover"
              hide-on-click-modal
              class="attach-thumb"
            />
            <span class="attach-text">
              {{ (row as ImportRow).files.length }} 个附件<template v-if="imagesOf(row as ImportRow).length"> · {{ imagesOf(row as ImportRow).length }} 张图片</template>
            </span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="归属设置" min-width="170">
        <template #default="{ row }">
          <div class="owner-line"><b>智能体</b><span :class="{ 'owner-pending': !rowAgentId(row as ImportRow) }">{{ agentNameOf(rowAgentId(row as ImportRow)) }}</span></div>
          <div class="owner-line"><b>平台</b>{{ platformLabel(rowPlatforms(row as ImportRow)) }}</div>
          <div class="owner-line"><b>场景</b>{{ scenarioNameOf(rowScenarioId(row as ImportRow)) }}</div>
        </template>
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
.import-settings { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 12px; border: 1px dashed var(--el-border-color); border-radius: 8px; background: var(--el-fill-color-lighter); }
.settings-label { font-size: 13px; font-weight: 600; color: var(--el-text-color-primary); }
.settings-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.owner-line { font-size: 12px; line-height: 18px; color: var(--el-text-color-regular); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.owner-line b { display: inline-block; width: 42px; color: var(--el-text-color-secondary); font-weight: 400; }
.owner-pending { color: var(--el-color-warning); }
.code-conflict :deep(.el-input__inner) { color: var(--el-color-danger); }
.cell-hint { font-size: 12px; line-height: 16px; margin-top: 2px; min-height: 0; }
.hint-err { color: var(--el-color-danger); font-size: 12px; }
.hint-warn { color: var(--el-color-warning); font-size: 12px; margin-right: 8px; }
.hint-ok { color: var(--el-color-success); font-size: 12px; }
.hint-muted { color: var(--el-text-color-secondary); font-size: 12px; }
.attach-cell { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.attach-thumb { width: 30px; height: 30px; border-radius: 4px; border: 1px solid var(--el-border-color-lighter); cursor: zoom-in; }
.attach-text { font-size: 12px; color: var(--el-text-color-regular); }
.footer-info { float: left; line-height: 32px; font-size: 13px; color: var(--el-text-color-regular); }
</style>
