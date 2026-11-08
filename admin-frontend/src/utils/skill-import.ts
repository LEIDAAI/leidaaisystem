/**
 * 技能导入解析：将「导入文件（JSON / ZIP）」选择的文件解析为技能草稿列表（SkillImportDraft[]），
 * 交由 SkillImportDialog 预览（勾选 / 编码冲突建议）后批量导入。
 * - JSON：单个技能对象或对象数组（导出 JSON 兼容）
 * - ZIP：{目录}/SKILL.md 多技能（Export Zip 往返包）或根目录 SKILL.md 单技能；
 *   SKILL.md 支持 YAML frontmatter 的 name/description；无 SKILL.md 时回退解析 ZIP 内技能 JSON
 */
import { unzipTextFiles } from './zip'
import { PLATFORMS, type PlatformType, type SkillFile } from '@/api/config'

export interface SkillImportDraft {
  name: string
  code: string
  description: string
  content: string
  files: SkillFile[]
  group?: string
  platforms?: PlatformType[]
  /** 来源标签：JSON 文件名或 ZIP 内目录名（预览列表展示用） */
  source: string
  /** 导入预览前展示被跳过的文件及原因。 */
  skipped?: string[]
}

/** 二进制扩展名（不可作文本附属文件解析的项：图片/压缩包/字体/媒体等） */
export const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|pdf|zip|gz|7z|rar|bin|exe|dll|woff2?|ttf|otf|mp4|mp3)$/i

/** 编码合法字符（与后端保存校验一致：字母数字下划线短横线） */
export const SKILL_CODE_RE = /^[a-zA-Z0-9_-]+$/

/** 清洗为合法编码：非法字符替换为下划线、去首尾下划线；清洗后为空则用 imported-skill */
function sanitizeCode(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
  return SKILL_CODE_RE.test(cleaned) ? cleaned : 'imported-skill'
}

/** 解析 SKILL.md YAML frontmatter 的 name / description（Claude Agent Skills 格式，宽松键值解析） */
export function parseFrontmatter(content: string): { name?: string; description?: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (!m) return {}
  const out: { name?: string; description?: string } = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+)\s*:\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    const v = kv[2].trim().replace(/^["']|["']$/g, '')
    if (kv[1] === 'name') out.name = v
    else if (kv[1] === 'description') out.description = v
  }
  return out
}

/** 导出 JSON 对象 → 草稿（保留 platforms/group 等业务字段） */
function draftFromObject(o: Record<string, unknown>, source: string): SkillImportDraft {
  const name = String(o.name || o.code || 'imported-skill')
  // 平台归一化：大写 + 仅保留合法值 + 去重（第三方文件常见小写 ozon/amazon 等）；全非法则留空由后端回填默认
  const platforms = Array.isArray(o.platforms)
    ? [...new Set(
        (o.platforms as unknown[])
          .filter((p): p is string => typeof p === 'string')
          .map((p) => p.toUpperCase())
          .filter((p): p is PlatformType => (PLATFORMS as string[]).includes(p))
      )]
    : []
  return {
    name,
    code: sanitizeCode(String(o.code || name)),
    description: String(o.description || ''),
    content: String(o.content ?? ''),
    files: Array.isArray(o.files)
      ? (o.files as unknown[]).filter((f): f is SkillFile => !!f && typeof (f as SkillFile).name === 'string' && typeof (f as SkillFile).content === 'string')
      : [],
    group: typeof o.group === 'string' && o.group.trim() ? o.group.trim() : undefined,
    ...(platforms.length ? { platforms } : {}),
    source
  }
}

function draftsFromPayload(payload: unknown, source: string): SkillImportDraft[] {
  const arr = Array.isArray(payload) ? payload : [payload]
  const drafts = arr
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o))
    .map((o) => draftFromObject(o, source))
  if (!drafts.length) throw new Error('文件中未找到有效的技能 JSON 对象（须为技能对象或对象数组）')
  return drafts
}

