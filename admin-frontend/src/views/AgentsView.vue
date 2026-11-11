<script setup lang="ts">
/**
 * 智能体管理页（v26）：
 * - 左侧导航独立入口，列出全部智能体（有维AI / WorkBuddy / 千问 …），各自技能相互独立、互不关联
 * - 卡片展示名称、编码、描述、启停状态与技能数；可跳转技能页查看该智能体归属的技能
 * - 新增/编辑/删除：编码创建后不可改；删除前须先将其技能移至其他智能体或公共池
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { listAgents, saveAgent, deleteAgent, listConfig, type Agent } from '@/api/config'
import { createSeqGuard } from '@/utils/race'

const router = useRouter()
const auth = useAuthStore()
const canEdit = computed(() => auth.hasPerm('skill:edit'))

const agents = ref<Agent[]>([])
const skills = ref<{ id: number; name: string; agentId?: number | null }[]>([])
const keyword = ref('')
const loading = ref(false)
const loadError = ref('')
const loadGuard = createSeqGuard()

const filtered = computed(() => agents.value.filter((a) => !keyword.value.trim() || `${a.name} ${a.code} ${a.description || ''}`.includes(keyword.value.trim())))
const skillCountOf = (agentId: number): number => skills.value.filter((s) => s.agentId === agentId).length

async function load(): Promise<void> {
  const seq = loadGuard.next()
  loading.value = true
  loadError.value = ''
  try {
    const [agentList, skillList] = await Promise.all([listAgents(), listConfig('skills')])
    if (!loadGuard.isCurrent(seq)) return
    agents.value = agentList
    skills.value = skillList.map((s) => ({ id: s.id, name: s.name, agentId: s.agentId ?? null }))
  } catch (e) {
    if (!loadGuard.isCurrent(seq)) return
    loadError.value = e instanceof Error ? e.message : '智能体加载失败'
    agents.value = []
  } finally {
    if (loadGuard.isCurrent(seq)) loading.value = false
  }
}
onMounted(() => { void load() })

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
  draft.value = { name: '', code: '', description: '', status: 1, sort: agents.value.length + 1 }
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
    await load()
  } catch {
    // 校验与冲突错误已由请求拦截器透出
  } finally {
    saving.value = false
  }
}

async function remove(agent: Agent): Promise<void> {
  const count = skillCountOf(agent.id)
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
    await load()
  } catch {
    // 409 引用拦截已透出
  }
}

/** 跳转技能页并定位到该智能体 */
function gotoSkills(agent: Agent): void {
  void router.push({ path: '/skills', query: { tab: 'agents', agent: String(agent.id) } })
}

const initialOf = (name: string): string => name.trim().slice(0, 1).toUpperCase() || 'A'
</script>

<template>
  <section class="page">
    <header class="page-heading">
      <div class="eyebrow">有维AI管理系统</div>
      <h1>智能体管理</h1>
      <p class="lead">
        每个智能体是一套独立的技能空间，技能归属互斥、互不关联；未归属任何智能体的技能视为公共技能。
      </p>
    </header>

    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索智能体名称 / 编码" clearable style="width: 260px" />
      <el-button v-if="canEdit" type="primary" @click="openCreate">
        <el-icon><Plus /></el-icon>新增智能体
      </el-button>
    </div>

    <el-alert v-if="loadError" type="error" :closable="false" :title="loadError" show-icon style="margin-bottom: 14px" />

    <div v-loading="loading" class="agent-cards">
      <div v-for="agent in filtered" :key="agent.id" class="agent-card">
        <div class="agent-card-head">
          <span class="agent-avatar">{{ initialOf(agent.name) }}</span>
          <div class="agent-card-title">
            <b>{{ agent.name }}</b>
            <small>{{ agent.code }}</small>
          </div>
          <el-tag :type="agent.status === 1 ? 'success' : 'info'" size="small" effect="plain">{{ agent.status === 1 ? '启用' : '停用' }}</el-tag>
        </div>
        <p class="agent-card-desc">{{ agent.description || '（未填写描述）' }}</p>
        <div class="agent-card-foot">
          <span class="muted">{{ skillCountOf(agent.id) }} 个技能</span>
          <span class="agent-card-ops">
            <el-button link type="primary" @click="gotoSkills(agent)">查看技能</el-button>
            <template v-if="canEdit">
              <el-button link type="primary" @click="openEdit(agent)">编辑</el-button>
              <el-button link type="danger" @click="remove(agent)">删除</el-button>
            </template>
          </span>
        </div>
      </div>
    </div>

    <el-empty v-if="!loading && !filtered.length" :description="keyword ? '没有匹配的智能体' : '尚未创建智能体'" />

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
  </section>
</template>

<style scoped>
.agent-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.agent-card { border: 1px solid var(--el-border-color-lighter); border-radius: 10px; padding: 16px; background: var(--el-bg-color); transition: border-color .15s, box-shadow .15s; }
.agent-card:hover { border-color: var(--el-color-primary-light-5); box-shadow: 0 4px 14px rgba(64, 158, 255, .1); }
.agent-card-head { display: flex; align-items: center; gap: 10px; }
.agent-avatar { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; font-size: 17px; flex: none; }
.agent-card-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.agent-card-title b { font-size: 15px; color: var(--el-text-color-primary); }
.agent-card-title small { font-size: 11px; color: var(--el-text-color-secondary); }
.agent-card-desc { margin: 12px 0; font-size: 12px; color: var(--el-text-color-secondary); line-height: 1.6; min-height: 38px; }
.agent-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; border-top: 1px dashed var(--el-border-color-lighter); padding-top: 10px; }
.agent-card-ops { display: flex; align-items: center; gap: 2px; }
.muted { color: var(--el-text-color-secondary); }
.setting-hint { margin: 4px 0 0; font-size: 12px; color: var(--el-text-color-secondary); }
</style>
