<script setup lang="ts">
import { reactive, ref } from 'vue'

import ProTable from '@/components/ProTable.vue'
import { listUsers } from '@/api/user'
import type { ProTableHandle, UserExpiryStatus, UserItem, UserQuery } from '@/api/types'
import { USER_EXPIRY_STATUS, USER_EXPIRY_STATUS_OPTIONS } from '@/constants'
import { formatDateTime, formatMembership } from '@/utils/format'
import UserDetailDrawer from './UserDetailDrawer.vue'

const tableRef = ref<ProTableHandle | null>(null)

const filter = reactive<{ keyword: string; expiryStatus: UserExpiryStatus | ''; dateRange: string[] }>({
  keyword: '',
  expiryStatus: '',
  dateRange: []
})

async function fetcher(query: { page: number; pageSize: number } & Record<string, unknown>) {
  return listUsers(query as UserQuery)
}

function handleSearch() {
  tableRef.value?.search({
    keyword: filter.keyword.trim(),
    expiryStatus: filter.expiryStatus,
    start: filter.dateRange?.[0] ?? '',
    end: filter.dateRange?.[1] ?? ''
  })
}

function handleReset() {
  filter.keyword = ''
  filter.expiryStatus = ''
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

/** v50 到期状态：统一走 USER_EXPIRY_STATUS，与订单页「到期状态」同一套文案与配色 */
function expiryOf(row: UserItem) {
  const status = (row.membership?.status ?? 'UNKNOWN') as string
  return { status, ...(USER_EXPIRY_STATUS[status] ?? USER_EXPIRY_STATUS.UNKNOWN) }
}

/** 只有有效 / 已到期才展示具体到期日期，无会员与未知不编造日期 */
function hasDate(status: string): boolean {
  return status === 'ACTIVE' || status === 'EXPIRED'
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
                placeholder="手机 / 邮箱 / 昵称 / ID"
                clearable
                style="width: 210px"
                @keyup.enter="handleSearch"
                @clear="handleSearch"
              />
            </el-form-item>
            <el-form-item label="到期状态">
              <el-select v-model="filter.expiryStatus" clearable placeholder="全部" style="width: 140px" @change="handleSearch">
                <el-option v-for="item in USER_EXPIRY_STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
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
        <el-table-column prop="phone" label="手机号" min-width="130" />
        <el-table-column prop="wechatNickname" label="微信昵称" min-width="140" show-overflow-tooltip />
        <el-table-column prop="planName" label="套餐" width="100">
          <template #default="{ row }">{{ row.planName || '-' }}</template>
        </el-table-column>
        <el-table-column prop="chatCount" label="对话数" width="90" />
        <el-table-column label="注册时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.registeredAt) }}</template>
        </el-table-column>
        <el-table-column label="到期状态 / 到期时间" width="200">
          <template #default="{ row }">
            <el-tag size="small" :type="expiryOf(row).type" disable-transitions>{{ expiryOf(row).label }}</el-tag>
            <div v-if="hasDate(expiryOf(row).status)" class="cell-sub">{{ formatMembership(row.membership).time }}</div>
          </template>
        </el-table-column>
        <el-table-column label="最后登录时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column prop="region" label="客户地区" min-width="110" />
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <UserDetailDrawer v-model="detailVisible" :user-id="detailUserId" @changed="tableRef?.refresh()" />
  </div>
</template>

<style scoped>
.cell-sub { font-size: 11.5px; color: var(--el-text-color-secondary); font-variant-numeric: tabular-nums; margin-top: 2px; }
</style>
