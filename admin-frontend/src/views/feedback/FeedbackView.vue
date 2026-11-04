<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

import ProTable from '@/components/ProTable.vue'
import StatusTag from '@/components/StatusTag.vue'
import { deleteFeedback, handleFeedback, listFeedbacks } from '@/api/feedback'
import type { FeedbackItem, FeedbackQuery, ProTableHandle } from '@/api/types'
import { formatDateTime } from '@/utils/format'
import { confirmAction } from '@/utils/feedback'
import FeedbackDetailDrawer from './FeedbackDetailDrawer.vue'

const tableRef = ref<ProTableHandle | null>(null)

const filter = reactive<{ keyword: string; status: string; dateRange: string[] }>({
  keyword: '',
  status: '',
  dateRange: []
})

async function fetcher(query: { page: number; pageSize: number } & Record<string, unknown>) {
  return listFeedbacks(query as FeedbackQuery)
}

function buildQuery(): Record<string, unknown> {
  return {
    keyword: filter.keyword.trim(),
    status: filter.status,
    start: filter.dateRange?.[0] ?? '',
    end: filter.dateRange?.[1] ?? ''
  }
}

function handleSearch() {
  tableRef.value?.search(buildQuery())
}

function handleReset() {
  filter.keyword = ''
  filter.status = ''
  filter.dateRange = []
  handleSearch()
}

// -------------------------------------------------- 详情抽屉
const detailVisible = ref(false)
const detailFeedbackId = ref<number | null>(null)

function openDetail(row: FeedbackItem) {
  detailFeedbackId.value = row.id
  detailVisible.value = true
}

// -------------------------------------------------- 处理反馈（采纳 / 驳回）
const handleVisible = ref(false)
const handleSubmitting = ref(false)
const handleTarget = ref<FeedbackItem | null>(null)
const handleForm = reactive<{ status: 'ADOPTED' | 'REJECTED'; rewardPoints: number; handleRemark: string }>({
  status: 'ADOPTED',
  rewardPoints: 200,
  handleRemark: ''
})

function openHandle(row: FeedbackItem) {
  handleTarget.value = row
  handleForm.status = 'ADOPTED'
  handleForm.rewardPoints = 200
  handleForm.handleRemark = ''
  handleVisible.value = true
}

async function submitHandle() {
  const target = handleTarget.value
  if (!target) return
  if (handleForm.status === 'ADOPTED' && !handleForm.handleRemark.trim()) {
    ElMessage.warning('采纳反馈须填写处理说明')
    return
  }
  if (handleSubmitting.value) return
  const actionLabel = handleForm.status === 'ADOPTED' ? `采纳并奖励 ${handleForm.rewardPoints} 积分` : '驳回'
  const confirmed = await confirmAction(`确认${actionLabel}反馈 ${target.fbNo}？`, '反馈处理确认')
  if (!confirmed) return
  handleSubmitting.value = true
  try {
    await handleFeedback(target.id, {
      status: handleForm.status,
      rewardPoints: handleForm.status === 'ADOPTED' ? handleForm.rewardPoints : 0,
      handleRemark: handleForm.handleRemark.trim()
    })
    ElMessage.success('处理成功')
    handleVisible.value = false
    tableRef.value?.refresh()
  } catch {
    // 校验失败已由 request 拦截器透出
  } finally {
    handleSubmitting.value = false
  }
}

// -------------------------------------------------- 删除反馈
async function handleDelete(row: FeedbackItem) {
  const confirmed = await confirmAction(`确认删除反馈 ${row.fbNo}？删除后不可恢复`, '删除确认')
  if (!confirmed) return
  await deleteFeedback(row.id)
  ElMessage.success('删除成功')
  tableRef.value?.refresh()
}
</script>

<template>
  <div class="page">
    <div class="page-card">
      <ProTable ref="tableRef" :fetcher="fetcher">
        <template #filter>
          <el-form inline @submit.prevent>
            <el-form-item label="关键词">
              <el-input
                v-model="filter.keyword"
                placeholder="编号 / 用户昵称 / 反馈内容"
                clearable
                style="width: 220px"
                @keyup.enter="handleSearch"
                @clear="handleSearch"
              />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filter.status" style="width: 120px" @change="handleSearch">
                <el-option label="全部" value="" />
                <el-option label="待处理" value="PENDING" />
                <el-option label="已采纳" value="ADOPTED" />
                <el-option label="未采纳" value="REJECTED" />
              </el-select>
            </el-form-item>
            <el-form-item label="提交时间">
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
            </el-form-item>
          </el-form>
        </template>

        <el-table-column prop="fbNo" label="编号" min-width="150" />
        <el-table-column label="用户" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.nickname || row.wechatNickname || '-' }}</span>
            <span class="muted" style="margin-left: 6px">ID: {{ row.userId }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="反馈内容" min-width="240" show-overflow-tooltip />
        <el-table-column label="引用对话" width="90" align="center">
          <template #default="{ row }">
            <span v-if="row.chatRefs.length">{{ row.chatRefs.length }} 条</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="附图" width="80" align="center">
          <template #default="{ row }">
            <span v-if="row.images.length">{{ row.images.length }} 张</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag kind="feedback" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="奖励积分" width="90" align="center">
          <template #default="{ row }">{{ row.rewardPoints > 0 ? row.rewardPoints : '-' }}</template>
        </el-table-column>
        <el-table-column label="提交时间" width="160">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              <el-button v-perm="'feedback:manage'" link type="success" :disabled="row.status !== 'PENDING'" @click="openHandle(row)">
                处理
              </el-button>
              <el-button v-perm="'feedback:manage'" link type="danger" @click="handleDelete(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <FeedbackDetailDrawer v-model="detailVisible" :feedback-id="detailFeedbackId" />

    <el-dialog v-model="handleVisible" title="处理反馈" width="500px">
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="编号">
          <span>{{ handleTarget?.fbNo }}</span>
        </el-form-item>
        <el-form-item label="处理结果" required>
          <el-radio-group v-model="handleForm.status">
            <el-radio-button value="ADOPTED">采纳</el-radio-button>
            <el-radio-button value="REJECTED">驳回</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="handleForm.status === 'ADOPTED'" label="奖励积分" required>
          <el-input-number v-model="handleForm.rewardPoints" :min="0" :step="100" style="width: 180px" />
          <span class="muted" style="margin-left: 12px">有效反馈有机会获得积分奖励</span>
        </el-form-item>
        <el-form-item label="处理说明" :required="handleForm.status === 'ADOPTED'">
          <el-input
            v-model="handleForm.handleRemark"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            :placeholder="handleForm.status === 'ADOPTED' ? '请输入处理说明（采纳必填）' : '驳回原因（选填）'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="handleVisible = false">取消</el-button>
        <el-button type="primary" :loading="handleSubmitting" @click="submitHandle">确认处理</el-button>
      </template>
    </el-dialog>
  </div>
</template>
