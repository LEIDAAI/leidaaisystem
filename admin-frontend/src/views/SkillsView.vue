<script setup lang="ts">
/**
 * 技能管理页（v6，Open WebUI 式）：
 * 搜索 + 行式列表（图标/名称/描述/平台/绑定助手数/状态开关/更新时间/操作）；
 * 右上「创建」下拉五项：创建技能 / 导入 JSON / 从文件夹导入 / Export Zip / 导出 JSON。
 * 编辑进入全屏 SkillEditor（文件树 + 编辑|预览 + 自动保存）；停用/删除遇 409 引用确认后携带 confirmReferences 重试。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { get, ApiError } from '@/api/request'
import {
  listConfig, saveConfig, deleteConfig, skillStats, exportConfigJson, importSkillJson, cloneSkill,
  platformMeta, type ConfigItem
} from '@/api/config'
import { downloadJsonFile } from '@/utils/jsonio'
import { downloadBlobFile } from '@/utils/download'
import { zipFiles } from '@/utils/zip'
import { formatDateTime } from '@/utils/format'
import { USE_MOCK } from '@/utils/constants'
import SkillEditor from './config/SkillEditor.vue'
import VersionDrawer from './config/VersionDrawer.vue'

const auth = useAuthStore()
const canEdit = computed(() => auth.hasPerm('skill:edit'))
const canExport = computed(() => auth.hasPerm('skill:export'))
const canClone = computed(() => auth.hasPerm('skill:clone'))

const items = ref<ConfigItem[]>([])
const keyword = ref('')
const loading = ref(false)
const filtered = computed(() => items.value.filter((i) => !keyword.value || `${i.name} ${i.code} ${i.description || ''}`.includes(keyword.value)))

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await listConfig('skills')
  } finally {
    loading.value = false
  }
}
void load()

// -------------------------------------------------------------- 编辑器 / 版本历史
const editorVisible = ref(false)
const editItem = ref<Partial<ConfigItem> | null>(null)
const versionDrawer = ref(false)
const historyItem = ref<ConfigItem | null>(null)

function blankDraft(): Partial<ConfigItem> {
  return { code: '', name: '', description: '', content: '', files: [], platforms: ['1688'], status: 1 }
}

async function edit(item?: ConfigItem): Promise<void> {
  const detail = item ? await get<ConfigItem>(`/skills/${item.id}`) : blankDraft()
  editItem.value = JSON.parse(JSON.stringify(detail))
  editorVisible.value = true
}

// -------------------------------------------------------------- 创建下拉（五项）
const jsonInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)

async function onCreate(command: string): Promise<void> {
  if (command === 'create') { void edit(); return }
  if (command === 'import-json') { jsonInput.value?.click(); return }
  if (command === 'import-folder') { folderInput.value?.click(); return }
  if (command === 'export-zip') { void exportZip(); return }
  if (command === 'export-json') { void exportAllJson(); return }
}

/** 导入 JSON：读取单个技能导出文件（对象），code 冲突 409 由全局提示透出 */
async function onJsonChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const text = await file.text()
  const payload = JSON.parse(text)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    ElMessage.error('导入内容须为单个技能 JSON 对象（不支持数组）')
    return
  }
  await importSkillJson(payload)
  ElMessage.success('导入成功（新建条目，如编码冲突请修改 JSON 中的 code 后重试）')
  await load()
}

/** 文本类扩展名判断（跳过图片/二进制） */
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|7z|rar|bin|exe|dll|woff2?|ttf|otf|mp4|mp3)$/i
async function onFolderChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return
  const rel = (f: File): string => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
  const rootName = rel(files[0]).split('/')[0] || 'imported-skill'
  const skillMd = files.find((f) => /(^|\/)SKILL\.md$/i.test(rel(f)))
  if (!skillMd) {
    ElMessage.warning('所选文件夹中未找到 SKILL.md（技能主文档）')
    return
  }
  const content = await skillMd.text()
  const extraFiles: Array<{ name: string; content: string }> = []
  for (const f of files) {
    const p = rel(f)
    if (f === skillMd || BINARY_EXT.test(p)) continue
    extraFiles.push({ name: p.split('/').slice(1).join('/') || f.name, content: await f.text() })
  }
  // 预填编辑器（不直接入库），可视化调整后再发布
  editItem.value = { code: '', name: rootName, description: '', content, files: extraFiles, platforms: ['1688'], status: 1 }
  editorVisible.value = true
  ElMessage.success(`已解析文件夹「${rootName}」：SKILL.md + ${extraFiles.length} 个附属文件，请在编辑器中完善后发布`)
}

