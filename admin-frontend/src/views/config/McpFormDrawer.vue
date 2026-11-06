<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { saveConfig, listConfig, PLATFORMS, PLATFORM_META, type ApiOperation, type ConfigItem, type PlatformType } from '@/api/config'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

/** MCP = 工具服务器连接表单（附录 12.3：MCP / OpenAPI 双类型；v5 每次保存生成连接配置快照） */
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
type McpDraft = FormDraft & { argsText?: string; toolFilterText?: string }
const saving = ref(false)
const draft = ref<McpDraft>({})
/** v9：套餐清单（PLAN 可见性选择用） */
const plans = ref<ConfigItem[]>([])
const manualOperation = ref<ApiOperation>({ method: 'GET', path: '', name: '' })
const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']

function operationError(ops: ApiOperation[]): string | null {
  const names = new Set<string>()
  const routes = new Set<string>()
  for (const op of ops) {
    if (!op.name?.trim() || !op.path?.trim().startsWith('/') || !httpMethods.includes(op.method?.toUpperCase())) return '接口须填写名称、HTTP 方法及以 / 开头的路径'
    const name = op.name.trim()
    const route = `${op.method.toUpperCase()} ${op.path.trim()}`
    if (names.has(name) || routes.has(route)) return `接口名称或方法与路径重复：${name}（${route}）`
    names.add(name); routes.add(route)
  }
  return null
}

