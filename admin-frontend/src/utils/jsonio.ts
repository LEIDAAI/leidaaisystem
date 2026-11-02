import { downloadTextFile } from './download'

export { downloadTextFile }

/** 导出 JSON 配置文件（预设迁移用） */
export function downloadJsonFile(filename: string, content: string): void {
  downloadTextFile(filename, content, 'application/json;charset=utf-8')
}

/** 读取用户选择的本地文本文件（导入 JSON 用） */
export async function readTextFile(file: File): Promise<string> {
  return file.text()
}

export interface DiffLine { type: 'same' | 'add' | 'del'; text: string }

/**
 * 简单行级 diff（公共前缀/后缀裁剪，中间差异逐行标记），用于版本历史对比展示。
 */
export function simpleLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = String(oldText ?? '').split('\n')
  const b = String(newText ?? '').split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length, endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const lines: DiffLine[] = a.slice(0, start).map((text) => ({ type: 'same', text }))
  a.slice(start, endA).forEach((text) => lines.push({ type: 'del', text }))
  b.slice(start, endB).forEach((text) => lines.push({ type: 'add', text }))
  a.slice(endA).forEach((text) => lines.push({ type: 'same', text }))
  return lines
}
