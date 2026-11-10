<script setup lang="ts">
/**
 * 技能管理页（v7，Open WebUI 式）：
 * 搜索 + 行式列表（勾选/图标/名称/描述/平台/绑定助手数/状态开关/更新时间/操作）；
 * 右上独立提供创建、导入、导出、场景管理入口；导入支持文件/文件夹，导出支持勾选项 ZIP/JSON。
 * 编辑进入全屏 SkillEditor（文件树 + 编辑|预览 + 自动保存）；停用/删除遇 409 引用确认后携带 confirmReferences 重试。
 * v7 分组：上方 Tab 切换（全部 / 未分组 / 各平台，平台下再切场景）；「加入场景分组」改为下拉框选择；右上「场景管理」维护平台下的场景。
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { CheckboxValueType } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { get, ApiError } from '@/api/request'
import {
  listConfig, saveConfig, deleteConfig, skillStats, cloneSkill,
  listScenarios, saveScenario, deleteScenario, PLATFORMS, platformMeta,
  type ConfigItem, type PlatformType, type Scenario
} from '@/api/config'
import { downloadJsonFile } from '@/utils/jsonio'
import { downloadBlobFile } from '@/utils/download'
import { zipFiles } from '@/utils/zip'
import { parseSkillJsonFile, parseSkillZipFile, type SkillImportDraft } from '@/utils/skill-import'
import { formatDateTime } from '@/utils/format'
import { USE_MOCK } from '@/utils/constants'
import { visTagOf } from '@/utils/visibility'
import { useTableMaxHeight } from '@/composables/useTableMax'
import SkillEditor from './config/SkillEditor.vue'
import SkillImportDialog from './config/SkillImportDialog.vue'
import VersionDrawer from './config/VersionDrawer.vue'

const auth = useAuthStore()

/** 列表限高：视口自适应、列表内部滚动（顶部页签/筛选条保持可见） */
const { max: rowsMax, bind: bindRows } = useTableMaxHeight(24)
const canEdit = computed(() => auth.hasPerm('skill:edit'))
const canExport = computed(() => auth.hasPerm('skill:export'))
const canClone = computed(() => auth.hasPerm('skill:clone'))

const items = ref<ConfigItem[]>([])
const keyword = ref('')
const loading = ref(false)
const loadError = ref('')
const filtered = computed(() => items.value.filter((i) => !keyword.value || `${i.name} ${i.code} ${i.description || ''}`.includes(keyword.value)))

let loadSeq = 0
let pageActive = true
async function load(): Promise<void> {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ''
  try {
    const [list, sceneList] = await Promise.all([listConfig('skills'), listScenarios()])
    if (!pageActive || seq !== loadSeq) return
    items.value = list
    scenarios.value = sceneList
    selected.value = selected.value.filter((id) => items.value.some((i) => i.id === id)) // 清理已不存在的勾选
    if (typeof activeScenario.value === 'number' && !scenarioById(activeScenario.value)) activeScenario.value = 'all' // 二级场景已删除时回退
  } catch (e) {
    if (seq === loadSeq && pageActive) loadError.value = e instanceof Error ? e.message : '技能加载失败'
  } finally {
    if (seq === loadSeq && pageActive) loading.value = false
  }
}
void load()

// -------------------------------------------------------------- 勾选导出（v7）：导出 ZIP / JSON 仅导出勾选行
const selected = ref<number[]>([])
const selectedItems = computed(() => items.value.filter((i) => selected.value.includes(i.id)))
const selectedInView = computed(() => viewRows.value.filter((i) => selected.value.includes(i.id)))
const allSelected = computed(() => viewRows.value.length > 0 && selectedInView.value.length === viewRows.value.length)
const indeterminate = computed(() => selectedInView.value.length > 0 && !allSelected.value)

