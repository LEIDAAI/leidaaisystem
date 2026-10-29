<script setup lang="ts">
/**
 * 技能编辑器（v6，Open WebUI 式全屏编辑）：
 * 顶栏（返回 + 名称/编码/状态 + 自动保存指示 + 历史版本/发布版本/关闭）；
 * 元信息（描述=触发意图 + 平台多选）；左侧文件树（SKILL.md 根 + 附属文件）；
 * 右侧「编辑 | 预览」页签 + 单文件下载。
 * 交互约定：禁止点空白关闭；关闭按钮先询问；边编辑边自动保存（skipVersion 不进版本历史，首次发布后启用）。
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { get } from '@/api/request'
import { saveConfig, PLATFORMS, PLATFORM_META, type ConfigItem, type PlatformType } from '@/api/config'
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown'
import { downloadTextFile } from '@/utils/download'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import VersionDrawer from './VersionDrawer.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()

const draft = ref<FormDraft>({})
const saving = ref(false)
/** 当前选中文件：'root' = SKILL.md；数字 = files 下标 */
const selected = ref<string | number>('root')
const viewTab = ref<'edit' | 'preview'>('edit')
/** 自动保存：首次发布拿到 id 后启用 */
const currentId = ref<number | null>(null)
const autosaveAt = ref('')
const autosaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const dirty = ref(false)
let suppress = false
let autosaveTimer: ReturnType<typeof setTimeout> | null = null

// ---------------------------------------------------------------- 打开初始化
watch(
  () => props.modelValue,
  (v) => {
    if (!v) return
    currentId.value = props.item?.id ?? null
    autosaveAt.value = ''
    autosaveState.value = 'idle'
    viewTab.value = 'edit'
    applyDraft(normalize(JSON.parse(JSON.stringify(props.item || {}))))
  },
  { immediate: true }
)

function normalize(copy: FormDraft): FormDraft {
  const d: FormDraft = { status: 1, platforms: ['1688'], files: [], content: '', ...copy }
  if (!Array.isArray(d.platforms) || !d.platforms.length) d.platforms = ['1688']
  d.platforms = d.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
  if (!Array.isArray(d.files)) d.files = []
  d.files = d.files.map((f) => ({ name: String(f?.name || ''), content: String(f?.content || '') }))
  if (!String(d.content || '')) d.content = '# 技能说明\n\n在此编写 SKILL.md（Markdown）……'
  return d
}

function applyDraft(next: FormDraft): void {
  suppress = true
  draft.value = next
  dirty.value = false
  selected.value = 'root'
  nextTick(() => { suppress = false })
}

// ---------------------------------------------------------------- 自动保存
watch(draft, () => {
  if (suppress) return
  dirty.value = true
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => void doAutosave(), 1500)
}, { deep: true })

/** UI 侧必填前置校验（对齐 mock 422 规则） */
const missingLabels = computed<string[]>(() => {
  const d = draft.value
  const miss: string[] = []
  if (!String(d.name || '').trim()) miss.push('名称')
  if (!/^[a-zA-Z0-9_-]+$/.test(String(d.code || '').trim())) miss.push('编码（仅字母数字_-）')
  if (!String(d.description || '').trim()) miss.push('描述（触发意图）')
  if (!String(d.content || '').trim()) miss.push('SKILL.md 内容')
  const names = (d.files || []).map((f) => String(f.name || '').trim())
  if (names.some((n) => !n)) miss.push('附件文件名')
  if (new Set(names).size !== names.length) miss.push('附件文件名唯一')
  return miss
})
const draftComplete = computed(() => !missingLabels.value.length)

function buildPayload(): FormDraft {
  const d = draft.value
  return {
    id: currentId.value ?? d.id,
    code: d.code, name: d.name, status: d.status,
    platforms: (d.platforms || []).filter((p) => PLATFORMS.includes(p as PlatformType)),
    description: d.description, content: d.content,
    files: (d.files || []).map((f) => ({ name: String(f.name || '').trim(), content: String(f.content || '') }))
  }
}