/** 解析导入的 JSON 文件：支持单技能对象或对象数组 */
export async function parseSkillJsonFile(file: File): Promise<SkillImportDraft[]> {
  let payload: unknown
  try {
    payload = JSON.parse(await file.text())
  } catch {
    throw new Error('JSON 解析失败：文件内容不是合法 JSON')
  }
  return draftsFromPayload(payload, file.name)
}

/** 解析导入的 ZIP：{目录}/SKILL.md 多技能；根目录 SKILL.md 单技能；无 SKILL.md 时回退 ZIP 内首个技能 JSON */
export async function parseSkillZipFile(file: File): Promise<SkillImportDraft[]> {
  return parseSkillEntries(await unzipTextFiles(file), file.name)
}

/** ZIP 与文件夹共用：每个文件归属包含它的最近一个 SKILL.md 根。 */
export function parseSkillEntries(entries: Record<string, string>, sourceName: string): SkillImportDraft[] {
  const normalized: Record<string, string> = Object.create(null) as Record<string, string>
  const skipped: string[] = []
  for (const [raw, content] of Object.entries(entries)) {
    const n = raw.replace(/\\/g, '/').replace(/^(\.\/)+/, '')
    if (n.endsWith('/')) continue
    if (!n || n.startsWith('/') || /^[a-z]:/i.test(n) || n.split('/').some((part) => !part || part === '..')) {
      skipped.push(`${raw}（路径无效）`)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(normalized, n)) throw new Error(`导入包包含重复路径：${n}`)
    normalized[n] = content
  }
  const names = Object.keys(normalized)
  const skillMds = names.filter((n) => /(^|\/)SKILL\.md$/i.test(n))
  const rootOf = (md: string): string => md.includes('/') ? md.slice(0, md.lastIndexOf('/') + 1) : ''
  const nearestRoot = (name: string): string | undefined => skillMds
    .filter((md) => name.startsWith(rootOf(md)))
    .sort((a, b) => rootOf(b).length - rootOf(a).length)[0]
  if (skillMds.length) {
    const drafts: SkillImportDraft[] = []
    for (const n of names) {
      if (BINARY_EXT.test(n)) skipped.push(`${n}（非文本文件）`)
      else if (!nearestRoot(n)) skipped.push(`${n}（不属于任何技能根）`)
    }
    for (const md of skillMds) {
      const dir = md.includes('/') ? md.slice(0, md.lastIndexOf('/')) : ''
      const content = normalized[md]
      const fm = parseFrontmatter(content)
      const files: SkillFile[] = []
      for (const n of names) {
        if (skillMds.includes(n) || nearestRoot(n) !== md || BINARY_EXT.test(n)) continue
        files.push({ name: dir ? n.slice(dir.length + 1) : n, content: normalized[n] })
      }
      const folderName = dir ? (dir.split('/').pop() as string) : sourceName.replace(/\.zip$/i, '')
      drafts.push({
        name: fm.name || folderName,
        code: sanitizeCode(fm.name || folderName),
        description: fm.description || '',
        content,
        files,
        source: dir || 'ZIP 根目录'
      })
    }
    if (drafts.length && skipped.length) drafts[0].skipped = skipped
    return drafts
  }
  const jsonName = names.find((n) => /\.json$/i.test(n))
  if (!jsonName) throw new Error('ZIP 中未找到 SKILL.md 或技能 JSON 文件（支持 Export Zip 往返包或 {目录}/SKILL.md 结构）')
  try {
    const drafts = draftsFromPayload(JSON.parse(normalized[jsonName]), `${sourceName} / ${jsonName}`)
    drafts[0].skipped = [...skipped, ...names.filter((n) => n !== jsonName).map((n) => `${n}（使用技能 JSON，其余条目未导入）`)]
    return drafts
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(`ZIP 内 JSON 文件 ${jsonName} 解析失败：内容不是合法 JSON`)
    throw e
  }
}
