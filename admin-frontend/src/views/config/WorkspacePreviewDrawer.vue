<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { listConfig, type ConfigItem } from '@/api/config'
import { workspaceExperts, workspaceSkills, workspaceMcps, type WorkspaceExpert, type WorkspaceSkill, type WorkspaceMcp } from '@/api/workspace'

/**
 * 前台预览抽屉：以普通用户视角调用 C 端只读工作台契约（/api/v1/workspace/**），
 * 直观验证「后台上架 → 前台选择器可见」；可切换用户持有套餐模拟 PLAN 过滤。
 */
const props = defineProps<{ modelValue: boolean; expert: ConfigItem | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const planIds = ref<number[]>([])
const experts = ref<WorkspaceExpert[]>([])
const skills = ref<WorkspaceSkill[]>([])
const mcps = ref<WorkspaceMcp[]>([])
const plans = ref<ConfigItem[]>([])
const loading = ref(false)

const visibleExpert = computed(() => experts.value.find((e) => e.code === props.expert?.code))
const skillNames = computed(() =>
  (props.expert?.skillIds || []).map((id) => skills.value.find((s) => s.id === id)?.name || `#${id}`)
)

async function refresh(): Promise<void> {
  if (!props.modelValue) return
  loading.value = true
  try {
    ;[experts.value, skills.value, mcps.value] = await Promise.all([
      workspaceExperts(planIds.value.length ? planIds.value : undefined),
      workspaceSkills(planIds.value.length ? planIds.value : undefined),
      workspaceMcps(planIds.value.length ? planIds.value : undefined)
    ])
  } finally {
    loading.value = false
  }
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    if (!plans.value.length) plans.value = await listConfig('plans')
    await refresh()
  },
  { immediate: true }
)
watch(planIds, () => { void refresh() })
</script>
<template>
  <el-drawer :model-value="modelValue" title="前台预览（普通用户视角）" size="720px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-alert
      :type="visibleExpert ? 'success' : 'warning'"
      :closable="false"
      style="margin-bottom:12px"
      :title="visibleExpert ? `「${expert?.name}」当前已上架，对所选视角用户前台可见。` : `「${expert?.name}」当前对该视角不可见（未上架，或可见性与所选套餐不匹配；PRIVATE 仅私有）。`"
    />
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
      <span class="muted">模拟用户持有套餐：</span>
      <el-checkbox-group v-model="planIds">
        <el-checkbox v-for="p in plans" :key="p.id" :value="p.id">{{ p.name }}</el-checkbox>
      </el-checkbox-group>
      <el-button size="small" :loading="loading" @click="refresh">刷新视角</el-button>
    </div>
    <template v-if="visibleExpert">
      <el-card shadow="never" style="margin-bottom:16px">
        <template #header><strong>前台专家卡片（work.html 选择器）</strong></template>
        <div style="display:flex;gap:14px">
          <el-avatar :size="56" :src="expert?.avatarUrl || undefined">{{ visibleExpert.name.slice(0, 1) }}</el-avatar>
          <div style="flex:1">
            <div style="display:flex;gap:8px;align-items:center">
              <strong style="font-size:16px">{{ visibleExpert.name }}</strong>
              <el-tag size="small" type="info">{{ visibleExpert.baseModel }}</el-tag>
              <el-tag v-for="t in visibleExpert.tags" :key="t" size="small">{{ t }}</el-tag>
            </div>
            <p style="margin:8px 0">{{ visibleExpert.description }}</p>
            <p class="muted" style="margin:4px 0">绑定技能 {{ visibleExpert.boundSkillCount }} 个 · 绑定 MCP {{ visibleExpert.boundMcpCount }} 个</p>
            <div v-if="skillNames.length" style="margin:8px 0">
              <el-tag v-for="n in skillNames" :key="n" size="small" type="success" style="margin-right:6px">{{ n }}</el-tag>
            </div>
            <div v-if="visibleExpert.suggestedQuestions.length" style="margin-top:8px">
              <p class="muted" style="margin:4px 0">建议问题：</p>
              <el-tag v-for="q in visibleExpert.suggestedQuestions" :key="q" size="small" type="warning" style="margin:0 6px 6px 0">{{ q }}</el-tag>
            </div>
          </div>
        </div>
      </el-card>
    </template>
    <el-tabs>
      <el-tab-pane :label="`专家库（${experts.length}）`">
        <el-table v-loading="loading" :data="experts" size="small">
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column prop="baseModel" label="模型" width="130" />
          <el-table-column label="绑定技能/MCP" width="120"><template #default="{ row }">{{ row.boundSkillCount }} / {{ row.boundMcpCount }}</template></el-table-column>
          <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>
      <el-tab-pane :label="`技能（${skills.length}）`">
        <el-table v-loading="loading" :data="skills" size="small">
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column prop="boundExpertCount" label="绑定助手数" width="110" />
          <el-table-column prop="description" label="触发意图" min-width="260" show-overflow-tooltip />
        </el-table>
      </el-tab-pane>
      <el-tab-pane :label="`MCP（${mcps.length}）`">
        <el-table v-loading="loading" :data="mcps" size="small">
          <el-table-column prop="name" label="名称" min-width="150" />
          <el-table-column prop="connType" label="类型" width="90" />
          <el-table-column label="地址" min-width="220"><template #default="{ row }">{{ row.endpoint }}{{ row.path }}</template></el-table-column>
          <el-table-column prop="enabledToolCount" label="可用工具" width="90" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
    <p class="muted">数据来源：GET /api/v1/workspace/experts|skills|mcps（C 端只读契约，按启用 + visibility 过滤；PLAN 需套餐匹配，PRIVATE 不出）。</p>
  </el-drawer>
</template>
