<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { get, post, ApiError } from '@/api/request'
import {
  listConfig, saveConfig, deleteConfig, configAction, listTools, toggleTool, skillStats,
  exportConfigJson, importExpertJson, importSkillJson, cloneSkill, testMcpConnection,
  type ConfigItem, type ConfigKind, type Tool
} from '@/api/config'
import { downloadJsonFile } from '@/utils/jsonio'
import { formatDateTime } from '@/utils/format'
import { USE_MOCK } from '@/utils/constants'
import PlanFormDrawer from './config/PlanFormDrawer.vue'
import ExpertFormDrawer from './config/ExpertFormDrawer.vue'
import SkillFormDrawer from './config/SkillFormDrawer.vue'
import McpFormDrawer from './config/McpFormDrawer.vue'
import VersionDrawer from './config/VersionDrawer.vue'
import WorkspacePreviewDrawer from './config/WorkspacePreviewDrawer.vue'

const route = useRoute()
const auth = useAuthStore()
const kind = computed(() => (route.path === '/mcp' ? 'mcp/servers' : route.path.slice(1)) as ConfigKind)
const module = computed(() => (kind.value === 'mcp/servers' ? 'mcp' : kind.value.slice(0, -1)))
const canEdit = computed(() => auth.hasPerm(`${module.value}:edit`))
// 专家导出/导入复用 expert:edit；技能导出为独立 skill:export 权限点（v4）
const canExport = computed(() => (module.value === 'expert' ? canEdit.value : auth.hasPerm('skill:export')))
const canClone = computed(() => auth.hasPerm('skill:clone'))

const items = ref<ConfigItem[]>([])
const tools = ref<Tool[]>([])
const skills = ref<ConfigItem[]>([])
const servers = ref<ConfigItem[]>([])
const plans = ref<ConfigItem[]>([])
const keyword = ref('')
const status = ref<number | ''>('')
const loading = ref(false)

const filtered = computed(() =>
  items.value.filter((i) => (!keyword.value || `${i.name} ${i.code}`.includes(keyword.value)) && (status.value === '' || i.status === status.value))
)

async function load(): Promise<void> {
  loading.value = true
  try {
    items.value = await listConfig(kind.value)
    if (kind.value === 'mcp/servers') tools.value = await listTools()
  } finally {
    loading.value = false
  }
}
watch(kind, () => { keyword.value = ''; status.value = ''; void load() }, { immediate: true })

// -------------------------------------------------------------- 表单抽屉
const planDrawer = ref(false), expertDrawer = ref(false), skillDrawer = ref(false), mcpDrawer = ref(false)
const versionDrawer = ref(false), previewDrawer = ref(false)
const editItem = ref<Partial<ConfigItem> | null>(null)
const historyItem = ref<ConfigItem | null>(null)
const previewItem = ref<ConfigItem | null>(null)
const historyKind = computed(() => (module.value === 'skill' ? 'skills' : 'experts') as 'experts' | 'skills')

function blankDraft(): Partial<ConfigItem> {
  if (module.value === 'expert') {
    return { code: '', name: '', description: '', avatarUrl: '', baseModel: 'GLM-5.3', systemPrompt: '', skillIds: [], mcpServerIds: [], suggestedQuestions: [], tags: [], status: 1, isDefault: false, visibility: { type: 'PUBLIC', planIds: [] } }
  }
  if (module.value === 'skill') return { code: '', name: '', description: '', content: '', files: [], status: 1 }
  if (module.value === 'mcp') return { code: '', name: '', connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: '', path: '', authConfig: { type: 'NONE' }, toolFilter: [], status: 1 }
  return { code: '', name: '', status: 1, price: 0, durationDays: 30, entitlements: [] }
}

async function edit(item?: ConfigItem): Promise<void> {
  const detail = item ? await get<ConfigItem>(`/${kind.value}/${item.id}`) : blankDraft()
  editItem.value = JSON.parse(JSON.stringify(detail))
  if (module.value === 'expert') {
    ;[skills.value, servers.value, plans.value] = await Promise.all([listConfig('skills'), listConfig('mcp/servers'), listConfig('plans')])
    expertDrawer.value = true
  } else if (module.value === 'skill') skillDrawer.value = true
  else if (module.value === 'mcp') mcpDrawer.value = true
  else planDrawer.value = true
}

