<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { get, post, ApiError } from '@/api/request'
import {
  listConfig, saveConfig, deleteConfig, configAction, listTools, toggleTool,
  exportConfigJson, importExpertJson, testMcpConnection, saveModelStatus,
  testModelConnection, listModels, listScenarios, saveScenario, deleteScenario, PLATFORMS, PLATFORM_META, platformMeta, hostOf,
  FRONTEND_PERM_GROUPS, normalizeFrontendPerms,
  listCreditPackages, deleteCreditPackage, getBillingSettings,
  type ConfigItem, type ConfigKind, type CreditPackage, type BillingSettings, type Tool, type LlmModel, type PlatformType, type FrontendPerms, type Scenario
} from '@/api/config'
import { downloadJsonFile } from '@/utils/jsonio'
import { formatDateTime } from '@/utils/format'
import { createSeqGuard } from '@/utils/race'
import { USE_MOCK } from '@/utils/constants'
import PlanFormDrawer from './config/PlanFormDrawer.vue'
import CreditPackageDrawer from './config/CreditPackageDrawer.vue'
import BillingSettingsForm from './config/BillingSettingsForm.vue'
import ExpertOrchestrator from './config/ExpertOrchestrator.vue'
import McpFormDrawer from './config/McpFormDrawer.vue'
import ModelFormDrawer from './config/ModelFormDrawer.vue'
import VersionDrawer from './config/VersionDrawer.vue'
import WorkspacePreviewDrawer from './config/WorkspacePreviewDrawer.vue'
import VersionConfirmDialog from './config/VersionConfirmDialog.vue'
import { useTableMaxHeight } from '@/composables/useTableMax'

/** 表格限高内滚：横向滚动条固定在表格底部，分页吸底悬浮 */
const { max: tableMax, bind: bindTable } = useTableMaxHeight(96)

const route = useRoute()
const auth = useAuthStore()
const kind = computed(() => (route.path === '/mcp' ? 'mcp/servers' : route.path.slice(1)) as ConfigKind)
/** v17 原始路由 kind（无 ConfigKind 断言）：加油包 / 计费设置不在 ConfigKind 联合内，供 load 分流比较 */
const rawKind = computed(() => (route.path === '/mcp' ? 'mcp/servers' : route.path.slice(1)))
const module = computed(() => (kind.value === 'mcp/servers' ? 'mcp' : kind.value.slice(0, -1)))
/** 权限模块映射：加油包 / 计费设置无独立权限点，复用套餐 plan:edit / plan:view */
const permModule = computed(() => (module.value === 'credit-package' || module.value === 'billing-setting' ? 'plan' : module.value))
const canEdit = computed(() => auth.hasPerm(`${permModule.value}:edit`))

/** 套餐前台权限概览：关闭项数量与标签（缺失按全开处理） */
function permsRestrictedCount(perms: FrontendPerms | undefined): number {
  const p = normalizeFrontendPerms(perms)
  return Object.values(p).filter((v) => !v).length
}
function restrictedPermLabels(perms: FrontendPerms | undefined): string[] {
  const p = normalizeFrontendPerms(perms)
  return FRONTEND_PERM_GROUPS.flatMap((g) => g.items).filter((it) => !p[it.key]).map((it) => it.label)
}

const items = ref<ConfigItem[]>([])
const tools = ref<Tool[]>([])
const plans = ref<ConfigItem[]>([])
const models = ref<LlmModel[]>([])
/** v17 加油包 / 计费设置：独立数据源，不混入 configItems */
const creditPackages = ref<CreditPackage[]>([])
const billingSettings = ref<BillingSettings | null>(null)
const planTypeFilter = ref('')
const sliderDialog = ref(false)
const keyword = ref('')
const status = ref<number | ''>('')
/** v6：模型域名筛选（接入地址 host），不同渠道的模型区分开 */
const modelDomain = ref('')
const modelDomains = ref<string[]>([])
/** v5：平台筛选（专家/技能/MCP；下拉多选，空=全部；命中任一所选平台即显示） */
const platformFilter = ref<PlatformType[]>([])
const loading = ref(false)
/** v5：模型管理列表为服务端分页契约（GET /models {total, list}） */
const modelPage = ref(1)
const modelPageSize = ref(20)
const modelTotal = ref(0)

/** v17 加油包行数据：顶部筛选条对加油包做本地过滤（名称/备注 + 状态） */
const packageRows = computed(() => creditPackages.value.filter((p) => (!keyword.value || `${p.name} ${p.remark || ''}`.includes(keyword.value)) && (status.value === '' || p.status === status.value)))

const filtered = computed(() => {
  // 模型模块：keyword/status 由服务端筛选并分页，前端不再二次过滤
  if (module.value === 'model') return items.value
  return items.value.filter((i) => (module.value !== 'plan' || !planTypeFilter.value || (i.planType || 'NORMAL') === planTypeFilter.value) && (!keyword.value || `${i.name} ${i.code}`.includes(keyword.value)) && (status.value === '' || i.status === status.value) && (!platformFilter.value.length || (i.platforms || []).some((p) => platformFilter.value.includes(p))))
})

// -------------------------------------------------------------- v14 专家场景分组（同技能页 v7）：平台 → 场景 两级 Tab 导航，仅专家模块显示
const scenarios = ref<Scenario[]>([])
/** 一级 Tab：all=全部 / ungrouped=未分组 / 平台值；选中平台后出现二级场景 Tab */
const activeTab = ref<string>('all')
const activeScenario = ref<number | 'all' | 'unassigned'>('all')