function toggleAllSelected(v: CheckboxValueType): void {
  const add = Boolean(v)
  const ids = new Set(selected.value)
  viewRows.value.forEach((i) => (add ? ids.add(i.id) : ids.delete(i.id)))
  selected.value = [...ids]
}

function toggleRowSelected(row: ConfigItem, v: CheckboxValueType): void {
  const ids = new Set(selected.value)
  if (Boolean(v)) ids.add(row.id)
  else ids.delete(row.id)
  selected.value = [...ids]
}

// -------------------------------------------------------------- v7 分组：平台 → 场景 两级（上方 Tab：全部 / 未分组 / 各平台；选中平台后二级切换场景）
const scenarios = ref<Scenario[]>([])
/** 一级 Tab：all=全部 / ungrouped=未分组 / 平台值；二级场景 Tab 仅在选中平台时出现 */
const activeTab = ref<string>('all')
const activeScenario = ref<number | 'all' | 'unassigned'>('all')

const scenariosOf = (p: PlatformType): Scenario[] => scenarios.value.filter((s) => s.platformId === p)
const scenarioById = (id?: number | null): Scenario | undefined => scenarios.value.find((s) => s.id === id)

/** v14：行内可见性标签（缺省视为全员可见，与保存归一化一致）—— 实现统一抽至 utils/visibility */

function switchTab(tab: string): void {
  activeTab.value = tab
  activeScenario.value = 'all'
}

/** 当前 Tab 视图行：全部=关键字过滤；未分组=无场景；平台=platforms 包含；平台+场景=scenarioId 精确匹配 */
const viewRows = computed<ConfigItem[]>(() => {
  if (activeTab.value === 'all') return filtered.value
  if (activeTab.value === 'ungrouped') return filtered.value.filter((r) => !r.scenarioId)
  const inPlat = filtered.value.filter((r) => (r.platforms || []).includes(activeTab.value as PlatformType))
  if (activeScenario.value === 'all') return inPlat
  if (activeScenario.value === 'unassigned') return inPlat.filter((r) => { const s = scenarioById(r.scenarioId); return !s || s.platformId !== activeTab.value })
  return inPlat.filter((r) => r.scenarioId === activeScenario.value)
})

/** 一级 Tab 计数徽标 */
const countOf = (tab: string): number => {
  if (tab === 'all') return items.value.length
  if (tab === 'ungrouped') return items.value.filter((r) => !r.scenarioId).length
  return items.value.filter((r) => (r.platforms || []).includes(tab as PlatformType)).length
}
/** 二级场景 Tab 计数（相对当前平台的技能全集） */
const subCountOf = (sid: number | 'all' | 'unassigned'): number => {
  const inPlat = items.value.filter((r) => (r.platforms || []).includes(activeTab.value as PlatformType))
  if (sid === 'all') return inPlat.length
  if (sid === 'unassigned') return inPlat.filter((r) => { const s = scenarioById(r.scenarioId); return !s || s.platformId !== activeTab.value }).length
  return inPlat.filter((r) => r.scenarioId === sid).length
}
const skillCountOf = (sid: number): number => items.value.filter((r) => r.scenarioId === sid).length

// -------------------------------------------------------------- 加入分组：左右面板选择（左平台 → 右场景）
const groupDialog = ref(false)
const groupTarget = ref<ConfigItem | null>(null)
const groupPick = ref<number | '' | null>(null)
const groupPlatform = ref<PlatformType | ''>('')

function openGroupDialog(row: ConfigItem): void {
  groupTarget.value = row
  groupPick.value = row.scenarioId ?? null
  // 根据当前场景反选平台
  const cur = scenarioById(row.scenarioId)
  groupPlatform.value = cur ? cur.platformId : (PLATFORMS[0] || '')
  groupDialog.value = true
}

