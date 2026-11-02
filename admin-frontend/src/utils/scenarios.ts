/**
 * 场景选项共享工具（专家 / 技能 / 知识库通用）：
 * - 模块级缓存场景库，避免各表单重复拉取
 * - ensureScenario：按名称取/建场景（输入自定义名称后回车，自动注册进场景库）
 */
import { ref } from 'vue'
import { listScenarios, saveScenario, PLATFORM_META, type Scenario, type PlatformType } from '@/api/config'

const scenarios = ref<Scenario[]>([])
let loaded = false
let inflight: Promise<void> | null = null

export function scenarioList(): Scenario[] {
  return scenarios.value
}

export async function reloadScenarios(): Promise<void> {
  scenarios.value = await listScenarios()
  loaded = true
}

export async function ensureScenarios(): Promise<Scenario[]> {
  if (loaded) return scenarios.value
  // 并发去重：多个表单同时打开只发一次请求
  if (!inflight) inflight = reloadScenarios().finally(() => { inflight = null })
  await inflight
  return scenarios.value
}

/** 下拉 label：跨平台同名场景带平台后缀区分 */
export function scenarioLabel(s: Scenario, all: Scenario[] = scenarios.value): string {
  const dup = all.filter((x) => x.name === s.name).length > 1
  return dup ? `${s.name}（${PLATFORM_META[s.platformId]?.label || s.platformId}）` : s.name
}

/** 下拉选项：所选平台场景优先置顶，其余排后（对齐前台「先选平台、再选场景」语义） */
export function orderedScenarioOptions(platforms: readonly string[] | undefined): Array<Scenario & { label: string }> {
  const plats = new Set(platforms || [])
  const list = scenarioList()
  return [...list]
    .sort((a, b) => Number(plats.has(b.platformId)) - Number(plats.has(a.platformId)))
    .map((s) => ({ ...s, label: scenarioLabel(s, list) }))
}

/** 取/建场景：按名称查找（优先匹配指定平台），不存在则创建到 platformId 平台下 */
export async function ensureScenario(name: string, platformId: PlatformType): Promise<Scenario> {
  const nm = String(name || '').trim()
  if (!nm) throw new Error('场景名称不能为空')
  await ensureScenarios()
  const found = scenarios.value.find((s) => s.name === nm && s.platformId === platformId) || scenarios.value.find((s) => s.name === nm)
  if (found) return found
  const created = await saveScenario({ name: nm, platformId })
  await reloadScenarios()
  return created
}
