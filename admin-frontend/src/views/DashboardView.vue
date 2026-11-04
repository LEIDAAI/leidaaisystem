<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dashboard, type Dashboard } from '@/api/operations'
import { USE_MOCK } from '@/utils/constants'
import { User, ShoppingCart, ChatDotRound, Money, TrendCharts, Clock } from '@element-plus/icons-vue'

const data = ref<Dashboard>()
const loading = ref(false)

/* ── KPI 卡片 ── */
const kpiCards = computed(() => {
  if (!data.value) return []
  const d = data.value
  return [
    { label: '用户总数', value: d.userTotal, sub: `今日 +${d.userToday}`, icon: User, color: '#169b82', bg: '#ebf7f3', trend: d.trend.length >= 2 ? d.trend[d.trend.length - 1].users - d.trend[d.trend.length - 2].users : 0 },
    { label: '订单总数', value: d.orderTotal, sub: `待处理 ${d.orderPending}`, icon: ShoppingCart, color: '#588bd7', bg: '#eef3fb', trend: d.trend.length >= 2 ? d.trend[d.trend.length - 1].orders - d.trend[d.trend.length - 2].orders : 0 },
    { label: 'AI 对话', value: d.chatTotal, sub: `今日 ${d.chatToday} · 消息 ${d.chatMessages}`, icon: ChatDotRound, color: '#dba24c', bg: '#fdf5e8', trend: d.trend.length >= 2 ? d.trend[d.trend.length - 1].chats - d.trend[d.trend.length - 2].chats : 0 },
    { label: '净收入', value: `¥${d.revenueTotal.toFixed(2)}`, sub: `微信 ${d.orderWechat} · 支付宝 ${d.orderAlipay}`, icon: Money, color: '#e06c75', bg: '#fceced', trend: 0 },
  ]
})

/* ── 资源统计 ── */
const resourceCards = computed(() => {
  if (!data.value) return []
  const d = data.value
  return [
    { label: 'AI 专家', value: d.expertTotal, color: '#169b82' },
    { label: '技能', value: d.skillTotal, color: '#588bd7' },
    { label: 'MCP 服务', value: d.serverTotal, color: '#dba24c' },
  ]
})

/* ── 订单状态分布 ── */
const orderStatuses = computed(() => {
  if (!data.value) return []
  const d = data.value
  const total = d.orderTotal || 1
  return [
    { label: '待支付', value: d.orderPending, color: '#dba24c', pct: Math.round(d.orderPending / total * 100) },
    { label: '已支付', value: d.orderPaid, color: '#169b82', pct: Math.round(d.orderPaid / total * 100) },
    { label: '已关闭', value: d.orderClosed, color: '#95a49c', pct: Math.round(d.orderClosed / total * 100) },
  ]
})

