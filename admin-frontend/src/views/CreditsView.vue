<script setup lang="ts">
/**
 * 消耗明细（v40）：把「前台用户只看到扣多少积分」在后台还原成可对账的成本账。
 * - 顶部消耗汇总卡：总扣分/总成本/按项目类型（LLM 模型、第三方 MCP 工具、技能执行）分布
 * - 筛选：时间范围、消耗项目、状态、消耗类型、手机号
 * - 明细表：成员 / 消耗项目 / 消耗内容 / 时间 / 状态 / 算力变更 + 行内「消耗详情」
 * - 右侧详情抽屉：执行过程 / 消耗类型 / 消耗算力 三列，逐笔核对模型 token 用量与第三方接口调用成本
 */
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listCreditRecords, creditRecordSummary, listCreditProjects,
  type CreditRecord, type CreditSummary, type CreditItemType
} from '@/api/config'
import { beijingTime } from '@/utils/chat-time'
import { useTableMaxHeight } from '@/composables/useTableMax'

const { max: tableMax, bind: bindTable } = useTableMaxHeight(96)

const rows = ref<CreditRecord[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref(false)
const summary = ref<CreditSummary | null>(null)
const projects = ref<string[]>([])

const query = reactive({
  phone: '',
  project: '',
  status: '',
  type: '',
  start: '',
  end: '',
  page: 1,
  pageSize: 20
})

/** 快捷日期范围（对齐前台今天-7天-30天习惯；点击即生效并立即查询，避免用户以为选中了却仍看旧数据） */
const quickRange = ref<'today' | '7d' | '30d' | ''>('7d')
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
  if (query.project) q.project = query.project
  if (query.status) q.status = query.status
  if (query.type) q.type = query.type
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
  Object.assign(query, { phone: '', project: '', status: '', type: '', start: '', end: '', page: 1, pageSize: 20 })
  applyQuickRange('7d', false)
  void load()
}

// ---------------------------------------------------------------- 详情抽屉
const detailVisible = ref(false)
const current = ref<CreditRecord | null>(null)
function openDetail(row: CreditRecord): void {
  current.value = row
  detailVisible.value = true
}

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