const scenariosOf = (p: PlatformType): Scenario[] => scenarios.value.filter((s) => s.platformId === p)
const scenarioById = (id?: number | null): Scenario | undefined => scenarios.value.find((s) => s.id === id)

function switchTab(tab: string): void {
  activeTab.value = tab
  activeScenario.value = 'all'
}

/** 表格数据源：专家叠加两级 Tab 过滤、MCP 叠加一级平台 Tab 过滤，其余模块沿用筛选结果 */
const viewRows = computed(() => {
  if (module.value !== 'expert' && module.value !== 'mcp') return filtered.value
  if (activeTab.value === 'all') return filtered.value
  if (module.value === 'mcp') return filtered.value.filter((r) => (r.platforms || []).includes(activeTab.value as PlatformType))
  if (activeTab.value === 'ungrouped') return filtered.value.filter((r) => !r.scenarioId)
  const inPlat = filtered.value.filter((r) => (r.platforms || []).includes(activeTab.value as PlatformType))
  if (activeScenario.value === 'all') return inPlat
  if (activeScenario.value === 'unassigned') return inPlat.filter((r) => { const s = scenarioById(r.scenarioId); return !s || s.platformId !== activeTab.value })
  return inPlat.filter((r) => r.scenarioId === activeScenario.value)
})

/** 一级 Tab 计数徽标（统计全集，与技能页一致） */
const countOf = (tab: string): number => {
  if (tab === 'all') return items.value.length
  if (tab === 'ungrouped') return items.value.filter((r) => !r.scenarioId).length
  return items.value.filter((r) => (r.platforms || []).includes(tab as PlatformType)).length
}
/** 二级场景 Tab 计数（相对当前平台的专家全集） */
const subCountOf = (sid: number | 'all' | 'unassigned'): number => {
  const inPlat = items.value.filter((r) => (r.platforms || []).includes(activeTab.value as PlatformType))
  if (sid === 'all') return inPlat.length
  if (sid === 'unassigned') return inPlat.filter((r) => { const s = scenarioById(r.scenarioId); return !s || s.platformId !== activeTab.value }).length
  return inPlat.filter((r) => r.scenarioId === sid).length
}
const expertCountOf = (sid: number): number => items.value.filter((r) => r.scenarioId === sid).length

// 加入场景分组：左右面板选择（左平台 → 右场景）
const groupDialog = ref(false)
const groupTarget = ref<ConfigItem | null>(null)
const groupPick = ref<number | null>(null)
const groupPlatform = ref<PlatformType | ''>('')

function openGroupDialog(row: ConfigItem): void {
  groupTarget.value = row
  groupPick.value = row.scenarioId ?? null
  // 根据当前场景反选平台（未分组则留空，右侧提示先选平台）
  const cur = scenarioById(row.scenarioId)
  groupPlatform.value = cur ? cur.platformId : ''
  groupDialog.value = true
}
/** 切换左侧平台：原选中的场景不属于新平台时清空选择 */
function pickGroupPlatform(p: PlatformType | ''): void {
  groupPlatform.value = p
  if (groupPick.value !== null) {
    const s = scenarioById(groupPick.value)
    if (!p || s?.platformId !== p) groupPick.value = null
  }
}

async function applyGroup(): Promise<void> {
  const row = groupTarget.value
  if (!row) return
  const next = groupPick.value === null ? undefined : groupPick.value
  if ((row.scenarioId ?? undefined) === next) { groupDialog.value = false; return }
  try {
    await saveConfig(kind.value, { id: row.id, code: row.code, name: row.name, scenarioId: next ?? null })
  } catch (e) {
    if (e instanceof ApiError) { ElMessage.error(e.message); return }
    throw e
  }
  groupDialog.value = false
  ElMessage.success(next ? `已加入场景「${scenarioById(next)?.name || next}」` : '已移出场景（未分组）')
  await load()
}

// 场景管理：场景按平台创建 / 删除（与技能页共用场景库）
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
    await ElMessageBox.confirm(`删除场景「${s.name}」？其下专家将变为未分组。`, '确认删除')
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

/** 列表查询竞态守卫：kind 切换 / 连续搜索时丢弃乱序返回的旧响应，防止旧结果覆盖新结果 */
const listGuard = createSeqGuard()