let autosaveSeq = 0
async function doAutosave(): Promise<void> {
  if (suppress || !props.canEdit || !currentId.value || !dirty.value || !draftComplete.value) return
  const seq = ++autosaveSeq
  autosaveState.value = 'saving'
  try {
    await saveConfig('skills', { ...buildPayload(), skipVersion: true })
    if (seq !== autosaveSeq) return // 保存期间又有新编辑在途，交给最新一次保存收尾
    dirty.value = false
    autosaveState.value = 'saved'
    autosaveAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch {
    autosaveState.value = 'error'
  }
}

const autosaveText = computed(() => {
  if (!props.canEdit) return '只读模式'
  if (!currentId.value) return '新建草稿：首次「发布」后启用自动保存'
  if (autosaveState.value === 'saving') return '自动保存中…'
  if (autosaveState.value === 'saved') return `自动保存于 ${autosaveAt.value}`
  if (autosaveState.value === 'error') return '自动保存失败，请检查填写后重试'
  if (dirty.value && !draftComplete.value) return `必填未完整（${missingLabels.value.join('、')}），暂未自动保存`
  return '自动保存已就绪'
})

// ---------------------------------------------------------------- 文件树
const fileList = computed(() => (draft.value.files || []).map((f, i) => ({ name: f.name, index: i })))
function selectRoot(): void { selected.value = 'root'; viewTab.value = 'edit' }
function selectFile(index: number): void { selected.value = index; viewTab.value = 'edit' }

async function addFile(): Promise<void> {
  if (!props.canEdit) return
  try {
    const { value } = await ElMessageBox.prompt('输入文件名（如 reference.md / params.json）', '新建附属文件', {
      inputValidator: (v: string) => {
        const t = String(v || '').trim()
        if (!t) return '文件名必填'
        if (t === 'SKILL.md') return 'SKILL.md 为主文档，请编辑左侧根节点'
        if ((draft.value.files || []).some((f) => f.name === t)) return '文件名已存在'
        return true
      }
    })
    draft.value.files!.push({ name: value.trim(), content: '' })
    selected.value = draft.value.files!.length - 1
    viewTab.value = 'edit'
  } catch { /* 取消 */ }
}

async function removeFile(index: number): Promise<void> {
  if (!props.canEdit) return
  const name = draft.value.files![index]?.name || ''
  try {
    await ElMessageBox.confirm(`删除附属文件「${name}」？`, '删除确认', { type: 'warning' })
  } catch { return }
  draft.value.files!.splice(index, 1)
  if (selected.value === index) selected.value = 'root'
  else if (typeof selected.value === 'number' && selected.value > index) selected.value = selected.value - 1
}

/** 当前编辑内容（SKILL.md ↔ content；附属文件 ↔ files[i].content） */
const currentName = computed(() => (selected.value === 'root' ? 'SKILL.md' : (draft.value.files || [])[selected.value as number]?.name || ''))
const currentContent = computed(() => (selected.value === 'root' ? String(draft.value.content || '') : String((draft.value.files || [])[selected.value as number]?.content || '')))
function setCurrentContent(v: string): void {
  if (selected.value === 'root') draft.value.content = v
  else if (draft.value.files && draft.value.files[selected.value as number]) draft.value.files![selected.value as number].content = v
}
const previewHtml = computed(() => renderSimpleMarkdown(currentContent.value))

function downloadCurrent(): void {
  if (!currentName.value) return
  downloadTextFile(currentName.value, currentContent.value, 'text/markdown;charset=utf-8')
}

// ---------------------------------------------------------------- 发布 / 历史版本 / 关闭
const versionDialog = ref(false)
const historyDrawer = ref(false)
function onPublishClick(): void {
  if (!props.canEdit) return
  if (!draftComplete.value) {
    ElMessage.warning(`请先完善：${missingLabels.value.join('、')}`)
    return
  }
  versionDialog.value = true
}

async function save(v: { versionName: string; note: string }): Promise<void> {
  saving.value = true
  try {
    const resp = await saveConfig('skills', { ...buildPayload(), versionName: v.versionName, note: v.note })
    if (!currentId.value && resp?.id) {
      currentId.value = resp.id
      suppress = true
      draft.value.id = resp.id
      nextTick(() => { suppress = false })
    }
    dirty.value = false
    autosaveState.value = 'saved'
    autosaveAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    ElMessage.success('已发布：版本 +1 并生成快照；启用状态即上架前台')
    emit('saved')
  } finally {
    saving.value = false
  }
}

const historyItem = computed<ConfigItem | null>(() => (currentId.value ? ({ ...draft.value, id: currentId.value } as ConfigItem) : null))
async function onRestored(): Promise<void> {
  if (!currentId.value) return
  const detail = await get<ConfigItem>(`/skills/${currentId.value}`)
  applyDraft(normalize(JSON.parse(JSON.stringify(detail))))
  ElMessage.success('已恢复为所选版本内容')
}

async function tryClose(): Promise<void> {
  if (dirty.value && props.canEdit) {
    try {
      await ElMessageBox.confirm('当前有尚未发布的修改。已自动保存的内容会保留在服务端（不进入版本历史）；必填未完整的编辑内容关闭后将丢失。确认关闭？', '关闭确认', {
        type: 'warning', confirmButtonText: '确认关闭', cancelButtonText: '继续编辑'
      })
    } catch { return }
  }
  emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    fullscreen
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    class="skill-editor-dialog"
    append-to-body
  >
    <template #header>
      <div class="se-header">
        <div class="se-header-left">
          <span class="back-btn" title="关闭（先询问）" @click="tryClose">←</span>
          <el-input v-model="draft.name" class="name-input" :disabled="!canEdit" placeholder="未命名技能" />
          <el-input v-if="!currentId" v-model="draft.code" class="code-input" :disabled="!canEdit" placeholder="编码（字母数字_-）" />
          <el-tag v-else-if="draft.code" size="small" effect="plain">{{ draft.code }}</el-tag>
          <el-tag size="small" :type="draft.status === 1 ? 'success' : 'info'" effect="plain">{{ draft.status === 1 ? '已上架' : '未上架' }}</el-tag>
          <span class="autosave" :class="autosaveState">{{ autosaveText }}</span>
        </div>
        <div class="se-header-right">
          <el-switch v-model="draft.status" :disabled="!canEdit" :active-value="1" :inactive-value="0" active-text="上架" inactive-text="下架" />
          <el-button v-if="currentId" @click="historyDrawer = true">历史版本</el-button>
          <el-button v-if="canEdit" type="primary" :loading="saving" @click="onPublishClick">发布版本</el-button>
          <el-button @click="tryClose">关闭</el-button>
        </div>
      </div>
    </template>

    <div class="se-layout">
      <!-- 左侧：文件树 + 元信息 -->
      <aside class="col-left">
        <div class="panel-title">技能文件</div>
        <div class="tree">
          <div class="tree-item" :class="{ active: selected === 'root' }" @click="selectRoot">
            <span class="tree-icon">📄</span><span class="tree-name">SKILL.md</span>
          </div>
          <div v-for="f in fileList" :key="f.index" class="tree-item" :class="{ active: selected === f.index }" @click="selectFile(f.index)">
            <span class="tree-icon">📃</span><span class="tree-name">{{ f.name || '未命名' }}</span>
            <el-button v-if="canEdit" class="tree-del" link type="danger" size="small" @click.stop="removeFile(f.index)">✕</el-button>
          </div>
        </div>
        <el-button v-if="canEdit" size="small" style="width:100%;margin-top:8px" @click="addFile">＋ 新建文件</el-button>

        <div class="panel-title" style="margin-top:16px">元信息</div>
        <el-form label-position="top" size="small" :disabled="!canEdit">
          <el-form-item label="描述（触发意图）">
            <el-input v-model="draft.description" type="textarea" :rows="4" placeholder="描述技能何时被触发（路由匹配依据）" />
          </el-form-item>
          <el-form-item label="适用平台">
            <el-checkbox-group v-model="draft.platforms!">
              <el-checkbox v-for="p in PLATFORMS" :key="p" :value="p">
                <span class="plat-badge" :style="{ color: PLATFORM_META[p].color, background: PLATFORM_META[p].bg, borderColor: PLATFORM_META[p].border }">{{ PLATFORM_META[p].label }}</span>
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
      </aside>

      <!-- 右侧：编辑 | 预览 -->
      <section class="col-right">
        <div class="editor-bar">
          <el-radio-group v-model="viewTab" size="small">
            <el-radio-button value="edit">编辑</el-radio-button>
            <el-radio-button value="preview">预览</el-radio-button>
          </el-radio-group>
          <span class="current-file">{{ currentName }}</span>
          <el-button size="small" link type="primary" @click="downloadCurrent">下载当前文件</el-button>
        </div>
        <el-input
          v-if="viewTab === 'edit'"
          :model-value="currentContent"
          type="textarea"
          :rows="26"
          :disabled="!canEdit"
          resize="none"
          :placeholder="selected === 'root' ? '以 Markdown 编写 SKILL.md（技能主文档）…' : '文件内容…'"
          @update:model-value="setCurrentContent"
        />
        <div v-else class="md-preview" v-html="previewHtml"></div>
      </section>
    </div>

    <VersionConfirmDialog v-model="versionDialog" title="发布版本确认" description="确认后将写库、版本 +1 并生成快照（进入版本历史）。" @confirm="save" />
    <VersionDrawer v-if="currentId" v-model="historyDrawer" kind="skills" :item="historyItem" :can-edit="canEdit" @restored="onRestored" />
  </el-dialog>
</template>
<style scoped>
.skill-editor-dialog :deep(.el-dialog__header) { padding: 0; margin: 0; border-bottom: 1px solid var(--el-border-color-light); }
.skill-editor-dialog :deep(.el-dialog__body) { padding: 12px 16px; height: calc(100vh - 57px); overflow: hidden; }
.se-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; }
.se-header-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.back-btn { font-size: 20px; cursor: pointer; color: var(--el-text-color-regular); padding: 0 6px; line-height: 1; }
.back-btn:hover { color: var(--el-color-primary); }
.name-input { width: 260px; }
.name-input :deep(.el-input__wrapper) { box-shadow: none; background: transparent; }
.name-input :deep(.el-input__inner) { font-size: 16px; font-weight: 600; }
.code-input { width: 200px; }
.code-input :deep(.el-input__inner) { font-family: ui-monospace, Consolas, monospace; }
.autosave { font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }
.autosave.saved { color: var(--el-color-success); }
.autosave.error { color: var(--el-color-danger); }
.se-header-right { display: flex; align-items: center; gap: 8px; }
.se-layout { display: flex; gap: 14px; height: 100%; }
.col-left { flex: 0 0 300px; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
.panel-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.tree { border: 1px solid var(--el-border-color-light); border-radius: 6px; overflow: hidden; }
.tree-item { display: flex; align-items: center; gap: 6px; padding: 7px 10px; cursor: pointer; font-size: 13px; border-bottom: 1px solid var(--el-border-color-extra-light); }
.tree-item:hover { background: var(--el-fill-color-light); }
.tree-item.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); }
.tree-icon { font-size: 12px; }
.tree-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-del { flex: 0 0 auto; }
.col-right { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; }
.editor-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.current-file { font-size: 13px; color: var(--el-text-color-secondary); }
.col-right :deep(.el-textarea) { flex: 1; }
.col-right :deep(.el-textarea__inner) { height: 100%; font-family: var(--el-font-family, monospace); font-size: 13px; }
.md-preview { flex: 1; overflow-y: auto; border: 1px solid var(--el-border-color-light); border-radius: 6px; padding: 16px; background: var(--el-bg-color); }
.md-preview :deep(pre) { background: var(--el-fill-color-light); padding: 10px; border-radius: 6px; overflow-x: auto; }
.md-preview :deep(code) { font-size: 13px; }
.md-preview :deep(blockquote) { margin: 8px 0; padding: 6px 12px; border-left: 3px solid var(--el-border-color); color: var(--el-text-color-secondary); }
.plat-badge { font-size: 12px; padding: 0 8px; border-radius: 4px; border: 1px solid; line-height: 20px; }
</style>
