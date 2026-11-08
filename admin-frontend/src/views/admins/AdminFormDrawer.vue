<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import { captureSession, isSessionCurrent } from '@/utils/token'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'

import { createAdmin, updateAdmin } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'
import type { AdminItem, RoleItem } from '@/api/types'

interface Props {
  modelValue: boolean
  /** 编辑目标，null 表示新增 */
  admin: AdminItem | null
  roles: RoleItem[]
  rolesLoading: boolean
  rolesError: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
  (e: 'retry-roles'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const isEdit = computed(() => props.admin !== null)
const formRef = ref<FormInstance>()
const saving = ref(false)
const form = reactive({
  username: '',
  password: '',
  displayName: '',
  roleIds: [] as number[]
})

let formVersion = 0
onUnmounted(() => { formVersion++ })
watch([visible, () => props.admin?.id], ([value]) => {
  formVersion++
  saving.value = false
  if (!value) return
  form.username = props.admin?.username ?? ''
  form.password = ''
  form.displayName = props.admin?.displayName ?? ''
  form.roleIds = props.admin ? props.admin.roles.map((r) => r.id) : []
  void nextTick(() => formRef.value?.clearValidate())
}, { flush: 'sync' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    { required: true, message: '请输入初始密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少 6 位', trigger: 'blur' }
  ],
  displayName: [{ required: true, message: '请输入显示名', trigger: 'blur' }],
  roleIds: [{ required: true, type: 'array', min: 1, message: '请至少选择一个角色', trigger: 'change' }]
}

async function handleSave() {
  if (saving.value || props.rolesLoading || props.rolesError || !visible.value) return
  const version = formVersion
  const session = captureSession()
  const targetId = props.admin?.id
  const payload = { username: form.username.trim(), password: form.password, displayName: form.displayName.trim(), roleIds: [...form.roleIds] }
  saving.value = true
  try {
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid || version !== formVersion || !isSessionCurrent(session)) return
    if (targetId !== undefined) await updateAdmin(targetId, { displayName: payload.displayName, roleIds: payload.roleIds })
    else await createAdmin(payload)
    if (!isSessionCurrent(session)) return
    ElMessage.success(targetId !== undefined ? '保存成功' : '新增成功')
    try { await useAuthStore().refreshPermissions() }
    catch { if (isSessionCurrent(session)) ElMessage.warning('保存成功，身份校验失败，请点击重试加载最新权限') }
    if (version !== formVersion || !isSessionCurrent(session)) return
    visible.value = false
    emit('success')
  } catch {
    // 请求错误由拦截器提示，当前草稿保留供重试。
  } finally {
    if (version === formVersion) saving.value = false
  }
}
</script>

<template>
  <el-drawer v-model="visible" :title="isEdit ? '编辑管理员' : '新增管理员'" size="440px" destroy-on-close>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" :disabled="isEdit" placeholder="登录用户名" />
      </el-form-item>
      <el-form-item v-if="!isEdit" label="初始密码" prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="至少 6 位" />
      </el-form-item>
      <el-form-item label="显示名" prop="displayName">
        <el-input v-model="form.displayName" placeholder="用于列表与顶栏展示" />
      </el-form-item>
      <el-form-item label="角色" prop="roleIds">
        <el-select v-model="form.roleIds" multiple :loading="rolesLoading" :disabled="rolesLoading || rolesError" placeholder="请选择角色" style="width: 100%">
          <el-option
            v-for="role in roles"
            :key="role.id"
            :label="role.name"
            :value="role.id"
            :disabled="role.status !== 1"
          />
        </el-select>
        <el-alert v-if="rolesError" title="可分配角色加载失败" type="error" :closable="false"><el-button link type="primary" @click="emit('retry-roles')">重试</el-button></el-alert>
        <span v-else-if="!rolesLoading && !roles.length">暂无可分配角色，请联系有授权权限的管理员。</span>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="rolesLoading || rolesError || !roles.length" @click="handleSave">保存</el-button>
    </template>
  </el-drawer>
</template>