/* ── 趋势图计算 ── */
const CHART_LEFT = 50, CHART_RIGHT = 650, CHART_TOP = 20, CHART_BOTTOM = 170
const CHART_W = CHART_RIGHT - CHART_LEFT, CHART_H = CHART_BOTTOM - CHART_TOP
const trendMax = computed(() => {
  const raw = Math.max(...(data.value?.trend.flatMap(d => [d.users, d.orders, d.chats]) || [0]))
  /* 向上取到 "好看" 的刻度：1→1, 2→2, 3→5, 5→5, 8→10, 15→20 ... */
  if (raw <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  return Math.ceil(raw / mag) * mag || 1
})
const trendStep = computed(() => { const n = data.value?.trend.length ?? 0; return n > 1 ? CHART_W / (n - 1) : 0 })
/* Y 轴刻度线（5 条） */
const yTicks = computed(() => Array.from({ length: 5 }, (_, i) => Math.round(trendMax.value * (4 - i) / 4)))
function yOf(val: number) { return CHART_BOTTOM - (val / trendMax.value) * CHART_H }
function xOf(i: number) { return CHART_LEFT + i * trendStep.value }
/* 平滑曲线：Catmull-Rom → cubic bezier */
function smoothPath(key: 'users' | 'orders' | 'chats') {
  const pts = (data.value?.trend || []).map((d, i) => ({ x: xOf(i), y: yOf(d[key]) }))
  if (pts.length < 2) return ''
  let path = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return path
}
function smoothArea(key: 'users' | 'orders' | 'chats') {
  const line = smoothPath(key)
  if (!line) return ''
  const n = (data.value?.trend || []).length
  return `${line} L${xOf(n - 1)},${CHART_BOTTOM} L${xOf(0)},${CHART_BOTTOM} Z`
}
/* hover 交互 */
const hoverIdx = ref<number | null>(null)
const hoverX = ref(0)
const svgRef = ref<SVGSVGElement | null>(null)

function onChartMouseMove(e: MouseEvent) {
  if (!svgRef.value || !data.value) return
  const svg = svgRef.value
  const rect = svg.getBoundingClientRect()
  const scaleX = 700 / rect.width
  const mouseX = (e.clientX - rect.left) * scaleX
  
  if (mouseX < CHART_LEFT || mouseX > CHART_RIGHT) {
    hoverIdx.value = null
    return
  }
  
  const idx = Math.round((mouseX - CHART_LEFT) / trendStep.value)
  if (idx >= 0 && idx < data.value.trend.length) {
    hoverIdx.value = idx
    hoverX.value = xOf(idx)
  }
}

function onChartMouseLeave() { 
  hoverIdx.value = null 
}

/* ── 套餐分布条 ── */
const planTotal = computed(() => data.value?.planDist.reduce((s, p) => s + p.count, 0) || 1)
const planColors = ['#169b82', '#588bd7', '#dba24c', '#e06c75', '#95a49c', '#b07cc6']

/* ── 专家排行 ── */
const expertMax = computed(() => Math.max(1, ...(data.value?.chatsByExpert.map(e => e.count) || [])))

/* ── 状态 helpers ── */
const orderStatusTag = (s: string) => {
  const map: Record<string, { type: string; text: string }> = { PENDING: { type: 'warning', text: '待支付' }, PAID: { type: 'success', text: '已支付' }, CLOSED: { type: 'info', text: '已关闭' } }
  return map[s] || { type: 'info', text: s }
}
const payChannelText = (c: string) => c === 'WECHAT' ? '微信' : c === 'ALIPAY' ? '支付宝' : c

async function load() {
  loading.value = true
  try { data.value = await dashboard() } finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <!-- 顶部信息栏 -->
    <div class="dash-header">
      <div>
        <h2 class="dash-title">控制台总览</h2>
        <p class="dash-subtitle">{{ data?.source || (USE_MOCK ? 'Mock 数据' : '等待API') }}</p>
      </div>
      <el-button @click="load" :icon="TrendCharts">刷新数据</el-button>
    </div>

    <!-- KPI 卡片 -->
    <el-row :gutter="16" class="kpi-row">
      <el-col v-for="card in kpiCards" :key="card.label" :xs="12" :sm="12" :md="6">
        <div class="kpi-card" :style="{ borderLeftColor: card.color }">
          <div class="kpi-icon" :style="{ background: card.bg, color: card.color }">
            <el-icon :size="22"><component :is="card.icon" /></el-icon>
          </div>
          <div class="kpi-body">
            <div class="kpi-label">{{ card.label }}</div>
            <div class="kpi-value">{{ card.value }}</div>
            <div class="kpi-sub">
              {{ card.sub }}
              <span v-if="card.trend > 0" class="kpi-trend up">+{{ card.trend }}</span>
              <span v-else-if="card.trend < 0" class="kpi-trend down">{{ card.trend }}</span>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 资源统计小卡片 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col v-for="rc in resourceCards" :key="rc.label" :span="8">
        <div class="resource-card">
          <span class="resource-dot" :style="{ background: rc.color }"></span>
          <span class="resource-label">{{ rc.label }}</span>
          <strong class="resource-value">{{ rc.value }}</strong>
        </div>
      </el-col>
    </el-row>

    <!-- 第二行：订单状态 + 套餐分布 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="12">
        <div class="dash-card">
          <h3 class="dash-card-title">
            <el-icon><ShoppingCart /></el-icon> 订单状态分布
          </h3>
          <div class="order-status-list">
            <div v-for="os in orderStatuses" :key="os.label" class="order-status-item">
              <div class="os-header">
                <span class="os-dot" :style="{ background: os.color }"></span>
                <span class="os-label">{{ os.label }}</span>
                <span class="os-value">{{ os.value }}</span>
                <span class="os-pct">{{ os.pct }}%</span>
              </div>
              <div class="os-bar-bg">
                <div class="os-bar-fill" :style="{ width: os.pct + '%', background: os.color }"></div>
              </div>
            </div>
          </div>
          <div class="order-summary">
            <span>渠道：微信 <b>{{ data?.orderWechat || 0 }}</b> · 支付宝 <b>{{ data?.orderAlipay || 0 }}</b></span>
          </div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="dash-card">
          <h3 class="dash-card-title">
            <el-icon><User /></el-icon> 用户套餐分布
          </h3>
          <div v-if="data?.planDist.length" class="plan-dist">
            <div v-for="(p, i) in data.planDist" :key="p.name" class="plan-item">
              <div class="plan-header">
                <span class="plan-name">{{ p.name }}</span>
                <span class="plan-count">{{ p.count }} 人</span>
                <span class="plan-pct">{{ Math.round(p.count / planTotal * 100) }}%</span>
              </div>
              <div class="plan-bar-bg">
                <div class="plan-bar-fill" :style="{ width: (p.count / planTotal * 100) + '%', background: planColors[i % planColors.length] }"></div>
              </div>
            </div>
          </div>
          <el-empty v-else description="暂无数据" :image-size="60" />
        </div>
      </el-col>
    </el-row>

    <!-- 第三行：趋势图 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="24">
        <div class="dash-card">
          <h3 class="dash-card-title">
            <el-icon><TrendCharts /></el-icon> 近七日趋势
          </h3>
          <div class="trend-legend">
            <span class="legend-item"><span class="legend-dot" style="background:#169b82"></span>新增用户</span>
            <span class="legend-item"><span class="legend-dot" style="background:#588bd7"></span>新增订单</span>
            <span class="legend-item"><span class="legend-dot" style="background:#dba24c"></span>新增会话</span>
          </div>
          <svg v-if="data" ref="svgRef" viewBox="0 0 700 220" class="trend-svg" @mousemove="onChartMouseMove" @mouseleave="onChartMouseLeave">
            <defs>
              <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#169b82" stop-opacity="0.3" /><stop offset="100%" stop-color="#169b82" stop-opacity="0.02" /></linearGradient>
              <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#588bd7" stop-opacity="0.25" /><stop offset="100%" stop-color="#588bd7" stop-opacity="0.02" /></linearGradient>
              <linearGradient id="gradChats" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#dba24c" stop-opacity="0.25" /><stop offset="100%" stop-color="#dba24c" stop-opacity="0.02" /></linearGradient>
              <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.12" /></filter>
            </defs>
            <!-- 网格线 -->
            <line v-for="(_, i) in yTicks" :key="'g'+i" :x1="CHART_LEFT" :x2="CHART_RIGHT" :y1="CHART_TOP + i * (CHART_H / 4)" :y2="CHART_TOP + i * (CHART_H / 4)" stroke="#edf1ee" stroke-width="1" />
            <!-- Y 轴标签 -->
            <text v-for="(tick, i) in yTicks" :key="'y'+i" :x="CHART_LEFT - 8" :y="CHART_TOP + i * (CHART_H / 4) + 4" text-anchor="end" font-size="11" fill="#95a49c">{{ tick }}</text>
            <!-- 面积 -->
            <path :d="smoothArea('users')" fill="url(#gradUsers)" />
            <path :d="smoothArea('orders')" fill="url(#gradOrders)" />
            <path :d="smoothArea('chats')" fill="url(#gradChats)" />
            <!-- 折线 -->
            <path v-for="(key, i) in (['users', 'orders', 'chats'] as const)" :key="key" :d="smoothPath(key)" fill="none" :stroke="['#169b82', '#588bd7', '#dba24c'][i]" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            <!-- 数据点 -->
            <template v-for="(key, i) in (['users', 'orders', 'chats'] as const)">
              <circle v-for="(d, j) in (data?.trend || [])" :key="key + j" :cx="xOf(j)" :cy="yOf(d[key])" r="4" :fill="['#169b82', '#588bd7', '#dba24c'][i]" stroke="#fff" stroke-width="2" class="data-dot" />
            </template>
            <!-- X 轴日期 -->
            <text v-for="(d, i) in (data?.trend || [])" :key="'d'+d.date" :x="xOf(i)" y="200" text-anchor="middle" font-size="11" fill="#6a8074">{{ d.date.slice(5) }}</text>
            <!-- Hover 交互区 -->
            <g v-if="data && hoverIdx !== null">
              <line :x1="hoverX" :x2="hoverX" :y1="CHART_TOP" :y2="CHART_BOTTOM" stroke="#169b82" stroke-width="1" stroke-dasharray="4,3" opacity="0.5" />
              <circle v-for="(key, i) in (['users', 'orders', 'chats'] as const)" :key="'h'+key" :cx="hoverX" :cy="yOf(data.trend[hoverIdx][key])" r="6" :fill="['#169b82', '#588bd7', '#dba24c'][i]" stroke="#fff" stroke-width="2" />
            </g>
            <!-- Tooltip -->
            <g v-if="data && hoverIdx !== null" :transform="`translate(${Math.min(hoverX + 12, 560)}, ${CHART_TOP})`">
              <rect x="0" y="0" width="120" height="80" rx="6" fill="#fff" filter="url(#shadow)" stroke="#e4eae6" stroke-width="1" />
              <text x="10" y="18" font-size="11" fill="#829087">{{ data.trend[hoverIdx].date.slice(5) }}</text>
              <circle cx="14" cy="34" r="4" fill="#169b82" /><text x="24" y="38" font-size="11" fill="#35463e">用户 {{ data.trend[hoverIdx].users }}</text>
              <circle cx="14" cy="52" r="4" fill="#588bd7" /><text x="24" y="56" font-size="11" fill="#35463e">订单 {{ data.trend[hoverIdx].orders }}</text>
              <circle cx="14" cy="70" r="4" fill="#dba24c" /><text x="24" y="74" font-size="11" fill="#35463e">会话 {{ data.trend[hoverIdx].chats }}</text>
            </g>
          </svg>
          <!-- 趋势数据表 -->
          <el-table v-if="data" :data="data.trend" size="small" style="margin-top:12px">
            <el-table-column prop="date" label="日期" width="120" />
            <el-table-column prop="users" label="新增用户" align="center">
              <template #default="{ row }"><span style="color:#169b82;font-weight:500">{{ row.users }}</span></template>
            </el-table-column>
            <el-table-column prop="orders" label="新增订单" align="center">
              <template #default="{ row }"><span style="color:#588bd7;font-weight:500">{{ row.orders }}</span></template>
            </el-table-column>
            <el-table-column prop="chats" label="新增会话" align="center">
              <template #default="{ row }"><span style="color:#dba24c;font-weight:500">{{ row.chats }}</span></template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>

    <!-- 第四行：专家排行 + AI 对话概览 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="12">
        <div class="dash-card">
          <h3 class="dash-card-title">
            <el-icon><ChatDotRound /></el-icon> 各专家会话量
          </h3>
          <div v-if="data?.chatsByExpert.length" class="expert-rank">
            <div v-for="(e, i) in data.chatsByExpert" :key="e.name" class="expert-item">
              <span class="expert-rank-no" :class="{ top: i < 3 }">{{ i + 1 }}</span>
              <span class="expert-name">{{ e.name }}</span>
              <div class="expert-bar-bg">
                <div class="expert-bar-fill" :style="{ width: (e.count / expertMax * 100) + '%' }"></div>
              </div>
              <span class="expert-count">{{ e.count }}</span>
            </div>
          </div>
          <el-empty v-else description="暂无会话数据" :image-size="60" />
        </div>
      </el-col>
      <el-col :span="12">
        <div class="dash-card">
          <h3 class="dash-card-title">
            <el-icon><ChatDotRound /></el-icon> AI 对话概览
          </h3>
          <div class="chat-overview">
            <div class="chat-stat">
              <div class="chat-stat-value" style="color:#169b82">{{ data?.chatTotal || 0 }}</div>
              <div class="chat-stat-label">总会话数</div>
            </div>
            <div class="chat-stat">
              <div class="chat-stat-value" style="color:#588bd7">{{ data?.chatToday || 0 }}</div>
              <div class="chat-stat-label">今日新增</div>
            </div>
            <div class="chat-stat">
              <div class="chat-stat-value" style="color:#dba24c">{{ data?.chatMessages || 0 }}</div>
              <div class="chat-stat-label">总消息数</div>
            </div>
            <div class="chat-stat">
              <div class="chat-stat-value" style="color:#e06c75">{{ data?.chatsByExpert.length || 0 }}</div>
              <div class="chat-stat-label">参与专家</div>
            </div>
          </div>
          <div class="chat-avg" v-if="data && data.chatTotal > 0">
            <span>平均每会话 <b>{{ (data.chatMessages / data.chatTotal).toFixed(1) }}</b> 条消息</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 第五行：最近用户 + 最近订单 -->
    <el-row :gutter="16">
      <el-col :span="12">
        <div class="dash-card">
          <h3 class="dash-card-title">
            <el-icon><Clock /></el-icon> 最近注册用户
          </h3>
          <el-table v-if="data" :data="data.recentUsers" size="small">
            <el-table-column prop="nickname" label="昵称" min-width="100" />
            <el-table-column prop="planName" label="套餐" min-width="100" />
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small" effect="light">
                  {{ row.status === 1 ? '正常' : '封禁' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="registeredAt" label="注册时间" min-width="150">
              <template #default="{ row }">{{ row.registeredAt.replace('T', ' ').slice(0, 16) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="dash-card">
          <h3 class="dash-card-title">
            <el-icon><ShoppingCart /></el-icon> 最近订单
          </h3>
          <el-table v-if="data" :data="data.recentOrders" size="small">
            <el-table-column prop="orderNo" label="订单号" min-width="130">
              <template #default="{ row }">{{ row.orderNo.slice(0, 12) }}...</template>
            </el-table-column>
            <el-table-column prop="nickname" label="用户" min-width="80" />
            <el-table-column prop="planName" label="套餐" min-width="90" />
            <el-table-column label="金额" width="90" align="right">
              <template #default="{ row }"><span style="font-weight:600">¥{{ row.amount.toFixed(2) }}</span></template>
            </el-table-column>
            <el-table-column label="状态" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="orderStatusTag(row.status).type as any" size="small" effect="light">{{ orderStatusTag(row.status).text }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="渠道" width="70" align="center">
              <template #default="{ row }">{{ payChannelText(row.payChannel) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.dashboard { padding: 0; }

/* ── 顶部 ── */
.dash-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.dash-title { margin: 0; font-size: 20px; font-weight: 600; color: #243d30; }
.dash-subtitle { margin: 4px 0 0; font-size: 12px; color: #95a49c; }

/* ── KPI 卡片 ── */
.kpi-row { margin-bottom: 0; }
.kpi-card {
  display: flex; align-items: flex-start; gap: 14px;
  background: #fff; border: 1px solid #e4eae6; border-left: 4px solid;
  border-radius: 10px; padding: 18px 16px; margin-bottom: 16px;
  box-shadow: 0 2px 5px rgba(31,62,46,0.03);
  transition: box-shadow 0.2s, transform 0.2s;
}
.kpi-card:hover { box-shadow: 0 4px 12px rgba(31,62,46,0.08); transform: translateY(-1px); }
.kpi-icon { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0; }
.kpi-body { flex: 1; min-width: 0; }
.kpi-label { font-size: 12px; color: #829087; margin-bottom: 4px; }
.kpi-value { font-size: 26px; font-weight: 700; color: #243d30; line-height: 1.2; }
.kpi-sub { font-size: 11px; color: #95a49c; margin-top: 4px; display: flex; align-items: center; gap: 6px; }
.kpi-trend { font-weight: 600; font-size: 11px; padding: 1px 5px; border-radius: 3px; }
.kpi-trend.up { color: #169b82; background: #ebf7f3; }
.kpi-trend.down { color: #e06c75; background: #fceced; }

/* ── 资源卡片 ── */
.resource-card {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1px solid #e4eae6; border-radius: 10px;
  padding: 14px 16px; box-shadow: 0 2px 5px rgba(31,62,46,0.03);
}
.resource-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.resource-label { font-size: 13px; color: #829087; }
.resource-value { margin-left: auto; font-size: 20px; font-weight: 700; color: #243d30; }

/* ── 通用卡片 ── */
.dash-card {
  background: #fff; border: 1px solid #e4eae6; border-radius: 10px;
  padding: 20px; box-shadow: 0 2px 5px rgba(31,62,46,0.03); margin-bottom: 0;
}
.dash-card-title { margin: 0 0 16px; font-size: 14px; font-weight: 600; color: #243d30; display: flex; align-items: center; gap: 6px; }
.dash-card-title .el-icon { color: #169b82; }

/* ── 订单状态 ── */
.order-status-list { display: flex; flex-direction: column; gap: 12px; }
.order-status-item .os-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.os-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.os-label { font-size: 13px; color: #52665b; flex: 1; }
.os-value { font-size: 14px; font-weight: 600; color: #243d30; min-width: 30px; text-align: right; }
.os-pct { font-size: 11px; color: #95a49c; min-width: 36px; text-align: right; }
.os-bar-bg { height: 6px; background: #f3f5f4; border-radius: 3px; overflow: hidden; }
.os-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }
.order-summary { margin-top: 14px; padding-top: 12px; border-top: 1px solid #edf1ee; font-size: 12px; color: #829087; }
.order-summary b { color: #52665b; }

/* ── 套餐分布 ── */
.plan-dist { display: flex; flex-direction: column; gap: 12px; }
.plan-item .plan-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.plan-name { font-size: 13px; color: #52665b; flex: 1; }
.plan-count { font-size: 13px; font-weight: 600; color: #243d30; }
.plan-pct { font-size: 11px; color: #95a49c; min-width: 36px; text-align: right; }
.plan-bar-bg { height: 6px; background: #f3f5f4; border-radius: 3px; overflow: hidden; }
.plan-bar-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease; }

/* ── 趋势图 ── */
.trend-legend { display: flex; gap: 20px; margin-bottom: 12px; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #829087; }
.legend-dot { width: 10px; height: 10px; border-radius: 50%; }
.trend-svg { width: 100%; max-height: 280px; cursor: crosshair; }
.data-dot { transition: r 0.15s ease; }
.data-dot:hover { r: 6; }

/* ── 专家排行 ── */
.expert-rank { display: flex; flex-direction: column; gap: 10px; }
.expert-item { display: flex; align-items: center; gap: 10px; }
.expert-rank-no { width: 22px; height: 22px; border-radius: 50%; background: #f3f5f4; color: #829087; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.expert-rank-no.top { background: #ebf7f3; color: #169b82; }
.expert-name { font-size: 13px; color: #52665b; width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.expert-bar-bg { flex: 1; height: 8px; background: #f3f5f4; border-radius: 4px; overflow: hidden; }
.expert-bar-fill { height: 100%; background: linear-gradient(90deg, #169b82, #5bb9a5); border-radius: 4px; transition: width 0.5s ease; }
.expert-count { font-size: 13px; font-weight: 600; color: #243d30; min-width: 28px; text-align: right; }

/* ── AI 对话概览 ── */
.chat-overview { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.chat-stat { text-align: center; padding: 16px 8px; background: #f9fbfa; border-radius: 8px; }
.chat-stat-value { font-size: 28px; font-weight: 700; line-height: 1.2; }
.chat-stat-label { font-size: 12px; color: #829087; margin-top: 4px; }
.chat-avg { margin-top: 14px; padding-top: 12px; border-top: 1px solid #edf1ee; font-size: 12px; color: #829087; text-align: center; }
.chat-avg b { color: #169b82; }
</style>