onMounted(async () => {
  applyQuickRange('7d')
  try { projects.value = await listCreditProjects() } catch { projects.value = [] }
  await load()
})
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
            <div class="kpi-label">折算成本</div>
            <div class="kpi-value cost">{{ money(summary?.totalCost ?? 0) }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">对话回合</div>
            <div class="kpi-value">{{ summary?.totalRecords ?? 0 }}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">免费 / 已退回</div>
            <div class="kpi-value muted">{{ summary?.freeRecords ?? 0 }} / {{ summary?.refundedCredits ?? 0 }} 分</div>
          </div>
        </div>
      </div>
      <div class="type-breakdown">
        <div v-for="t in summary?.byType || []" :key="t.type" class="type-chip">
          <span class="type-name">{{ t.label }}</span>
          <span class="type-figures">
            <b>{{ t.credits }}</b> 分
            <i class="dot" />
            <b class="type-cost">{{ money(t.cost) }}</b>
            <i class="dot" />
            {{ t.count }} 次
          </span>
        </div>
      </div>
    </el-card>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-card">
      <div class="filter-row">
        <el-date-picker
          v-model="query.start" type="date" placeholder="开始日期" value-format="YYYY-MM-DD"
          style="width:150px" :clearable="false"
        />
        <span class="sep">→</span>
        <el-date-picker
          v-model="query.end" type="date" placeholder="结束日期" value-format="YYYY-MM-DD"
          style="width:150px" :clearable="false"
        />
        <el-button-group class="quick-group">
          <el-button size="small" :type="quickRange === 'today' ? 'primary' : 'default'" @click="applyQuickRange('today')">今天</el-button>
          <el-button size="small" :type="quickRange === '7d' ? 'primary' : 'default'" @click="applyQuickRange('7d')">近 7 天</el-button>
          <el-button size="small" :type="quickRange === '30d' ? 'primary' : 'default'" @click="applyQuickRange('30d')">近 30 天</el-button>
        </el-button-group>

        <el-select v-model="query.project" placeholder="消耗项目（全部）" clearable style="width:180px" @change="search">
          <el-option v-for="p in projects" :key="p" :value="p" :label="p" />
        </el-select>
        <el-select v-model="query.type" placeholder="消耗类型（全部）" clearable style="width:160px" @change="search">
          <el-option value="LLM_MODEL" label="LLM 模型" />
          <el-option value="MCP_TOOL" label="第三方工具" />
          <el-option value="SKILL" label="技能执行" />
        </el-select>
        <el-select v-model="query.status" placeholder="状态（全部）" clearable style="width:140px" @change="search">
          <el-option value="CHARGED" label="已扣减" />
          <el-option value="FREE" label="免费" />
          <el-option value="REFUNDED" label="已退回" />
        </el-select>
        <el-input v-model="query.phone" placeholder="手机号（支持多个）" clearable style="width:190px" @keyup.enter="search" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="reset">重置</el-button>
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
        <el-table-column label="成员" min-width="150">
          <template #default="{ row }">
            <div class="member">
              <b>{{ (row as CreditRecord).wechatNickname }}</b>
              <small class="muted">{{ (row as CreditRecord).phone }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="消耗项目" width="160">
          <template #default="{ row }">
            <span class="project">{{ (row as CreditRecord).projectName }}</span>
          </template>
        </el-table-column>
        <el-table-column label="消耗内容" min-width="260">
          <template #default="{ row }">
            <el-button link type="primary" class="content-link" @click="openDetail(row as CreditRecord)">
              {{ (row as CreditRecord).content }}
            </el-button>
            <div class="content-sub muted">
              {{ (row as CreditRecord).breakdown.map((b) => typeLabel(b.type)).filter((v, i, a) => a.indexOf(v) === i).join(' · ') }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时间（北京）" width="185">
          <template #default="{ row }">{{ beijingTime((row as CreditRecord).createdAt) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="95">
          <template #default="{ row }">
            <el-tag size="small" :type="statusMeta((row as CreditRecord).status).type" effect="plain">
              {{ statusMeta((row as CreditRecord).status).label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="算力变更" width="105" align="right">
          <template #default="{ row }">
            <span class="credit-val" :class="creditClass(row as CreditRecord)">{{ creditText(row as CreditRecord) }}</span>
            <small class="unit">分</small>
          </template>
        </el-table-column>
        <el-table-column label="成本" width="110" align="right">
          <template #default="{ row }"><span class="cost-val">{{ money((row as CreditRecord).cost) }}</span></template>
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
    <el-drawer v-model="detailVisible" title="消耗详情" size="520px" append-to-body>
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

        <div class="detail-section-title">消耗明细</div>
        <el-table :data="current.breakdown" size="small" class="detail-table">
          <el-table-column label="执行过程" min-width="190">
            <template #default="{ row }">
              <div class="exec-name">{{ row.name }}</div>
              <div class="exec-basis muted">{{ row.basis }}</div>
            </template>
          </el-table-column>
          <el-table-column label="消耗类型" width="100">
            <template #default="{ row }"><span class="exec-type">{{ typeLabel(row.type) }}</span></template>
          </el-table-column>
          <el-table-column label="消耗算力" width="90" align="right">
            <template #default="{ row }">
              <span class="credit-val" :class="row.credits > 0 ? 'credit-cost' : 'credit-free'">{{ row.credits > 0 ? `-${row.credits}` : '0' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="成本" width="90" align="right">
            <template #default="{ row }"><span class="cost-val">{{ row.cost ? `¥${row.cost.toFixed(4)}` : '—' }}</span></template>
          </el-table-column>
        </el-table>

        <div class="detail-foot muted">
          <p>· 算力扣减口径：模型按「tokens ÷ 1,000,000 × 单价 ÷ 0.0049」向上取整；第三方工具按「收单价 ÷ 0.0049」向上取整。</p>
          <p>· 单价取自「模型管理」的输入/输出价格与「MCP 服务」的工具收单价；改价后仅影响新产生的记录。</p>
          <p>· 数据来源：{{ current.source }}。前台只展示本次扣减总积分，逐笔成本仅后台可见。</p>
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
.kpi-label { font-size: 12px; color: var(--el-text-color-secondary); }
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
.filter-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; row-gap: 10px; }
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
</style>
