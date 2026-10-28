<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

import ProTable from '@/components/ProTable.vue'
import StatusTag from '@/components/StatusTag.vue'
import { exportOrders, listOrders, refundOrder, updateOrderRemark } from '@/api/order'
import type { OrderItem, OrderQuery, ProTableHandle } from '@/api/types'
import { formatAmount, formatDateTime } from '@/utils/format'
import { confirmAction, promptText } from '@/utils/feedback'
import { useAuthStore } from '@/stores/auth'
import OrderDetailDrawer from './OrderDetailDrawer.vue'

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

// -------------------------------------------------- 退款
const refundVisible = ref(false)
const refundSubmitting = ref(false)
const refundTarget = ref<OrderItem | null>(null)
const refundForm = reactive({ reason: '', amount: 0 })

function openRefund(row: OrderItem) {
  refundTarget.value = row
  refundForm.reason = ''
  refundForm.amount = row.amount
  refundVisible.value = true
}

async function submitRefund() {
  const target = refundTarget.value
  if (!target) return
  if (!refundForm.reason.trim()) {
    ElMessage.warning('请填写退款原因')
    return
  }
  if (refundSubmitting.value) return
  const confirmed = await confirmAction(`确认将订单 ${target.orderNo} 全额退款 ${formatAmount(target.amount)}？原因：${refundForm.reason.trim()}`, '最终退款确认')
  if (!confirmed) return
  refundSubmitting.value = true
  try {
    await refundOrder(target.id, refundForm.reason.trim(), refundForm.amount)
    ElMessage.success('退款成功')
    refundVisible.value = false
    tableRef.value?.refresh()
  } catch {
    // 渠道失败等原因已由 request 拦截器透出
  } finally {
    refundSubmitting.value = false
  }
}

// -------------------------------------------------- 备注
async function handleRemark(row: OrderItem) {
  if (!auth.hasPerm('order:remark')) {
    ElMessage.warning('无权限执行该操作')
    return
  }
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

const CHANNEL_LABELS: Record<string, string> = { WECHAT: '微信支付', ALIPAY: '支付宝' }


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
                <el-option label="已退款" value="REFUNDED" />
                <el-option label="已关闭" value="CLOSED" />
              </el-select>
            </el-form-item>
            <el-form-item label="渠道">
              <el-select v-model="filter.payChannel" style="width: 120px" @change="handleSearch">
                <el-option label="全部" value="" />
                <el-option label="微信支付" value="WECHAT" />
                <el-option label="支付宝" value="ALIPAY" />
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
              <el-button v-perm="'order:export'" @click="handleExport">导出 CSV</el-button>
            </el-form-item>
          </el-form>
        </template>

        <el-table-column prop="orderNo" label="订单号" min-width="160" />
        <el-table-column prop="userId" label="用户ID" width="80" />
        <el-table-column prop="userNickname" label="用户昵称" min-width="120" show-overflow-tooltip />
        <el-table-column prop="planName" label="套餐" width="90" />
        <el-table-column label="金额" width="110">
          <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
        </el-table-column>
        <el-table-column label="渠道" width="100">
          <template #default="{ row }">{{ CHANNEL_LABELS[row.payChannel] ?? row.payChannel }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag kind="order" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="支付时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.paidAt) }}</template>
        </el-table-column>
        <el-table-column label="下单时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              <el-button v-perm="'order:refund'" link type="danger" :disabled="row.status !== 'PAID'" @click="openRefund(row)">
                退款
              </el-button>
              <el-button v-perm="'order:remark'" link type="primary" @click="handleRemark(row)">备注</el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <OrderDetailDrawer v-model="detailVisible" :order-id="detailOrderId" />

    <el-dialog v-model="refundVisible" title="订单退款" width="460px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="订单号">
          <span>{{ refundTarget?.orderNo }}</span>
        </el-form-item>
        <el-form-item label="订单金额">
          <span>{{ refundTarget ? formatAmount(refundTarget.amount) : '-' }}</span>
        </el-form-item>
        <el-form-item label="退款金额" required>
          <strong>{{ formatAmount(refundForm.amount) }}</strong>
          <span class="muted" style="margin-left: 12px">仅支持全额退款</span>
        </el-form-item>
        <el-form-item label="退款原因" required>
          <el-input v-model="refundForm.reason" type="textarea" :rows="2" placeholder="请输入退款原因（必填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">取消</el-button>
        <el-button type="danger" :loading="refundSubmitting" @click="submitRefund">确认退款</el-button>
      </template>
    </el-dialog>
  </div>
</template>
