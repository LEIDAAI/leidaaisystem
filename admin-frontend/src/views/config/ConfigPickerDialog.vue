<script setup lang="ts">
/**
 * Coze 式资源选择弹窗（v6，参考图1「添加插件」交互）：
 * 左侧筛选栏（搜索 + 分类：全部 / 已绑定 / 所选平台）+ 右侧行式列表（点行切换选中、右端勾选态）。
 * 技能与 MCP 共用：type 区分数据源与展示标签。停用项（status!==1）禁选并置灰。
 */
import { computed, ref, watch } from 'vue'
import { platformMeta, type ConfigItem, type PlatformType } from '@/api/config'
import { formatDateTime } from '@/utils/format'

const props = defineProps<{
  modelValue: boolean
  type: 'skill' | 'mcp'
  /** 当前专家草稿所选平台：决定「平台」筛选项与默认可见范围 */
  platforms: PlatformType[]
  /** 已绑定 ID（进入弹窗时回显勾选） */
  selectedIds: number[]
  skills: ConfigItem[]
  servers: ConfigItem[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; confirm: [number[]] }>()

const keyword = ref('')
const activeCat = ref('all')
/** 弹窗内暂存选中集（确认才回写草稿，取消即丢弃） */
const picked = ref<Set<number>>(new Set())

const source = computed<ConfigItem[]>(() => (props.type === 'skill' ? props.skills : props.servers))

/** 分类筛选：全部 / 已绑定 / 某平台（仅展示与专家平台有交集的资源） */
const scoped = computed(() => source.value.filter((s) => (s.platforms || []).some((p) => props.platforms.includes(p as PlatformType))))
const filtered = computed(() =>
  scoped.value.filter((s) => {
    if (activeCat.value === 'bound' && !picked.value.has(s.id)) return false
    if (activeCat.value !== 'all' && activeCat.value !== 'bound' && !(s.platforms || []).includes(activeCat.value as PlatformType)) return false
    return !keyword.value || `${s.name} ${s.code}`.toLowerCase().includes(keyword.value.toLowerCase())
  })
)
/** 各分类计数徽标 */
const catCount = (cat: string): number =>
  cat === 'all' ? scoped.value.length : cat === 'bound' ? scoped.value.filter((s) => picked.value.has(s.id)).length : scoped.value.filter((s) => (s.platforms || []).includes(cat as PlatformType)).length

const cats = computed(() => [
  { key: 'all', label: `全部${props.type === 'skill' ? '技能' : 'MCP'}` },
  { key: 'bound', label: '已绑定' },
  ...props.platforms.map((p) => ({ key: p, label: platformMeta(p).label }))
])

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      keyword.value = ''
      activeCat.value = 'all'
      picked.value = new Set(props.selectedIds)
    }
  }
)

function toggle(item: ConfigItem): void {
  if (item.status !== 1) return
  const next = new Set(picked.value)
  if (next.has(item.id)) next.delete(item.id)
  else next.add(item.id)
  picked.value = next
  if (activeCat.value === 'bound' && !next.has(item.id)) activeCat.value = 'all'
}