async function applyGroup(): Promise<void> {
  const row = groupTarget.value
  if (!row) return
  const raw = groupPick.value
  const next = raw === null || raw === undefined || raw === '' ? undefined : Number(raw)
  if ((row.scenarioId ?? undefined) === next) { groupDialog.value = false; return }
  try {
    await saveConfig('skills', { id: row.id, code: row.code, name: row.name, scenarioId: next ?? null })
  } catch (e) {
    if (e instanceof ApiError) { ElMessage.error(e.message); return }
    throw e
  }
  groupDialog.value = false
  ElMessage.success(next ? `已加入场景「${scenarioById(next)?.name || next}」` : '已移出场景（未分组）')
  await load()
}

// -------------------------------------------------------------- 场景管理：平台为固定枚举（平台包含场景），场景按平台创建
const sceneDlg = ref(false)
const sceneTab = ref<PlatformType>('1688')
const sceneName = ref('')
const sceneDesc = ref('')

async function loadScenarios(): Promise<void> {
  scenarios.value = await listScenarios()
}

async function addScenario(): Promise<void> {
  const name = sceneName.value.trim()
  if (!name) { ElMessage.warning('请输入场景名称'); return }
  try {
    await saveScenario({ name, platformId: sceneTab.value, description: sceneDesc.value.trim() })
  } catch (e) {
    if (e instanceof ApiError) { ElMessage.error(e.message); return }
    throw e
  }
  sceneName.value = ''
  sceneDesc.value = ''
  ElMessage.success(`场景「${name}」已创建`)
  await loadScenarios()
}

