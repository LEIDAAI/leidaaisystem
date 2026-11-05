<script setup lang="ts">
/**
 * 知识库管理页（v9，文档编辑器升级 Tiptap）：
 * - 列表视图：行式列表 + 新建/编辑对话框（访问权限 公开/私有）；点行进入详情
 * - 详情视图：搜索知识库内容 + 排序 + 上传 txt/md + 新建文档（填名称→直接进编辑）
 * - 预览视图：左侧文档列表（高亮）+ 右侧 预览/编辑 切换；编辑用 Tiptap 富文本
 *   （语雀式表格右键菜单、列宽拖拽、图片、任务列表）；旧 Markdown 文档自动转 HTML 兼容
 * 删除知识库遇 409 专家引用确认后携带 confirmReferences 重试。
 * v10：新建/编辑支持「场景」多选——下拉选历史场景 / 输入新名称自动注册进场景库（归属所选平台），对齐前台平台→场景两级；列表行展示场景标签。
 * v15：详情文档行新增显式「编辑」入口，点击直接进入富文本编辑（原先须先点行进预览再切换，入口不可见）。
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Document as DocumentIcon } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/api/request'
import {
  listConfig, listKnowledgeBases, saveKnowledgeBase, deleteKnowledgeBase, setKnowledgeBaseStatus,
  listKnowledgeFiles, saveKnowledgeFile, deleteKnowledgeFile,
  PLATFORMS, platformMeta, type ConfigItem, type KnowledgeBase, type KnowledgeFile, type PlatformType
} from '@/api/config'
import { formatSize } from '@/api/files'
import { ensureScenario, ensureScenarios, orderedScenarioOptions, scenarioList } from '@/utils/scenarios'
import { USE_MOCK } from '@/utils/constants'
import { formatDateTime } from '@/utils/format'
import { createSeqGuard } from '@/utils/race'
import { visTagOf } from '@/utils/visibility'
import { useTableMaxHeight } from '@/composables/useTableMax'
import TiptapDocEditor from '@/components/tiptap/TiptapDocEditor.vue'
import { contentToHtml } from '@/utils/docContent'

const auth = useAuthStore()

/** 列表限高：视口自适应、列表内部滚动（顶部工具条保持可见） */
const { max: rowsMax, bind: bindRows } = useTableMaxHeight(24)
const canEdit = computed(() => auth.hasPerm('knowledge:edit'))

// -------------------------------------------------------------- 视图状态
const view = ref<'list' | 'detail' | 'preview'>('list')
const current = ref<KnowledgeBase | null>(null)

function platMetaOf(p?: string): { label: string; color: string; bg: string; border: string } {
  return p ? platformMeta(p) : { label: '通用', color: '#909399', bg: '#f4f4f5', border: '#e9e9eb' }
}
/** 前端可见性标签（v14 三段设置，与专家/MCP 同款；旧数据缺省 visibility 时按 access 回退）—— 实现统一抽至 utils/visibility */

// -------------------------------------------------------------- 列表视图
const items = ref<KnowledgeBase[]>([])
const keyword = ref('')
const loading = ref(false)
const filtered = computed(() => items.value.filter((i) => !keyword.value || `${i.name} ${i.description || ''}`.includes(keyword.value)))

/** 列表加载竞态守卫：连续保存/刷新时丢弃乱序返回的旧响应 */
const loadGuard = createSeqGuard()

async function load(): Promise<void> {
  const seq = loadGuard.next()
  loading.value = true
  try {
    const list = await listKnowledgeBases()
    if (!loadGuard.isCurrent(seq)) return
    items.value = list
  } finally {
    if (loadGuard.isCurrent(seq)) loading.value = false
  }
}
void load()