async function load(): Promise<void> {
  const seq = listGuard.next()
  loading.value = true
  try {
    // v17：加油包 / 计费设置走独立接口与数据源，不混入 configItems
    if (rawKind.value === 'credit-packages') {
      const list = await listCreditPackages()
      if (!listGuard.isCurrent(seq)) return
      creditPackages.value = list
      return
    }
    if (rawKind.value === 'billing-settings') {
      const s = await getBillingSettings()
      if (!listGuard.isCurrent(seq)) return
      billingSettings.value = s
      return
    }
    if (kind.value === 'models') {
      const p = await listModels({ keyword: keyword.value, status: status.value, domain: modelDomain.value, page: modelPage.value, pageSize: modelPageSize.value })
      if (!listGuard.isCurrent(seq)) return // 乱序响应：已有更新的查询在途，丢弃本次结果
      // 删除/筛选后末页可能变空页：回退一页重查
      if (!p.list.length && modelPage.value > 1) { modelPage.value -= 1; void load(); return }
      items.value = p.list as unknown as ConfigItem[]
      modelTotal.value = p.total
      modelDomains.value = p.domains || []
    } else {
      const list = await listConfig(kind.value)
      if (!listGuard.isCurrent(seq)) return
      items.value = list
      if (kind.value === 'plans') {
        const [packages, settings] = await Promise.all([listCreditPackages(), getBillingSettings()])
        if (!listGuard.isCurrent(seq)) return
        creditPackages.value = packages
        billingSettings.value = settings
      }
    }
    if (!listGuard.isCurrent(seq)) return
    if (kind.value === 'mcp/servers') tools.value = await listTools()
    // 专家表单/列表的基础模型下拉数据源：取模型管理全量（pageSize 上限内）
    if (kind.value === 'experts') models.value = (await listModels({ page: 1, pageSize: 200 })).list
    // 专家场景分组：加载场景库；已删除场景的二级 Tab 回退到「全部场景」
    if (kind.value === 'experts') {
      scenarios.value = await listScenarios()
      if (typeof activeScenario.value === 'number' && !scenarioById(activeScenario.value)) activeScenario.value = 'all'
    }
  } finally {
    if (listGuard.isCurrent(seq)) loading.value = false
  }
}
watch(sliderDialog, async (open) => { if (open) billingSettings.value = await getBillingSettings() })
watch(kind, () => { planTypeFilter.value = ''; sliderDialog.value = false; keyword.value = ''; status.value = ''; platformFilter.value = []; modelPage.value = 1; modelDomain.value = ''; switchTab('all'); void load() }, { immediate: true })
let searchTimer: ReturnType<typeof setTimeout> | undefined
// 模型模块：status/domain 变更立即回第一页重查；keyword 输入防抖 300ms 后重查；其余模块走本地过滤无需重查
watch(status, () => { if (module.value === 'model') { modelPage.value = 1; void load() } })
watch(modelDomain, () => { if (module.value === 'model') { modelPage.value = 1; void load() } })
watch(keyword, () => {
  if (module.value !== 'model') return
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { modelPage.value = 1; void load() }, 300)
})
// 卸载时清理防抖定时器，避免组件销毁后仍触发 load
onUnmounted(() => { if (searchTimer) clearTimeout(searchTimer) })

/** 生效状态中文标签（未知枚举值兜底原样显示） */
const REFRESH_STATUS_LABELS: Record<string, string> = { APPLIED: '已生效', PENDING: '待刷新', FAILED: '刷新失败' }

/** 平台徽章元数据（历史未知值兜底显示） */
function platMeta(p: string): { label: string; color: string; bg: string; border: string } {
  return platformMeta(p)
}
/** v6：域名→彩色标签（按域名在 domains 清单中的序号取色：同域名恒同色，相邻域名必不同色，不同渠道一眼区分） */
const DOMAIN_TAG_TYPES = ['primary', 'success', 'warning', 'danger', 'info'] as const
function domainTagType(host: string): (typeof DOMAIN_TAG_TYPES)[number] {
  const idx = modelDomains.value.indexOf(host)
  return DOMAIN_TAG_TYPES[(idx >= 0 ? idx : 0) % DOMAIN_TAG_TYPES.length]
}
/** 专家基础模型显示名（模型表解析；未注册则原样显示 code） */
function modelNameOf(code: string | undefined): string {
  if (!code) return '-'
  const m = models.value.find((x) => x.code === code)
  return m ? `${m.name}（${m.code}）` : code
}

// -------------------------------------------------------------- 表单抽屉
const planDrawer = ref(false), expertDrawer = ref(false), mcpDrawer = ref(false), modelDrawer = ref(false)
const versionDrawer = ref(false), previewDrawer = ref(false)
const editItem = ref<Partial<ConfigItem> | null>(null)
const historyItem = ref<ConfigItem | null>(null)
const previewItem = ref<ConfigItem | null>(null)
/** 版本历史 kind：专家/套餐/MCP（v5 补齐 MCP 快照历史；v17 套餐快照打通） */
const historyKind = computed(() => (module.value === 'mcp' ? 'mcp/servers' : module.value === 'plan' ? 'plans' : 'experts') as 'experts' | 'skills' | 'mcp/servers' | 'plans')

function blankDraft(): Partial<ConfigItem> {
  if (module.value === 'expert') {
    return { code: '', name: '', description: '', avatarUrl: '', baseModel: 'glm-5.3', platforms: ['1688'], systemPrompt: '', skillIds: [], mcpServerIds: [], suggestedQuestions: [], tags: [], status: 1, isDefault: false, visibility: { type: 'PUBLIC', planIds: [] } }
  }
  if (module.value === 'mcp') return { code: '', name: '', connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: '', path: '', authConfig: { type: 'NONE' }, toolFilter: [], platforms: ['1688'], status: 1, visibility: { type: 'PUBLIC', planIds: [] } }
  if (module.value === 'model') return { code: '', name: '', provider: '智谱', endpoint: '', remark: '', status: 1 }
  return { code: '', name: '', status: 1, price: 0, durationDays: 30, entitlements: [], planType: 'NORMAL' }
}

async function edit(item?: ConfigItem): Promise<void> {
  const detail = item ? await get<ConfigItem>(`/${kind.value}/${item.id}`) : blankDraft()
  editItem.value = JSON.parse(JSON.stringify(detail))
  if (module.value === 'expert') {
    // v6：编排页自加载 skills/servers/plans/models，此处只传详情
    expertDrawer.value = true
  } else if (module.value === 'mcp') mcpDrawer.value = true
  else if (module.value === 'model') modelDrawer.value = true
  else planDrawer.value = true
}

async function onSaved(): Promise<void> {
  await load()
  if (module.value === 'plan') plans.value = await listConfig('plans')
}

// -------------------------------------------------------------- v17 积分加油包：新建 / 编辑 / 删除
const creditDrawer = ref(false)
const editPackage = ref<Partial<CreditPackage> | null>(null)