async function removeScenario(s: Scenario): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除场景「${s.name}」？其下技能将变为未分组。`, '确认删除')
  } catch { return }
  try {
    await deleteScenario(s.id)
  } catch (e) {
    if (e instanceof ApiError) { ElMessage.error(e.message); return }
    throw e
  }
  ElMessage.success('场景已删除')
  await loadScenarios()
  await load()
}

// -------------------------------------------------------------- 编辑器 / 版本历史
const editorVisible = ref(false)
const editItem = ref<Partial<ConfigItem> | null>(null)
const versionDrawer = ref(false)
const historyItem = ref<ConfigItem | null>(null)

function blankDraft(): Partial<ConfigItem> {
  return { code: '', name: '', description: '', content: '', files: [], platforms: ['1688'], status: 1 }
}

const skillEditor = ref<InstanceType<typeof SkillEditor>>()
let editSeq = 0
async function edit(item?: ConfigItem): Promise<void> {
  const seq = ++editSeq
  const detail = item ? await get<ConfigItem>(`/skills/${item.id}`) : blankDraft()
  if (!pageActive || seq !== editSeq) return
  editItem.value = JSON.parse(JSON.stringify(detail))
  editorVisible.value = true
}
onBeforeRouteLeave(async (to) => {
  if (editorVisible.value && skillEditor.value && !(await skillEditor.value.prepareLeave(`前往「${String(to.meta.title || to.path)}」`))) return false
  if (importVisible.value || groupDialog.value || sceneDlg.value) {
    try { await ElMessageBox.confirm('离开技能管理后，未提交的导入和分组设置将丢失。', '离开确认', { confirmButtonText: '离开', cancelButtonText: '继续编辑' }) }
    catch { return false }
  }
  return true
})
onBeforeUnmount(() => { pageActive = false; ++loadSeq; ++editSeq })
async function previewImport(drafts: SkillImportDraft[]): Promise<void> {
  if (!pageActive) return
  const skipped = drafts.flatMap((d) => d.skipped || [])
  if (skipped.length) {
    try { await ElMessageBox.confirm(`以下 ${skipped.length} 项不会导入，请核对后继续：\n${skipped.join('\n')}`, '导入跳过项', { type: 'warning', confirmButtonText: '继续预览', cancelButtonText: '取消导入' }) }
    catch { return }
  }
  if (!pageActive) return
  importDrafts.value = drafts
  importVisible.value = true
}

// -------------------------------------------------------------- 工具栏操作
const importInput = ref<HTMLInputElement | null>(null)

async function onCreate(command: string): Promise<void> {
  if (command === 'create') { void edit(); return }
  if (command === 'manage-scenarios') { sceneDlg.value = true; return }
  if (command === 'import-file') { importInput.value?.click(); return }
  if (command === 'export-zip') { void exportSelectedZip(); return }
  if (command === 'export-json') { void exportSelectedJson(); return }
}

// -------------------------------------------------------------- 导入（JSON / ZIP）→ 解析预览批量导入（v7）
const importDrafts = ref<SkillImportDraft[]>([])
const importVisible = ref(false)

/** 按扩展名分发解析：.zip 走解包（{目录}/SKILL.md 或技能 JSON），其余按技能 JSON（对象或数组） */
async function onImportChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const drafts = /\.zip$/i.test(file.name) ? await parseSkillZipFile(file) : await parseSkillJsonFile(file)
    await previewImport(drafts)
  } catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err))
    return
  }
}

/** 导出 ZIP：仅勾选的技能 → {code}/SKILL.md + {code}/{file.name}（未勾选时提示） */
function exportSelectedZip(): void {
  const list = selectedItems.value
  if (!list.length) {
    ElMessage.warning('请先勾选要导出的技能（列表左侧复选框）')
    return
  }
  const entries = list.flatMap((s) => [
    { name: `${s.code}/SKILL.md`, content: String(s.content || '') },
    ...(s.files || []).map((f) => ({ name: `${s.code}/${f.name}`, content: String(f.content || '') }))
  ])
  downloadBlobFile('skills-export.zip', zipFiles(entries))
  ElMessage.success(`已导出勾选的 ${list.length} 个技能（store-only ZIP）`)
}

/** 导出 JSON：仅勾选的技能数组（含附属文件，可再编辑后导入） */
function exportSelectedJson(): void {
  const list = selectedItems.value
  if (!list.length) {
    ElMessage.warning('请先勾选要导出的技能（列表左侧复选框）')
    return
  }
  downloadJsonFile('skills-export.json', JSON.stringify(list, null, 2))
  ElMessage.success(`已导出勾选的 ${list.length} 个技能 JSON`)
}

// -------------------------------------------------------------- 行操作
/** 启停（停用被专家引用 409 → 确认后携带引用确认重试） */
async function toggleStatus(item: ConfigItem, next: number | string | boolean): Promise<void> {
  const status = Number(next)
  try {
    await saveConfig('skills', { id: item.id, code: item.code, name: item.name, status })
    await load()
  } catch (e) {
    if (e instanceof ApiError && e.code === 409) {
      try {
        await ElMessageBox.confirm(`${e.message}。确认继续停用？`, '引用确认')
        await saveConfig('skills', { id: item.id, code: item.code, name: item.name, status, confirmReferences: true })
        await load()
      } catch { /* 取消或仍失败 */ }
    }
  }
}

async function remove(item: ConfigItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除「${item.name}」？被引用资源将被拦截。`, '确认删除')
  } catch {
    return
  }
  try {
    await deleteConfig('skills', item.id)
  } catch (e) {
    if (e instanceof ApiError && e.code === 409) {
      try {
        await ElMessageBox.confirm(`${e.message}。确认继续删除？`, '引用确认')
        await deleteConfig('skills', item.id, { confirmReferences: true })
      } catch { return }
    } else {
      return
    }
  }
  ElMessage.success('已删除')
  await load()
}

async function clone(item: ConfigItem): Promise<void> {
  await cloneSkill(item.id)
  ElMessage.success('已克隆为停用副本，可编辑后上架')
  await load()
}

