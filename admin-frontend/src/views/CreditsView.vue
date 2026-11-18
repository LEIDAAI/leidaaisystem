<script setup lang="ts">
/**
 * 消耗明细（v40）：把「前台用户只看到扣多少积分」在后台还原成可对账的成本账。
 * - 顶部消耗汇总卡：总扣分/总成本/按项目类型（LLM 模型、第三方 MCP 工具、技能执行）分布
 * - 筛选：时间范围、消耗项目、状态、消耗类型、手机号
 * - 明细表：成员 / 消耗项目 / 消耗内容 / 时间 / 状态 / 算力变更 + 行内「消耗详情」
 * - 右侧详情抽屉：执行过程 / 消耗类型 / 消耗算力 三列，逐笔核对模型 token 用量与第三方接口调用成本
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listCreditRecords, creditRecordSummary, creditRecordOptions,
  type CreditRecord, type CreditSummary, type CreditItemType, type CreditRecordOptions, type CreditRecordOption
} from '@/api/config'
import { beijingTime } from '@/utils/chat-time'
import { useTableMaxHeight } from '@/composables/useTableMax'

const { max: tableMax, bind: bindTable } = useTableMaxHeight(96)
/**
 * v47：详情抽屉明细表限高——超出后表格内部滚动、表头固定可见。
 * 不用 useTableMaxHeight：抽屉是 fixed 定位 + 有进入动画，用视口高度推算会算错，
 * 改为按「抽屉可视高度 − 表格在抽屉内的偏移 − 下方合计/说明/页脚预留」实测。
 */
const detailMax = ref<number | undefined>(undefined)
let detailTableEl: HTMLElement | null = null
const bindDetailTable = (el: unknown): void => {
  const inst = el as { $el?: unknown } | HTMLElement | null
  detailTableEl = !inst ? null : inst instanceof HTMLElement ? inst : inst.$el instanceof HTMLElement ? inst.$el : null
  // 表格在 v-if 内，挂载时抽屉可能还在动画中，等一帧不够，稍等再量
  setTimeout(measureDetail, 320)
}
function measureDetail(): void {
  const table = detailTableEl
  if (!table || !table.isConnected) { detailMax.value = undefined; return }
  const body = table.closest('.el-drawer__body') as HTMLElement | null
  if (!body) return
  const bodyRect = body.getBoundingClientRect()
  const tableRect = table.getBoundingClientRect()
  // 表格上方已占用（详情标题区 + 小标题）
  const above = tableRect.top - bodyRect.top - (parseFloat(getComputedStyle(body).paddingTop) || 0)
  // 表格下方要保留：合计行 36 + 间距 24 + 说明 108 + 表格下边距 12 + 抽屉内边距 24 + 余量 14 ≈ 216
  const below = 216
  const avail = body.clientHeight - above - below
  detailMax.value = avail > 200 ? Math.round(avail) : 200
}

