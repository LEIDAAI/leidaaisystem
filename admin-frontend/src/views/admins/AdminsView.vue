<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

import ProTable from '@/components/ProTable.vue'
import StatusTag from '@/components/StatusTag.vue'
import { deleteAdmin, listAdmins, listRoles, resetAdminPassword, updateAdminStatus } from '@/api/admin'
import type { AdminItem, AdminQuery, ProTableHandle, RoleItem } from '@/api/types'
import { formatDateTime } from '@/utils/format'
import { confirmAction, promptText } from '@/utils/feedback'
import AdminFormDrawer from './AdminFormDrawer.vue'

const tableRef = ref<ProTableHandle | null>(null)
const roles = ref<RoleItem[]>([])

const filter = reactive<{ keyword: string; status: number | '' }>({
  keyword: '',
  status: ''
})

async function fetcher(query: { page: number; pageSize: number } & Record<string, unknown>) {
  return listAdmins(query as AdminQuery)
}

function handleSearch() {
  tableRef.value?.search({ keyword: filter.keyword.trim(), status: filter.status })
}

function handleReset() {
  filter.keyword = ''
  filter.status = ''
  handleSearch()
}

onMounted(async () => {
  roles.value = await listRoles()
})

// -------------------------------------------------- 抽屉
const drawerVisible = ref(false)
const editingAdmin = ref<AdminItem | null>(null)

function openCreate() {
  editingAdmin.value = null
  drawerVisible.value = true
}

function openEdit(row: AdminItem) {
  editingAdmin.value = row
  drawerVisible.value = true
}

// -------------------------------------------------- 行操作
async function handleToggleStatus(row: AdminItem) {
  const next = row.status === 1 ? 0 : 1
  const action = next === 1 ? '启用' : '禁用'
  const confirmed = await confirmAction(`确定要${action}管理员「${row.displayName}」吗？`, `${action}确认`)
  if (!confirmed) return
  await updateAdminStatus(row.id, next)
  ElMessage.success(`${action}成功`)
  tableRef.value?.refresh()
}

async function handleResetPassword(row: AdminItem) {
  const value = await promptText(`为管理员「${row.displayName}」设置新密码（至少 6 位）`, '重置密码', {
    inputType: 'password',
    inputPattern: /^.{6,}$/,
    inputErrorMessage: '密码长度至少 6 位'
  })
  if (value === null) return
  await resetAdminPassword(row.id, value)
  ElMessage.success('密码已重置')
}

async function handleDelete(row: AdminItem) {
  const confirmed = await confirmAction(
    `确定要删除管理员「${row.displayName}」吗？删除后不可恢复。`,
    '删除确认'
  )
  if (!confirmed) return
  await deleteAdmin(row.id)
  ElMessage.success('删除成功')
  tableRef.value?.refresh()
}
</script>

<template>
  <div class="page">
    <div class="page-card">
      <ProTable ref="tableRef" :fetcher="fetcher">
        <template #filter>
          <div class="filter-bar">
            <el-form inline @submit.prevent>
              <el-form-item label="关键词">
                <el-input
                  v-model="filter.keyword"
                  placeholder="用户名 / 显示名"
                  clearable
                  style="width: 200px"
                  @keyup.enter="handleSearch"
                  @clear="handleSearch"
                />
              </el-form-item>
              <el-form-item label="状态">
                <el-select v-model="filter.status" style="width: 130px" @change="handleSearch">
                  <el-option label="全部" value="" />
                  <el-option label="启用" :value="1" />
                  <el-option label="禁用" :value="0" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="handleSearch">查询</el-button>
                <el-button @click="handleReset">重置</el-button>
              </el-form-item>
            </el-form>
            <el-button v-perm="'admin:edit'" type="primary" @click="openCreate">新增管理员</el-button>
          </div>
        </template>

        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column prop="displayName" label="显示名" min-width="120" />
        <el-table-column label="角色" min-width="160">
          <template #default="{ row }">
            <template v-if="row.roles && row.roles.length > 0">
              <el-tag v-for="role in row.roles" :key="role.id" size="small" type="info" class="role-tag">
                {{ role.name }}
              </el-tag>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag kind="admin" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="最后登录" width="170">
          <template #default="{ row }">{{ formatDateTime(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button v-perm="'admin:edit'" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-perm="'admin:edit'" link type="primary" @click="handleResetPassword(row)">
                重置密码
              </el-button>
              <el-button
                v-perm="'admin:edit'"
                link
                :type="row.status === 1 ? 'warning' : 'success'"
                @click="handleToggleStatus(row)"
              >
                {{ row.status === 1 ? '禁用' : '启用' }}
              </el-button>
              <el-button v-perm="'admin:edit'" link type="danger" @click="handleDelete(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <AdminFormDrawer v-model="drawerVisible" :admin="editingAdmin" :roles="roles" @success="tableRef?.refresh()" />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.role-tag {
  margin-right: 6px;
  margin-bottom: 2px;
}
</style>