// -------------------------------------------------------------- 新建 / 编辑
const dlg = ref(false)
const form = ref<Partial<KnowledgeBase>>({})
/** 可见性「指定套餐」下拉数据源（无 plan:view 权限时静默为空） */
const planOptions = ref<ConfigItem[]>([])
void listConfig('plans').then((l) => { planOptions.value = l }).catch(() => {})
const formRef = ref<FormInstance>()
const rules: FormRules = {
  name: [{ required: true, whitespace: true, message: '请输入知识库名称', trigger: 'blur' }]
}

function edit(item?: KnowledgeBase): void {
  form.value = item
    ? { ...item, tags: [...(item.tags || [])], visibility: item.visibility || (item.access === 'PRIVATE' ? { type: 'PRIVATE', planIds: [] } : { type: 'PUBLIC', planIds: [] }) }
    : { name: '', description: '', platform: undefined, access: 'PUBLIC', status: 1, tags: [], visibility: { type: 'PUBLIC', planIds: [] } }
  void ensureScenarios().catch(() => {}) // 场景下拉数据源（共享缓存）
  dlg.value = true
}

async function submit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  try {
    const vis = form.value.visibility || { type: 'PUBLIC', planIds: [] }
    await saveKnowledgeBase({ ...form.value, visibility: { ...vis, planIds: vis.type === 'PLAN' ? (vis.planIds || []) : [] }, access: vis.type === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC' })
  } catch (e) {
    if (e instanceof ApiError) { ElMessage.error(e.message); return }
    throw e
  }
  dlg.value = false
  ElMessage.success('已保存')
  await load()
}

/** 场景下拉选项：所选平台场景优先置顶（对齐前台「先平台、后场景」） */
const kbScenarioOptions = computed(() => orderedScenarioOptions(form.value.platform ? [form.value.platform] : undefined))

/** 选择/输入知识库场景：新名称注册进场景库（归属所选平台）；未选平台时仅保留名称不入库 */
async function onKbScenariosChange(names: unknown[]): Promise<void> {
  const fresh = names.map((n) => String(n || '').trim()).filter((n) => n && !scenarioList().some((s) => s.name === n))
  if (!fresh.length) return
  if (!form.value.platform) {
    // 未选平台不能入库：同步移除本次新输入的本地选中，避免残留「假选中」
    const freshSet = new Set(fresh)
    form.value.tags = (form.value.tags || []).filter((t) => !freshSet.has(t))
    ElMessage.warning('请先选择所属平台，新场景才能归属平台并入库')
    return
  }
  try {
    for (const nm of fresh) await ensureScenario(nm, form.value.platform as PlatformType)
    ElMessage.success(`已新增场景：${fresh.join('、')}`)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '场景创建失败')
  }
}

// -------------------------------------------------------------- 启停 / 删除
async function toggleStatus(item: KnowledgeBase, next: number | string | boolean): Promise<void> {
  try {
    await setKnowledgeBaseStatus(item.id, Number(next))
    await load()
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
    else throw e
  }
}