const rows = ref<CreditRecord[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref(false)
const summary = ref<CreditSummary | null>(null)
/** v44：专家 / 技能 / MCP 服务筛选候选 */
const options = ref<CreditRecordOptions>({ experts: [], skills: [], mcpServers: [], platforms: [], scenarios: [], agents: [] })

const query = reactive({
  phone: '',
  /** v44：消耗内容关键词 */
  content: '',
  type: '',
  /** v44：专家 / 技能 / MCP 服务多选（数组内为「或」关系） */
  expertIds: [] as number[],
  skillIds: [] as number[],
  mcpServerIds: [] as number[],
  /** v48：平台（枚举串）/ 场景 / 智能体（多选 id） */
  platforms: [] as string[],
  scenarioIds: [] as number[],
  agentIds: [] as number[],
  start: '',
  end: '',
  page: 1,
  pageSize: 20
})

/**
 * v48：专家/技能下拉内部的二级收窄（平台 / 场景 / 智能体）。
 * 这是「在下拉里挑人」的辅助维度，不参与后端查询——只影响候选列表显示哪些项，
 * 真正的筛选条件仍是 query.expertIds / query.skillIds（保持与原有口径一致）。
 */
const picker = reactive({
  expertPlatforms: [] as string[],
  expertScenarios: [] as number[],
  skillPlatforms: [] as string[],
  skillScenarios: [] as number[],
  skillAgents: [] as number[]
})
const platformsOfExpert = (e: CreditRecordOption): string[] => (e.platforms || []).map(String)
/**
 * v48：下拉内的收窄芯片只列「库里实际有数据」的平台/场景/智能体，
 * 避免把 6 个平台 9 个场景全铺开会把下拉挤满（无消耗的选了也筛不到东西）。
 */
const usedPlatformOptions = computed(() => options.value.platforms.filter((p) => p.usedCount > 0))
const usedScenarioOptions = computed(() => options.value.scenarios.filter((s) => s.usedCount > 0))
const usedAgentOptions = computed(() => options.value.agents.filter((a) => a.usedCount > 0))
/** 芯片多选切换（数组内「或」关系） */
function toggleIn<T>(arr: T[], v: T): void {
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}
const filteredExperts = computed(() => {
  const ps = picker.expertPlatforms
  const ss = picker.expertScenarios
  return options.value.experts.filter((e) =>
    (!ps.length || (e.platforms || []).some((p) => ps.includes(p as string))) &&
    (!ss.length || (typeof e.scenarioId === 'number' && ss.includes(e.scenarioId)))
  )
})
const filteredSkills = computed(() => {
  const ps = picker.skillPlatforms
  const ss = picker.skillScenarios
  const as = picker.skillAgents
  return options.value.skills.filter((sk) =>
    (!ps.length || (sk.platforms || []).some((p) => ps.includes(p as string))) &&
    (!ss.length || (typeof sk.scenarioId === 'number' && ss.includes(sk.scenarioId))) &&
    (!as.length || (typeof sk.agentId === 'number' && as.includes(sk.agentId)))
  )
})

/** 快捷日期范围（对齐前台今天-7天-30天习惯；点击即生效并立即查询，避免用户以为选中了却仍看旧数据） */
const quickRange = ref<'today' | '7d' | '30d' | ''>('30d')
function applyQuickRange(v: 'today' | '7d' | '30d' | '', immediate = true): void {
  quickRange.value = v
  const fmt = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  if (!v) { query.start = ''; query.end = ''; return }
  const days = v === 'today' ? 0 : v === '7d' ? 6 : 29
  const from = new Date(now.getTime() - days * 86400000)
  query.start = fmt(from)
  query.end = fmt(now)
  if (immediate) { query.page = 1; void load() }
}

/** 查询参数：仅传有值的字段，避免空串污染后端筛选 */
function queryParams(): Record<string, string | number> {
  const q: Record<string, string | number> = { page: query.page, pageSize: query.pageSize }
  if (query.phone.trim()) q.phone = query.phone.trim()
  if (query.content.trim()) q.content = query.content.trim()
  if (query.type) q.type = query.type
  if (query.expertIds.length) q.expertIds = query.expertIds.join(',')
  if (query.skillIds.length) q.skillIds = query.skillIds.join(',')
  if (query.mcpServerIds.length) q.mcpServerIds = query.mcpServerIds.join(',')
  if (query.platforms.length) q.platforms = query.platforms.join(',')
  if (query.scenarioIds.length) q.scenarioIds = query.scenarioIds.join(',')
  if (query.agentIds.length) q.agentIds = query.agentIds.join(',')
  if (query.start) q.from = query.start
  if (query.end) q.to = query.end
  return q
}

let reqSeq = 0
async function load(): Promise<void> {
  const seq = ++reqSeq
  loading.value = true
  loadError.value = false
  try {
    const params = queryParams()
    const [page, sum] = await Promise.all([listCreditRecords(params), creditRecordSummary(params)])
    if (seq !== reqSeq) return
    rows.value = page.list
    total.value = page.total
    summary.value = sum
  } catch {
    if (seq === reqSeq) { loadError.value = true; rows.value = []; total.value = 0 }
  } finally {
    if (seq === reqSeq) loading.value = false
  }
}

function search(): void {
  if (query.start && query.end && query.start > query.end) { ElMessage.warning('开始日期不能晚于结束日期'); return }
  query.page = 1
  void load()
}

function reset(): void {
  Object.assign(query, { phone: '', content: '', type: '', expertIds: [], skillIds: [], mcpServerIds: [], platforms: [], scenarioIds: [], agentIds: [], start: '', end: '', page: 1, pageSize: 20 })
  Object.assign(picker, { expertPlatforms: [], expertScenarios: [], skillPlatforms: [], skillScenarios: [], skillAgents: [] })
  applyQuickRange('30d', false)
  void load()
}

// ---------------------------------------------------------------- 详情抽屉
const detailVisible = ref(false)
const current = ref<CreditRecord | null>(null)
function openDetail(row: CreditRecord): void {
  current.value = row
  detailVisible.value = true
}

/**
 * v47：抽屉明细展示顺序——模型输入/输出固定置顶，其后第三方接口、技能执行。
 * 只影响展示顺序（Array.prototype.sort 稳定，同类型内保持种子生成顺序：输入在输出前）。
 * 不改 breakdown 本身，合计与毛利仍按全量计算。
 */
const TYPE_ORDER: Record<CreditItemType, number> = { LLM_MODEL: 0, MCP_TOOL: 1, SKILL: 2 }
const detailRows = computed(() => {
  const rows = current.value?.breakdown ?? []
  return [...rows].sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))
})

// ---------------------------------------------------------------- 展示辅助
const STATUS_META: Record<CreditRecord['status'], { label: string; type: 'success' | 'info' | 'warning' }> = {
  CHARGED: { label: '已扣减', type: 'success' },
  FREE: { label: '免费', type: 'info' },
  REFUNDED: { label: '已退回', type: 'warning' }
}
const statusMeta = (s: CreditRecord['status']) => STATUS_META[s]
const TYPE_LABEL: Record<CreditItemType, string> = { LLM_MODEL: 'LLM 模型', MCP_TOOL: '第三方工具', SKILL: '技能执行' }
const typeLabel = (t: CreditItemType): string => TYPE_LABEL[t] ?? t