/** 导出 ZIP：单个技能 → {code}/SKILL.md + {code}/{file.name}（与批量 ZIP 同结构，可直接再导入） */
function exportZip(item: ConfigItem): void {
  const entries = [
    { name: `${item.code}/SKILL.md`, content: String(item.content || '') },
    ...(item.files || []).map((f) => ({ name: `${item.code}/${f.name}`, content: String(f.content || '') }))
  ]
  downloadBlobFile(`skill-${item.code}.zip`, zipFiles(entries))
  ElMessage.success(`已导出技能 ZIP：skill-${item.code}.zip`)
}

async function stats(item: ConfigItem): Promise<void> {
  const s = await skillStats(item.id)
  await ElMessageBox.alert(`近7天 ${s.calls7} 次；近30天 ${s.calls30} 次；成功率 ${(s.successRate * 100).toFixed(1)}%。来源：${s.source}`, '调用统计')
}

function history(item: ConfigItem): void {
  historyItem.value = item
  versionDrawer.value = true
}

/** 行操作「更多」下拉统一分发（收纳低频操作，避免行内按钮过多折行） */
function onRowCommand(cmd: string, row: ConfigItem): void {
  if (cmd === 'group') openGroupDialog(row)
  else if (cmd === 'history') history(row)
  else if (cmd === 'clone') void clone(row)
  else if (cmd === 'export') exportZip(row)
  else if (cmd === 'stats') void stats(row)
  else if (cmd === 'remove') void remove(row)
}

