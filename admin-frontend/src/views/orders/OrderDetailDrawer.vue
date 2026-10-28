<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StatusTag from '@/components/StatusTag.vue'
import { getOrderDetail } from '@/api/order'
import type { OrderDetail } from '@/api/types'
import { formatAmount, formatDateTime, orDash } from '@/utils/format'

interface Props {
  modelValue: boolean
  orderId: number | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loading = ref(false)
const detail = ref<OrderDetail | null>(null)

watch(visible, async (value) => {
  if (!value || props.orderId === null) return
  loading.value = true
  detail.value = null
  try {
    detail.value = await getOrderDetail(props.orderId)
  } finally {
    loading.value = false
  }
})

const CHANNEL_LABELS: Record<string, string> = { WECHAT: '微信支付', ALIPAY: '支付宝' }

const TYPE_LABELS: Record<string, string> = { PAY: '支付', REFUND: '退款' }
</script>

<template>
  <el-drawer v-model="visible" title="订单详情" size="640px" destroy-on-close>
    <div v-loading="loading">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag kind="order" :value="detail.status" />
          </el-descriptions-item>
          <el-descriptions-item label="用户">{{ detail.userNickname }}（ID: {{ detail.userId }}）</el-descriptions-item>
          <el-descriptions-item label="套餐">{{ detail.planName }}</el-descriptions-item>
          <el-descriptions-item label="金额">{{ formatAmount(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="支付渠道">{{ CHANNEL_LABELS[detail.payChannel] ?? detail.payChannel }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDateTime(detail.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="退款时间">{{ formatDateTime(detail.refundedAt) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ orDash(detail.remark) }}</el-descriptions-item>
        </el-descriptions>

        <div class="block-head">
          <span class="block-title">支付流水</span>
        </div>
        <el-table :data="detail.transactions" border size="small">
          <el-table-column prop="txnNo" label="流水号" min-width="160" />
          <el-table-column label="类型" width="80">
            <template #default="{ row }">
              <el-tag :type="row.type === 'PAY' ? 'success' : 'warning'" size="small" disable-transitions>
                {{ TYPE_LABELS[row.type] ?? row.type }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="渠道" width="100">
            <template #default="{ row }">{{ CHANNEL_LABELS[row.payChannel] ?? row.payChannel }}</template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="90" />
          <el-table-column label="时间" width="160">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
        </el-table>
      </template>
      <el-empty v-else-if="!loading" description="暂无数据" />
    </div>
  </el-drawer>
</template>

<style scoped>
.block-head {
  margin: 16px 0 10px;
}

.block-title {
  font-weight: 600;
}
</style>
