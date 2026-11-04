<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import StatusTag from '@/components/StatusTag.vue'
import EntitlementEditor from '@/components/EntitlementEditor.vue'
import { getUserDetail, updateUserEntitlements } from '@/api/user'
import { listChats, chatMessages, type ChatItem, type Message } from '@/api/operations'
import { ApiError } from '@/api/request'
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
  // 对话记录状态复位（切到「对话记录」Tab 时按需加载）
  chatList.value = []
  chatTotal.value = 0
  chatPage.value = 1
  chatsDenied.value = false
  chatsError.value = false
  msgCache.value = {}
  msgFailed.value = {}
  try {
    detail.value = await getUserDetail(props.userId)
  } finally {
    loading.value = false
  }
})

// 切到对话记录 Tab 时懒加载会话列表
watch(activeTab, (tab) => {
  // 权限不足/上次失败时不再自动重发（避免每次切 Tab 重复 403），失败可手动重试
  if (tab === 'chatLogs' && !chatList.value.length && !chatsLoading.value && !chatsDenied.value && !chatsError.value) loadChats()
})

// -------------------------------------------------- 对话记录（每次会话的过程与结果）
const chatList = ref<ChatItem[]>([])
const chatTotal = ref(0)
const chatPage = ref(1)
const chatPageSize = ref(10)
const chatsLoading = ref(false)
/** 无 chat:view 权限（403）标记：对话为敏感数据，权限不足时降级提示且不再重试 */
const chatsDenied = ref(false)
/** 加载失败（非权限原因）标记：允许手动重试 */
const chatsError = ref(false)
/** 会话消息缓存：会话ID → 消息列表（过程=往来消息，最后一条 AI 回复=结果） */
const msgCache = ref<Record<number, Message[]>>({})
/** 会话消息加载失败标记：会话ID → true（重新展开可重试） */
const msgFailed = ref<Record<number, boolean>>({})
const msgLoadingId = ref<number | null>(null)
/** 请求序号：快速切换用户/翻页时丢弃乱序响应，防止旧数据写入新列表 */
let chatReqSeq = 0

async function loadChats(): Promise<void> {
  if (props.userId === null) return
  const seq = ++chatReqSeq
  chatsLoading.value = true
  chatsDenied.value = false
  chatsError.value = false
  try {
    const data = await listChats({ userId: props.userId, page: chatPage.value, pageSize: chatPageSize.value, deleted: 'all' })
    if (seq !== chatReqSeq) return // 已切换用户/翻页，丢弃过期响应
    chatList.value = data.list
    chatTotal.value = data.total
  } catch (e) {
    if (seq !== chatReqSeq) return
    // 区分权限不足与加载失败：权限不足提示授权，其他失败允许重试
    if (e instanceof ApiError && e.code === 403) chatsDenied.value = true
    else chatsError.value = true
    chatList.value = []
    chatTotal.value = 0
  } finally {
    if (seq === chatReqSeq) chatsLoading.value = false
  }
}

function handleChatPageChange(): void {
  loadChats()
}

function handleChatSizeChange(): void {
  chatPage.value = 1
  loadChats()
}

function onExpandChat(row: ChatItem, expanded: ChatItem[]): void {
  if (!expanded.some((r) => r.id === row.id) || msgCache.value[row.id]) return
  loadMessages(row)
}

/** 加载会话消息：失败不缓存空数组（标记后可重新展开重试） */
async function loadMessages(row: ChatItem): Promise<void> {
  msgLoadingId.value = row.id
  delete msgFailed.value[row.id]
  try {
    msgCache.value[row.id] = await chatMessages(row.id)
  } catch {
    delete msgCache.value[row.id]
    msgFailed.value[row.id] = true
  } finally {
    msgLoadingId.value = null
  }
}