function platMetaOf(p: string): { label: string; color: string; bg: string; border: string } {
  return platformMeta(p)
}
/** 列表接口附加字段：被专家引用数（类型上不在 ConfigItem，运行时由列表接口返回） */
function boundExpertCount(row: ConfigItem): number {
  return (row as ConfigItem & { boundExpertCount?: number }).boundExpertCount ?? 0
}
</script>
<template>
  <el-alert v-if="USE_MOCK" title="Mock 配置中心：技能内容、导入导出与统计均为本地模拟。" type="info" :closable="false" style="margin-bottom:16px" />
  <el-alert v-if="loadError" :title="`技能加载失败：${loadError}`" type="error" :closable="false" style="margin-bottom:12px"><el-button link type="primary" @click="load">重新加载</el-button></el-alert>
  <el-card shadow="never">
    <p class="muted" style="margin:0 0 12px">当前分组 {{ viewRows.length }} 项 · 已上架 {{ viewRows.filter((r) => r.status === 1).length }} 项 · 已勾选 {{ selected.length }} 项</p>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索名称 / 编码 / 描述" clearable style="width:260px" />
      <el-button @click="load">刷新列表</el-button>
      <div class="spacer" />
      <el-button v-if="canEdit" type="primary" @click="onCreate('create')">创建技能</el-button>
      <el-button v-if="canEdit" @click="importInput?.click()">导入</el-button>
      <el-dropdown v-if="canExport" trigger="click" @command="onCreate">
        <el-button>导出（已勾选 {{ selected.length }}）▾</el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="export-zip">导出 ZIP（勾选 {{ selected.length }}）</el-dropdown-item>
            <el-dropdown-item command="export-json">导出 JSON（勾选 {{ selected.length }}）</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button v-if="canEdit" @click="onCreate('manage-scenarios')">场景管理</el-button>
    </div>

    <!-- v7 分组导航：一级 Tab（全部 / 未分组 / 各平台）+ 选中平台后的二级场景 Tab -->
    <div class="group-tabs">
      <div class="tab-row">
        <button class="tab-pill" :class="{ active: activeTab === 'all' }" @click="switchTab('all')">全部<span class="tab-count">{{ countOf('all') }}</span></button>
        <button class="tab-pill" :class="{ active: activeTab === 'ungrouped' }" @click="switchTab('ungrouped')">未分组<span class="tab-count">{{ countOf('ungrouped') }}</span></button>
        <button v-for="p in PLATFORMS" :key="p" class="tab-pill" :class="{ active: activeTab === p }" @click="switchTab(p)">
          <span class="tab-dot" :style="{ background: platMetaOf(p).color }" />{{ platMetaOf(p).label }}<span class="tab-count">{{ countOf(p) }}</span>
        </button>
      </div>
      <div v-if="activeTab !== 'all' && activeTab !== 'ungrouped'" class="tab-row sub">
        <button class="tab-pill small" :class="{ active: activeScenario === 'all' }" @click="activeScenario = 'all'">全部场景<span class="tab-count">{{ subCountOf('all') }}</span></button>
        <button class="tab-pill small" :class="{ active: activeScenario === 'unassigned' }" @click="activeScenario = 'unassigned'">未分配场景<span class="tab-count">{{ subCountOf('unassigned') }}</span></button>
        <button v-for="s in scenariosOf(activeTab as PlatformType)" :key="s.id" class="tab-pill small" :class="{ active: activeScenario === s.id }" @click="activeScenario = s.id">{{ s.name }}<span class="tab-count">{{ subCountOf(s.id) }}</span></button>
      </div>
    </div>

    <div class="select-bar">
      <el-checkbox :model-value="allSelected" :indeterminate="indeterminate" :disabled="!filtered.length" @change="toggleAllSelected">全选</el-checkbox>
      <template v-if="selected.length">
        <span class="sel-count">已勾选 {{ selected.length }} 项</span>
        <el-button link type="primary" size="small" @click="selected = []">清空</el-button>
        <span class="sel-hint">勾选后可通过右上「导出」按钮选择 ZIP / JSON</span>
      </template>
    </div>

    <div v-loading="loading" class="rows" :style="rowsMax ? { maxHeight: `${rowsMax}px`, overflowY: 'auto' } : undefined" :ref="bindRows">
      <div v-for="row in viewRows" :key="row.id" class="row">
        <el-checkbox
          class="row-check"
          :model-value="selected.includes(row.id)"
          @change="(v: CheckboxValueType) => toggleRowSelected(row, v)"
        />
        <div class="row-icon" :class="{ off: row.status !== 1 }">{{ (row.name || '?').slice(0, 1).toUpperCase() }}</div>
        <div class="row-main">
          <div class="row-title">
            <span class="row-name">{{ row.name }}</span>
            <small v-if="row.code" class="slash-code">/{{ row.code }}</small>
            <el-tag
              v-for="p in row.platforms || []"
              :key="p"
              size="small"
              effect="plain"
              :style="{ color: platMetaOf(p).color, background: platMetaOf(p).bg, borderColor: platMetaOf(p).border }"
            >{{ platMetaOf(p).label }}</el-tag>
            <el-tag v-if="scenarioById(row.scenarioId)" size="small" type="info" effect="plain">{{ scenarioById(row.scenarioId)?.name }}</el-tag>
            <el-tag size="small" :type="visTagOf(row.visibility).type">{{ visTagOf(row.visibility).label }}</el-tag>
          </div>
          <div class="row-desc">{{ row.description || '—' }}</div>
        </div>
        <div class="row-meta">
          <span>绑定助手 <b>{{ boundExpertCount(row) }}</b></span>
          <span>文件 <b>{{ (row.files || []).length + 1 }}</b></span>
          <span class="muted">{{ formatDateTime(row.updatedAt) }}</span>
        </div>
        <div class="row-actions">
          <el-switch :model-value="row.status === 1" :disabled="!canEdit" @change="(v: string | number | boolean) => toggleStatus(row, v)" />
          <el-button link type="primary" @click="edit(row)">{{ canEdit ? '编辑' : '详情' }}</el-button>
          <el-dropdown trigger="click" @command="(cmd: string | number | object) => onRowCommand(String(cmd), row)">
            <el-button link type="primary">更多 ▾</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-if="canEdit" command="group">加入场景分组</el-dropdown-item>
                <el-dropdown-item command="history">版本历史</el-dropdown-item>
                <el-dropdown-item v-if="canClone" command="clone">克隆</el-dropdown-item>
                <el-dropdown-item v-if="canExport" command="export">导出 ZIP</el-dropdown-item>
                <el-dropdown-item command="stats">统计</el-dropdown-item>
                <el-dropdown-item v-if="canEdit" command="remove" divided>删除</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
      <el-empty v-if="!viewRows.length && !loading" :description="loadError ? '加载失败，请重新加载技能' : keyword ? '没有匹配的技能，请调整搜索条件' : activeTab === 'all' ? '尚未创建技能，可新建或导入 SKILL.md 技能包' : '当前分组暂无技能，可切换分组或为技能设置所属场景'" />
    </div>
  </el-card>

  <input ref="importInput" type="file" accept=".json,.zip,application/json,application/zip" style="display:none" @change="onImportChange" />

  <SkillEditor v-if="editorVisible" ref="skillEditor" v-model="editorVisible" :item="editItem" :can-edit="canEdit" @saved="load" />
  <VersionDrawer v-model="versionDrawer" kind="skills" :item="historyItem" :can-edit="canEdit" @restored="load" />
  <SkillImportDialog v-model="importVisible" :drafts="importDrafts" :existing-codes="items.map((i) => i.code)" @imported="load" />

  <!-- 加入场景分组：左平台 → 右场景 左右面板选择 -->
  <el-dialog v-model="groupDialog" title="加入场景分组" width="560px">
    <div v-if="groupTarget" class="group-target">「{{ groupTarget.name }}」当前分组：{{ scenarioById(groupTarget.scenarioId)?.name || '未分组' }}</div>
    <div class="group-panels">
      <div class="group-panel group-panel-left">
        <div class="group-panel-title">平台</div>
        <div class="group-panel-list">
          <div class="group-item" :class="{ active: groupPlatform === '' }" @click="groupPlatform = ''">未分组</div>
          <div v-for="p in PLATFORMS" :key="p" class="group-item" :class="{ active: groupPlatform === p }" @click="groupPlatform = p">
            <span class="group-dot" :style="{ background: platMetaOf(p).color }" />
            {{ platMetaOf(p).label }}
          </div>
        </div>
      </div>
      <div class="group-panel group-panel-right">
        <div class="group-panel-title">场景</div>
        <div class="group-panel-list">
          <template v-if="groupPlatform === ''">
            <div class="group-item muted">请先在左侧选择平台</div>
          </template>
          <template v-else>
            <div v-for="s in scenariosOf(groupPlatform)" :key="s.id" class="group-item" :class="{ active: groupPick === s.id }" @click="groupPick = s.id">
              {{ s.name }}
            </div>
            <div v-if="!scenariosOf(groupPlatform).length" class="group-item muted">该平台暂无场景</div>
          </template>
        </div>
      </div>
    </div>
    <template #footer>
      <el-button @click="groupDialog = false">取消</el-button>
      <el-button type="primary" @click="applyGroup">确定</el-button>
    </template>
  </el-dialog>

  <!-- 场景管理：平台为固定枚举（平台包含场景），场景按平台创建 / 删除 -->
  <el-dialog v-model="sceneDlg" title="场景管理" width="640px" @open="loadScenarios">
    <div class="scene-add">
      <el-select v-model="sceneTab" style="width:130px">
        <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="platMetaOf(p).label" />
      </el-select>
      <el-input v-model="sceneName" placeholder="场景名称" style="width:170px" />
      <el-input v-model="sceneDesc" placeholder="场景描述（可选）" style="flex:1" />
      <el-button type="primary" @click="addScenario">添加场景</el-button>
    </div>
    <div class="scene-list">
      <div v-for="s in scenariosOf(sceneTab)" :key="s.id" class="scene-row">
        <span class="scene-name">{{ s.name }}</span>
        <span class="scene-desc">{{ s.description || '—' }}</span>
        <span class="scene-count">{{ skillCountOf(s.id) }} 个技能</span>
        <el-button v-if="canEdit" link type="danger" size="small" @click="removeScenario(s)">删除</el-button>
      </div>
      <el-empty v-if="!scenariosOf(sceneTab).length" description="该平台暂无场景" :image-size="60" />
    </div>
  </el-dialog>