function switchToPlan(type: 'NORMAL' | 'GIFT'): void {
  creditDrawer.value = false
  editItem.value = { ...blankDraft(), planType: type }
  planDrawer.value = true
}

function editCredit(item?: CreditPackage): void {
  editPackage.value = item ? JSON.parse(JSON.stringify(item)) : { name: '', credits: 500, bonusCredits: 0, price: 0, sort: 0, status: 1 }
  creditDrawer.value = true
}

async function removeCredit(item: CreditPackage): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除加油包「${item.name}」？删除后前台不可再购买。`, '确认删除')
  } catch {
    return
  }
  try {
    await deleteCreditPackage(item.id)
  } catch (e) {
    if (e instanceof ApiError) { ElMessage.error(e.message); return }
    throw e
  }
  ElMessage.success('已删除')
  await load()
}

// -------------------------------------------------------------- 删除（409 引用拦截确认）
/** 删除：首删被引用 409 → 弹引用确认 → 携带 confirmReferences 重试（对齐 Skills/Knowledge 行为） */
async function remove(item: ConfigItem): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除「${item.name}」？被引用资源将被拦截。`, '确认删除')
  } catch {
    return
  }
  try {
    await deleteConfig(kind.value, item.id)
  } catch (e) {
    if (e instanceof ApiError && e.code === 409) {
      try {
        await ElMessageBox.confirm(`${e.message}。确认继续删除？`, '引用确认')
        await deleteConfig(kind.value, item.id, { confirmReferences: true })
      } catch { return }
    } else {
      // 其余错误（如默认专家删除 422）由全局错误提示透出
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
  if (module.value === 'expert' || module.value === 'mcp') {
    // 默认专家必须保持启用（mock 端 422 同规则），前置拦截给出可操作提示
    if (module.value === 'expert' && item.status === 1 && item.isDefault) {
      ElMessage.warning('默认专家必须保持启用，请先将其他专家设为默认')
      return
    }
    // 全量字段 + skipVersion：启停不属于配置内容变更，不产生版本记录
    await saveConfig(kind.value, { ...item, status: next, skipVersion: true })
    ElMessage.success(next === 1 ? '已启用' : '已停用')
    await load()
    return
  }
  await saveConfig(kind.value, { id: item.id, code: item.code, name: item.name, status: next })
  await load()
}

/** 模型启停：走独立状态端点 */
async function toggleModel(item: ConfigItem): Promise<void> {
  await saveModelStatus(item.id, item.status === 1 ? 0 : 1)
  await load()
}

/** 模型连通测试（Mock 演示模拟，明示未发起真实请求） */
async function testModel(item: ConfigItem): Promise<void> {
  const r = await testModelConnection(item.id)
  await ElMessageBox.alert(`${r.detail}（模拟延迟 ${r.latencyMs}ms · ${r.testedAt}）`, `连通测试：${r.result}`)
}

async function setDefault(item: ConfigItem): Promise<void> {
  await post(`/experts/${item.id}/default`)
  await load()
}

/** 操作列「更多」下拉统一分发（收纳低频操作，避免行内按钮过多换行溢出） */
function onRowCommand(cmd: string, row: ConfigItem): void {
  if (cmd === 'history') void history(row)
  else if (cmd === 'toggle') void toggleStatus(row)
  else if (cmd === 'toggleModel') void toggleModel(row)
  else if (cmd === 'refresh') void refresh(row)
  else if (cmd === 'refreshFail') void refresh(row, true)
  else if (cmd === 'setDefault') void setDefault(row)
  else if (cmd === 'export') void exportJson(row)
  else if (cmd === 'discover') void action(row, 'discover')
  else if (cmd === 'health') void action(row, 'health-check')
  else if (cmd === 'group') openGroupDialog(row)
  else if (cmd === 'remove') void remove(row)
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
  const { filename, content } = await exportConfigJson('experts', item.id)
  downloadJsonFile(filename, content)
  ElMessage.success(`已导出 ${filename}`)
}

/** 导入预设：粘贴导出的 JSON 内容（code 冲突返回 409） */
async function importJson(): Promise<void> {
  let value: string
  try {
    ({ value } = await ElMessageBox.prompt(
      '粘贴专家预设 JSON（内容为「导出预设JSON」生成的文件）',
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
  await importExpertJson(payload)
  ElMessage.success('导入成功（新建条目，如编码冲突请修改 JSON 中的 code 后重试）')
  await load()
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

const toolVersionDialog = ref(false)
const toolChangeTarget = ref<Tool | null>(null)
const toolChanging = ref(false)
function askToolChange(tool: Tool): void {
  toolChangeTarget.value = tool
  toolVersionDialog.value = true
}
async function toolChange(v: { versionName: string; note: string }): Promise<void> {
  if (!toolChangeTarget.value || toolChanging.value) return
  toolChanging.value = true
  try {
    await toggleTool(toolChangeTarget.value.id, !toolChangeTarget.value.enabled, v)
    toolVersionDialog.value = false
    await load()
  } finally {
    toolChanging.value = false
  }
}

const VISIBILITY_LABELS: Record<string, string> = { PUBLIC: '全员', PLAN: '指定套餐', PRIVATE: '私有' }
</script>
<template>
  <el-alert v-if="USE_MOCK" title="Mock 配置中心：刷新、工具发现、连接测试及前台预览均为本地模拟，未连接 AgentScope 或真实 MCP 服务。" type="info" :closable="false" style="margin-bottom:16px" />
  <el-card shadow="never">
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
      <el-input v-if="module !== 'billing-setting'" v-model="keyword" placeholder="搜索名称 / 编码" clearable style="width:250px" />
      <el-select v-if="module !== 'billing-setting'" v-model="status" placeholder="全部状态" clearable style="width:150px">
        <el-option label="启用 / 上架" :value="1" /><el-option label="停用 / 下架" :value="0" />
      </el-select>
      <el-select
        v-if="module === 'model' && modelDomains.length"
        v-model="modelDomain"
        placeholder="全部域名"
        clearable
        filterable
        style="width:220px"
      >
        <el-option v-for="d in modelDomains" :key="d" :value="d" :label="d">
          <el-tag size="small" effect="plain" :type="domainTagType(d)" style="margin-right:8px">{{ d }}</el-tag>
        </el-option>
      </el-select>
      <el-select
        v-if="module === 'expert' || module === 'mcp'"
        v-model="platformFilter"
        multiple
        collapse-tags
        clearable
        placeholder="平台筛选（可多选）"
        style="width:200px"
      >
        <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="PLATFORM_META[p].label" />
      </el-select>
      <el-select v-if="module === 'plan'" v-model="planTypeFilter" placeholder="全部套餐类型" clearable style="width:170px">
        <el-option label="常规套餐" value="NORMAL" /><el-option label="积分包套餐" value="CREDIT_PACKAGE" /><el-option label="赠送套餐" value="GIFT" />
      </el-select>
      <el-button v-if="module === 'plan' || module === 'credit-package'" @click="sliderDialog = true">自定义积分包 / 滑块设置</el-button>
      <el-button @click="load">刷新列表</el-button>
      <!-- v17：计费设置无新建语义，隐藏；加油包新建按钮文案特判 -->
      <el-button v-if="canEdit && module !== 'billing-setting'" type="primary" @click="module === 'credit-package' ? editCredit() : edit()">{{ module === 'model' ? '新建 / 接入渠道' : module === 'credit-package' ? '新建加油包' : '新建' }}</el-button>
      <el-button v-if="canEdit && module === 'expert'" @click="importJson()">导入预设 JSON</el-button>
    </div>
    <!-- v14 专家场景分组：一级 Tab（全部 / 未分组 / 各平台）+ 选中平台后的二级场景 Tab；v15 MCP 复用一级平台 Tab（无场景层级） -->
    <div v-if="module === 'expert' || module === 'mcp'" class="group-tabs">
      <div class="tab-row">
        <button class="tab-pill" :class="{ active: activeTab === 'all' }" @click="switchTab('all')">全部<span class="tab-count">{{ countOf('all') }}</span></button>
        <button v-if="module === 'expert'" class="tab-pill" :class="{ active: activeTab === 'ungrouped' }" @click="switchTab('ungrouped')">未分组<span class="tab-count">{{ countOf('ungrouped') }}</span></button>
        <button v-for="p in PLATFORMS" :key="p" class="tab-pill" :class="{ active: activeTab === p }" @click="switchTab(p)">
          <span class="tab-dot" :style="{ background: platMeta(p).color }" />{{ platMeta(p).label }}<span class="tab-count">{{ countOf(p) }}</span>
        </button>
        <el-button v-if="canEdit && module === 'expert'" class="tab-manage" link type="primary" size="small" @click="sceneDlg = true">场景管理</el-button>
      </div>
      <div v-if="module === 'expert' && activeTab !== 'all' && activeTab !== 'ungrouped'" class="tab-row sub">
        <button class="tab-pill small" :class="{ active: activeScenario === 'all' }" @click="activeScenario = 'all'">全部场景<span class="tab-count">{{ subCountOf('all') }}</span></button>
        <button class="tab-pill small" :class="{ active: activeScenario === 'unassigned' }" @click="activeScenario = 'unassigned'">未分配场景<span class="tab-count">{{ subCountOf('unassigned') }}</span></button>
        <button v-for="s in scenariosOf(activeTab as PlatformType)" :key="s.id" class="tab-pill small" :class="{ active: activeScenario === s.id }" @click="activeScenario = s.id">{{ s.name }}<span class="tab-count">{{ subCountOf(s.id) }}</span></button>
      </div>
    </div>
    <!-- v17：加油包 / 计费设置模块使用下方独立表格 / 表单，主配置表格不渲染 -->
    <el-table v-if="module !== 'credit-package' && module !== 'billing-setting' && !(module === 'plan' && planTypeFilter === 'CREDIT_PACKAGE')" v-loading="loading" :data="viewRows" :max-height="tableMax" scrollbar-always-on :ref="bindTable">
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
          <template v-else-if="module === 'model'">
            <div style="line-height:1.3">
              <div>{{ row.name }}</div>
              <small class="muted">{{ row.code }}</small>
            </div>
          </template>
          <template v-else>{{ row.name }}</template>
        </template>
      </el-table-column>
      <el-table-column v-if="!['expert', 'model'].includes(module)" prop="code" label="编码" min-width="150" show-overflow-tooltip />
      <el-table-column v-if="module !== 'plan' && module !== 'model'" label="平台" min-width="140">
        <template #default="{ row }">
          <el-tag
            v-for="p in row.platforms || []"
            :key="p"
            size="small"
            effect="plain"
            :style="{ color: platMeta(p).color, background: platMeta(p).bg, borderColor: platMeta(p).border, marginRight: '4px' }"
          >{{ platMeta(p).label }}</el-tag>
          <span v-if="!(row.platforms || []).length" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column v-if="module === 'expert'" label="基础模型" min-width="150" show-overflow-tooltip><template #default="{ row }">{{ modelNameOf(row.baseModel) }}</template></el-table-column>
      <el-table-column v-if="module === 'model'" prop="code" label="编码" min-width="130" show-overflow-tooltip><template #default="{ row }"><code>{{ row.code }}</code></template></el-table-column>
      <el-table-column v-if="module === 'model'" label="供应商" width="120"><template #default="{ row }">{{ row.provider || '-' }}</template></el-table-column>
      <el-table-column v-if="module === 'model'" label="API Key" width="110"><template #default="{ row }">{{ row.apiKeyMasked || '—' }}</template></el-table-column>
      <el-table-column v-if="module === 'model'" label="渠道域名 / 接入地址" min-width="215">
        <template #default="{ row }">
          <template v-if="row.endpoint">
            <el-tag size="small" effect="plain" :type="domainTagType(hostOf(row.endpoint))">{{ hostOf(row.endpoint) }}</el-tag>
            <br /><small class="muted" style="word-break:break-all">{{ row.endpoint }}</small>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column v-if="module === 'expert'" label="场景 / 标签" min-width="160">
        <template #default="{ row }">
          <el-tag v-if="scenarioById(row.scenarioId)" size="small" type="info" effect="plain" style="margin-right:4px">{{ scenarioById(row.scenarioId)?.name }}</el-tag>
          <el-tag v-for="t in row.tags || []" :key="t" size="small" style="margin-right:4px">{{ t }}</el-tag>
          <span v-if="!scenarioById(row.scenarioId) && !(row.tags || []).length" class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column v-if="['expert', 'mcp', 'skill'].includes(module)" label="可见性" width="110">
        <template #default="{ row }">{{ VISIBILITY_LABELS[row.visibility?.type] || '-' }}<small v-if="row.visibility?.type === 'PLAN'">（{{ (row.visibility?.planIds || []).length }}套餐）</small></template>
      </el-table-column>
      <el-table-column v-if="module === 'expert'" label="绑定技能 / MCP" width="115"><template #default="{ row }">{{ (row.skillIds || []).length }} / {{ (row.mcpServerIds || []).length }}</template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="类型" width="95"><template #default="{ row }"><el-tag size="small" :type="row.connType === 'MCP' ? 'success' : 'warning'">{{ row.connType || 'MCP' }}</el-tag></template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="传输方式" width="165"><template #default="{ row }"><el-tag v-if="row.connType === 'MCP'" size="small" type="info">{{ row.transport || '-' }}</el-tag><span v-else class="muted">schema 解析</span></template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="工具数" width="75"><template #default="{ row }">{{ tools.filter((t) => t.serverId === row.id).length }}</template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="地址 / 端点" min-width="200" show-overflow-tooltip><template #default="{ row }">{{ row.endpoint || row.command }}{{ row.path || '' }}</template></el-table-column>
      <el-table-column v-if="module === 'mcp'" label="健康" min-width="150"><template #default="{ row }">{{ row.healthStatus || 'UNKNOWN' }}<br /><small class="muted">{{ row.lastHealthAt }}</small></template></el-table-column>
      <el-table-column v-if="module === 'plan'" label="类型" width="80"><template #default="{ row }"><el-tag size="small" :type="row.planType === 'GIFT' ? 'success' : 'info'">{{ row.planType === 'GIFT' ? '赠送' : '常规' }}</el-tag></template></el-table-column>
      <el-table-column v-if="module === 'plan'" label="价格" width="90"><template #default="{ row }"><span v-if="row.planType !== 'GIFT'">¥{{ row.price }}</span><span v-else class="muted">—</span></template></el-table-column>
      <el-table-column v-if="module === 'plan'" label="时长" min-width="135"><template #default="{ row }">{{ row.durationMode === 'MEMBERSHIP' ? '会员期内有效' : row.durationDays === 0 ? '长期有效' : row.durationDays + '天' }}</template></el-table-column>
      <el-table-column v-if="module === 'plan'" label="积分" width="100"><template #default="{ row }"><span v-if="row.planType !== 'GIFT'">{{ row.credits ?? 0 }}</span><br /><small class="muted">已付订单 {{ row.salesCount }}</small></template></el-table-column>
      <!-- v17 套餐营销/计费模型：排序值 + 营销摘要（角标/标语，tooltip 展示卖点列表） -->
      <el-table-column v-if="module === 'plan'" label="排序" width="70"><template #default="{ row }">{{ row.sort ?? 0 }}</template></el-table-column>
      <el-table-column v-if="module === 'plan'" label="营销" min-width="150">
        <template #default="{ row }">
          <el-tooltip v-if="row.badge || row.tagline || (row.features || []).length" placement="top">
            <template #content>
              <div style="max-width:280px">
                <div v-if="row.tagline">{{ row.tagline }}</div>
                <div v-for="f in row.features || []" :key="f">· {{ f }}</div>
                <div v-if="!(row.features || []).length && !row.tagline">仅角标：{{ row.badge }}</div>
              </div>
            </template>
            <span class="mk-summary"><el-tag v-if="row.badge" size="small" type="warning" effect="plain" style="margin-right:4px">{{ row.badge }}</el-tag>{{ row.tagline || `${(row.features || []).length} 条卖点` }}</span>
          </el-tooltip>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column v-if="module === 'plan'" label="前台权限" width="150">
        <template #default="{ row }">
          <template v-if="permsRestrictedCount(row.frontendPerms) === 0"><small class="muted">全部开放</small></template>
          <template v-else>
            <el-tag v-for="t in restrictedPermLabels(row.frontendPerms)" :key="t" size="small" type="danger" effect="plain" style="margin:0 4px 4px 0">{{ t }}已关</el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="105">
        <template #default="{ row }">
          <!-- 专家/MCP：行内直接启停（默认专家保持启用，停用会前置拦截提示） -->
          <el-switch
            v-if="canEdit && (module === 'expert' || module === 'mcp')"
            :model-value="row.status === 1"
            inline-prompt
            active-text="启"
            inactive-text="停"
            @change="() => toggleStatus(row)"
          />
          <el-tag v-else :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? (module === 'expert' ? '上架' : '启用') : '停用' }}</el-tag>
          <small v-if="row.isDefault"> 默认</small>
        </template>
      </el-table-column>
      <el-table-column v-if="module === 'expert' || module === 'model'" label="更新时间" width="160"><template #default="{ row }"><small class="muted">{{ formatDateTime(row.updatedAt) }}</small></template></el-table-column>
      <el-table-column v-if="module !== 'model'" label="配置 / 生效版本" width="145">
        <template #default="{ row }">v{{ row.version }} / v{{ row.appliedVersion }}<br />
          <el-tag size="small" :type="row.refreshStatus === 'FAILED' ? 'danger' : row.refreshStatus === 'PENDING' ? 'warning' : 'success'">{{ REFRESH_STATUS_LABELS[row.refreshStatus] || row.refreshStatus }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="185" fixed="right">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button link type="primary" @click="edit(row)">{{ canEdit ? '编辑' : '详情' }}</el-button>
            <el-button v-if="module === 'expert'" link type="success" @click="preview(row)">前台预览</el-button>
            <el-button v-if="module === 'mcp' && canEdit" link type="success" @click="testConnection(row)">连接测试</el-button>
            <el-button v-if="module === 'model' && canEdit" link type="success" @click="testModel(row)">连通测试</el-button>
            <el-dropdown v-if="module === 'expert' || module === 'mcp' || canEdit" @command="(cmd: string | number | object) => onRowCommand(String(cmd), row)">
              <el-button link type="primary">更多 ▾</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-if="module === 'expert' || module === 'mcp' || module === 'plan'" command="history">版本历史</el-dropdown-item>
                  <el-dropdown-item v-if="module === 'expert' && auth.hasPerm('expert:export')" command="export">导出 JSON</el-dropdown-item>
                  <template v-if="canEdit">
                    <el-dropdown-item v-if="module === 'expert'" command="group">加入场景分组</el-dropdown-item>
                    <el-dropdown-item v-if="module === 'expert'" command="toggle" :disabled="row.status === 1 && row.isDefault">{{ row.status === 1 ? '下架' : '上架' }}</el-dropdown-item>
                    <el-dropdown-item v-if="module === 'model'" command="toggleModel">{{ row.status === 1 ? '停用' : '启用' }}</el-dropdown-item>
                    <el-dropdown-item v-if="module !== 'model'" command="refresh">{{ row.refreshStatus === 'FAILED' ? '重试刷新' : '刷新生效' }}</el-dropdown-item>
                    <el-dropdown-item v-if="module !== 'model' && USE_MOCK" command="refreshFail">模拟失败</el-dropdown-item>
                    <el-dropdown-item v-if="module === 'expert' && !row.isDefault" command="setDefault">设为默认</el-dropdown-item>
                    <el-dropdown-item v-if="module === 'mcp'" command="discover">发现工具</el-dropdown-item>
                    <el-dropdown-item v-if="module === 'mcp'" command="health">健康检查</el-dropdown-item>
                    <el-dropdown-item command="remove" divided>删除</el-dropdown-item>
                  </template>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <!-- v17 积分加油包：独立表格（名称/积分/赠送/价格/角标/排序/状态/操作） -->
    <el-alert v-if="module === 'plan' && (!planTypeFilter || planTypeFilter === 'CREDIT_PACKAGE')" title="积分包套餐（与积分加油包同源）：仅购买积分，不增加会员等级或权限；有效期及前台购买链路待对接。" type="info" :closable="false" style="margin:16px 0" />
    <el-table v-if="module === 'credit-package' || (module === 'plan' && (!planTypeFilter || planTypeFilter === 'CREDIT_PACKAGE'))" v-loading="loading" :data="packageRows" :max-height="tableMax" scrollbar-always-on :ref="bindTable">
      <el-table-column prop="name" label="名称" min-width="150" />
      <el-table-column label="类型" width="130"><template #default><el-tag size="small">积分包套餐</el-tag></template></el-table-column>
      <el-table-column label="积分" width="100"><template #default="{ row }">{{ row.credits }}</template></el-table-column>
      <el-table-column label="赠送积分" width="100"><template #default="{ row }"><span v-if="row.bonusCredits" style="color:#67c23a">+{{ row.bonusCredits }}</span><span v-else class="muted">—</span></template></el-table-column>
      <el-table-column label="价格" width="130">
        <template #default="{ row }">
          <span>¥{{ row.price }}</span>
          <small v-if="row.originalPrice" class="muted" style="margin-left:6px;text-decoration:line-through">¥{{ row.originalPrice }}</small>
        </template>
      </el-table-column>
      <el-table-column label="角标" width="110"><template #default="{ row }"><el-tag v-if="row.badge" size="small" type="warning" effect="plain">{{ row.badge }}</el-tag><span v-else class="muted">—</span></template></el-table-column>
      <el-table-column label="排序" width="70"><template #default="{ row }">{{ row.sort ?? 0 }}</template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <div class="row-actions">
            <el-button v-if="canEdit" link type="primary" @click="editCredit(row)">编辑</el-button>
            <el-button v-if="canEdit" link type="danger" @click="removeCredit(row)">删除</el-button>
          </div>
        </template>
      </el-table-column>
    </el-table>
    <!-- v17 计费设置：无表格，仅全局表单 -->
    <template v-if="module === 'billing-setting'">
      <BillingSettingsForm :settings="billingSettings" :can-edit="canEdit" @saved="load" />
    </template>
    <div v-if="module === 'model'" style="display:flex;justify-content:flex-end;margin-top:14px;position:sticky;bottom:0;z-index:20;background:#fff">
      <el-pagination
        v-model:current-page="modelPage"
        v-model:page-size="modelPageSize"
        :total="modelTotal"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @current-change="load"
        @size-change="modelPage = 1; load()"
      />
    </div>
    <template v-if="module === 'mcp'">
      <h3>工具清单（工具发现落库，受 tool_filter 过滤）</h3>
      <el-table v-loading="loading" :data="tools" size="small">
        <el-table-column label="所属服务" min-width="150"><template #default="{ row }">{{ items.find((s) => s.id === row.serverId)?.name || row.serverId }}</template></el-table-column>
        <el-table-column prop="name" label="工具" min-width="180" />
        <el-table-column label="启用" width="90"><template #default="{ row }"><el-switch :model-value="row.enabled" :disabled="!canEdit" @change="askToolChange(row)" /></template></el-table-column>
      </el-table>
    </template>
  </el-card>

  <el-dialog v-model="sliderDialog" title="自定义积分包 / 滑块设置" width="760px" destroy-on-close>
    <BillingSettingsForm v-if="billingSettings" :settings="billingSettings" :can-edit="canEdit" slider-only @saved="load" />
  </el-dialog>
  <PlanFormDrawer v-model="planDrawer" :item="editItem" :can-edit="canEdit" @saved="onSaved" @credit-package="planDrawer = false; editCredit()" />
  <!-- v17 积分加油包表单抽屉 -->
  <CreditPackageDrawer v-model="creditDrawer" :item="editPackage" :can-edit="canEdit" @saved="load" @plan-type="switchToPlan" @slider-settings="sliderDialog = true" />
  <ExpertOrchestrator v-model="expertDrawer" :item="editItem" :can-edit="canEdit" @saved="onSaved" />
  <McpFormDrawer v-model="mcpDrawer" :item="editItem" :can-edit="canEdit" @saved="onSaved" />
  <ModelFormDrawer v-model="modelDrawer" :item="editItem" :can-edit="canEdit" :existing-codes="items.map(i => i.code)" @saved="onSaved" />
  <VersionDrawer v-model="versionDrawer" :kind="historyKind" :item="historyItem" :can-edit="canEdit" @restored="load" />
  <WorkspacePreviewDrawer v-model="previewDrawer" :expert="previewItem" />
  <!-- v5：MCP 工具启停同样走版本确认框（默认时间戳版本名可改 + 变更说明，确认后才写库并生成快照） -->
  <VersionConfirmDialog
    v-model="toolVersionDialog"
    title="工具启停确认"
    :description="`确认将${toolChangeTarget?.enabled ? '停用' : '启用'}工具「${toolChangeTarget?.name || ''}」，所属服务版本 +1 并生成快照。`"
    confirm-text="确认并变更"
    async
    :loading="toolChanging"
    @confirm="toolChange"
  />

  <!-- v14 加入场景分组：左平台 → 右场景 左右面板选择（与技能页共用场景库） -->
  <el-dialog v-model="groupDialog" title="加入场景分组" width="560px">
    <div v-if="groupTarget" class="group-target">「{{ groupTarget.name }}」当前分组：{{ scenarioById(groupTarget.scenarioId)?.name || '未分组' }}</div>
    <div class="group-panels">
      <div class="group-panel group-panel-left">
        <div class="group-panel-title">平台</div>
        <div class="group-panel-list">
          <div class="group-item" :class="{ active: groupPlatform === '' }" @click="pickGroupPlatform('')">未分组</div>
          <div v-for="p in PLATFORMS" :key="p" class="group-item" :class="{ active: groupPlatform === p }" @click="pickGroupPlatform(p)">
            <span class="group-dot" :style="{ background: platMeta(p).color }" />
            {{ platMeta(p).label }}
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

  <!-- v14 场景管理：场景按平台创建 / 删除，删除后其下专家变为未分组 -->
  <el-dialog v-model="sceneDlg" title="场景管理" width="640px" @open="loadScenarios">
    <div class="scene-add">
      <el-select v-model="sceneTab" style="width:130px">
        <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="platMeta(p).label" />
      </el-select>
      <el-input v-model="sceneName" placeholder="场景名称" style="width:170px" />
      <el-input v-model="sceneDesc" placeholder="场景描述（可选）" style="flex:1" />
      <el-button type="primary" @click="addScenario">添加场景</el-button>
    </div>
    <div class="scene-list">
      <div v-for="s in scenariosOf(sceneTab)" :key="s.id" class="scene-row">
        <span class="scene-name">{{ s.name }}</span>
        <span class="scene-desc">{{ s.description || '—' }}</span>
        <span class="scene-count">{{ expertCountOf(s.id) }} 个专家</span>
        <el-button v-if="canEdit" link type="danger" size="small" @click="removeScenario(s)">删除</el-button>
      </div>
      <el-empty v-if="!scenariosOf(sceneTab).length" description="该平台暂无场景" :image-size="60" />
    </div>
  </el-dialog>
</template>
<style scoped>
.row-actions { display: flex; align-items: center; white-space: nowrap; }
/* v17 套餐营销摘要：超出省略（详情见 tooltip） */
.mk-summary { display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom; }
/* v14 分组导航：一级平台 Tab + 二级场景 Tab（胶囊样式，同技能页） */
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
.tab-manage { margin-left: auto; }
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
</style>
