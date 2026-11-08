<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import ProTable from '@/components/ProTable.vue'
import StatusTag from '@/components/StatusTag.vue'
import { createGiftOrder, createManualOrder, exportOrders, listOrders, updateOrderPrice, updateOrderRemark } from '@/api/order'
import { listConfig } from '@/api/config'
import type { ConfigItem } from '@/api/config'
import type { OrderItem, OrderQuery, ProTableHandle } from '@/api/types'
import { formatAmount, formatDateTime, formatOrderExpiry, formatOrderDuration, isValidMoney } from '@/utils/format'
import { promptText } from '@/utils/feedback'
import { useAuthStore } from '@/stores/auth'
import OrderDetailDrawer from './OrderDetailDrawer.vue'

const now = ref(Date.now())
const expiryTimer = window.setInterval(() => { now.value = Date.now() }, 60_000)
onUnmounted(() => window.clearInterval(expiryTimer))
const auth = useAuthStore()
const tableRef = ref<ProTableHandle | null>(null)
const optionalColumns = [
  { key: 'expiry', label: '到期状态 / 时间' }, { key: 'credits', label: '剩余积分' },
  { key: 'duration', label: '套餐时长' }, { key: 'usage', label: '近7日消耗' },
  { key: 'goods', label: '商品金额' }, { key: 'discount', label: '优惠金额' },
  { key: 'paidAt', label: '支付时间' }, { key: 'createdAt', label: '下单时间' }, { key: 'remark', label: '备注' }
]
const selectedColumns = ref<string[]>([])

const filter = reactive<{ orderNo: string; userId: string; status: string; payChannel: string; dateRange: string[] }>({
  orderNo: '',
  userId: '',
  status: '',
  payChannel: '',
  dateRange: []
})

async function fetcher(query: { page: number; pageSize: number } & Record<string, unknown>) {
  return listOrders(query as OrderQuery)
}

function buildQuery(): Record<string, unknown> {
  return {
    orderNo: filter.orderNo.trim(),
    userId: filter.userId.trim(),
    status: filter.status,
    payChannel: filter.payChannel,
    start: filter.dateRange?.[0] ?? '',
    end: filter.dateRange?.[1] ?? ''
  }
}

function handleSearch() {
  tableRef.value?.search(buildQuery())
}

function handleReset() {
  filter.orderNo = ''
  filter.userId = ''
  filter.status = ''
  filter.payChannel = ''
  filter.dateRange = []
  handleSearch()
}

async function handleExport() {
  await exportOrders(buildQuery())
  ElMessage.success('导出成功')
}

// -------------------------------------------------- 详情抽屉
const detailVisible = ref(false)
const detailOrderId = ref<number | null>(null)

function openDetail(row: OrderItem) {
  detailOrderId.value = row.id
  detailVisible.value = true
}

// -------------------------------------------------- 备注
async function handleRemark(row: OrderItem) {
  const value = await promptText('备注内容将留痕于审计日志', '订单备注', {
    inputValue: row.remark || '',
    placeholder: '请输入备注'
  })
  if (value === null) return
  if (!auth.hasPerm('order:remark')) {
    ElMessage.warning('无权限执行该操作')
    return
  }
  await updateOrderRemark(row.id, value.trim())
  ElMessage.success('备注已保存')
  tableRef.value?.refresh()
}

// 待支付线上订单改价：提交时重新读取状态并由服务端校验原应付金额
const priceVisible = ref(false)
const priceSubmitting = ref(false)
const priceOrder = ref<OrderItem | null>(null)
const priceForm = reactive({ amount: null as number | null, reason: '' })
function openPrice(row: OrderItem) {
  priceOrder.value = row
  priceForm.amount = row.amount
  priceForm.reason = ''
  priceVisible.value = true
}
async function submitPrice() {
  const row = priceOrder.value
  const amount = priceForm.amount
  if (!row || priceSubmitting.value) return
  if (amount === null || !Number.isFinite(amount) || amount < 0 || amount > row.goodsAmount || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
    ElMessage.warning('请输入 0 至商品金额之间的应付金额，最多两位小数')
    return
  }
  if (amount === row.amount) { ElMessage.warning('新价格须与当前应付金额不同'); return }
  const reason = priceForm.reason.trim()
  if (!reason) { ElMessage.warning('请填写改价原因'); return }
  priceSubmitting.value = true
  try {
    await updateOrderPrice(row.id, amount, row.amount, reason)
    priceVisible.value = false
    tableRef.value?.refresh()
    ElMessage.success('改价成功，已记录审计')
  } finally {
    priceSubmitting.value = false
  }
}