</template>
<style scoped>
.toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 16px; }
.toolbar .spacer { flex: 1; }
.rows { display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 14px; padding: 12px 8px; border-bottom: 1px solid var(--el-border-color-extra-light); }
.row:hover { background: var(--el-fill-color-lighter); }
.row-icon { flex: 0 0 40px; height: 40px; border-radius: 8px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
.row-icon.off { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.row-main { flex: 1 1 0; min-width: 0; }
.row-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row-name { font-weight: 600; }
.row-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-meta { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--el-text-color-regular); flex: 0 0 150px; }
.row-actions { display: flex; align-items: center; gap: 2px; flex: 0 0 auto; justify-content: flex-end; white-space: nowrap; }
.muted { color: var(--el-text-color-secondary); }
.slash-code { font-family: ui-monospace, Consolas, monospace; font-size: 12px; line-height: 20px; padding: 0 6px; border-radius: 4px; color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
/* v7 分组导航：一级平台 Tab + 二级场景 Tab（胶囊样式） */
.group-tabs { margin: 4px 0 12px; }
.tab-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tab-row.sub { margin-top: 8px; padding-left: 4px; }
.tab-pill { display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; border: 1px solid var(--el-border-color); border-radius: 999px; background: var(--el-bg-color); color: var(--el-text-color-regular); font-size: 13px; line-height: 1.2; cursor: pointer; transition: all 0.15s; }
.tab-pill:hover { color: var(--el-color-primary); border-color: var(--el-color-primary-light-5); }
.tab-pill.active { background: var(--el-color-primary); border-color: var(--el-color-primary); color: #fff; font-weight: 600; }
.tab-pill.small { padding: 3px 10px; font-size: 12px; background: var(--el-fill-color-lighter); border-color: transparent; }
.tab-pill.small.active { background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); }
.tab-count { font-size: 11px; opacity: 0.75; }
.tab-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
.group-target { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 10px; }
.group-panels { display: flex; gap: 0; border: 1px solid var(--el-border-color-lighter); border-radius: 6px; overflow: hidden; min-height: 280px; max-height: 360px; }
.group-panel { display: flex; flex-direction: column; }
.group-panel-left { width: 160px; border-right: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-lighter); }
.group-panel-right { flex: 1; min-width: 0; }
.group-panel-title { padding: 8px 12px; font-size: 12px; font-weight: 600; color: var(--el-text-color-secondary); border-bottom: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color); }
.group-panel-list { flex: 1; overflow-y: auto; padding: 4px 0; }
.group-item { padding: 7px 12px; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.12s; }
.group-item:hover { background: var(--el-fill-color-light); }
.group-item.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
.group-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; }
/* 场景管理对话框 */
.scene-add { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
.scene-list { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; }
.scene-row { display: flex; align-items: center; gap: 12px; padding: 8px 4px; border-bottom: 1px solid var(--el-border-color-extra-light); font-size: 13px; }
.scene-name { font-weight: 600; flex: 0 0 140px; }
.scene-desc { flex: 1; color: var(--el-text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scene-count { flex: 0 0 auto; font-size: 12px; color: var(--el-text-color-secondary); }
.select-bar { display: flex; align-items: center; gap: 10px; padding: 6px 8px; margin-bottom: 4px; background: var(--el-fill-color-lighter); border-radius: 6px; }
.sel-count { font-size: 13px; color: var(--el-color-primary); font-weight: 600; }
.sel-hint { font-size: 12px; color: var(--el-text-color-secondary); }
.row-check { flex: 0 0 auto; }
</style>