/** 算力变更展示：扣减为负数（红色）、免费 0、退回为正数（绿色，用 success 色但文案标"退回"） */
const creditText = (r: CreditRecord): string => (r.status === 'REFUNDED' ? `+${Math.abs(r.credits)}` : r.credits === 0 ? '0' : String(r.credits))
const creditClass = (r: CreditRecord): string => (r.status === 'REFUNDED' ? 'credit-refund' : r.credits < 0 ? 'credit-cost' : 'credit-free')

/** 顶部卡片：成本展示统一 4 位小数内（不足补 0 显得像账，而不是随机小数） */
const money = (n: number): string => `¥${Number(n || 0).toFixed(4)}`
/** 毛利率展示：0–1 → 89.9%；undefined（无用户价）显示 — */
const percent = (n?: number): string => (typeof n === 'number' && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—')
/** 列表副行：把该次调用的第三方接口与点数摘出来（最多 2 个 + 其余计数） */
function toolSummary(r: CreditRecord): string {
  const tools = r.breakdown.filter((b) => b.type === 'MCP_TOOL')
  if (!tools.length) return r.breakdown.map((b) => typeLabel(b.type)).filter((v, i, a) => a.indexOf(v) === i).join(' · ')
  const head = tools.slice(0, 2).map((b) => `${b.name}${b.points ? ` ${b.points}点` : ''}`).join('、')
  return tools.length > 2 ? `${head} 等 ${tools.length} 个接口` : head
}
/** 成本价展示：接口单价很低，需要 4–6 位小数才看得出差异 */
const moneyFine = (n?: number): string => (typeof n === 'number' ? `¥${n < 0.01 ? n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') : n.toFixed(4)}` : '—')

/** v50：到期状态 → 标签文案与配色（与用户管理 USER_EXPIRY_STATUS 完全同一口径） */
const MEMBERSHIP_META: Record<NonNullable<CreditRecord['membershipStatus']>, { label: string; type: 'success' | 'primary' | 'info' | 'warning' | 'danger' }> = {
  ACTIVE: { label: '未到期', type: 'success' },
  EXPIRED: { label: '已到期', type: 'danger' },
  NONE: { label: '无会员', type: 'info' },
  LIFETIME: { label: '长期有效', type: 'primary' },
  UNKNOWN: { label: '期限未知', type: 'warning' }
}
const membershipMeta = (r: CreditRecord): { label: string; type: 'success' | 'primary' | 'info' | 'warning' | 'danger' } =>
  MEMBERSHIP_META[r.membershipStatus ?? 'UNKNOWN'] ?? { label: '期限未知', type: 'warning' }

/** 到期时间：终身 / 无会员不出日期，避免把 null 显示成 1970 或空串 */
function expiryText(r: CreditRecord): string {
  if (r.membershipStatus === 'LIFETIME') return '长期有效'
  if (r.membershipStatus === 'NONE') return '—'
  if (!r.membershipExpireAt) return '—'
  return r.membershipExpireAt.slice(0, 10)
}
/** 30 天内到期高亮：运营需要提前干预续费，已到期由标签本身标识 */
function isExpiringSoon(r: CreditRecord): boolean {
  if (r.membershipStatus !== 'ACTIVE' || !r.membershipExpireAt) return false
  const left = Date.parse(r.membershipExpireAt) - Date.now()
  return left > 0 && left < 30 * 86400000
}

onMounted(async () => {
  applyQuickRange('30d')
  try { options.value = await creditRecordOptions() } catch { options.value = { experts: [], skills: [], mcpServers: [], platforms: [], scenarios: [], agents: [] } }
  await load()
  window.addEventListener('resize', measureDetail)
})
onBeforeUnmount(() => window.removeEventListener('resize', measureDetail))
</script>

<template>
  <div class="credit-view">
    <el-alert
      title="消耗明细记录每次对话的实际扣点与成本：前台用户只看到扣多少积分，这里可下钻到模型 token 用量与第三方 MCP 接口调用成本（如亚马逊数据源），用于对账与定价校准。"
      type="info" :closable="false" style="margin-bottom:14px"
    />

    <!-- 消耗汇总 -->
    <el-card shadow="never" class="summary-card">
      <div class="summary-head">
        <div class="summary-title">
          消耗汇总
          <small class="muted">{{ query.start || '不限' }} ~ {{ query.end || '不限' }}</small>
        </div>
        <div class="summary-kpis">
          <div class="kpi">
            <div class="kpi-label">扣减积分</div>
            <div class="kpi-value primary">{{ summary?.totalCredits ?? 0 }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">成本价</div>
            <div class="kpi-value cost">{{ money(summary?.totalCost ?? 0) }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">用户价</div>
            <div class="kpi-value revenue">{{ money(summary?.totalUserPrice ?? 0) }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">
              毛利率
              <el-tooltip
                placement="top"
                :show-after="200"
                effect="dark"
                popper-class="kpi-margin-tip"
                :popper-options="{ modifiers: [{ name: 'offset', options: { offset: [0, 14] } }] }"
              >
                <template #content>
                  <div class="tip-body">
                    区间整体毛利率 ＝ 1 − 总成本 / 总用户价。<br />
                    免费与已退回回合的成本已实际发生、用户价为 0，会拉低整体毛利率，<br />
                    因此通常低于单条明细的毛利率（明细按该回合实收计）。
                  </div>
                </template>
                <span class="kpi-hint">?</span>
              </el-tooltip>
            </div>
            <div class="kpi-value margin">{{ percent(summary?.grossMargin) }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">对话回合</div>
            <div class="kpi-value">{{ summary?.totalRecords ?? 0 }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">接口点数</div>
            <div class="kpi-value muted">{{ summary?.totalPoints ?? 0 }} 点</div>
          </div>
        </div>
      </div>
      <div class="type-breakdown">
        <div v-for="t in summary?.byType || []" :key="t.type" class="type-chip">
          <span class="type-name">{{ t.label }}</span>
          <span class="type-figures">
            <b>{{ t.credits }}</b> 分
            <i class="dot" />
            成本 <b class="type-cost">{{ money(t.cost) }}</b>
            <i class="dot" />
            用户 <b class="type-revenue">{{ money(t.userPrice ?? 0) }}</b>
            <i class="dot" />
            {{ t.count }} 次
          </span>
        </div>
      </div>
    </el-card>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-line">
        <div class="filter-row">
        <el-date-picker
          v-model="query.start" type="date" placeholder="开始日期" value-format="YYYY-MM-DD"
          style="width:138px" :clearable="false"
        />
        <span class="sep">→</span>
        <el-date-picker
          v-model="query.end" type="date" placeholder="结束日期" value-format="YYYY-MM-DD"
          style="width:138px" :clearable="false"
        />
        <el-button-group class="quick-group">
          <el-button size="small" :type="quickRange === 'today' ? 'primary' : 'default'" @click="applyQuickRange('today')">今天</el-button>
          <el-button size="small" :type="quickRange === '7d' ? 'primary' : 'default'" @click="applyQuickRange('7d')">近 7 天</el-button>
          <el-button size="small" :type="quickRange === '30d' ? 'primary' : 'default'" @click="applyQuickRange('30d')">近 30 天</el-button>
        </el-button-group>
        </div>

        <div class="filter-row">
        <el-select v-model="query.expertIds" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1" placeholder="专家（可多选）" clearable style="width:170px" @change="search">
          <template #header>
            <div class="pick-head" @click.stop @mousedown.stop>
              <div class="pick-line">
                <span class="pick-label">平台</span>
                <div class="pick-chips">
                  <button
                    v-for="p in usedPlatformOptions" :key="p.value" type="button"
                    class="pick-chip" :class="{ on: picker.expertPlatforms.includes(p.value) }"
                    @click="toggleIn(picker.expertPlatforms, p.value)"
                  >{{ p.label }}</button>
                </div>
              </div>
              <div class="pick-line">
                <span class="pick-label">场景</span>
                <div class="pick-chips">
                  <button
                    v-for="s in usedScenarioOptions" :key="s.id" type="button"
                    class="pick-chip" :class="{ on: picker.expertScenarios.includes(s.id) }"
                    @click="toggleIn(picker.expertScenarios, s.id)"
                  >{{ s.name }}</button>
                </div>
              </div>
            </div>
          </template>
          <el-option v-for="e in filteredExperts" :key="e.id" :value="e.id" :label="e.name">
            <span class="opt-name" :class="{ 'opt-idle': !e.usedCount }">{{ e.name }}</span>
            <span class="opt-meta">{{ e.usedCount ? `${e.usedCount} 条` : '无消耗' }}</span>
          </el-option>
          <template #empty>
            <div class="opt-empty">{{ picker.expertPlatforms.length || picker.expertScenarios.length ? '所选平台/场景下没有专家' : '暂无专家' }}</div>
          </template>
        </el-select>
        <el-select v-model="query.skillIds" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1" placeholder="技能（可多选）" clearable style="width:170px" @change="search">
          <template #header>
            <div class="pick-head" @click.stop @mousedown.stop>
              <div class="pick-line">
                <span class="pick-label">智能体</span>
                <div class="pick-chips">
                  <button
                    v-for="a in usedAgentOptions" :key="a.id" type="button"
                    class="pick-chip" :class="{ on: picker.skillAgents.includes(a.id) }"
                    @click="toggleIn(picker.skillAgents, a.id)"
                  >{{ a.name }}</button>
                </div>
              </div>
              <div class="pick-line">
                <span class="pick-label">平台</span>
                <div class="pick-chips">
                  <button
                    v-for="p in usedPlatformOptions" :key="p.value" type="button"
                    class="pick-chip" :class="{ on: picker.skillPlatforms.includes(p.value) }"
                    @click="toggleIn(picker.skillPlatforms, p.value)"
                  >{{ p.label }}</button>
                </div>
              </div>
              <div class="pick-line">
                <span class="pick-label">场景</span>
                <div class="pick-chips">
                  <button
                    v-for="s in usedScenarioOptions" :key="s.id" type="button"
                    class="pick-chip" :class="{ on: picker.skillScenarios.includes(s.id) }"
                    @click="toggleIn(picker.skillScenarios, s.id)"
                  >{{ s.name }}</button>
                </div>
              </div>
            </div>
          </template>
          <el-option v-for="sk in filteredSkills" :key="sk.id" :value="sk.id" :label="sk.name">
            <span class="opt-name" :class="{ 'opt-idle': !sk.usedCount }">{{ sk.name }}</span>
            <span class="opt-meta">{{ sk.usedCount ? `${sk.usedCount} 条` : '无消耗' }}</span>
          </el-option>
          <template #empty>
            <div class="opt-empty">{{ picker.skillAgents.length || picker.skillPlatforms.length || picker.skillScenarios.length ? '所选智能体/平台/场景下没有技能' : '暂无技能' }}</div>
          </template>
        </el-select>
        <el-select v-model="query.mcpServerIds" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1" placeholder="MCP 服务（可多选）" clearable style="width:180px" @change="search">
          <el-option v-for="m in options.mcpServers" :key="m.id" :value="m.id" :label="m.name">
            <span class="opt-name" :class="{ 'opt-idle': !m.usedCount }">{{ m.name }}</span>
            <span class="opt-meta">{{ m.usedCount ? `${m.usedCount} 条` : '无消耗' }}</span>
          </el-option>
        </el-select>
        <el-select v-model="query.type" placeholder="消耗类型（全部）" clearable style="width:136px" @change="search">
          <el-option value="LLM_MODEL" label="LLM 模型" />
          <el-option value="MCP_TOOL" label="第三方工具" />
          <el-option value="SKILL" label="技能执行" />
        </el-select>
        <el-select v-model="query.platforms" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1" placeholder="平台（可多选）" clearable style="width:150px" @change="search">
          <el-option v-for="p in options.platforms" :key="p.value" :value="p.value" :label="p.label">
            <span class="opt-name" :class="{ 'opt-idle': !p.usedCount }">{{ p.label }}</span>
            <span class="opt-meta">{{ p.usedCount ? `${p.usedCount} 条` : '无消耗' }}</span>
          </el-option>
        </el-select>
        <el-select v-model="query.scenarioIds" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1" placeholder="场景（可多选）" clearable style="width:150px" @change="search">
          <el-option v-for="s in options.scenarios" :key="s.id" :value="s.id" :label="s.name">
            <span class="opt-name" :class="{ 'opt-idle': !s.usedCount }">{{ s.name }}</span>
            <span class="opt-meta">{{ s.usedCount ? `${s.usedCount} 条` : '无消耗' }}</span>
          </el-option>
        </el-select>
        <el-select v-model="query.agentIds" multiple collapse-tags collapse-tags-tooltip :max-collapse-tags="1" placeholder="智能体（可多选）" clearable style="width:150px" @change="search">
          <el-option v-for="a in options.agents" :key="a.id" :value="a.id" :label="a.name">
            <span class="opt-name" :class="{ 'opt-idle': !a.usedCount }">{{ a.name }}</span>
            <span class="opt-meta">{{ a.usedCount ? `${a.usedCount} 条` : '无消耗' }}</span>
          </el-option>
        </el-select>
        <el-input v-model="query.content" placeholder="消耗内容关键词" clearable style="width:160px" @keyup.enter="search" />
        <el-input v-model="query.phone" placeholder="手机号（支持多个）" clearable style="width:160px" @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
        </div>
      </div>
    </el-card>

    <!-- 明细表 -->
    <el-card shadow="never" class="table-card">
      <el-table
        ref="bindTable"
        v-loading="loading"
        :data="rows"
        :max-height="tableMax"
        size="small"
        row-key="id"
        class="credit-table"
        empty-text="所选条件下暂无消耗记录"
      >
        <el-table-column label="手机号" width="118">
          <template #default="{ row }">
            <!-- v48：成员列只放手机号（原「昵称在上、手机号在下」取消）；v52 列头改「手机号」 -->
            <span class="member-phone">{{ (row as CreditRecord).phone }}</span>
          </template>
        </el-table-column>
        <!-- v52：客户维度列（微信昵称 / 套餐 / 到期状态 / 到期时间）紧跟手机号 -->
        <el-table-column label="微信昵称" width="112" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="member-nick">{{ (row as CreditRecord).wechatNickname || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="套餐" width="96" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="plan-name">{{ (row as CreditRecord).planName || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="到期状态" width="96" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="membershipMeta(row as CreditRecord).type" effect="plain">
              {{ membershipMeta(row as CreditRecord).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到期时间" width="104">
          <template #default="{ row }">
            <span class="expire-time" :class="{ 'expire-warn': isExpiringSoon(row as CreditRecord) }">
              {{ expiryText(row as CreditRecord) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="消耗项目" width="126">
          <template #default="{ row }">
            <span class="project">{{ (row as CreditRecord).projectName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="消耗内容" min-width="150">
          <template #default="{ row }">
            <el-button link type="primary" class="content-link" @click="openDetail(row as CreditRecord)">
              {{ (row as CreditRecord).content }}
            </el-button>
            <div class="content-sub muted" :title="(row as CreditRecord).breakdown.filter((b) => b.type === 'MCP_TOOL').map((b) => `${b.name}${b.points ? ` ${b.points}点` : ''}`).join('、')">
              {{ toolSummary(row as CreditRecord) }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="消耗时间" width="146">
          <template #default="{ row }">{{ beijingTime((row as CreditRecord).createdAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="82">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMeta((row as CreditRecord).status).type" effect="plain">
              {{ statusMeta((row as CreditRecord).status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="算力变更" width="92" align="right">
          <template #default="{ row }">
            <span class="credit-val" :class="creditClass(row as CreditRecord)">{{ creditText(row as CreditRecord) }}</span>
            <small class="unit">分</small>
          </template>
        </el-table-column>
        <el-table-column label="成本价" width="86" align="right">
          <template #default="{ row }"><span class="cost-val">{{ money((row as CreditRecord).cost) }}</span></template>
        </el-table-column>
        <el-table-column label="用户价" width="96" align="right">
          <template #default="{ row }">
            <span v-if="(row as CreditRecord).status === 'CHARGED'" class="revenue-val">{{ money((row as CreditRecord).userPriceTotal ?? 0) }}</span>
            <span v-else class="revenue-void" :title="`原本应扣 ¥${((row as CreditRecord).originalUserPrice ?? 0).toFixed(4)}，已${(row as CreditRecord).status === 'REFUNDED' ? '全额退回' : '免费'}`">
              0 <small class="void-note">（原 {{ money((row as CreditRecord).originalUserPrice ?? 0) }}）</small>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="毛利" width="74" align="right">
          <template #default="{ row }"><span class="margin-val">{{ percent((row as CreditRecord).grossMargin) }}</span></template>
        </el-table-column>
        <el-table-column label="操作" width="96" fixed="right" align="center">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row as CreditRecord)">消耗详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager-wrap">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          background
          small
          @current-change="load"
          @size-change="search"
        />
      </div>
      <el-alert v-if="loadError" type="error" :closable="false" style="margin-top:10px">
        消耗记录加载失败，请重新加载
        <el-button link type="primary" @click="load">重试</el-button>
      </el-alert>
    </el-card>

    <!-- 消耗详情抽屉：执行过程 / 消耗类型 / 消耗算力 三列 -->
    <el-drawer v-model="detailVisible" title="消耗详情" size="860px" append-to-body>
      <template v-if="current">
        <div class="detail-head">
          <div class="detail-title">
            <span class="detail-name">{{ current.content }}</span>
            <el-tag size="small" :type="statusMeta(current.status).type" effect="plain">{{ statusMeta(current.status).label }}</el-tag>
          </div>
          <div class="detail-meta muted">
            {{ current.wechatNickname }} · {{ current.phone }} · {{ beijingTime(current.createdAt) }}
          </div>
          <div class="detail-total">
            <span class="total-credits">{{ creditText(current) }} 分</span>
            <span class="total-cost">{{ money(current.cost) }}</span>
          </div>
        </div>

        <div class="detail-section-title">消耗明细（逐个接口 / 模型）</div>
        <el-table :data="detailRows" size="small" class="detail-table" :ref="bindDetailTable" :max-height="detailMax">
          <el-table-column label="执行过程" min-width="190">
            <template #default="{ row }">
              <div class="exec-name">
                {{ row.name }}
                <el-tag v-if="row.channel" size="small" effect="plain" class="exec-channel">{{ row.channel }}</el-tag>
              </div>
              <div v-if="row.code" class="exec-code">{{ row.code }}</div>
              <div class="exec-basis muted">{{ row.basis }}</div>
            </template>
          </el-table-column>
          <el-table-column label="调用/点数" width="92" align="center">
            <template #default="{ row }">
              <template v-if="row.calls">
                <span class="calls-times">{{ row.calls }} 次</span>
                <span class="points-tag">{{ row.points }} 点</span>
                <div class="points-sub muted">{{ row.calls }} × {{ row.pointsPerCall }} 点</div>
              </template>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="76">
            <template #default="{ row }"><span class="exec-type">{{ typeLabel(row.type) }}</span></template>
          </el-table-column>
          <el-table-column label="成本价" width="80" align="right">
            <template #default="{ row }"><span class="cost-val">{{ moneyFine(row.costPrice) }}</span></template>
          </el-table-column>
          <el-table-column label="用户价" width="80" align="right">
            <template #default="{ row }"><span class="revenue-val">{{ moneyFine(row.userPrice) }}</span></template>
          </el-table-column>
          <el-table-column label="扣分" width="64" align="right">
            <template #default="{ row }">
              <span class="credit-val" :class="row.credits > 0 ? 'credit-cost' : 'credit-free'">{{ row.credits > 0 ? `-${row.credits}` : '0' }}</span>
              <div v-if="row.originalCredits" class="void-note">原 -{{ row.originalCredits }}</div>
            </template>
          </el-table-column>
          <el-table-column label="毛利" width="72" align="right">
            <template #default="{ row }"><span class="margin-val">{{ percent(row.grossMargin) }}</span></template>
          </el-table-column>
        </el-table>

        <div class="detail-sum">
          <span class="sum-label">合计</span>
          <span class="sum-item">成本价 <b class="cost-val">{{ money(current.cost) }}</b></span>
          <span class="sum-item">
            用户价
            <b class="revenue-val">{{ money(current.userPriceTotal ?? 0) }}</b>
            <small v-if="current.status !== 'CHARGED' && current.originalUserPrice" class="void-note">（原 {{ money(current.originalUserPrice) }}，已{{ current.status === 'REFUNDED' ? '退回' : '免费' }}）</small>
          </span>
          <span class="sum-item">扣分 <b class="credit-cost">{{ Math.abs(current.credits) }}</b></span>
          <span class="sum-item">毛利 <b class="margin-val">{{ percent(current.grossMargin) }}</b></span>
        </div>

        <div class="detail-foot muted">
          <p>· <b>成本价</b>= 渠道采购单价（月采购 ÷ 月额度）× 用量；<b>用户价</b>= 成本价 × 加价倍数（1688 为 5×，其余 10×）× 每分 ¥0.0049。</p>
          <p>· 计费粒度：亚马逊逐工具扣量（1/2/5/10/60/150/450 额度/次）；云启（OZON/TEMU）按次不分工具（字典/字段/额度查询不计次）；1688 按次不分工具。</p>
          <p>· 模型：输入 4 分/千 tokens、输出 16 分/千 tokens（成本 ¥2 / ¥8 每百万），多轮累计后统一向上取整。</p>
          <p>· 前台只展示「本次消耗 N 积分」；成本价、毛利与逐笔接口明细仅后台可见。数据来源：{{ current.source }}。</p>
        </div>
      </template>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.credit-view { display: flex; flex-direction: column; gap: 12px; }
.muted { color: var(--el-text-color-secondary); }
.summary-card :deep(.el-card__body) { padding: 16px 18px; }
.summary-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.summary-title { font-size: 14px; font-weight: 600; display: flex; flex-direction: column; gap: 4px; }
.summary-title small { font-weight: 400; font-size: 12px; }
.summary-kpis { display: flex; align-items: stretch; gap: 0; flex-wrap: wrap; }
.kpi { display: flex; flex-direction: column; gap: 4px; min-width: 104px; padding: 0 20px; border-left: 1px solid var(--el-border-color-lighter); }
.kpi:first-child { border-left: none; padding-left: 0; }
.kpi-label { font-size: 12px; color: var(--el-text-color-secondary); display: flex; align-items: center; gap: 4px; }
.kpi-hint {
  display: inline-grid; place-items: center; width: 13px; height: 13px; border-radius: 50%;
  background: #e8edeb; color: #7d908a; font-size: 9px; cursor: help; line-height: 1;
  border: 1px solid #d8e2de; flex: none;
}
.tip-body { max-width: 300px; line-height: 1.7; font-size: 12px; }
/* v46 筛选下拉：右侧显示该配置已产生的消耗条数，无消耗的条目淡化 */
.opt-name.opt-idle { color: var(--el-text-color-placeholder); }
.opt-meta { float: right; margin-left: 12px; font-size: 11px; color: var(--el-text-color-secondary); }
/* v48 下拉内二级收窄（平台/场景/智能体）：芯片式多选，不占用页面筛选区 */
.pick-head { padding: 6px 8px 8px; border-bottom: 1px solid var(--el-border-color-lighter); margin-bottom: 4px; }
.pick-line { display: flex; align-items: flex-start; gap: 8px; }
.pick-line + .pick-line { margin-top: 6px; }
.pick-label { flex: none; width: 34px; font-size: 11px; line-height: 20px; color: var(--el-text-color-secondary); }
.pick-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.pick-chip {
  padding: 0 8px; height: 20px; line-height: 18px; font-size: 11px; cursor: pointer;
  border: 1px solid var(--el-border-color); border-radius: 10px; background: #fff;
  color: var(--el-text-color-regular); transition: all .15s;
}
.pick-chip:hover { border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); }
.pick-chip.on { background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-5); color: var(--el-color-primary); font-weight: 600; }
.opt-empty { padding: 14px 12px; text-align: center; font-size: 12px; color: var(--el-text-color-secondary); }
/* v48 列表新增列：手机号独立展示、昵称/套餐/到期 */
.member-phone { font-variant-numeric: tabular-nums; color: var(--el-text-color-primary); font-size: 12.5px; }
.member-nick { color: var(--el-text-color-regular); }
.plan-name { font-size: 12px; color: var(--el-text-color-regular); }
.expire-time { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--el-text-color-regular); }
.expire-time.expire-warn { color: #d97706; font-weight: 600; }
.kpi-value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.kpi-value.primary { color: var(--el-color-primary); }
.kpi-value.cost { color: #d97706; }
.kpi-value.muted { font-size: 15px; color: var(--el-text-color-regular); }
.type-breakdown { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--el-border-color-lighter); }
.type-chip { display: inline-flex; align-items: baseline; gap: 12px; padding: 8px 14px; border-radius: 8px; background: var(--el-fill-color-lighter); font-size: 12px; }
.type-name { font-weight: 600; color: var(--el-text-color-primary); min-width: 66px; }
.type-figures { display: inline-flex; align-items: baseline; gap: 7px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.type-figures b { font-weight: 600; color: var(--el-text-color-regular); }
.type-figures b.type-cost { color: #d97706; }
.type-figures .dot { width: 3px; height: 3px; border-radius: 50%; background: var(--el-border-color); flex: 0 0 auto; align-self: center; }
.filter-card :deep(.el-card__body) { padding: 12px 14px; }
.filter-line { display: flex; flex-direction: column; gap: 8px; }
.filter-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; row-gap: 8px; }
.filter-row .el-button-group { margin-right: 4px; }
.sep { color: var(--el-text-color-secondary); font-size: 12px; }
.quick-group { margin-left: 2px; }
.table-card :deep(.el-card__body) { padding: 12px 16px 14px; }
.credit-table :deep(.el-table__cell) { padding: 9px 0; }
.credit-table :deep(.el-table__header .el-table__cell) { padding: 8px 0; background: var(--el-fill-color-lighter); }
.credit-table :deep(.el-table__header th) { font-weight: 600; color: var(--el-text-color-regular); }
.member { display: flex; flex-direction: column; line-height: 1.5; }
.member small { font-size: 11px; }
.project { font-size: 12px; color: var(--el-text-color-regular); }
.content-link { padding: 0; text-align: left; white-space: normal; line-height: 1.5; font-size: 13px; }
.content-sub { font-size: 11px; margin-top: 2px; }
.credit-val { font-variant-numeric: tabular-nums; font-weight: 600; }
.credit-cost { color: #f56c6c; }
.credit-refund { color: #67c23a; }
.credit-free { color: var(--el-text-color-secondary); }
.unit { font-size: 11px; color: var(--el-text-color-secondary); margin-left: 2px; }
.cost-val { font-variant-numeric: tabular-nums; color: #d97706; }
.pager-wrap { display: flex; justify-content: flex-end; margin-top: 10px; }
/* 详情抽屉 */
.detail-head { padding-bottom: 14px; border-bottom: 1px solid var(--el-border-color-lighter); }
.detail-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-name { font-size: 15px; font-weight: 600; line-height: 1.5; }
.detail-meta { font-size: 12px; margin-top: 6px; }
.detail-total { display: flex; align-items: baseline; gap: 14px; margin-top: 10px; }
.total-credits { font-size: 20px; font-weight: 700; color: #f56c6c; font-variant-numeric: tabular-nums; }
.total-cost { font-size: 14px; color: #d97706; font-variant-numeric: tabular-nums; }
.detail-section-title { font-size: 13px; font-weight: 600; margin: 16px 0 8px; }
.detail-table { margin-bottom: 12px; }
.exec-name { font-size: 13px; font-weight: 500; }
.exec-basis { font-size: 11px; line-height: 1.5; margin-top: 2px; }
.exec-type { font-size: 12px; color: var(--el-text-color-regular); }
.detail-foot { font-size: 12px; line-height: 1.8; }
.detail-foot p { margin: 0; }
.detail-foot b { color: var(--el-text-color-regular); font-weight: 600; }
.exec-channel { margin-left: 6px; transform: scale(0.88); transform-origin: left center; }
.exec-code { font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: var(--el-color-primary); margin-top: 1px; }
.detail-sum { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding: 10px 12px; margin-bottom: 12px; border-radius: 8px; background: var(--el-fill-color-lighter); font-size: 12px; }
.sum-label { font-weight: 600; color: var(--el-text-color-primary); }
.sum-item { color: var(--el-text-color-secondary); }
.sum-item b { font-variant-numeric: tabular-nums; }
.kpi-value.revenue { color: #0f766e; }
.kpi-value.margin { color: #7c3aed; font-size: 18px; }
.type-revenue { color: #0f766e; font-variant-numeric: tabular-nums; }
.revenue-val { color: #0f766e; font-variant-numeric: tabular-nums; }
.margin-val { color: #7c3aed; font-variant-numeric: tabular-nums; }
.detail-table { font-size: 12px; }
.detail-table :deep(.el-table__cell) { padding: 7px 0; }
.detail-table .cost-val, .detail-table .revenue-val, .detail-table .margin-val { font-size: 11.5px; white-space: nowrap; }
.detail-table :deep(.el-table__cell) { padding: 7px 0; }
.detail-table .cost-val, .detail-table .revenue-val, .detail-table .margin-val { font-size: 11.5px; white-space: nowrap; }
.revenue-void { color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; }
.calls-times { font-variant-numeric: tabular-nums; color: var(--el-text-color-regular); }
.points-tag { display: inline-block; margin-left: 5px; padding: 0 5px; border-radius: 4px; background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-size: 11px; line-height: 16px; font-weight: 600; }
.points-sub { font-size: 10px; line-height: 1.3; }
.void-note { font-size: 11px; color: var(--el-text-color-secondary); }
</style>