/** v11 订单来源中文标签与标签色 */
const ORDER_SOURCE_LABELS: Record<string, string> = { ONLINE: '线上订单', MANUAL: '手工订单', GIFT: '赠送订单' }
const ORDER_SOURCE_TAG_TYPES: Record<string, 'info' | 'warning' | 'success'> = { ONLINE: 'info', MANUAL: 'warning', GIFT: 'success' }

// -------------------------------------------------- 创建手工订单 / 创建赠送订单（v11，与套餐管理联动）
const plans = ref<ConfigItem[]>([])

async function loadPlans() {
  plans.value = await listConfig('plans')
}
const normalPlans = computed(() => plans.value.filter((p) => (p.planType || 'NORMAL') === 'NORMAL' && p.status === 1))
const giftPlans = computed(() => plans.value.filter((p) => p.planType === 'GIFT' && p.status === 1))

const manualVisible = ref(false)
const manualSubmitting = ref(false)
/** v21 手工单支持月/年周期：金额默认带对应周期售价或首购价（首购价配置时优先），时长按周期写入 */
const manualForm = reactive({ phone: '', planId: null as number | null, cycle: 'MONTHLY' as 'MONTHLY' | 'YEARLY', useFirstPurchase: false, credits: 0, amount: null as number | null | undefined })
const manualPlanSelected = computed(() => normalPlans.value.find((p) => p.id === manualForm.planId) || null)
const manualCycleMeta = computed(() => {
  const plan = manualPlanSelected.value
  const cycle = manualForm.cycle
  const configured = plan?.billingCycles?.find((c) => c.cycle === cycle)
  const hasCycle = Boolean(configured && Number.isFinite(Number(configured.price)))
  const listPrice = hasCycle ? Number(configured!.price) : cycle === 'MONTHLY' ? Number(plan?.price ?? 0) : Number(plan?.price ?? 0) * 12
  const first = configured?.firstPurchasePrice
  const firstPrice = typeof first === 'number' ? first : cycle === 'MONTHLY' && typeof plan?.firstPurchasePrice === 'number' ? plan.firstPurchasePrice : undefined
  const hasFirst = typeof firstPrice === 'number'
  // 周期时长：月付按套餐基础天数，年付按 365 天（与规则文档场景 15/23 的"年=365×24h"口径一致）
  const baseDays = Number(plan?.durationDays ?? 30) || 30
  const durationDays = cycle === 'YEARLY' ? 365 : baseDays
  return { hasCycle, listPrice, hasFirst, firstPrice: hasFirst ? firstPrice : undefined, durationDays }
})
/** 金额联动：优先首购价（可勾选关闭），否则周期售价；仅当用户未手动改过金额时自动带出 */
const manualAmountTouched = ref(false)
watch(
  () => [manualForm.planId, manualForm.cycle, manualForm.useFirstPurchase] as const,
  () => {
    const meta = manualCycleMeta.value
    manualForm.credits = Number(manualPlanSelected.value?.credits ?? 0)
    if (!manualAmountTouched.value) manualForm.amount = manualForm.useFirstPurchase && meta.hasFirst ? meta.firstPrice : meta.listPrice
  },
  { flush: 'sync' }
)
watch(() => manualForm.amount, () => { manualAmountTouched.value = true })

async function openManual() {
  await loadPlans()
  if (!normalPlans.value.length) {
    ElMessage.warning('暂无可用的常规套餐，请先在套餐管理创建')
    return
  }
  manualForm.phone = ''
  manualForm.planId = null
  manualForm.cycle = 'MONTHLY'
  manualForm.useFirstPurchase = false
  manualForm.credits = 0
  manualForm.amount = null
  manualAmountTouched.value = false
  manualVisible.value = true
}

async function submitManual() {
  if (!manualForm.phone.trim()) {
    ElMessage.warning('请输入用户手机号')
    return
  }
  if (!manualPlanSelected.value) {
    ElMessage.warning('请选择套餐')
    return
  }
  if (!isValidMoney(manualForm.amount)) {
    ElMessage.warning('请填写支付金额，支持明确 0 元且最多两位小数')
    return
  }
  if (manualSubmitting.value) return
  manualSubmitting.value = true
  try {
    await createManualOrder({
      phone: manualForm.phone.trim(),
      planId: manualPlanSelected.value.id,
      cycle: manualForm.cycle,
      useFirstPurchase: manualForm.useFirstPurchase,
      credits: Number(manualPlanSelected.value.credits ?? 0),
      amount: manualForm.amount
    })
    ElMessage.success('手工订单创建成功')
    manualVisible.value = false
    tableRef.value?.refresh()
  } catch {
    // 手机号/套餐校验失败已由 request 拦截器透出
  } finally {
    manualSubmitting.value = false
  }
}