function onConfirm(): void {
  emit('confirm', [...picked.value])
  emit('update:modelValue', false)
}
</script>
<template>
  <el-dialog
    :model-value="modelValue"
    :title="`添加${type === 'skill' ? '技能' : 'MCP 插件'}`"
    width="860px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="picker-layout">
      <aside class="picker-side">
        <el-input v-model="keyword" placeholder="搜索名称或编码" clearable prefix-icon="Search" />
        <div class="cat-list">
          <div v-for="c in cats" :key="c.key" :class="['cat-item', { active: activeCat === c.key }]" @click="activeCat = c.key">
            <span>{{ c.label }}</span>
            <span class="cat-count">{{ catCount(c.key) }}</span>
          </div>
        </div>
      </aside>
      <div class="picker-main">
        <div class="picker-list">
          <div
            v-for="s in filtered"
            :key="s.id"
            :class="['pick-row', { picked: picked.has(s.id), disabled: s.status !== 1 }]"
            @click="toggle(s)"
          >
            <div class="pick-icon">{{ (s.name || '?').slice(0, 1) }}</div>
            <div class="pick-info">
              <div class="pick-name">
                {{ s.name }}
                <el-tag size="small" :type="type === 'skill' ? 'primary' : 'warning'" effect="plain" class="pick-tag">
                  {{ type === 'skill' ? '技能' : 'MCP 插件' }}
                </el-tag>
                <span v-for="p in s.platforms" :key="p" class="plat-dot" :style="{ color: platformMeta(p).color, background: platformMeta(p).bg, borderColor: platformMeta(p).border }">{{ platformMeta(p).label }}</span>
                <el-tag v-if="s.status !== 1" size="small" type="info" effect="plain">已停用</el-tag>
              </div>
              <div class="pick-desc">{{ s.description || s.code }}</div>
              <div class="pick-meta">创建于 {{ formatDateTime(s.updatedAt) }} · {{ s.code }}</div>
            </div>
            <div class="pick-check" :class="{ on: picked.has(s.id) }">
              <el-icon v-if="picked.has(s.id)"><svg viewBox="0 0 1024 1024" width="12" height="12"><path fill="currentColor" d="M406.656 746.528L222.08 561.92l-45.248 45.28 229.824 229.824L902.08 341.632l-45.248-45.248z" /></svg></el-icon>
            </div>
          </div>
          <el-empty v-if="!filtered.length" :description="keyword ? '无匹配结果' : '当前分类暂无可选项'" :image-size="72" />
        </div>
      </div>
    </div>
    <template #footer>
      <div class="picker-footer">
        <span class="muted">已选 {{ picked.size }} 项</span>
        <div>
          <el-button @click="emit('update:modelValue', false)">取消</el-button>
          <el-button type="primary" @click="onConfirm">确定</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>
<style scoped>
.picker-layout { display: flex; gap: 14px; height: 480px; }
.picker-side { flex: 0 0 190px; display: flex; flex-direction: column; gap: 10px; border-right: 1px solid var(--el-border-color-lighter); padding-right: 14px; }
.cat-list { overflow-y: auto; }
.cat-item { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 13px; color: var(--el-text-color-primary); }
.cat-item:hover { background: var(--el-fill-color-light); }
.cat-item.active { background: var(--el-color-primary-light-9); color: var(--el-color-primary); font-weight: 600; }
.cat-count { font-size: 12px; color: var(--el-text-color-secondary); }
.picker-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.picker-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.pick-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; cursor: pointer; transition: border-color 0.12s, background 0.12s; }
.pick-row:hover { border-color: var(--el-color-primary-light-5); }
.pick-row.picked { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.pick-row.disabled { opacity: 0.5; cursor: not-allowed; }
.pick-icon { flex: 0 0 38px; height: 38px; border-radius: 8px; background: var(--el-fill-color); display: flex; align-items: center; justify-content: center; font-weight: 700; color: var(--el-color-primary); font-size: 16px; }
.pick-info { flex: 1; min-width: 0; }
.pick-name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pick-tag { transform: scale(0.9); }
.plat-dot { font-size: 11px; padding: 0 6px; border-radius: 4px; border: 1px solid; line-height: 18px; }
.pick-desc { font-size: 12px; color: var(--el-text-color-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pick-meta { font-size: 11px; color: var(--el-text-color-placeholder); margin-top: 3px; }
.pick-check { flex: 0 0 20px; height: 20px; border-radius: 50%; border: 1px solid var(--el-border-color); display: flex; align-items: center; justify-content: center; color: #fff; }
.pick-check.on { background: var(--el-color-primary); border-color: var(--el-color-primary); }
.picker-footer { display: flex; justify-content: space-between; align-items: center; }
</style>
