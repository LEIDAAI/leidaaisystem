<script setup lang="ts">
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

import ProTable from '@/components/ProTable.vue'
import StatusTag from '@/components/StatusTag.vue'
import { listUsers, updateUserStatus } from '@/api/user'
import type { ProTableHandle, UserItem, UserQuery } from '@/api/types'
import { formatDateTime } from '@/utils/format'
import { promptText } from '@/utils/feedback'
import UserDetailDrawer from './UserDetailDrawer.vue'

const tableRef = ref<ProTableHandle | null>(null)

const filter = reactive<{ keyword: string; status: number | ''; dateRange: string[] }>({
  keyword: '',
  status: '',
  dateRange: []
})

async function fetcher(query: { page: number; pageSize: number } & Record<string, unknown>) {
  return listUsers(query as UserQuery)
}

function handleSearch() {
  tableRef.value?.search({
    keyword: filter.keyword.trim(),
    status: filter.status,
    start: filter.dateRange?.[0] ?? '',
    end: filter.dateRange?.[1] ?? ''
  })
}

function handleReset() {
  filter.keyword = ''
  filter.status = ''
  filter.dateRange = []
  handleSearch()
}

// -------------------------------------------------- 详情抽屉
const detailVisible = ref(false)
const detailUserId = ref<number | null>(null)

function openDetail(row: UserItem) {
  detailUserId.value = row.id
  detailVisible.value = true
}

// -------------------------------------------------- 封禁 / 解封
async function handleBan(row: UserItem) {
  const reason = await promptText(`封禁用户「${row.nickname}」后将无法登录，请填写封禁原因`, '封禁用户', {
    inputPattern: /^.{2,}$/,
    inputErrorMessage: '请填写至少 2 个字的原因'
  })
  if (reason === null) return
  await updateUserStatus(row.id, true, reason.trim())
  ElMessage.success('已封禁')
  tableRef.value?.refresh()
}

async function handleUnban(row: UserItem) {
  const reason = await promptText(`请填写解封用户「${row.nickname}」的原因`, '解封确认', {
    inputPattern: /\S.{1,}/,
    inputErrorMessage: '请填写至少 2 个字的原因'
  })
  if (reason === null) return
  await updateUserStatus(row.id, false, reason.trim())
  ElMessage.success('已解封')
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
                placeholder="昵称 / 手机 / 邮箱 / ID"
                clearable
                style="width: 210px"
                @keyup.enter="handleSearch"
                @clear="handleSearch"
              />
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filter.status" style="width: 130px" @change="handleSearch">
                <el-option label="全部" value="" />
                <el-option label="正常" :value="1" />
                <el-option label="已封禁" :value="0" />
              </el-select>
            </el-form-item>
            <el-form-item label="注册时间">
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

        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="nickname" label="昵称" min-width="130" show-overflow-tooltip />
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag kind="user" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column prop="planName" label="套餐" width="100">
          <template #default="{ row }">{{ row.planName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="chatCount" label="对话数" width="90" />
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.registeredAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              <el-button
                v-perm="'user:ban'"
                link
                :type="row.status === 1 ? 'danger' : 'success'"
                @click="row.status === 1 ? handleBan(row) : handleUnban(row)"
              >
                {{ row.status === 1 ? '封禁' : '解封' }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <UserDetailDrawer v-model="detailVisible" :user-id="detailUserId" @changed="tableRef?.refresh()" />
  </div>
</template>