const giftVisible = ref(false)
const giftSubmitting = ref(false)
const giftForm = reactive({ phone: '', planId: null as number | null, durationMonths: 1 as number | null, credits: 10000, remark: '' })
const giftPlanSelected = computed(() => giftPlans.value.find((p) => p.id === giftForm.planId) || null)

/** 赠送时长与套餐联动：套餐「长期有效」(durationDays=0) 时锁定不可改，否则默认 N 个月（可在 1-36 内调整） */
watch(
  () => giftForm.planId,
  () => {
    const plan = giftPlanSelected.value
    if (!plan) return
    giftForm.durationMonths = plan.durationMode === 'MEMBERSHIP' ? null : Number(plan.durationDays) === 0 ? 0 : Math.max(1, Math.ceil(Number(plan.durationDays || 30) / 30))
  }
)

async function openGift() {
  if (!auth.hasPerm('order:gift')) { ElMessage.warning('需要独立的特批赠送权限'); return }
  await loadPlans()
  if (!giftPlans.value.length) {
    ElMessage.warning('暂无赠送套餐，请先在套餐管理创建套餐类型为「赠送」的套餐')
    return
  }
  giftForm.phone = ''
  giftForm.planId = null
  giftForm.durationMonths = 1
  giftForm.credits = 10000
  giftForm.remark = ''
  giftVisible.value = true
}

async function submitGift() {
  if (!auth.hasPerm('order:gift')) { ElMessage.warning('需要独立的特批赠送权限'); return }
  if (!giftForm.remark.trim()) { ElMessage.warning('请填写特批赠送原因，操作需审计留痕'); return }
  if (!Number.isSafeInteger(giftForm.credits) || giftForm.credits < 0) { ElMessage.warning('赠送积分须为非负整数'); return }
  if (!giftForm.phone.trim()) {
    ElMessage.warning('请输入用户手机号')
    return
  }
  if (!giftForm.planId) {
    ElMessage.warning('请选择赠送套餐')
    return
  }
  if (giftPlanSelected.value?.durationMode !== 'MEMBERSHIP' && (giftForm.durationMonths === null || giftForm.durationMonths < 0)) {
    ElMessage.warning('请选择赠送时长')
    return
  }
  if (giftForm.remark.length > 200) {
    ElMessage.warning('备注最多 200 字')
    return
  }
  if (giftSubmitting.value) return
  giftSubmitting.value = true
  try {
    await createGiftOrder({
      phone: giftForm.phone.trim(),
      planId: giftForm.planId,
      durationMonths: giftForm.durationMonths,
      credits: giftForm.credits,
      remark: giftForm.remark.trim()
    })
    ElMessage.success('赠送订单创建成功')
    giftVisible.value = false
    tableRef.value?.refresh()
  } catch {
    // 手机号/套餐/备注校验失败已由 request 拦截器透出
  } finally {
    giftSubmitting.value = false
  }
}


</script>