async function onSaved(): Promise<void> {
  await load()
  if (module.value === 'plan') plans.value = await listConfig('plans')
}

// -------------------------------------------------------------- 删除（409 引用拦截确认）
async function remove(item: ConfigItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除「${item.name}」？被引用资源将被拦截。`, '确认删除')
  } catch {
    return
  }
  try {
    await deleteConfig(kind.value, item.id)
  } catch (e) {
    if (e instanceof ApiError && e.code === 409 && module.value === 'skill') {
      try {
        await ElMessageBox.confirm(`${e.message}。确认继续删除？`, '引用确认')
        await deleteConfig(kind.value, item.id, { confirmReferences: true })
      } catch { return }
    } else {
      return
    }
  }
  ElMessage.success('已删除')
  await load()
}

// -------------------------------------------------------------- 通用行操作
async function refresh(item: ConfigItem, simulateFailure = false): Promise<void> {
  await configAction(kind.value, item.id, 'refresh', simulateFailure ? { simulateFailure } : undefined)
  await load()
}

async function toggleStatus(item: ConfigItem): Promise<void> {
  const next = item.status === 1 ? 0 : 1
  try {
    await saveConfig(kind.value, { id: item.id, code: item.code, name: item.name, status: next })
    await load()
  } catch (e) {
    // 技能停用被专家引用时 409：二次确认后携带引用确认重试
    if (e instanceof ApiError && e.code === 409 && module.value === 'skill') {
      try {
        await ElMessageBox.confirm(`${e.message}。确认继续停用？`, '引用确认')
        await saveConfig(kind.value, { id: item.id, code: item.code, name: item.name, status: next, confirmReferences: true })
        await load()
      } catch { /* 取消或仍失败 */ }
    }
  }
}

async function setDefault(item: ConfigItem): Promise<void> {
  await post(`/experts/${item.id}/default`)
  await load()
}

// -------------------------------------------------------------- 专家：前台预览 / 导出
function preview(item: ConfigItem): void {
  previewItem.value = item
  previewDrawer.value = true
}

async function history(item: ConfigItem): Promise<void> {
  historyItem.value = item
  versionDrawer.value = true
}

async function exportJson(item: ConfigItem): Promise<void> {
  const { filename, content } = await exportConfigJson(historyKind.value, item.id)
  downloadJsonFile(filename, content)
  ElMessage.success(`已导出 ${filename}`)
}

/** 导入预设：粘贴导出的 JSON 内容（专家/技能通用；code 冲突返回 409） */
async function importJson(): Promise<void> {
  let value: string
  try {
    ({ value } = await ElMessageBox.prompt(
      module.value === 'expert' ? '粘贴专家预设 JSON（内容为「导出预设JSON」生成的文件）' : '粘贴技能 JSON（内容为「导出」生成的文件）',
      '导入预设',
      {
        inputType: 'textarea',
        inputPlaceholder: '{ "code": "...", "name": "...", ... }',
        inputValidator: (v: string) => {
          if (!v || !v.trim()) return '请粘贴 JSON 内容'
          try { JSON.parse(v); return true } catch { return '内容不是合法 JSON' }
        }
      }
    ))
  } catch {
    return
  }
  const payload = JSON.parse(value)
  if (module.value === 'expert') await importExpertJson(payload)
  else await importSkillJson(payload)
  ElMessage.success('导入成功（新建条目，如编码冲突请修改 JSON 中的 code 后重试）')
  await load()
}

// -------------------------------------------------------------- 技能：克隆 / 统计
async function clone(item: ConfigItem): Promise<void> {
  await cloneSkill(item.id)
  ElMessage.success('已克隆为停用副本，可编辑后上架')
  await load()
}

async function stats(item: ConfigItem): Promise<void> {
  const s = await skillStats(item.id)
  await ElMessageBox.alert(`近7天 ${s.calls7} 次；近30天 ${s.calls30} 次；成功率 ${(s.successRate * 100).toFixed(1)}%。来源：${s.source}`, '调用统计')
}

// -------------------------------------------------------------- MCP：连接测试 / 工具发现 / 健康检查
async function testConnection(item: ConfigItem): Promise<void> {
  const r = await testMcpConnection(item.id)
  await ElMessageBox.alert(`${r.healthDetail}（${r.lastHealthAt}）`, `连接测试：${r.healthStatus}`)
  await load()
}

async function action(item: ConfigItem, name: string): Promise<void> {
  await post(`/mcp/servers/${item.id}/${name}`)
  await load()
}

async function toolChange(tool: Tool): Promise<void> {
  await toggleTool(tool.id, !tool.enabled)
  await load()
}

const VISIBILITY_LABELS: Record<string, string> = { PUBLIC: '全员', PLAN: '指定套餐', PRIVATE: '私有' }
</script>
<template>
  <el-alert v-if="USE_MOCK" title="Mock 配置中心：刷新、工具发现、连接测试及前台预览均为本地模拟，未连接 AgentScope 或真实 MCP 服务。" type="info" :closable="false" style="margin-bottom:16px" />
  <el-card shadow="never">
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <el-input v-model="keyword" placeholder="搜索名称 / 编码" clearable style="width:250px" />
      <el-select v-model="status" placeholder="全部状态" clearable style="width:150px">
        <el-option label="启用 / 上架" :value="1" /><el-option label="停用 / 下架" :value="0" />
      </el-select>
      <el-button @click="load">刷新列表</el-button>
      <el-button v-if="canEdit" type="primary" @click="edit()">新建</el-button>
      <el-button v-if="canEdit && (module === 'expert' || module === 'skill')" @click="importJson()">导入预设 JSON</el-button>
    </div>
    <el-table v-loading="loading" :data="filtered">
      <el-table-column prop="name" label="名称" min-width="170">
        <template #default="{ row }">
          <template v-if="module === 'expert'">
            <div style="display:flex;align-items:center;gap:8px">
              <el-avatar :size="30" :src="row.avatarUrl || undefined">{{ (row.name || '?').slice(0, 1) }}</el-avatar>
              <div style="line-height:1.3">
                <div>{{ row.name }}</div>
                <small class="muted">{{ row.code }}</small>
              </div>
            </div>
          </template>
          <template v-else>{{ row.name }}</template>
        </template>
      </el-table-column>
      <el-table-column v-if="module !== 'expert'" prop="code" label="编码" min-width="150" show-overflow-tooltip />
      <el-table-column v-if="module === 'expert'" label="基础模型" width="130"><template #default="{ row }">{{ row.baseModel || '-' }}</template></el-table-column>
      <el-table-column v-if="module === 'expert'" label="标签" min-width="140">
        <template #default="{ row }"><el-tag v-for="t in row.tags || []" :key="t" size="small" style="margin-right:4px">{{ t }}</el-tag></template>
      </el-table-column>
      <el-table-column v-if="module === 'expert'" label="可见性" width="110">
        <template #default="{ row }">{{ VISIBILITY_LABELS[row.visibility?.type] || '-' }}<small v-if="row.visibility?.type === 'PLAN'">（{{ (row.visibility?.planIds || []).length }}套餐）</small></template>
      </el-table-column>
      <el-table-column v-if="module === 'expert'" label="绑定技能/MCP" width="115"><template #default="{ row }">{{ (row.skillIds || []).length }} / {{ (row.mcpServerIds || []).length }}</template></el-table-column>
      <el-table-column v-if="module === 'skill'" label="绑定助手数" width="100"><template #default="{ row }">{{ row.boundExpertCount ?? 0 }}</template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="类型" width="95"><template #default="{ row }"><el-tag size="small" :type="row.connType === 'MCP' ? 'success' : 'warning'">{{ row.connType || 'MCP' }}</el-tag></template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="传输方式" width="165"><template #default="{ row }"><el-tag v-if="row.connType === 'MCP'" size="small" type="info">{{ row.transport || '-' }}</el-tag><span v-else class="muted">schema 解析</span></template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="工具数" width="75"><template #default="{ row }">{{ tools.filter((t) => t.serverId === row.id).length }}</template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="地址 / 端点" min-width="200" show-overflow-tooltip><template #default="{ row }">{{ row.endpoint || row.command }}{{ row.path || '' }}</template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="健康" min-width="150"><template #default="{ row }">{{ row.healthStatus || 'UNKNOWN' }}<br /><small class="muted">{{ row.lastHealthAt }}</small></template></el-table-column>
      <el-table-column v-if="module === 'plan'" label="价格 / 天数" width="130"><template #default="{ row }">¥{{ row.price }} / {{ row.durationDays }}天<br /><small class="muted">已付订单 {{ row.salesCount }}</small></template></el-table-column>
      <el-table-column label="状态" width="95">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? (module === 'expert' || module === 'skill' ? '上架' : '启用') : '停用' }}</el-tag>
          <small v-if="row.isDefault"> 默认</small>
        </template>
      </el-table-column>
      <el-table-column v-if="module === 'expert'" label="更新时间" width="160"><template #default="{ row }"><small class="muted">{{ formatDateTime(row.updatedAt) }}</small></template></el-table-column>
      <el-table-column label="配置 / 生效版本" width="145">
        <template #default="{ row }">v{{ row.version }} / v{{ row.appliedVersion }}<br />
          <el-tag size="small" :type="row.refreshStatus === 'FAILED' ? 'danger' : row.refreshStatus === 'PENDING' ? 'warning' : 'success'">{{ row.refreshStatus }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="330" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="edit(row)">{{ canEdit ? '编辑' : '详情' }}</el-button>
          <el-button v-if="module === 'expert'" link type="success" @click="preview(row)">前台预览</el-button>
          <el-button v-if="module === 'expert' || module === 'skill'" link @click="history(row)">版本历史</el-button>
          <template v-if="canEdit">
            <el-button v-if="module === 'expert'" link :disabled="row.status === 1 && row.isDefault" @click="toggleStatus(row)">{{ row.status === 1 ? '下架' : '上架' }}</el-button>
            <el-button v-if="module === 'skill'" link :disabled="row.status !== 1" @click="toggleStatus(row)">{{ row.status === 1 ? '停用' : '启用' }}</el-button>
            <el-button link @click="refresh(row)">{{ row.refreshStatus === 'FAILED' ? '重试刷新' : '刷新生效' }}</el-button>
            <el-button v-if="USE_MOCK" link @click="refresh(row, true)">模拟失败</el-button>
          </template>
          <el-button v-if="module === 'expert' && canEdit && !row.isDefault" link @click="setDefault(row)">设为默认</el-button>
          <el-button v-if="module === 'skill' && canClone" link @click="clone(row)">克隆</el-button>
          <el-button v-if="(module === 'expert' || module === 'skill') && canExport" link @click="exportJson(row)">导出</el-button>
          <el-button v-if="module === 'mcp' && canEdit" link type="success" @click="testConnection(row)">连接测试</el-button>
          <template v-if="module === 'mcp' && canEdit">
            <el-button link @click="action(row, 'discover')">发现工具</el-button>
            <el-button link @click="action(row, 'health-check')">健康检查</el-button>
          </template>
          <el-button v-if="module === 'skill'" link @click="stats(row)">统计</el-button>
          <el-button v-if="canEdit" link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <template v-if="module === 'mcp'">
      <h3>工具清单（工具发现落库，受 tool_filter 过滤）</h3>
      <el-table v-loading="loading" :data="tools" size="small">
        <el-table-column label="所属服务" min-width="150"><template #default="{ row }">{{ items.find((s) => s.id === row.serverId)?.name || row.serverId }}</template></el-table-column>
        <el-table-column prop="name" label="工具" min-width="180" />
        <el-table-column label="启用" width="90"><template #default="{ row }"><el-switch :model-value="row.enabled" :disabled="!canEdit" @change="toolChange(row)" /></template></el-table-column>
      </el-table>
    </template>
  </el-card>

  <PlanFormDrawer v-model="planDrawer" :item="editItem" :can-edit="canEdit" @saved="onSaved" />
  <ExpertFormDrawer v-model="expertDrawer" :item="editItem" :skills="skills" :servers="servers" :plans="plans" :can-edit="canEdit" @saved="onSaved" />
  <SkillFormDrawer v-model="skillDrawer" :item="editItem" :can-edit="canEdit" @saved="onSaved" />
  <McpFormDrawer v-model="mcpDrawer" :item="editItem" :can-edit="canEdit" @saved="onSaved" />
  <VersionDrawer v-model="versionDrawer" :kind="historyKind" :item="historyItem" :can-edit="canEdit" @restored="load" />
  <WorkspacePreviewDrawer v-model="previewDrawer" :expert="previewItem" />
</template>
