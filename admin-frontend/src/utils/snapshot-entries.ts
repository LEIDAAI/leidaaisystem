/**
 * 版本快照条目解析（v27）：
 * 把某个版本的快照拆成「可点选的条目清单 + 与条目对应的内容」，
 * 让版本历史抽屉可以按条目浏览，而不是只能看整篇文本。
 * - skills：SKILL.md 按 markdown 标题切分章节 + 附属文件逐个成条
 * - 其它资源（专家 / MCP / 套餐）：快照顶层字段逐个成条
 */
import type { ConfigItem } from '@/api/config'

export interface SnapshotEntry {
  /** 稳定 id（同一版本内唯一） */
  id: string
  /** 条目标题（章节名 / 文件名 / 字段中文名） */
  label: string
  /** 条目类型标签 */
  hint: string
  /** 条目内容（与右侧预览一一对应） */
  content: string
}

/** 树节点（技能版本快照用）：root=SKILL.md / folder=文件夹 / file=文件 / section=章节 */
export interface SnapshotTreeNode {
  id: string
  label: string
  kind: 'root' | 'folder' | 'file' | 'section'
  hint?: string
  content?: string
  children?: SnapshotTreeNode[]
}

/** 展平后的条目（用于列表渲染，depth 控制缩进） */
export interface FlatTreeEntry {
  id: string
  label: string
  kind: SnapshotTreeNode['kind']
  hint?: string
  content?: string
  depth: number
  /** 是否有子节点（文件夹 / SKILL.md 章节组） */
  expandable: boolean
  expanded: boolean
}

/** 字段中文名（按资源类型分组，未命中时回退原始 key） */
const FIELD_LABELS: Record<string, string> = {
  name: '名称', description: '描述', content: '正文（SKILL.md）', files: '附属文件',
  systemPrompt: '系统提示词', baseModel: '基础模型', skillIds: '绑定技能',
  mcpServerIds: '绑定 MCP 服务', suggestedQuestions: '建议问题', capabilities: '能力开关',
  tags: '标签', visibility: '可见性', avatarUrl: '头像', isDefault: '默认专家',
  scenarioId: '所属场景', agentId: '归属智能体', platforms: '适用平台',
  connType: '连接类型', endpoint: '端点地址', path: '接口路径', transport: '传输协议',
  authConfig: '鉴权配置', toolFilter: '工具过滤', tools: '工具列表',
  price: '价格', originalPrice: '划线价', credits: 'AI 积分', durationDays: '有效天数',
  durationMode: '时长模式', billingCycles: '计费周期', features: '功能特性',
  firstPurchasePrice: '首购价', tagline: '一句话卖点', badge: '角标', remark: '备注',
  paramSchema: '参数契约', execConfig: '执行配置', code: '编码', sort: '排序'
}

const asText = (v: unknown): string => {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x))).join('\n') : '（空列表）'
  return JSON.stringify(v, null, 2)
}

/** SKILL.md 按 markdown 标题（# ~ ######）切分为章节；标题前正文作为「前言」 */
export function splitMarkdownSections(content: string): { label: string; content: string }[] {
  const lines = String(content || '').split(/\r?\n/)
  const sections: { label: string; content: string }[] = []
  const preamble: string[] = []
  let cur: { label: string; lines: string[] } | null = null
  const flush = (): void => {
    if (!cur) return
    const body = cur.lines.join('\n').replace(/\s+$/, '')
    if (body.trim()) sections.push({ label: cur.label, content: body })
    cur = null
  }
  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line)
    if (m) {
      flush()
      cur = { label: (m[2] || '').trim() || '（未命名章节）', lines: [line] }
    } else if (cur) cur.lines.push(line)
    else preamble.push(line)
  }
  flush()
  const pre = preamble.join('\n').trim()
  if (!sections.length) return pre ? [{ label: '全文', content: pre }] : []
  return pre ? [{ label: '前言', content: pre }, ...sections] : sections
}

/**
 * 技能快照文件树（与技能编辑器一致的文件分组规则）：
 * 根节点 SKILL.md（children 为章节）→ 首段路径隐式文件夹 → 散落文件
 */
export function buildSkillTree(snapshot: ConfigItem | null | undefined): SnapshotTreeNode[] {
  if (!snapshot) return []
  const nodes: SnapshotTreeNode[] = []

  // 根：SKILL.md（章节作为子节点，便于按章节查看）
  const content = String(snapshot.content || '')
  const sections = splitMarkdownSections(content)
  const rootChildren: SnapshotTreeNode[] = sections.map((s, i) => ({
    id: `sec-${i}`, label: s.label, kind: 'section', hint: '章节', content: s.content
  }))
  nodes.push({
    id: 'root', label: 'SKILL.md', kind: 'root', hint: '主文档', content: content || '（空）',
    children: rootChildren
  })

  // 附属文件：首段路径 → 文件夹分组，其余散落
  const folderMap = new Map<string, SnapshotTreeNode[]>()
  const loose: SnapshotTreeNode[] = []
  ;(snapshot.files || []).forEach((f, i) => {
    const name = String(f.name || '').trim()
    if (!name) return
    const slash = name.indexOf('/')
    const node: SnapshotTreeNode = {
      id: `file-${i}`, label: slash > 0 ? name.slice(slash + 1) : name,
      kind: 'file', hint: '文件', content: String(f.content || '（空）')
    }
    if (slash > 0) {
      const folder = name.slice(0, slash)
      if (!folderMap.has(folder)) folderMap.set(folder, [])
      folderMap.get(folder)!.push(node)
    } else {
      loose.push(node)
    }
  })
  ;[...folderMap.entries()].forEach(([folder, files]) => {
    nodes.push({
      id: `folder-${folder}`, label: folder, kind: 'folder', hint: `${files.length} 个文件`, children: files
    })
  })
  nodes.push(...loose)
  return nodes
}

/** 其它资源：快照顶层字段逐个成条 */
export function buildFieldEntries(snapshot: ConfigItem | null | undefined): SnapshotEntry[] {
  if (!snapshot) return []
  const skip = new Set(['id', 'version', 'createdAt', 'updatedAt', 'status', 'refreshStatus', 'appliedVersion', 'refreshMessage'])
  const entries: SnapshotEntry[] = []
  const raw = snapshot as unknown as Record<string, unknown>
  for (const key of Object.keys(raw)) {
    if (skip.has(key)) continue
    const value = raw[key]
    if (value === undefined || value === null || value === '') continue
    entries.push({ id: `f-${key}`, label: FIELD_LABELS[key] || key, hint: '配置项', content: asText(value) })
  }
  return entries.length ? entries : [{ id: 'f-empty', label: '（无内容）', hint: '', content: '（空）' }]
}

/** 树 → 扁平列表（展开态决定是否输出子节点，depth 用于缩进） */
export function flattenTree(nodes: SnapshotTreeNode[], expanded: Set<string>): FlatTreeEntry[] {
  const out: FlatTreeEntry[] = []
  const walk = (list: SnapshotTreeNode[], depth: number): void => {
    list.forEach((n) => {
      const hasChildren = !!n.children?.length
      const isExpanded = expanded.has(n.id)
      out.push({
        id: n.id, label: n.label, kind: n.kind, hint: n.hint, content: n.content,
        depth, expandable: hasChildren, expanded: isExpanded
      })
      if (hasChildren && isExpanded) walk(n.children!, depth + 1)
    })
  }
  walk(nodes, 0)
  return out
}