async function remove(item: KnowledgeBase): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除知识库「${item.name}」将同时删除库内全部文档，且被专家引用会被拦截。`, '确认删除')
  } catch { return }
  try {
    await deleteKnowledgeBase(item.id)
  } catch (e) {
    if (e instanceof ApiError && e.code === 409) {
      try {
        await ElMessageBox.confirm(`${e.message}。确认继续删除？`, '引用确认')
        await deleteKnowledgeBase(item.id, { confirmReferences: true })
      } catch { return }
    } else {
      if (e instanceof ApiError) ElMessage.error(e.message)
      return
    }
  }
  ElMessage.success('已删除')
  await load()
}

// -------------------------------------------------------------- 详情视图：文档列表
const files = ref<KnowledgeFile[]>([])
const loadingFiles = ref(false)
const fileQuery = ref('')
const sortKey = ref<'updated' | 'name'>('updated')

/** 过滤（按文件名+内容搜索）与排序（名称 / 最后修改时间降序） */
const filteredFiles = computed(() => {
  let list = files.value.filter((f) => !fileQuery.value || `${f.name}\n${f.content}`.includes(fileQuery.value))
  list = [...list].sort((a, b) =>
    sortKey.value === 'name'
      ? a.name.localeCompare(b.name, 'zh-CN')
      : b.updatedAt.localeCompare(a.updatedAt)
  )
  return list
})

async function openDetail(row: KnowledgeBase): Promise<void> {
  current.value = row
  view.value = 'detail'
  await loadFiles()
}

/** 文件列表竞态守卫：快速切换知识库详情时丢弃旧库的文件列表 */
const filesGuard = createSeqGuard()

async function loadFiles(): Promise<void> {
  if (!current.value) return
  const seq = filesGuard.next()
  loadingFiles.value = true
  try {
    const list = await listKnowledgeFiles(current.value.id)
    if (!filesGuard.isCurrent(seq)) return
    files.value = list
  } catch (e) {
    if (!filesGuard.isCurrent(seq)) return
    if (e instanceof ApiError) ElMessage.error(e.message)
    else throw e
  } finally {
    if (filesGuard.isCurrent(seq)) loadingFiles.value = false
  }
}

async function backToList(): Promise<void> {
  view.value = 'list'
  current.value = null
  await load()
}

// -------------------------------------------------------------- 详情视图：上传文档
const uploadRef = ref<HTMLInputElement | null>(null)

/** 同名文档自动追加 -1/-2 后缀（保留扩展名） */
function uniqueName(name: string): string {
  if (!files.value.some((f) => f.name === name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 1
  while (files.value.some((f) => f.name === `${base}-${i}${ext}`)) i++
  return `${base}-${i}${ext}`
}

function triggerUpload(): void {
  uploadRef.value?.click()
}

async function onUploadChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const list = Array.from(input.files || [])
  input.value = ''
  if (!list.length || !current.value) return
  let ok = 0
  for (const file of list) {
    try {
      const content = await file.text()
      await saveKnowledgeFile(current.value.id, { name: uniqueName(file.name), content })
      ok++
    } catch (err) {
      if (err instanceof ApiError) ElMessage.error(`「${file.name}」上传失败：${err.message}`)
      else throw err
    }
  }
  if (ok) {
    ElMessage.success(`已上传 ${ok} 个文档`)
    await loadFiles()
  }
}

// -------------------------------------------------------------- 详情视图：新建文档（语雀式：填名称 → 直接进入编辑）
const docDlg = ref(false)
const docName = ref('')

function newDoc(): void {
  docName.value = ''
  docDlg.value = true
}

async function submitDoc(): Promise<void> {
  if (!current.value) return
  const name = docName.value.trim()
  if (!name) { ElMessage.warning('请输入文档名称'); return }
  let saved: KnowledgeFile
  try {
    saved = await saveKnowledgeFile(current.value.id, { name, content: '' })
  } catch (e) {
    if (e instanceof ApiError) { ElMessage.error(e.message); return }
    throw e
  }
  docDlg.value = false
  await loadFiles()
  openFile(saved)
  startEdit()
}

// -------------------------------------------------------------- 预览视图：预览 / 编辑
const currentFileId = ref<number | null>(null)
const fileMode = ref<'preview' | 'edit'>('preview')
const editName = ref('')
const editContent = ref('')

const currentFile = computed(() => files.value.find((f) => f.id === currentFileId.value) || null)
const previewHtml = computed(() => contentToHtml(currentFile.value?.content || ''))

function openFile(f: KnowledgeFile): void {
  currentFileId.value = f.id
  fileMode.value = 'preview'
  view.value = 'preview'
}

function switchFile(f: KnowledgeFile): void {
  currentFileId.value = f.id
  fileMode.value = 'preview'
}

/** 文档行「编辑」快捷入口：直接进入富文本编辑，无需先进预览再切换（v15） */
function editFile(f: KnowledgeFile): void {
  openFile(f)
  startEdit()
}

function startEdit(): void {
  if (!currentFile.value) return
  editName.value = currentFile.value.name
  editContent.value = contentToHtml(currentFile.value.content)
  fileMode.value = 'edit'
}

async function saveFileEdit(): Promise<void> {
  if (!current.value || !currentFile.value) return
  if (!editName.value.trim()) { ElMessage.warning('请输入文档名称'); return }
  try {
    const saved = await saveKnowledgeFile(current.value.id, { id: currentFile.value.id, name: editName.value.trim(), content: editContent.value })
    const idx = files.value.findIndex((f) => f.id === saved.id)
    if (idx >= 0) files.value[idx] = saved
    fileMode.value = 'preview'
    ElMessage.success('已保存')
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
    else throw e
  }
}

function cancelEdit(): void {
  fileMode.value = 'preview'
}

async function backToDetail(): Promise<void> {
  view.value = 'detail'
  await loadFiles()
}

async function removeFile(f: KnowledgeFile): Promise<void> {
  if (!current.value) return
  try {
    await ElMessageBox.confirm(`删除文档「${f.name}」？`, '确认删除')
  } catch { return }
  try {
    await deleteKnowledgeFile(current.value.id, f.id)
  } catch (e) {
    if (e instanceof ApiError) ElMessage.error(e.message)
    else throw e
  }
  ElMessage.success('已删除')
  if (currentFileId.value === f.id) {
    view.value = 'detail'
    currentFileId.value = null
  }
  await loadFiles()
}
</script>

<template>
  <el-alert v-if="USE_MOCK" title="Mock 配置中心：知识库为本地模拟数据。" type="info" :closable="false" style="margin-bottom:16px" />

  <!-- ============================== 列表视图 ============================== -->
  <el-card v-if="view === 'list'" shadow="never">
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索名称 / 描述" clearable style="width:260px" />
      <el-button @click="load">刷新列表</el-button>
      <div class="spacer" />
      <el-button v-if="canEdit" type="primary" @click="edit()">创建知识库</el-button>
    </div>

    <div v-loading="loading" class="rows" :style="rowsMax ? { maxHeight: `${rowsMax}px`, overflowY: 'auto' } : undefined" :ref="bindRows">
      <div v-for="row in filtered" :key="row.id" class="row" @click="openDetail(row)">
        <div class="row-icon" :class="{ off: row.status !== 1 }">{{ (row.name || '?').slice(0, 1).toUpperCase() }}</div>
        <div class="row-main">
          <div class="row-title">
            <span class="row-name">{{ row.name }}</span>
            <el-tag
              size="small"
              effect="plain"
              :style="{ color: platMetaOf(row.platform).color, background: platMetaOf(row.platform).bg, borderColor: platMetaOf(row.platform).border }"
            >{{ platMetaOf(row.platform).label }}</el-tag>
            <el-tag v-for="t in row.tags || []" :key="t" size="small" type="info" effect="plain">{{ t }}</el-tag>
            <el-tag size="small" :type="visTagOf(row.visibility, row.access).type" effect="plain">{{ visTagOf(row.visibility, row.access).label }}</el-tag>
          </div>
          <div class="row-desc">{{ row.description || '—' }}</div>
        </div>
        <div class="row-meta">
          <span>文件 <b>{{ row.fileCount }}</b></span>
          <span class="muted">{{ formatDateTime(row.updatedAt) }}</span>
        </div>
        <div class="row-actions" @click.stop>
          <el-switch :model-value="row.status === 1" :disabled="!canEdit" @change="(v: string | number | boolean) => toggleStatus(row, v)" />
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button v-if="canEdit" link type="primary" @click="edit(row)">编辑</el-button>
          <el-button v-if="canEdit" link type="danger" @click="remove(row)">删除</el-button>
        </div>
      </div>
      <el-empty v-if="!filtered.length && !loading" description="暂无知识库，点击右上「创建知识库」开始" />
    </div>
  </el-card>

  <!-- ============================== 详情视图 ============================== -->
  <el-card v-else-if="view === 'detail'" shadow="never">
    <div class="kb-head">
      <div class="kb-head-main">
        <el-button link @click="backToList"><el-icon style="margin-right:4px">&larr;</el-icon>返回</el-button>
        <div class="kb-title">
          <span class="kb-name">{{ current?.name }}</span>
          <el-tag
            size="small"
            effect="plain"
            :style="{ color: platMetaOf(current?.platform).color, background: platMetaOf(current?.platform).bg, borderColor: platMetaOf(current?.platform).border }"
          >{{ platMetaOf(current?.platform).label }}</el-tag>
          <el-tag size="small" :type="visTagOf(current?.visibility, current?.access).type" effect="plain">{{ visTagOf(current?.visibility, current?.access).label }}</el-tag>
        </div>
        <div class="kb-desc">{{ current?.description || '—' }}</div>
      </div>
    </div>

    <div class="doc-toolbar">
      <el-input v-model="fileQuery" placeholder="搜索知识库内容" clearable style="width:300px" />
      <el-select v-model="sortKey" style="width:170px">
        <el-option value="updated" label="按最后修改时间排序" />
        <el-option value="name" label="按名称排序" />
      </el-select>
      <div class="spacer" />
      <template v-if="canEdit">
        <input ref="uploadRef" type="file" accept=".txt,.md,.markdown" multiple style="display:none" @change="onUploadChange" />
        <el-button @click="triggerUpload">上传文档</el-button>
        <el-button type="primary" @click="newDoc">新建文档</el-button>
      </template>
    </div>

    <div v-loading="loadingFiles" class="doc-rows">
      <div v-for="f in filteredFiles" :key="f.id" class="doc-row" @click="openFile(f)">
        <el-icon class="doc-icon"><DocumentIcon /></el-icon>
        <span class="doc-name">{{ f.name }}</span>
        <span class="muted doc-date">{{ formatDateTime(f.updatedAt) }}</span>
        <span class="muted doc-size">{{ formatSize(f.size) }}</span>
        <div class="doc-actions" @click.stop>
          <el-button v-if="canEdit" link type="primary" @click="editFile(f)">编辑</el-button>
        </div>
      </div>
      <el-empty
        v-if="!filteredFiles.length && !loadingFiles"
        :description="fileQuery ? '未找到匹配的文档' : '暂无文档，可上传 txt/md 文件或新建文档'"
      />
    </div>
  </el-card>

  <!-- ============================== 预览视图 ============================== -->
  <el-card v-else shadow="never">
    <div class="preview-layout">
      <aside class="preview-side">
        <div class="side-head">
          <el-button link @click="backToDetail"><el-icon style="margin-right:4px">&larr;</el-icon>{{ current?.name }}</el-button>
        </div>
        <div
          v-for="f in files"
          :key="f.id"
          class="side-item"
          :class="{ active: f.id === currentFileId }"
          @click="switchFile(f)"
        >{{ f.name }}</div>
      </aside>
      <section class="preview-main">
        <div class="preview-head">
          <div class="preview-title">
            <span class="preview-name">{{ currentFile?.name }}</span>
            <span v-if="currentFile" class="muted">· {{ formatDateTime(currentFile.updatedAt) }}</span>
          </div>
          <div class="preview-actions" @click.stop>
            <el-button size="small" :type="fileMode === 'preview' ? 'primary' : ''" @click="fileMode = 'preview'">预览</el-button>
            <el-button v-if="canEdit" size="small" :type="fileMode === 'edit' ? 'primary' : ''" @click="startEdit">编辑</el-button>
            <el-button v-if="canEdit && currentFile" size="small" type="danger" plain @click="removeFile(currentFile)">删除</el-button>
          </div>
        </div>

        <!-- 预览：内容渲染（旧 Markdown 自动转 HTML；新文档为 Tiptap HTML） -->
        <div v-if="fileMode === 'preview'" class="md-preview" v-html="previewHtml" />

        <!-- 编辑：名称 + 语雀式富文本（Tiptap，支持表格右键/列宽拖拽/图片/任务列表） -->
        <div v-else class="file-edit">
          <el-input v-model="editName" placeholder="文档名称" style="margin-bottom:12px" />
          <TiptapDocEditor v-model="editContent" :can-edit="canEdit" :min-height="420" placeholder="开始编写文档…" />
          <div class="edit-footer">
            <el-button @click="cancelEdit">取消</el-button>
            <el-button type="primary" @click="saveFileEdit">保存</el-button>
          </div>
        </div>
      </section>
    </div>
  </el-card>

  <!-- ============================== 弹窗 ============================== -->
  <el-dialog v-model="dlg" :title="form.id ? '编辑知识库' : '创建知识库'" width="480px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="88px">
      <el-form-item label="名称" prop="name"><el-input v-model="form.name" placeholder="知识库名称" /></el-form-item>
      <el-form-item label="所属平台">
        <el-select v-model="form.platform" placeholder="通用（可选）" clearable style="width:100%">
          <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="platMetaOf(p).label" />
        </el-select>
      </el-form-item>
      <el-form-item label="场景">
        <el-select
          v-model="form.tags" multiple filterable allow-create default-first-option
          :placeholder="form.platform ? '选择历史场景，或输入新场景后回车' : '可选历史场景；选择平台后才能新建'"
          style="width:100%" @change="onKbScenariosChange"
        >
          <el-option v-for="s in kbScenarioOptions" :key="s.id" :value="s.name" :label="s.label" />
        </el-select>
        <div class="muted" style="font-size:12px;line-height:1.6">对齐前台「平台 → 场景」两级筛选；输入新名称回车自动创建并归入所选平台。</div>
      </el-form-item>
      <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="3" placeholder="知识库用途说明（可选）" /></el-form-item>
      <el-form-item label="前台可见性">
        <div class="access-group">
          <el-radio-group v-model="form.visibility!.type">
            <el-radio-button value="PUBLIC">全员可见</el-radio-button>
            <el-radio-button value="PLAN">指定套餐</el-radio-button>
            <el-radio-button value="PRIVATE">内部隐藏</el-radio-button>
          </el-radio-group>
          <el-select
            v-if="form.visibility!.type === 'PLAN'"
            v-model="form.visibility!.planIds" multiple filterable
            style="width:100%;margin-top:8px"
            placeholder="选择对哪些套餐用户可见（不选则不可见）"
          >
            <el-option v-for="p in planOptions" :key="p.id" :value="p.id" :label="`${p.name}（${p.code}）`" />
          </el-select>
          <div class="muted access-tip">仅控制 C 端工作台「知识库清单」中的展示；已被专家引用的知识库检索不受影响（隐藏 ≠ 不可检索）。</div>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dlg = false">取消</el-button>
      <el-button type="primary" @click="submit">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="docDlg" title="新建文档" width="480px">
    <el-input v-model="docName" placeholder="文档名称，如 选品指标说明" @keyup.enter="submitDoc" />
    <div class="muted" style="font-size:12px;margin-top:8px">创建后直接进入编辑，可插入表格、图片、代码块、任务列表等</div>
    <template #footer>
      <el-button @click="docDlg = false">取消</el-button>
      <el-button type="primary" @click="submitDoc">创建并编辑</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 16px; }
.toolbar .spacer, .doc-toolbar .spacer { flex: 1; }
.rows { display: flex; flex-direction: column; }
.row { display: flex; align-items: center; gap: 14px; padding: 12px 8px; border-bottom: 1px solid var(--el-border-color-extra-light); cursor: pointer; }
.row:hover { background: var(--el-fill-color-lighter); }
.row-icon { flex: 0 0 40px; height: 40px; border-radius: 8px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
.row-icon.off { background: var(--el-fill-color); color: var(--el-text-color-secondary); }
.row-main { flex: 1 1 0; min-width: 0; }
.row-title { display: flex; align-items: center; gap: 8px; }
.row-name { font-weight: 600; }
.row-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-meta { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--el-text-color-regular); flex: 0 0 150px; }
.row-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; justify-content: flex-end; white-space: nowrap; }
.muted { color: var(--el-text-color-secondary); }
.access-group { display: flex; flex-direction: column; gap: 4px; }
.access-tip { font-size: 12px; line-height: 1.5; }

/* 详情视图 */
.kb-head { margin-bottom: 16px; }
.kb-title { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
.kb-name { font-size: 18px; font-weight: 600; }
.kb-desc { font-size: 13px; color: var(--el-text-color-secondary); margin-top: 4px; }
.doc-toolbar { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.doc-rows { display: flex; flex-direction: column; }
.doc-row { display: flex; align-items: center; gap: 10px; padding: 11px 8px; border-bottom: 1px solid var(--el-border-color-extra-light); cursor: pointer; font-size: 14px; }
.doc-row:hover { background: var(--el-fill-color-lighter); }
.doc-icon { color: var(--el-color-primary); }
.doc-name { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-date { flex: 0 0 150px; font-size: 12px; }
.doc-size { flex: 0 0 80px; text-align: right; font-size: 12px; }
.doc-actions { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; white-space: nowrap; }

/* 预览视图 */
.preview-layout { display: flex; gap: 16px; min-height: 480px; }
.preview-side { flex: 0 0 240px; border-right: 1px solid var(--el-border-color-lighter); padding-right: 12px; overflow-y: auto; max-height: 640px; }
.side-head { margin-bottom: 8px; }
.side-item { padding: 9px 10px; border-radius: 6px; font-size: 13px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--el-text-color-regular); }
.side-item:hover { background: var(--el-fill-color-lighter); }
.side-item.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
.preview-main { flex: 1 1 0; min-width: 0; }
.preview-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--el-border-color-extra-light); margin-bottom: 14px; }
.preview-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.preview-name { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-actions { display: flex; gap: 8px; flex: 0 0 auto; }
.edit-footer { margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px; }

/* Markdown 预览排版（v-html 需要 :deep 穿透） */
.md-preview { line-height: 1.75; font-size: 14px; color: var(--el-text-color-primary); overflow-y: auto; max-height: 640px; }
.md-preview :deep(h1) { font-size: 22px; margin: 18px 0 12px; }
.md-preview :deep(h2) { font-size: 18px; margin: 16px 0 10px; }
.md-preview :deep(h3) { font-size: 16px; margin: 14px 0 8px; }
.md-preview :deep(h4) { font-size: 14px; margin: 12px 0 6px; }
.md-preview :deep(p) { margin: 8px 0; }
.md-preview :deep(ul), .md-preview :deep(ol) { padding-left: 22px; margin: 8px 0; }
.md-preview :deep(blockquote) { margin: 10px 0; padding: 8px 14px; border-left: 3px solid var(--el-color-primary-light-5); background: var(--el-fill-color-lighter); color: var(--el-text-color-regular); border-radius: 0 4px 4px 0; }
.md-preview :deep(code) { background: var(--el-fill-color); padding: 1px 6px; border-radius: 4px; font-size: 13px; font-family: Consolas, Monaco, monospace; }
.md-preview :deep(pre) { background: var(--el-fill-color-darker); color: var(--el-text-color-primary); padding: 12px 14px; border-radius: 6px; overflow-x: auto; margin: 10px 0; }
.md-preview :deep(pre code) { background: transparent; padding: 0; color: inherit; }
.md-preview :deep(hr) { border: none; border-top: 1px solid var(--el-border-color-lighter); margin: 14px 0; }
.md-preview :deep(a) { color: var(--el-color-primary); }
.md-preview :deep(table) { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
.md-preview :deep(th), .md-preview :deep(td) { border: 1px solid var(--el-border-color-lighter); padding: 8px 12px; text-align: left; }
.md-preview :deep(th) { background: var(--el-fill-color-light); font-weight: 600; }
.md-preview :deep(tbody tr:hover) { background: var(--el-fill-color-lighter); }
</style>
