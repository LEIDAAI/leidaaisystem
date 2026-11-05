<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import ProTable from '@/components/ProTable.vue'
import StatusTag from '@/components/StatusTag.vue'
import { createGiftOrder, createManualOrder, exportOrders, listOrders, updateOrderRemark } from '@/api/order'
import { listConfig } from '@/api/config'
import type { ConfigItem } from '@/api/config'
import type { OrderItem, OrderQuery, ProTableHandle } from '@/api/types'
import { formatAmount, formatDateTime, formatOrderExpiry, formatOrderDuration } from '@/utils/format'
import { promptText } from '@/utils/feedback'
import { useAuthStore } from '@/stores/auth'
import OrderDetailDrawer from './OrderDetailDrawer.vue'

const now = ref(Date.now())
const expiryTimer = window.setInterval(() => { now.value = Date.now() }, 60_000)
onUnmounted(() => window.clearInterval(expiryTimer))
const auth = useAuthStore()
const tableRef = ref<ProTableHandle | null>(null)

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
const manualForm = reactive({ phone: '', planId: null as number | null, credits: 0, amount: 0 })
const manualPlanSelected = computed(() => normalPlans.value.find((p) => p.id === manualForm.planId) || null)
/** R6 手工订单积分锁定为当前套餐积分，金额默认带出售价且可调整 */
watch(
  manualPlanSelected,
  (plan) => {
    manualForm.credits = Number(plan?.credits ?? 0)
    manualForm.amount = Number(plan?.price ?? 0)
  },
  { flush: 'sync' }
)

async function openManual() {
  await loadPlans()
  if (!normalPlans.value.length) {
    ElMessage.warning('暂无可用的常规套餐，请先在套餐管理创建')
    return
  }
  manualForm.phone = ''
  manualForm.planId = null
  manualForm.credits = 0
  manualForm.amount = 0
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
  if (manualForm.amount < 0) {
    ElMessage.warning('支付金额不能为负数')
    return
  }
  if (manualSubmitting.value) return
  manualSubmitting.value = true
  try {
    await createManualOrder({
      phone: manualForm.phone.trim(),
      planId: manualPlanSelected.value.id,
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
    giftForm.durationMonths = plan.durationMode === 'MEMBERSHIP' ? null : Number(plan.durationDays) === 0 ? 0 : Math.max(1, Math.round(Number(plan.durationDays || 30) / 30))
  }
)

async function openGift() {
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
      remark: giftForm.remark.trim() || undefined
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
              <el-button v-perm="'order:create'" type="success" plain @click="openGift">创建赠送订单</el-button>
            </el-form-item>
          </el-form>
        </template>

        <el-table-column prop="orderNo" label="订单号" min-width="160" show-overflow-tooltip />
        <el-table-column prop="userId" label="用户ID" width="80" />
        <el-table-column label="用户手机号" width="140">
          <template #default="{ row }">{{ row.phone || '—' }}</template>
        </el-table-column>
        <el-table-column prop="wechatNickname" label="微信昵称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="planName" label="套餐" width="90" />
        <el-table-column label="订单来源" width="100">
          <template #default="{ row }">
            <el-tag :type="ORDER_SOURCE_TAG_TYPES[row.source] ?? 'info'" size="small" disable-transitions>
              {{ ORDER_SOURCE_LABELS[row.source] ?? row.source }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到期状态" width="150">
          <template #default="{ row }">
            <el-tag :type="formatOrderExpiry(row, now).type" size="small" disable-transitions>{{ formatOrderExpiry(row, now).text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="剩余积分" width="100">
          <template #default="{ row }">{{ row.remainingCredits }}</template>
        </el-table-column>
        <el-table-column label="套餐时长" width="100">
          <template #default="{ row }">{{ formatOrderDuration(row) }}</template>
        </el-table-column>
        <el-table-column label="近7日消耗" width="110">
          <template #default="{ row }">{{ row.last7DaysUsage }}</template>
        </el-table-column>
        <el-table-column label="商品金额" width="110">
          <template #default="{ row }">{{ formatAmount(row.goodsAmount) }}</template>
        </el-table-column>
        <el-table-column label="优惠金额" width="110">
          <template #default="{ row }">{{ formatAmount(row.discountAmount) }}</template>
        </el-table-column>
        <el-table-column label="实付金额" width="110">
          <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag kind="order" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="支付时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column label="下单时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="到期时间" width="180">
          <template #default="{ row }">{{ formatOrderExpiry(row, now).time }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              <el-button v-perm="'order:remark'" link type="primary" @click="handleRemark(row)">备注</el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <OrderDetailDrawer v-model="detailVisible" :order-id="detailOrderId" :now="now" />

    <el-dialog v-model="manualVisible" title="创建手工订单" width="460px">
      <el-form label-width="100px" @submit.prevent>
        <el-form-item label="手机号" required>
          <el-input v-model="manualForm.phone" placeholder="请输入用户手机号，如 138****5678" />
        </el-form-item>
        <el-form-item label="选择套餐" required>
          <el-select v-model="manualForm.planId" placeholder="请选择套餐" style="width: 100%">
            <el-option v-for="p in normalPlans" :key="p.id" :label="`${p.name}（¥${p.price ?? 0}）`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="AI积分" required>
          <div style="width: 100%">
            <el-input-number v-model="manualForm.credits" :min="0" :step="1000" disabled style="width: 100%" />
            <p class="muted" style="margin: 6px 0 0; font-size: 12px">积分来自当前套餐，不可修改；支付金额可调整</p>
          </div>
        </el-form-item>
        <el-form-item label="支付金额(元)" required>
          <!-- v17 允许 0 元：线下赠送 / 减免场景 -->
          <div style="width: 100%">
            <el-input-number v-model="manualForm.amount" :min="0" :precision="2" :step="100" style="width: 100%" />
            <p class="muted" style="margin: 6px 0 0; font-size: 12px">0 元表示线下赠送 / 减免</p>
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

    <el-dialog v-model="giftVisible" title="创建赠送订单" width="460px">
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
        <el-form-item label="备注">
          <el-input
            v-model="giftForm.remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="赠送原因（选填，最多 200 字）"
          />
        </el-form-item>
        <el-form-item label=" ">
          <span class="muted">赠送订单金额为 0、不产生支付流水</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="giftVisible = false">取消</el-button>
        <el-button type="primary" :loading="giftSubmitting" @click="submitGift">确认赠送</el-button>
      </template>
    </el-dialog>
  </div>
</template>
