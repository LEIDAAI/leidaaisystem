<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import StatusTag from '@/components/StatusTag.vue'
import { getFeedbackDetail } from '@/api/feedback'
import type { FeedbackDetail } from '@/api/types'
import { orDash } from '@/utils/format'
import { beijingTime as formatDateTime } from '@/utils/chat-time'
import { feedbackImageSrc } from '@/utils/feedback'

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

const failed = ref(false)
let requestVersion = 0
async function loadDetail() {
  const version = ++requestVersion
  const id = props.feedbackId
  detail.value = null
  failed.value = false
  loading.value = false
  if (!props.modelValue || id === null) return
  loading.value = true
  try {
    const result = await getFeedbackDetail(id)
    if (version !== requestVersion || !props.modelValue || props.feedbackId !== id) return
    if (result.id !== id) throw new Error('反馈详情对象不一致')
    detail.value = result
  } catch {
    if (version === requestVersion) failed.value = true
  } finally {
    if (version === requestVersion) loading.value = false
  }
}
watch(() => [props.modelValue, props.feedbackId] as const, loadDetail, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { ++requestVersion })
</script>

<template>
  <el-drawer v-model="visible" title="反馈详情" size="640px" destroy-on-close>
    <div v-loading="loading">
      <template v-if="detail">
        <el-alert title="反馈奖励属于独立运营特批积分，不是常规购买赠分；处理权限、特批原因与处理人均须留审计。时间为北京时间（UTC+08:00）。" type="info" :closable="false" style="margin-bottom:12px" />
        <el-descriptions :column="2" border>
          <el-descriptions-item label="编号">{{ detail.fbNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <StatusTag kind="feedback" :value="detail.status" />
          </el-descriptions-item>
          <el-descriptions-item label="用户">{{ detail.wechatNickname || '-' }}（ID: {{ detail.userId }}）</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatDateTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="反馈内容" :span="2">
            <div class="content-text">{{ detail.content }}</div>
          </el-descriptions-item>
          <el-descriptions-item label="附图" :span="2">
            <template v-if="detail.images.length">
              <div class="img-grid">
                <div v-for="(img, i) in detail.images" :key="img" class="img-item">
                  <el-image
                    class="img-lg"
                    :src="feedbackImageSrc(img)"
                    :preview-src-list="detail.images.map(feedbackImageSrc)"
                    :initial-index="i"
                    :z-index="3000"
                    fit="cover"
                    preview-teleported
                    hide-on-click-modal
                  />
                  <span class="img-name" :title="img">{{ img }}</span>
                </div>
              </div>
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
      <el-alert v-else-if="failed" title="反馈详情加载失败，尚未取得当前反馈内容" type="error" :closable="false"><el-button link @click="loadDetail">重试</el-button></el-alert>
      <el-empty v-else-if="!loading" description="请选择要查看的反馈" />
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

.img-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.img-item {
  width: 104px;
}

.img-lg {
  width: 104px;
  height: 76px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid #ebeef5;
}

.img-name {
  display: block;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
