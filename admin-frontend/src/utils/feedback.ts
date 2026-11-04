import { ElMessageBox } from 'element-plus'

// -------------------------------------------------- 反馈附图（用户端上传截图）
/** 生成一张「用户上传截图」风格的 SVG data URI：按文件名哈希取 6 种主题（表格/对话/移动端报告/图表/深色后台/上传弹窗），离线可用且同文件名渲染稳定 */
function shotSvg(name: string): string {
  const seed = [...name].reduce((s, c) => s + c.charCodeAt(0), 0)
  const bar = (x: number, y: number, w: number, h: number, fill: string, rx = 2) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`
  const t = seed % 6
  let body = ''
  if (t === 0) body = bar(70, 46, 200, 132, '#fff', 4) + bar(70, 46, 200, 24, '#ecf5ff', 4) + bar(80, 53, 46, 9, '#409eff') + [0, 1, 2, 3, 4].map(r => bar(80, 78 + r * 19, 26 + ((seed * 7 + r * 31) % 148), 8, r % 2 ? '#ebeef5' : '#dcdfe6')).join('')
  else if (t === 1) body = bar(70, 46, 200, 132, '#f5f7fa', 4) + bar(80, 58, 92, 16, '#fff', 8) + bar(138, 84, 112, 22, '#409eff', 8) + bar(80, 116, 122, 16, '#fff', 8) + bar(148, 142, 102, 20, '#409eff', 8)
  else if (t === 2) body = bar(140, 40, 62, 144, '#fff', 6) + bar(147, 50, 48, 10, '#409eff') + bar(147, 66, 48, 30, '#ecf5ff', 3) + bar(147, 102, 48, 8, '#dcdfe6') + bar(147, 116, 36, 8, '#dcdfe6') + bar(147, 130, 44, 8, '#dcdfe6') + bar(147, 152, 48, 8, '#dcdfe6')
  else if (t === 3) { const pts = Array.from({ length: 8 }, (_, i) => `${100 + i * 22},${142 - ((seed * 13 + i * 29) % 70)}`).join(' '); body = bar(70, 46, 200, 132, '#fff', 4) + bar(80, 52, 50, 8, '#909399') + `<polyline points="${pts}" fill="none" stroke="#409eff" stroke-width="2"/>` + [0, 1, 2].map(i => bar(134 + i * 44, 150, 36, 18, '#ecf5ff', 3)).join('') }
  else if (t === 4) body = bar(70, 46, 200, 132, '#1d2935', 4) + bar(70, 46, 52, 132, '#141e27', 4) + [0, 1, 2].map(i => bar(78, 60 + i * 18, 36, 8, '#3a4a5a')).join('') + [0, 1, 2].map(i => bar(134 + i * 44, 60, 36, 28, '#263442', 3)).join('') + bar(134, 102, 124, 62, '#263442', 3)
  else body = bar(90, 58, 160, 108, '#fff', 6) + bar(90, 58, 160, 20, '#f5f7fa', 6) + bar(122, 90, 96, 34, '#ecf5ff', 4) + `<path d="M170 96 l11 14 h-22 z" fill="#409eff"/>` + bar(122, 132, 96, 8, '#dcdfe6')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="224" viewBox="0 0 340 224"><rect width="340" height="224" fill="#f0f2f5"/>${bar(56, 12, 228, 10, '#dcdfe6', 5)}${body}<text x="330" y="214" font-size="11" fill="#909399" text-anchor="end" font-family="monospace">${name}</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** 附图展示源：种子存文件名（fb-shot-xx.png）→ 本地 SVG 截图；存 URL/dataURI → 原样返回 */
export function feedbackImageSrc(name: string): string {
  if (/^(https?:|data:|blob:)/.test(name)) return name
  return shotSvg(name)
}

/** 确认弹窗：确定返回 true，取消返回 false */
export async function confirmAction(message: string, title = '提示'): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    return true
  } catch {
    return false
  }
}

interface PromptOptions {
  inputType?: string
  inputPattern?: RegExp
  inputErrorMessage?: string
  inputValue?: string
  placeholder?: string
}

/** 输入弹窗：确定返回输入值，取消返回 null */
export async function promptText(message: string, title: string, options?: PromptOptions): Promise<string | null> {
  try {
    const { value } = await ElMessageBox.prompt(message, title, {
      inputType: options?.inputType ?? 'text',
      inputPattern: options?.inputPattern,
      inputErrorMessage: options?.inputErrorMessage,
      inputValue: options?.inputValue,
      inputPlaceholder: options?.placeholder,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    return value
  } catch {
    return null
  }
}