/** Export Zip：全部技能 → {code}/SKILL.md + {code}/{file.name} */
function exportZip(): void {
  if (!items.value.length) {
    ElMessage.warning('暂无可导出的技能')
    return
  }
  const entries = items.value.flatMap((s) => [
    { name: `${s.code}/SKILL.md`, content: String(s.content || '') },
    ...(s.files || []).map((f) => ({ name: `${s.code}/${f.name}`, content: String(f.content || '') }))
  ])
  downloadBlobFile('skills-export.zip', zipFiles(entries))
  ElMessage.success(`已导出 ${items.value.length} 个技能（store-only ZIP）`)
}

/** 导出 JSON：全量技能数组（含附属文件，可再编辑后逐个导入） */
function exportAllJson(): void {
  downloadJsonFile('skills-export.json', JSON.stringify(items.value, null, 2))
  ElMessage.success('已导出全部技能 JSON')
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

async function exportJson(item: ConfigItem): Promise<void> {
  const { filename, content } = await exportConfigJson('skills', item.id)
  downloadJsonFile(filename, content)
  ElMessage.success(`已导出 ${filename}`)
}

async function stats(item: ConfigItem): Promise<void> {
  const s = await skillStats(item.id)
  await ElMessageBox.alert(`近7天 ${s.calls7} 次；近30天 ${s.calls30} 次；成功率 ${(s.successRate * 100).toFixed(1)}%。来源：${s.source}`, '调用统计')
}

function history(item: ConfigItem): void {
  historyItem.value = item
  versionDrawer.value = true
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
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索名称 / 编码 / 描述" clearable style="width:260px" />
      <el-button @click="load">刷新列表</el-button>
      <div class="spacer" />
      <el-dropdown v-if="canEdit || canExport" @command="onCreate">
        <el-button type="primary">
          创建 <el-icon style="margin-left:4px"><svg viewBox="0 0 1024 1024" width="12" height="12"><path fill="currentColor" d="M831.872 340.864 512 652.672 192.128 340.864a30.592 30.592 0 0 0-42.752 0 29.12 29.12 0 0 0 0 41.6L489.664 714.24a32 32 0 0 0 44.672 0l340.288-331.712a29.12 29.12 0 0 0 0-41.728 30.592 30.592 0 0 0-42.752 0z"/></svg></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-if="canEdit" command="create">创建技能</el-dropdown-item>
            <el-dropdown-item v-if="canEdit" command="import-json">导入 JSON</el-dropdown-item>
            <el-dropdown-item v-if="canEdit" command="import-folder">从文件夹导入</el-dropdown-item>
            <el-dropdown-item v-if="canExport" command="export-zip" divided>Export Zip</el-dropdown-item>
            <el-dropdown-item v-if="canExport" command="export-json">导出 JSON</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <div v-loading="loading" class="rows">
      <div v-for="row in filtered" :key="row.id" class="row">
        <div class="row-icon" :class="{ off: row.status !== 1 }">{{ (row.name || '?').slice(0, 1).toUpperCase() }}</div>
        <div class="row-main">
          <div class="row-title">
            <span class="row-name">{{ row.name }}</span>
            <small class="muted">{{ row.code }}</small>
            <el-tag
              v-for="p in row.platforms || []"
              :key="p"
              size="small"
              effect="plain"
              :style="{ color: platMetaOf(p).color, background: platMetaOf(p).bg, borderColor: platMetaOf(p).border }"
            >{{ platMetaOf(p).label }}</el-tag>
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
          <el-button link @click="history(row)">版本历史</el-button>
          <el-button v-if="canClone" link @click="clone(row)">克隆</el-button>
          <el-button v-if="canExport" link @click="exportJson(row)">导出</el-button>
          <el-button link @click="stats(row)">统计</el-button>
          <el-button v-if="canEdit" link type="danger" @click="remove(row)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!filtered.length && !loading" description="暂无技能，点击右上「创建」开始" />
    </div>
  </el-card>

  <input ref="jsonInput" type="file" accept=".json,application/json" style="display:none" @change="onJsonChange" />
  <input ref="folderInput" type="file" webkitdirectory style="display:none" @change="onFolderChange" />

  <SkillEditor v-model="editorVisible" :item="editItem" :can-edit="canEdit" @saved="load" />
  <VersionDrawer v-model="versionDrawer" kind="skills" :item="historyItem" :can-edit="canEdit" @restored="load" />
</template>
<style scoped>
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.toolbar .spacer { flex: 1; }
.rows { display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 14px; padding: 12px 8px; border-bottom: 1px solid var(--el-border-color-extra-light); }
.row:hover { background: var(--el-fill-color-lighter); }
.row-icon { flex: 0 0 40px; height: 40px; border-radius: 8px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
.row-icon.off { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.row-main { flex: 1 1 0; min-width: 0; }
.row-title { display: flex; align-items: center; gap: 8px; }
.row-name { font-weight: 600; }
.row-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-meta { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--el-text-color-regular); flex: 0 0 150px; }
.row-actions { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; justify-content: flex-end; }
.muted { color: var(--el-text-color-secondary); }
</style>
