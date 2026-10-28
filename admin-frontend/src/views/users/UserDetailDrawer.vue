<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import StatusTag from '@/components/StatusTag.vue'
import EntitlementEditor from '@/components/EntitlementEditor.vue'
import { getUserDetail, updateUserEntitlements } from '@/api/user'
import type { EntitlementPayload, UserDetail } from '@/api/types'
import { formatAmount, formatDateTime, orDash } from '@/utils/format'
import { confirmAction } from '@/utils/feedback'

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  EXPERT: '专家',
  SKILL: '技能',
  MCP_TOOL: 'MCP工具'
}

const QUOTA_TYPE_LABELS: Record<string, string> = {
  CHAT_COUNT: '对话次数',
  SKILL_CALL: '调用次数'
}

interface Props {
  modelValue: boolean
  userId: number | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'changed'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const loading = ref(false)
const detail = ref<UserDetail | null>(null)
const activeTab = ref('profile')

watch(visible, async (value) => {
  if (!value || props.userId === null) return
  loading.value = true
  detail.value = null
  editingEntitlements.value = false
  activeTab.value = 'profile'
  try {
    detail.value = await getUserDetail(props.userId)
  } finally {
    loading.value = false
  }
})

// -------------------------------------------------- 权益覆盖编辑（受 user:entitlement 权限控制的按钮触发）
const editingEntitlements = ref(false)
const draftEntitlements = ref<EntitlementPayload[]>([])

function startEditEntitlements() {
  const source = detail.value?.entitlements ?? []
  draftEntitlements.value = source.map((e) => ({
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    quotaType: e.quotaType,
    quotaLimit: e.quotaLimit,
    quotaPeriod: e.quotaPeriod || 'MONTH'
  }))
  editingEntitlements.value = true
}

async function saveEntitlements() {
  if (props.userId === null) return
  const invalid = draftEntitlements.value.some((e) => !Number.isFinite(e.quotaLimit) || e.quotaLimit < 0)
  if (invalid) {
    ElMessage.warning('限额值必须为不小于 0 的数字')
    return
  }
  await updateUserEntitlements(props.userId, draftEntitlements.value)
  ElMessage.success('权益已更新')
  editingEntitlements.value = false
  detail.value = await getUserDetail(props.userId)
  emit('changed')
}

async function cancelEditEntitlements() {
  if (draftEntitlements.value.length === 0) {
    editingEntitlements.value = false
    return
  }
  const confirmed = await confirmAction('放弃本次权益修改？', '提示')
  if (confirmed) editingEntitlements.value = false
}
</script>

<template>
  <el-drawer v-model="visible" title="用户详情" size="720px" destroy-on-close>
    <div v-loading="loading">
      <el-tabs v-if="detail" v-model="activeTab">
        <el-tab-pane label="基本资料" name="profile">
          <el-descriptions :column="2" border>
            <el-descriptions-item label="用户ID">{{ detail.profile.id }}</el-descriptions-item>
            <el-descriptions-item label="昵称">{{ detail.profile.nickname }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ orDash(detail.profile.phone) }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ orDash(detail.profile.email) }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <StatusTag kind="user" :value="detail.profile.status" />
            </el-descriptions-item>
            <el-descriptions-item label="当前套餐">{{ detail.plan.planName }}</el-descriptions-item>
            <el-descriptions-item label="注册时间">{{ formatDateTime(detail.profile.registeredAt) }}</el-descriptions-item>
            <el-descriptions-item label="最后登录">{{ formatDateTime(detail.profile.lastLoginAt) }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <el-tab-pane label="套餐与权益" name="entitlements">
          <el-descriptions :column="3" border class="block-gap">
            <el-descriptions-item label="套餐">{{ detail.plan.planName }}</el-descriptions-item>
            <el-descriptions-item label="到期时间">
              {{ detail.plan.expireAt ? formatDateTime(detail.plan.expireAt) : '长期有效' }}
            </el-descriptions-item>
            <el-descriptions-item label="个体覆盖">{{ detail.entitlements.length }} 条</el-descriptions-item>
          </el-descriptions>

          <div class="block-head">
            <span class="block-title">个体权益覆盖</span>
            <span v-if="!editingEntitlements" v-perm="'user:entitlement'">
              <el-button size="small" type="primary" plain @click="startEditEntitlements">调整权益</el-button>
            </span>
            <template v-else>
              <el-button size="small" @click="cancelEditEntitlements">取消</el-button>
              <el-button size="small" type="primary" @click="saveEntitlements">保存</el-button>
            </template>
          </div>

          <el-table v-if="!editingEntitlements" :data="detail.entitlements" border size="small">
            <el-table-column label="资源类型" width="100">
              <template #default="{ row }">{{ RESOURCE_TYPE_LABELS[row.resourceType] ?? row.resourceType }}</template>
            </el-table-column>
            <el-table-column prop="resourceName" label="资源名称" min-width="150" />
            <el-table-column label="限额类型" width="110">
              <template #default="{ row }">{{ QUOTA_TYPE_LABELS[row.quotaType] ?? orDash(row.quotaType) }}</template>
            </el-table-column>
            <el-table-column prop="quotaLimit" label="限额" width="90" />
            <el-table-column prop="used" label="已用" width="90" />
            <el-table-column prop="quotaPeriod" label="周期" width="100" />
          </el-table>
          <EntitlementEditor v-else v-model="draftEntitlements" />
          <p class="hint-text">个体覆盖优先于套餐权益；移除覆盖条目后使用套餐权益。</p>
        </el-tab-pane>

        <el-tab-pane label="最近订单" name="orders">
          <el-descriptions :column="2" border class="block-gap">
            <el-descriptions-item label="订单总数">{{ detail.orders.totalCount }}</el-descriptions-item>
            <el-descriptions-item label="累计支付金额">{{ formatAmount(detail.orders.totalAmount) }}</el-descriptions-item>
          </el-descriptions>
          <el-table :data="detail.orders.list" border size="small">
            <el-table-column prop="orderNo" label="订单号" min-width="150" />
            <el-table-column prop="planName" label="套餐" width="90" />
            <el-table-column label="金额" width="100">
              <template #default="{ row }">{{ formatAmount(row.amount) }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <StatusTag kind="order" :value="row.status" />
              </template>
            </el-table-column>
            <el-table-column label="下单时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="对话统计" name="chats">
          <el-descriptions :column="3" border>
            <el-descriptions-item label="会话数">{{ detail.chatStats.conversationCount }}</el-descriptions-item>
            <el-descriptions-item label="消息数">{{ detail.chatStats.messageCount }}</el-descriptions-item>
            <el-descriptions-item label="最近对话">{{ formatDateTime(detail.chatStats.lastChatAt) }}</el-descriptions-item>
          </el-descriptions>
        </el-tab-pane>

        <el-tab-pane label="登录日志" name="logins">
          <el-table :data="detail.loginLogs" border size="small">
            <el-table-column prop="ip" label="IP" min-width="130" />
            <el-table-column prop="userAgent" label="终端" min-width="260" show-overflow-tooltip />
            <el-table-column label="登录时间" width="160">
              <template #default="{ row }">{{ formatDateTime(row.loginAt) }}</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
      <el-empty v-else-if="!loading" description="暂无数据" />
    </div>
  </el-drawer>
</template>

<style scoped>
.block-gap {
  margin-bottom: 16px;
}

.block-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
}

.block-title {
  font-weight: 600;
}

.hint-text {
  margin-top: 10px;
  color: #c0c4cc;
  font-size: 12px;
}
</style>
