<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import ProTable from '@/components/ProTable.vue'
import StatusTag from '@/components/StatusTag.vue'
import { deleteRole, listPermissions, listRoles, updateRoleStatus } from '@/api/admin'
import type { PermissionModule, ProTableHandle, RoleItem } from '@/api/types'
import { formatDateTime } from '@/utils/format'
import { confirmAction } from '@/utils/feedback'
import RoleFormDrawer from './RoleFormDrawer.vue'

const tableRef = ref<ProTableHandle | null>(null)
const permissions = ref<PermissionModule[]>([])

async function fetcher(query: { page: number; pageSize: number } & Record<string, unknown>) {
  const all = await listRoles()
  // 角色为全量接口（不分页），在前端做内存分页以复用 ProTable
  const keyword = String(query.keyword ?? '')
  const start = (Number(query.page) - 1) * Number(query.pageSize)
  let list = all
  if (keyword) {
    list = all.filter((r) => r.code.includes(keyword) || r.name.includes(keyword))
  }
  return {
    total: list.length,
    list: list.slice(start, start + Number(query.pageSize))
  }
}

onMounted(async () => {
  permissions.value = await listPermissions()
})

const drawerVisible = ref(false)
const editingRole = ref<RoleItem | null>(null)

function openCreate() {
  editingRole.value = null
  drawerVisible.value = true
}

function openEdit(row: RoleItem) {
  editingRole.value = row
  drawerVisible.value = true
}

async function handleToggleStatus(row: RoleItem) {
  const next = row.status === 1 ? 0 : 1
  const action = next === 1 ? '启用' : '禁用'
  const confirmed = await confirmAction(`确定要${action}角色「${row.name}」吗？`, `${action}确认`)
  if (!confirmed) return
  await updateRoleStatus(row.id, next)
  ElMessage.success(`${action}成功`)
  tableRef.value?.refresh()
}

async function handleDelete(row: RoleItem) {
  const confirmed = await confirmAction(
    `确定要删除角色「${row.name}」吗？已绑定账号的角色将被拒绝删除。`,
    '删除确认'
  )
  if (!confirmed) return
  await deleteRole(row.id)
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
            <span class="filter-tip">角色权限在下次页面导航或刷新时校验；禁用角色后其权限失效</span>
            <el-button v-perm="'role:manage'" type="primary" @click="openCreate">新增角色</el-button>
          </div>
        </template>

        <el-table-column prop="code" label="角色编码" min-width="140" />
        <el-table-column prop="name" label="角色名称" min-width="120" />
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '-' }}</template>
        </el-table-column>
        <el-table-column label="权限点数量" width="110">
          <template #default="{ row }">{{ row.permissionIds.length }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <StatusTag kind="role" :value="row.status" />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="table-actions">
              <el-button v-perm="'role:manage'" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button
                v-perm="'role:manage'"
                link
                :type="row.status === 1 ? 'warning' : 'success'"
                :disabled="row.code === 'SUPER_ADMIN'"
                @click="handleToggleStatus(row)"
              >
                {{ row.status === 1 ? '禁用' : '启用' }}
              </el-button>
              <el-button
                v-perm="'role:manage'"
                link
                type="danger"
                :disabled="row.code === 'SUPER_ADMIN'"
                @click="handleDelete(row)"
              >删除</el-button>
            </div>
          </template>
        </el-table-column>
      </ProTable>
    </div>

    <RoleFormDrawer v-model="drawerVisible" :role="editingRole" :permissions="permissions" @success="tableRef?.refresh()" />
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.filter-tip {
  color: #909399;
  font-size: 13px;
}
</style>
