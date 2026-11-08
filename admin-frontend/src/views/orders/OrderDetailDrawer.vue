<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StatusTag from '@/components/StatusTag.vue'
import { getOrderDetail } from '@/api/order'
import type { OrderDetail } from '@/api/types'
import { formatAmount, formatDateTime, formatOrderExpiry, formatOrderDuration, orDash } from '@/utils/format'

interface Props {
  modelValue: boolean
  orderId: number | null
  now: number
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

const loadError = ref(false)
let requestSeq = 0
async function loadDetail(): Promise<void> {
  const id = props.orderId
  const seq = ++requestSeq
  detail.value = null
  loadError.value = false
  loading.value = false
  if (!props.modelValue || id === null) return
  loading.value = true
  const current = () => seq === requestSeq && props.modelValue && props.orderId === id
  try {
    const result = await getOrderDetail(id)
    if (current()) {
      if (result.id !== id) throw new Error('订单详情与请求对象不一致')
      detail.value = result
    }
  } catch {
    if (current()) loadError.value = true
  } finally {
    if (current()) loading.value = false
  }
}
watch(() => [props.modelValue, props.orderId], () => { void loadDetail() }, { immediate: true, flush: 'sync' })

const CHANNEL_LABELS: Record<string, string> = { WECHAT: '微信支付', ALIPAY: '支付宝', OFFLINE: '线下录入' }
/** v11 订单来源中文标签 */
const ORDER_SOURCE_LABELS: Record<string, string> = { ONLINE: '线上订单', MANUAL: '手工订单', GIFT: '赠送订单' }
const ORDER_CATEGORY_LABELS: Record<string, string> = { FIRST_PURCHASE: '首次购买', RENEW: '同档续费', UPGRADE: '升级', SWITCH: '降级/换周期切换', PACK: '增购积分包' }

const TYPE_LABELS: Record<string, string> = { PAY: '支付' }
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
          <el-descriptions-item label="用户手机号">{{ detail.phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="微信昵称">{{ detail.wechatNickname }}（ID: {{ detail.userId }}）</el-descriptions-item>
          <el-descriptions-item label="套餐">{{ detail.planName }}</el-descriptions-item>
          <el-descriptions-item label="订单来源">{{ ORDER_SOURCE_LABELS[detail.source] ?? detail.source }}</el-descriptions-item>
          <el-descriptions-item label="到期状态"><el-tag :type="formatOrderExpiry(detail, now).type" size="small">{{ formatOrderExpiry(detail, now).text }}</el-tag></el-descriptions-item>
          <el-descriptions-item label="剩余积分">{{ detail.remainingCredits }}</el-descriptions-item>
          <el-descriptions-item label="套餐时长">{{ formatOrderDuration(detail) }}</el-descriptions-item>
          <el-descriptions-item label="近7日消耗">{{ detail.last7DaysUsage }}</el-descriptions-item>
          <el-descriptions-item label="商品金额">{{ formatAmount(detail.goodsAmount) }}</el-descriptions-item>
          <el-descriptions-item label="优惠金额">{{ formatAmount(detail.discountAmount) }}</el-descriptions-item>
          <el-descriptions-item label="应付 / 成交金额">{{ formatAmount(detail.amount) }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDateTime(detail.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="到期时间">{{ formatOrderExpiry(detail, now).time }}</el-descriptions-item>
          <el-descriptions-item label="支付渠道">{{ CHANNEL_LABELS[detail.payChannel] ?? detail.payChannel }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ orDash(detail.remark) }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.orderCategory" label="购买动作">{{ ORDER_CATEGORY_LABELS[detail.orderCategory] ?? detail.orderCategory }}</el-descriptions-item>
          <el-descriptions-item v-if="detail.quoteExpireAt" label="报价有效期">{{ formatDateTime(detail.quoteExpireAt) }}<el-tag v-if="detail.quoteExpired" type="danger" size="small" style="margin-left:6px">已过期，请关闭重下</el-tag></el-descriptions-item>
        </el-descriptions>
        <el-alert v-if="detail.priceChangeReason" type="warning" :closable="false" style="margin-top:12px" title="本订单经过改价">
          <p style="margin:4px 0 0">改价原因：{{ detail.priceChangeReason }}（调整后应付 {{ formatAmount(detail.amount) }}，完整前后记录见审计日志）</p>
        </el-alert>

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
      <el-alert v-else-if="!loading && loadError" title="订单详情加载失败" type="error" :closable="false">
        <el-button size="small" @click="loadDetail">重试</el-button>
      </el-alert>
      <el-empty v-else-if="!loading" description="请选择要查看的订单" />
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
