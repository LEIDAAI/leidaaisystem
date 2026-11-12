<script setup lang="ts">
/**
 * 智能体卡片网格（v29 共享组件）：
 * 技能管理页顶部「智能体管理」Tab 使用本组件完成智能体的查看 / 新增 / 编辑 / 删除，
 * 各智能体相互独立、互不关联；未归属任何智能体的技能为公共技能。
 */
import { ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { saveAgent, deleteAgent, type Agent } from '@/api/config'

const props = defineProps<{
  /** 智能体列表（父组件负责加载） */
  agents: Agent[]
  /** 技能列表（用于统计每个智能体的技能数；agentId 为空表示公共技能） */
  skills: { id: number; agentId?: number | null }[]
  /** 是否可编辑（skill:edit） */
  canEdit: boolean
}>()
const emit = defineEmits<{ open: [id: number]; changed: [] }>()

const countOf = (agentId: number): number => props.skills.filter((s) => s.agentId === agentId).length
const initialOf = (name: string): string => name.trim().slice(0, 1).toUpperCase() || 'A'

// -------------------------------------------------------------- 新增 / 编辑
const dlgVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const editingId = ref<number | null>(null)
const draft = ref<{ name: string; code: string; description: string; status: 0 | 1; sort: number }>({
  name: '', code: '', description: '', status: 1, sort: 0
})
const rules: FormRules = {
  name: [{ required: true, message: '请输入智能体名称', trigger: 'blur' }],
  code: [
    { required: true, message: '请输入智能体编码', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9-]{1,31}$/, message: '编码须为 2~32 位小写字母/数字/短横线且以字母开头', trigger: 'blur' }
  ]
}

function openCreate(): void {
  editingId.value = null
  draft.value = { name: '', code: '', description: '', status: 1, sort: props.agents.length + 1 }
  dlgVisible.value = true
  formRef.value?.clearValidate()
}

function openEdit(agent: Agent): void {
  editingId.value = agent.id
  draft.value = { name: agent.name, code: agent.code, description: agent.description || '', status: agent.status, sort: agent.sort ?? 0 }
  dlgVisible.value = true
  formRef.value?.clearValidate()
}

async function submit(): Promise<void> {
  if (!formRef.value || saving.value) return
  try { await formRef.value.validate() } catch { return }
  saving.value = true
  try {
    const payload = {
      name: draft.value.name.trim(),
      description: draft.value.description.trim(),
      status: draft.value.status,
      sort: draft.value.sort,
      ...(editingId.value === null ? { code: draft.value.code.trim().toLowerCase() } : {})
    }
    await saveAgent(editingId.value === null ? payload : { ...payload, id: editingId.value })
    ElMessage.success(editingId.value === null ? '智能体已创建' : '智能体已更新')
    dlgVisible.value = false
    emit('changed')
  } catch {
    // 校验与冲突错误已由请求拦截器透出
  } finally {
    saving.value = false
  }
}

async function remove(agent: Agent): Promise<void> {
  const count = countOf(agent.id)
  try {
    await ElMessageBox.confirm(
      count ? `智能体「${agent.name}」仍归属 ${count} 个技能，请先将技能移至其他智能体或公共池。` : `确认删除智能体「${agent.name}」？`,
      '删除智能体',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
  } catch { return }
  try {
    await deleteAgent(agent.id)
    ElMessage.success('智能体已删除')
    emit('changed')
  } catch {
    // 409 引用拦截已透出
  }
}
</script>

<template>
  <div>
    <div class="agent-grid-head">
      <p class="agent-grid-tip">
        每个智能体是一套独立的技能空间，技能归属互斥、互不关联；未归属任何智能体的技能视为公共技能。
      </p>
      <el-button v-if="canEdit" type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>新增智能体
      </el-button>
    </div>

    <div class="agent-cards">
      <div v-for="agent in agents" :key="agent.id" class="agent-card">
        <div class="agent-card-head">
          <span class="agent-avatar">{{ initialOf(agent.name) }}</span>
          <div class="agent-card-title">
            <b>{{ agent.name }}</b>
            <small class="muted">{{ agent.code }}</small>
          </div>
          <el-tag size="small" :type="agent.status === 1 ? 'success' : 'info'" effect="plain">{{ agent.status === 1 ? '启用' : '停用' }}</el-tag>
        </div>
        <div class="agent-card-desc">{{ agent.description || '（未填写描述）' }}</div>
        <div class="agent-card-foot">
          <span>{{ countOf(agent.id) }} 个技能</span>
          <span class="agent-card-ops">
            <el-button link type="primary" @click="emit('open', agent.id)">查看技能</el-button>
            <template v-if="canEdit">
              <el-button link type="primary" @click="openEdit(agent)">编辑</el-button>
              <el-button link type="danger" @click="remove(agent)">删除</el-button>
            </template>
          </span>
        </div>
      </div>
    </div>

    <el-empty v-if="!agents.length" description="尚未创建智能体，可新增一个作为技能归属维度" />

    <el-dialog v-model="dlgVisible" :title="editingId === null ? '新增智能体' : '编辑智能体'" width="520px" destroy-on-close>
      <el-form ref="formRef" :model="draft" :rules="rules" label-width="88px">
        <el-form-item label="名称" prop="name"><el-input v-model="draft.name" maxlength="40" placeholder="如：WorkBuddy" /></el-form-item>
        <el-form-item label="编码" prop="code">
          <el-input v-model="draft.code" :disabled="editingId !== null" maxlength="32" placeholder="小写字母/数字/短横线" />
          <p class="setting-hint">创建后不可修改，用于内部标识</p>
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="draft.description" type="textarea" :rows="3" maxlength="200" placeholder="说明该智能体的定位与用途" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="draft.sort" :min="0" :step="1" /></el-form-item>
        <el-form-item label="状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlgVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.agent-grid-head { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 14px; }
.agent-grid-tip { margin: 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; }
.agent-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; margin-bottom: 18px; }
.agent-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 16px; background: #fff; transition: border-color .15s, box-shadow .15s, transform .15s; }
.agent-card:hover { border-color: var(--el-color-primary); box-shadow: 0 4px 14px rgba(64, 158, 255, .12); transform: translateY(-1px); }
.agent-card-head { display: flex; align-items: center; gap: 10px; }
.agent-avatar { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; font-size: 17px; flex: none; }
.agent-card-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.agent-card-title b { font-size: 15px; color: var(--el-text-color-primary); }
.agent-card-title small { font-size: 11px; }
.agent-card-desc { margin: 12px 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; min-height: 38px; }
.agent-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: var(--el-text-color-regular); border-top: 1px dashed var(--el-border-color-lighter); padding-top: 10px; }
.agent-card-ops { display: flex; align-items: center; gap: 2px; }
.muted { color: var(--el-text-color-secondary); }
.setting-hint { margin: 4px 0 0; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
