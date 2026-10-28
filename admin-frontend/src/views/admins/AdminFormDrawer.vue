<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
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
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
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

watch(visible, (value) => {
  if (!value) return
  form.username = props.admin?.username ?? ''
  form.password = ''
  form.displayName = props.admin?.displayName ?? ''
  form.roleIds = props.admin ? props.admin.roles.map((r) => r.id) : []
  void nextTick(() => formRef.value?.clearValidate())
})

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
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    if (isEdit.value && props.admin) {
      await updateAdmin(props.admin.id, { displayName: form.displayName.trim(), roleIds: form.roleIds })
      ElMessage.success('保存成功')
    } else {
      await createAdmin({
        username: form.username.trim(),
        password: form.password,
        displayName: form.displayName.trim(),
        roleIds: form.roleIds
      })
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
        <el-select v-model="form.roleIds" multiple placeholder="请选择角色" style="width: 100%">
          <el-option
            v-for="role in roles"
            :key="role.id"
            :label="role.name"
            :value="role.id"
            :disabled="role.status !== 1"
          />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
    </template>
  </el-drawer>
</template>
