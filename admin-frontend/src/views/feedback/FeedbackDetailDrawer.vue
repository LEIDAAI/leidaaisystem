<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import StatusTag from '@/components/StatusTag.vue'
import { getFeedbackDetail } from '@/api/feedback'
import type { FeedbackDetail } from '@/api/types'
import { formatDateTime, orDash } from '@/utils/format'

interface Props {
  modelValue: boolean
  feedbackId: number | null
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
const detail = ref<FeedbackDetail | null>(null)

watch(visible, async (value) => {
  if (!value || props.feedbackId === null) return
  loading.value = true
  detail.value = null
  try {
    detail.value = await getFeedbackDetail(props.feedbackId)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <el-drawer v-model="visible" title="反馈详情" size="640px" destroy-on-close>
    <div v-loading="loading">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="编号">{{ detail.fbNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag kind="feedback" :value="detail.status" />
          </el-descriptions-item>
          <el-descriptions-item label="用户">{{ detail.nickname || detail.wechatNickname || '-' }}（ID: {{ detail.userId }}）</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="反馈内容" :span="2">
            <div class="content-text">{{ detail.content }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="附图" :span="2">
            <template v-if="detail.images.length">
              <el-tag v-for="img in detail.images" :key="img" size="small" type="info" disable-transitions class="img-chip">
                {{ img }}
              </el-tag>
            </template>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="奖励积分">{{ detail.rewardPoints > 0 ? detail.rewardPoints : '-' }}</el-descriptions-item>
          <el-descriptions-item label="处理人">{{ orDash(detail.handledBy) }}</el-descriptions-item>
          <el-descriptions-item label="处理时间">{{ formatDateTime(detail.handledAt) }}</el-descriptions-item>
          <el-descriptions-item label="处理说明" :span="2">{{ orDash(detail.handleRemark) }}</el-descriptions-item>
        </el-descriptions>

        <div class="block-head">
          <span class="block-title">引用对话（{{ detail.chatRefs.length }}）</span>
        </div>
        <template v-if="detail.chatRefs.length">
          <div v-for="ref in detail.chatRefs" :key="ref.chatId" class="chat-ref">
            <span class="chat-ref-id">#{{ ref.chatId }}</span>
            <span class="chat-ref-summary">{{ ref.summary }}</span>
          </div>
        </template>
        <el-empty v-else description="未引用对话" :image-size="60" />
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

.content-text {
  white-space: pre-wrap;
  word-break: break-all;
}

.img-chip {
  margin: 0 8px 6px 0;
}

.chat-ref {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #f7f9f8;
  border-radius: 6px;
  font-size: 13px;
}

.chat-ref-id {
  color: #15816c;
  font-weight: 600;
  flex-shrink: 0;
}

.chat-ref-summary {
  color: #47594f;
  word-break: break-all;
}
</style>
