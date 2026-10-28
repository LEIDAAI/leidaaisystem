<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'

import { createRole, updateRole } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'
import type { PermissionModule, RoleItem } from '@/api/types'

interface Props {
  modelValue: boolean
  /** 编辑目标，null 表示新增 */
  role: RoleItem | null
  /** 权限点字典（按 module 分组） */
  permissions: PermissionModule[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
}>()

const MODULE_LABELS: Record<string, string> = {
  dashboard: '仪表盘',
  admin: '权限管理',
  user: '用户',
  order: '订单',
  plan: '套餐',
  expert: '专家',
  skill: '技能',
  mcp: 'MCP',
  chat: '对话'
}

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const isEdit = computed(() => props.role !== null)
const formRef = ref<FormInstance>()
const saving = ref(false)
const form = reactive({
  code: '',
  name: '',
  remark: '',
  permissionIds: [] as number[]
})

watch(visible, (value) => {
  if (!value) return
  form.code = props.role?.code ?? ''
  form.name = props.role?.name ?? ''
  form.remark = props.role?.remark ?? ''
  form.permissionIds = props.role ? [...props.role.permissionIds] : []
  void nextTick(() => formRef.value?.clearValidate())
})

const rules: FormRules = {
  code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }]
}

function moduleLabel(moduleName: string): string {
  return MODULE_LABELS[moduleName] ?? moduleName
}

function sortedPermissions(module: PermissionModule): PermissionModule['permissions'] {
  return [...module.permissions].sort((a, b) => a.sort - b.sort)
}

function modulePermIds(moduleName: string): number[] {
  const module = props.permissions.find((m) => m.module === moduleName)
  return module ? module.permissions.map((p) => p.id) : []
}

function isAllChecked(moduleName: string): boolean {
  const ids = modulePermIds(moduleName)
  return ids.length > 0 && ids.every((id) => form.permissionIds.includes(id))
}

function isIndeterminate(moduleName: string): boolean {
  const ids = modulePermIds(moduleName)
  const checked = ids.filter((id) => form.permissionIds.includes(id))
  return checked.length > 0 && checked.length < ids.length
}

function toggleModule(module: PermissionModule, checked: unknown): void {
  const ids = module.permissions.map((p) => p.id)
  const others = form.permissionIds.filter((id) => !ids.includes(id))
  form.permissionIds = checked ? [...others, ...ids] : others
}

async function handleSave() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      remark: form.remark.trim(),
      permissionIds: form.permissionIds
    }
    if (isEdit.value && props.role) {
      await updateRole(props.role.id, payload)
      ElMessage.success('保存成功')
    } else {
      await createRole(payload)
      ElMessage.success('新增成功')
    }
    await useAuthStore().refreshSession()
    visible.value = false
    emit('success')
  } catch {
    // 错误提示已由 request 拦截器统一展示
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-drawer v-model="visible" :title="isEdit ? '编辑角色' : '新增角色'" size="560px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="角色编码" prop="code">
        <el-input v-model="form.code" :disabled="isEdit" placeholder="如 OPS / SUPPORT" />
      </el-form-item>
      <el-form-item label="角色名称" prop="name">
        <el-input v-model="form.name" placeholder="角色显示名称" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="角色说明（可选）" />
      </el-form-item>
      <el-form-item label="权限点">
        <el-alert title="P1/P2 权限点仅为字典预留，相应模块尚未实现。" type="info" :closable="false" style="margin-bottom:12px" />
        <div class="perm-groups">
          <div v-for="module in permissions" :key="module.module" class="perm-group">
            <div class="perm-group__head">
              <el-checkbox
                :model-value="isAllChecked(module.module)"
                :indeterminate="isIndeterminate(module.module)"
                @change="toggleModule(module, $event)"
              >
                {{ moduleLabel(module.module) }}
              </el-checkbox>
            </div>
            <el-checkbox-group v-model="form.permissionIds" class="perm-group__list">
              <el-checkbox v-for="p in sortedPermissions(module)" :key="p.id" :value="p.id">
                {{ p.name }}
                <span class="perm-code">{{ p.code }}</span>
              </el-checkbox>
            </el-checkbox-group>
          </div>
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.perm-groups {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.perm-group {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 10px 12px;
}

.perm-group__head {
  margin-bottom: 4px;
  font-weight: 600;
}

.perm-group__list {
  display: flex;
  flex-wrap: wrap;
}

.perm-group__list .el-checkbox {
  width: 46%;
  margin-right: 2%;
}

.perm-code {
  color: #c0c4cc;
  font-size: 12px;
  margin-left: 4px;
}
</style>