// -------------------------------------------------- 权益覆盖编辑（受 user:entitlement 权限控制的按钮触发）
const editingEntitlements = ref(false)
const draftEntitlements = ref<EntitlementPayload[]>([])
const savingEntitlements = ref(false)

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
  if (props.userId === null || savingEntitlements.value) return
  const invalid = draftEntitlements.value.some((e) => !Number.isFinite(e.quotaLimit) || e.quotaLimit < 0)
  if (invalid) {
    ElMessage.warning('限额值必须为不小于 0 的数字')
    return
  }
  savingEntitlements.value = true
  try {
    await updateUserEntitlements(props.userId, draftEntitlements.value)
    ElMessage.success('权益已更新')
    editingEntitlements.value = false
    detail.value = await getUserDetail(props.userId)
    emit('changed')
  } finally {
    savingEntitlements.value = false
  }
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
              <el-button size="small" type="primary" :loading="savingEntitlements" @click="saveEntitlements">保存</el-button>
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

        <el-tab-pane label="对话记录" name="chatLogs" lazy>
          <div v-loading="chatsLoading">
            <el-alert
              v-if="chatsDenied"
              title="无对话查看权限（chat:view）"
              description="对话为敏感数据，需单独授权后才能查看该用户的对话记录"
              type="info"
              :closable="false"
            />
            <el-alert v-else-if="chatsError" title="对话记录加载失败，请稍后重试" type="error" :closable="false">
              <el-button size="small" type="primary" plain @click="loadChats">重试</el-button>
            </el-alert>
            <el-empty v-else-if="!chatList.length" description="该用户暂无对话记录" />
            <template v-else>
              <el-table :data="chatList" border size="small" @expand-change="onExpandChat">
                <el-table-column type="expand">
                  <template #default="{ row }">
                    <div v-loading="msgLoadingId === row.id" class="msg-wrap">
                      <article
                        v-for="(m, i) in msgCache[row.id] || []"
                        :key="i"
                        class="msg-item"
                        :class="{ 'msg-result': m.role !== 'user' && i === (msgCache[row.id] || []).length - 1 }"
                      >
                        <div class="msg-head">
                          <el-tag size="small" :type="m.role === 'user' ? 'primary' : 'success'">{{ m.role === 'user' ? '用户' : 'AI' }}</el-tag>
                          <el-tag v-if="m.role !== 'user' && i === (msgCache[row.id] || []).length - 1" size="small" type="warning" effect="plain">结果</el-tag>
                          <small class="msg-time">{{ formatDateTime(m.createdAt) }}</small>
                        </div>
                        <pre class="msg-content">{{ m.content }}</pre>
                      </article>
                      <div v-if="msgFailed[row.id] && msgLoadingId !== row.id" class="msg-fail">
                        <span>消息加载失败</span>
                        <el-button size="small" type="primary" link @click="loadMessages(row)">重试</el-button>
                      </div>
                      <el-empty
                        v-else-if="msgLoadingId !== row.id && !(msgCache[row.id] || []).length"
                        description="无消息记录"
                        :image-size="60"
                      />
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="id" label="会话ID" width="75" />
                <el-table-column prop="expertName" label="专家" min-width="100" show-overflow-tooltip />
                <el-table-column prop="summary" label="摘要" min-width="160" show-overflow-tooltip />
                <el-table-column prop="messageCount" label="消息数" width="75" />
                <el-table-column label="状态" width="80">
                  <template #default="{ row }">
                    <el-tag size="small" :type="row.deletedAt ? 'danger' : 'success'">{{ row.deletedAt ? '已删除' : '正常' }}</el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="开始时间" width="160">
                  <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
                </el-table-column>
              </el-table>
              <el-pagination
                v-model:current-page="chatPage"
                v-model:page-size="chatPageSize"
                :total="chatTotal"
                layout="total, sizes, prev, pager, next"
                style="margin-top: 12px; justify-content: flex-end"
                @current-change="handleChatPageChange"
                @size-change="handleChatSizeChange"
              />
              <p class="hint-text">展开会话查看完整对话过程；最后一条 AI 回复标记为「结果」。查看会话消息会记录审计。</p>
            </template>
          </div>
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

.msg-wrap {
  padding: 8px 16px 8px 40px;
}

.msg-fail {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f56c6c;
  font-size: 13px;
}

.msg-item {
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  background: #fafafa;
}

.msg-item.msg-result {
  border-color: #ffd591;
  background: #fffbe6;
}

.msg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.msg-time {
  color: #909399;
}

.msg-content {
  margin: 0;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