<template>
  <div class="page">
    <div class="page-card">
      <ProTable ref="tableRef" :fetcher="fetcher">
        <template #filter>
          <el-form inline @submit.prevent>
            <el-form-item label="订单号">
              <el-input
                v-model="filter.orderNo"
                placeholder="请输入订单号"
                clearable
                style="width: 190px"
                @keyup.enter="handleSearch"
                @clear="handleSearch"
              />
            </el-form-item>
            <el-form-item label="用户ID">
              <el-input v-model="filter.userId" placeholder="用户ID" clearable style="width: 110px" @keyup.enter="handleSearch" />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filter.status" style="width: 120px" @change="handleSearch">
                <el-option label="全部" value="" />
                <el-option label="待支付" value="PENDING" />
                <el-option label="已支付" value="PAID" />
                <el-option label="已关闭" value="CLOSED" />
              </el-select>
            </el-form-item>
            <el-form-item label="渠道">
              <el-select v-model="filter.payChannel" style="width: 120px" @change="handleSearch">
                <el-option label="全部" value="" />
                <el-option label="微信支付" value="WECHAT" />
                <el-option label="支付宝" value="ALIPAY" />
                <el-option label="线下录入" value="OFFLINE" />
              </el-select>
            </el-form-item>
            <el-form-item label="下单时间">
              <el-date-picker
                v-model="filter.dateRange"
                type="daterange"
                value-format="YYYY-MM-DD"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                style="width: 260px"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
              <el-button v-perm="'order:export'" @click="handleExport">导出 XLSX</el-button>
              <el-button v-perm="'order:create'" type="primary" plain @click="openManual">创建手工订单</el-button>
              <el-button v-perm="'order:gift'" type="success" plain @click="openGift">运营特批赠送</el-button>
              <el-popover trigger="click" width="240">
                <template #reference><el-button>列设置</el-button></template>
                <p>关键列固定显示，可选信息也可在详情查看。</p>
                <el-checkbox-group v-model="selectedColumns">
                  <el-checkbox v-for="column in optionalColumns" :key="column.key" :value="column.key">{{ column.label }}</el-checkbox>
                </el-checkbox-group>
              </el-popover>
            </el-form-item>
          </el-form>
        </template>

        <el-table-column prop="orderNo" label="订单号" min-width="160" show-overflow-tooltip />
        <el-table-column label="用户" min-width="145" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.phone || row.wechatNickname || '—' }}</div>
            <small>ID: {{ row.userId }}</small>
          </template>
        </el-table-column>
        <el-table-column prop="planName" label="商品" min-width="100" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }"><StatusTag kind="order" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="应付 / 成交金额" width="135">
          <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="订单来源" width="100">
          <template #default="{ row }">
            <el-tag :type="ORDER_SOURCE_TAG_TYPES[row.source] ?? 'info'" size="small" disable-transitions>
              {{ ORDER_SOURCE_LABELS[row.source] ?? row.source }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column v-if="selectedColumns.includes('expiry')" label="到期状态 / 时间" width="185">
          <template #default="{ row }">
            <el-tag :type="formatOrderExpiry(row, now).type" size="small" disable-transitions>{{ formatOrderExpiry(row, now).text }}</el-tag>
            <div>{{ formatOrderExpiry(row, now).time }}</div>
          </template>
        </el-table-column>
        <el-table-column v-if="selectedColumns.includes('credits')" prop="remainingCredits" label="剩余积分" width="100" />
        <el-table-column v-if="selectedColumns.includes('duration')" label="套餐时长" width="110">
          <template #default="{ row }">{{ formatOrderDuration(row) }}</template>
        </el-table-column>
        <el-table-column v-if="selectedColumns.includes('usage')" prop="last7DaysUsage" label="近7日消耗" width="110" />
        <el-table-column v-if="selectedColumns.includes('goods')" label="商品金额" width="110">
          <template #default="{ row }">{{ formatAmount(row.goodsAmount) }}</template>
        </el-table-column>
        <el-table-column v-if="selectedColumns.includes('discount')" label="优惠金额" width="110">
          <template #default="{ row }">{{ formatAmount(row.discountAmount) }}</template>
        </el-table-column>
        <el-table-column v-if="selectedColumns.includes('paidAt')" label="支付时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column v-if="selectedColumns.includes('createdAt')" label="下单时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column v-if="selectedColumns.includes('remark')" prop="remark" label="备注" min-width="130" show-overflow-tooltip />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              <el-button v-if="row.source === 'ONLINE' && row.status === 'PENDING'" v-perm="'order:price'" link type="warning" @click="openPrice(row)">改价</el-button>
              <el-button v-perm="'order:remark'" link type="primary" @click="handleRemark(row)">备注</el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <OrderDetailDrawer v-model="detailVisible" :order-id="detailOrderId" :now="now" />

    <el-dialog v-model="priceVisible" title="订单改价" width="460px">
      <el-form label-width="112px" @submit.prevent>
        <el-form-item label="订单号">{{ priceOrder?.orderNo }}</el-form-item>
        <el-form-item label="商品金额">{{ formatAmount(priceOrder?.goodsAmount ?? 0) }}</el-form-item>
        <el-form-item label="原应付金额">{{ formatAmount(priceOrder?.amount ?? 0) }}</el-form-item>
        <el-form-item label="新应付金额" required>
          <el-input-number v-model="priceForm.amount" :min="0" :max="priceOrder?.goodsAmount ?? 0" :precision="2" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="改价原因" required>
          <el-input v-model="priceForm.reason" type="textarea" :rows="2" maxlength="200" show-word-limit placeholder="填写本次改价原因（审计留痕）" />
        </el-form-item>
        <el-form-item label=" "><span class="muted">仅线上待支付、尚未生成支付流水的订单可改价；优惠金额将根据商品金额重新计算。已支付订单不可改价。</span></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="priceVisible = false">取消</el-button>
        <el-button type="primary" :loading="priceSubmitting" @click="submitPrice">确认改价</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="manualVisible" title="创建手工订单" width="460px">
      <el-form label-width="100px" @submit.prevent>
        <el-form-item label="手机号" required>
          <el-input v-model="manualForm.phone" placeholder="请输入用户手机号，如 138****5678" />
        </el-form-item>
        <el-form-item label="选择套餐" required>
          <el-select v-model="manualForm.planId" placeholder="请选择套餐" style="width: 100%">
            <el-option v-for="p in normalPlans" :key="p.id" :label="`${p.name}（¥${p.price ?? 0}/月${p.billingCycles?.some(c => c.cycle === 'YEARLY') ? ` · ¥${p.billingCycles.find(c => c.cycle === 'YEARLY')!.price}/年` : ''}）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="计费周期" required>
          <el-radio-group v-model="manualForm.cycle">
            <el-radio-button value="MONTHLY">月付</el-radio-button>
            <el-radio-button value="YEARLY" :disabled="!manualPlanSelected?.billingCycles?.some(c => c.cycle === 'YEARLY' && Number.isFinite(Number(c.price)))">年付</el-radio-button>
          </el-radio-group>
          <p v-if="manualForm.cycle === 'YEARLY' && !manualPlanSelected?.billingCycles?.some(c => c.cycle === 'YEARLY')" class="muted" style="margin: 6px 0 0; font-size: 12px">该套餐未配置年付周期，请先在套餐管理添加</p>
        </el-form-item>
        <el-form-item v-if="manualCycleMeta.hasFirst" label="首购价">
          <el-checkbox v-model="manualForm.useFirstPurchase">按首购价 ¥{{ manualCycleMeta.firstPrice }} 结算（该用户首次购买本套餐时适用）</el-checkbox>
        </el-form-item>
        <el-form-item label="AI积分" required>
          <div style="width: 100%">
            <el-input-number v-model="manualForm.credits" :min="0" :step="1000" disabled style="width: 100%" />
            <p class="muted" style="margin: 6px 0 0; font-size: 12px">积分来自当前套餐，不可修改；支付金额可调整；时长按 {{ manualForm.cycle === 'YEARLY' ? '365 天' : `${manualCycleMeta.durationDays} 天` }} 记录</p>
          </div>
        </el-form-item>
        <el-form-item label="支付金额(元)" required>
          <!-- v17 允许 0 元：线下赠送 / 减免场景 -->
          <div style="width: 100%">
            <el-input-number v-model="manualForm.amount" :min="0" :precision="2" :step="100" style="width: 100%" />
            <p class="muted" style="margin: 6px 0 0; font-size: 12px">明确填写 0 表示本次实收为零；留空不可提交。运营赠送请使用独立的特批赠送入口</p>
          </div>
        </el-form-item>
        <el-form-item label=" ">
          <span class="muted">手工订单渠道记为「线下录入」，生成对应支付流水，请核实到账后再操作</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="manualVisible = false">取消</el-button>
        <el-button type="primary" :loading="manualSubmitting" @click="submitManual">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="giftVisible" title="运营特批赠送" width="460px">
      <el-form label-width="100px" @submit.prevent>
        <el-form-item label="手机号" required>
          <el-input v-model="giftForm.phone" placeholder="请输入用户手机号，如 138****5678" />
        </el-form-item>
        <el-form-item label="选择套餐" required>
          <el-select v-model="giftForm.planId" placeholder="请选择赠送套餐" style="width: 100%">
            <el-option v-for="p in giftPlans" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="赠送时长" required>
          <el-input v-if="giftPlanSelected?.durationMode === 'MEMBERSHIP'" model-value="会员期内有效" disabled />
          <el-input v-else-if="giftPlanSelected && Number(giftPlanSelected.durationDays) === 0" model-value="长期有效" disabled />
          <el-select v-else v-model="giftForm.durationMonths" placeholder="请选择赠送时长" style="width: 100%">
            <el-option v-for="m in 36" :key="m" :label="`${m}个月`" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="赠送AI积分" required>
          <el-input-number v-model="giftForm.credits" :min="0" :step="1000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="特批原因" required>
          <el-input
            v-model="giftForm.remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="必填，说明特批依据（审计留痕，最多 200 字）"
          />
        </el-form-item>
        <el-form-item label=" ">
          <span class="muted">独立运营操作，需特批赠送权限、必填原因并记录审计；金额为 0、不产生支付流水，不作为常规购买促销。常规赠分仅注册 100 分</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="giftVisible = false">取消</el-button>
        <el-button type="primary" :loading="giftSubmitting" @click="submitGift">确认赠送</el-button>
      </template>
    </el-dialog>
  </div>
</template>