function parseOpenApi(text: string): ApiOperation[] {
  let doc: Record<string, unknown>
  try { doc = JSON.parse(text) as Record<string, unknown> } catch { throw new Error('文件不是合法 JSON') }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || typeof doc.openapi !== 'string' || !/^3\./.test(doc.openapi)) throw new Error('仅支持 OpenAPI 3.x JSON')
  if (!doc.paths || typeof doc.paths !== 'object' || Array.isArray(doc.paths) || !Object.keys(doc.paths).length) throw new Error('OpenAPI paths 不能为空')
  const operations: ApiOperation[] = []
  for (const [path, methods] of Object.entries(doc.paths as Record<string, unknown>)) {
    if (!path.startsWith('/') || !methods || typeof methods !== 'object' || Array.isArray(methods)) throw new Error(`无效的接口路径：${path}`)
    for (const [method, value] of Object.entries(methods as Record<string, unknown>)) {
      if (!httpMethods.includes(method.toUpperCase())) continue
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${method.toUpperCase()} ${path} 的接口定义无效`)
      const operation = value as Record<string, unknown>
      const name = typeof operation.operationId === 'string' && operation.operationId.trim() ? operation.operationId.trim() : `${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`
      operations.push({ name, method: method.toUpperCase(), path, summary: typeof operation.summary === 'string' ? operation.summary : undefined })
    }
  }
  if (!operations.length) throw new Error('paths 中没有 HTTP 接口操作')
  const err = operationError(operations)
  if (err) throw new Error(err)
  return operations
}

async function importOpenApi(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.canEdit) return
  try {
    const operations = parseOpenApi(await file.text())
    draft.value.apiOperations = operations
    ElMessage.success(`已解析 ${operations.length} 个 API 接口定义，请保存连接后执行「发现工具」`)
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '导入失败') }
}

function changeConnectionType(): void {
  draft.value.path = ''
  if (draft.value.connType === 'MCP') {
    draft.value.apiOperations = []
    draft.value.transport = 'STREAMABLE_HTTP'
  } else {
    draft.value.command = ''
    draft.value.args = []
    draft.value.argsText = '[]'
    draft.value.transport = undefined
  }
}

function addOperation(): void {
  const op = { ...manualOperation.value, name: manualOperation.value.name.trim(), path: manualOperation.value.path.trim() }
  const err = operationError([...(draft.value.apiOperations || []), op])
  if (err) { ElMessage.error(err); return }
  draft.value.apiOperations = [...(draft.value.apiOperations || []), op]
  manualOperation.value = { method: 'GET', path: '', name: '' }
}

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (!visible) return
    draft.value = {
      status: 1, connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: '', path: '', command: '', args: [],
      authConfig: { type: 'NONE' }, toolFilter: [], platforms: ['1688'], visibility: { type: 'PUBLIC', planIds: [] },
      ...JSON.parse(JSON.stringify(props.item || {}))
    }
    if (!draft.value.authConfig || typeof draft.value.authConfig !== 'object') draft.value.authConfig = { type: 'NONE' }
    if (!Array.isArray(draft.value.platforms)) draft.value.platforms = ['1688']
    draft.value.platforms = draft.value.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
    if (!draft.value.platforms.length) draft.value.platforms = ['1688']
    if (!Array.isArray(draft.value.args)) draft.value.args = []
    if (!Array.isArray(draft.value.toolFilter)) draft.value.toolFilter = []
    if (!Array.isArray(draft.value.apiOperations)) draft.value.apiOperations = []
    manualOperation.value = { method: 'GET', path: '', name: '' }
    // v9：前台可见性归一化（仅控制 C 端展示，不影响专家调用）
    if (!draft.value.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(draft.value.visibility.type || '')) draft.value.visibility = { type: 'PUBLIC', planIds: [] }
    draft.value.argsText = JSON.stringify(draft.value.args)
    draft.value.toolFilterText = (draft.value.toolFilter as string[]).join('\n')
    if (!plans.value.length) listConfig('plans').then((ps) => { plans.value = ps }).catch(() => {})
  },
  { immediate: true }
)

/** 提交前置校验：必填项 + 参数格式（弹版本确认框之前拦截，避免确认后才报错） */
function validateDraft(): string | null {
  if (!String(draft.value.code || '').trim()) return '请填写连接编码'
  if (!String(draft.value.name || '').trim()) return '请填写名称'
  if (!draft.value.platforms || !draft.value.platforms.length) return '平台维度至少选择一个'
  if (draft.value.connType === 'OpenAPI') {
    if (!String(draft.value.endpoint || '').trim()) return 'API 服务地址不能为空'
    if (!draft.value.apiOperations?.length) return '请导入 OpenAPI 文件或手工添加至少一个接口'
    const err = operationError(draft.value.apiOperations || [])
    if (err) return err
  } else if (draft.value.transport === 'STDIO') {
    if (!String(draft.value.command || '').trim()) return 'STDIO 启动命令不能为空'
    if (draft.value.argsText !== undefined) {
      try { const parsed = JSON.parse(draft.value.argsText) as unknown; if (!Array.isArray(parsed)) return '启动参数须为 JSON 字符串数组' } catch { return '启动参数须为合法 JSON（字符串数组）' }
    }
  } else if (!String(draft.value.endpoint || '').trim()) return 'MCP 服务地址不能为空'
  if (draft.value.visibility?.type === 'PLAN' && !(draft.value.visibility.planIds || []).length) return '指定套餐可见时请至少选择一个套餐'
  return null
}

/** 保存（发布）：先弹版本确认框（默认时间戳版本名可改），确认后才写库并生成快照 */
const versionDialog = ref(false)
function onSaveClick(): void {
  if (!props.canEdit) return
  const err = validateDraft()
  if (err) { ElMessage.error(err); return }
  versionDialog.value = true
}

async function save(v: { versionName: string; note: string }): Promise<void> {
  if (!props.canEdit) return
  saving.value = true
  try {
    let args: string[] = []
    if (draft.value.connType === 'MCP' && draft.value.transport === 'STDIO' && draft.value.argsText !== undefined) {
      try { args = JSON.parse(draft.value.argsText) as string[] } catch { ElMessage.error('启动参数须为 JSON 字符串数组'); return }
    }
    // 工具过滤：文本域每行（或逗号分隔）一个工具名，留空 = 开放全部
    const toolFilter = String(draft.value.toolFilterText || '')
      .split(/[\n,，]/).map((s) => s.trim()).filter(Boolean)
    if (!draft.value.platforms || !draft.value.platforms.length) {
      ElMessage.error('平台维度至少选择一个')
      return
    }
    await saveConfig('mcp/servers', {
      ...draft.value, args: draft.value.connType === 'MCP' ? args : [], toolFilter,
      apiOperations: draft.value.connType === 'OpenAPI' ? draft.value.apiOperations : [],
      platforms: draft.value.platforms.filter((p) => PLATFORMS.includes(p as PlatformType)),
      versionName: v.versionName, note: v.note
    })
    ElMessage.success(draft.value.connType === 'OpenAPI' ? '连接已保存，API 工具定义可通过「发现工具」同步；调用待后端接入' : 'MCP 连接已保存；「发现工具」为 Mock 示例数据，连接测试也为演示模拟')
    versionDialog.value = false
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑连接' : '新建工具服务器连接'}`" size="700px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-form label-width="120px" :disabled="!canEdit">
      <el-form-item label="连接编码" required><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="如 gateway / dld / amazon_data" /></el-form-item>
      <el-form-item label="名称" required><el-input v-model="draft.name" /></el-form-item>
      <el-form-item label="平台">
        <el-select v-model="draft.platforms" multiple style="width:100%" placeholder="至少选择一个平台">
          <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="PLATFORM_META[p].label" />
        </el-select>
        <p class="muted">平台维度多选（至少一个）：专家按平台联动时仅显示有平台交集的连接。</p>
      </el-form-item>
      <el-form-item label="连接类型">
        <el-radio-group v-model="draft.connType" @change="changeConnectionType">
          <el-radio-button value="MCP">导入 MCP 服务</el-radio-button>
          <el-radio-button value="OpenAPI">导入 API 接口</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <template v-if="draft.connType === 'MCP'">
        <el-form-item label="传输方式">
          <el-select v-model="draft.transport" style="width:260px">
            <el-option value="STREAMABLE_HTTP" label="STREAMABLE_HTTP" />
            <el-option value="SSE" label="SSE" />
            <el-option value="STDIO" label="STDIO" />
          </el-select>
        </el-form-item>
        <template v-if="draft.transport !== 'STDIO'">
          <el-form-item label="服务地址"><el-input v-model="draft.endpoint" placeholder="https://..." /></el-form-item>
          <el-form-item label="端点路径"><el-input v-model="draft.path" placeholder="/mcp" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="启动命令"><el-input v-model="draft.command" placeholder="如 node / python" /></el-form-item>
          <el-form-item label="启动参数"><el-input v-model="draft.argsText" type="textarea" :rows="2" placeholder="JSON 数组，如 [&quot;-y&quot;,&quot;server.js&quot;]" /></el-form-item>
        </template>
        <p class="muted">登记 MCP HTTP/SSE/STDIO 连接；发现工具和连接测试为 Mock 示例，不会访问 MCP 服务。</p>
      </template>
      <template v-else>
        <el-form-item label="服务地址"><el-input v-model="draft.endpoint" placeholder="https://api.example.com" /></el-form-item>
        <el-form-item label="Schema 路径"><el-input v-model="draft.path" placeholder="可选，仅记录 /openapi.json；不会自动请求" /></el-form-item>
        <el-form-item label="导入 OpenAPI">
          <input type="file" accept=".json,application/json" :disabled="!canEdit" @change="importOpenApi" />
          <p class="muted">仅解析本地 OpenAPI 3.x JSON 的 paths；导入将替换当前接口定义，不保存文件原文。</p>
        </el-form-item>
        <el-form-item label="手工添加接口">
          <div style="display:flex;gap:8px;width:100%">
            <el-select v-model="manualOperation.method" style="width:115px"><el-option v-for="method in httpMethods" :key="method" :value="method" :label="method" /></el-select>
            <el-input v-model="manualOperation.path" placeholder="/products/{id}" />
            <el-input v-model="manualOperation.name" placeholder="接口名称" />
            <el-button @click="addOperation">添加</el-button>
          </div>
        </el-form-item>
        <el-form-item :label="`接口定义（${draft.apiOperations?.length || 0}）`">
          <el-table :data="draft.apiOperations || []" size="small" style="width:100%" max-height="220">
            <el-table-column prop="method" label="方法" width="85" />
            <el-table-column prop="path" label="路径" min-width="150" />
            <el-table-column prop="name" label="名称" min-width="150" />
            <el-table-column prop="summary" label="摘要" min-width="130" />
            <el-table-column label="操作" width="75"><template #default="{ $index }"><el-button link type="danger" @click="draft.apiOperations?.splice($index, 1)">移除</el-button></template></el-table-column>
          </el-table>
          <p class="muted">保存后执行「发现工具」同步定义；仅导入元数据，API 调用待后端接入，连接测试为 Mock 模拟。</p>
        </el-form-item>
      </template>
      <el-form-item label="鉴权方式">
        <el-select v-model="draft.authConfig!.type" style="width:200px">
          <el-option value="NONE" label="无鉴权" />
          <el-option value="BEARER" label="Bearer Token" />
          <el-option value="API_KEY" label="API Key" />
          <el-option value="HEADER" label="自定义请求头" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="draft.authConfig!.type === 'API_KEY' || draft.authConfig!.type === 'HEADER'" label="请求头名称">
        <el-input v-model="draft.authConfig!.headerName" placeholder="如 X-Api-Key / Authorization" style="width:240px" />
      </el-form-item>
      <el-form-item v-if="draft.authConfig!.type !== 'NONE'" label="鉴权凭据">
        <el-input v-model="draft.authConfig!.credential" type="password" autocomplete="new-password" :placeholder="item?.id ? '留空表示不修改已有凭据' : '仅输入演示凭据，保存后永不回显'" />
        <p class="muted">凭据应用层加密存储，界面与接口均只回显掩码 ****。</p>
      </el-form-item>
      <el-form-item label="工具过滤">
        <el-input v-model="draft.toolFilterText" type="textarea" :rows="3" placeholder="每行一个工具名（也可逗号分隔），留空 = 开放全部工具；工具发现结果受此清单过滤" />
        <p class="muted">简化为单一过滤文本域：命中清单的工具才会对助手可见（可作黑/白名单使用）。</p>
      </el-form-item>
      <el-form-item label="前台可见性">
        <el-radio-group v-model="draft.visibility!.type">
          <el-radio-button value="PUBLIC">全员可见</el-radio-button>
          <el-radio-button value="PLAN">指定套餐</el-radio-button>
          <el-radio-button value="PRIVATE">内部隐藏</el-radio-button>
        </el-radio-group>
        <el-select
          v-if="draft.visibility!.type === 'PLAN'"
          v-model="draft.visibility!.planIds" multiple style="width:100%;margin-top:8px" placeholder="选择对哪些套餐用户可见（不选则不可见）"
        >
          <el-option v-for="p in plans" :key="p.id" :value="p.id" :label="`${p.name}（${p.code}）`" />
        </el-select>
        <p class="muted">仅控制 C 端工作台「MCP 清单」与专家详情中的服务名展示；已绑定该服务的专家/技能调用不受影响（隐藏 ≠ 不可调用）。</p>
      </el-form-item>
      <el-form-item label="状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="onSaveClick">保存连接</el-button>
    </template>
    <VersionConfirmDialog
      v-model="versionDialog"
      title="发布版本确认"
      description="确认后将写库、版本 +1 并生成连接配置快照（含工具绑定，进入版本历史）。"
      async
      :loading="saving"
      @confirm="save"
    />
  </el-drawer>
</template>
