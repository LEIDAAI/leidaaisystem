/** 语雀风格编辑器：工具栏 ⇆ 编辑器 共享类型与常量 */

export interface EditorState {
  block: string // p | h1..h6
  fontSize: string
  bold: boolean
  italic: boolean
  strike: boolean
  underline: boolean
  code: boolean
  sup: boolean
  sub: boolean
  ul: boolean
  ol: boolean
  task: boolean
  quote: boolean
  align: 'left' | 'center' | 'right'
  lineHeight: string | null
  olType: number
  color: string
  bg: string
  canUndo: boolean
  canRedo: boolean
  tableActive: boolean
  canMerge: boolean
  tableBorderHidden: boolean
  painter: boolean // 格式刷已吸取格式待应用（按钮高亮）
}

export type EditorCommand =
  | { cmd: 'undo' } | { cmd: 'redo' }
  | { cmd: 'formatPainter' } | { cmd: 'clearFormat' }
  | { cmd: 'block'; v: string }
  | { cmd: 'fontSize'; v: string }
  | { cmd: 'fontStep'; v: number }
  | { cmd: 'bold' } | { cmd: 'italic' } | { cmd: 'strike' } | { cmd: 'underline' }
  | { cmd: 'inlineCode' } | { cmd: 'sup' } | { cmd: 'sub' }
  | { cmd: 'color'; v: string } | { cmd: 'bg'; v: string }
  | { cmd: 'colorDefault' } | { cmd: 'bgDefault' }
  | { cmd: 'gradient'; v: string }
  | { cmd: 'align'; v: 'left' | 'center' | 'right' }
  | { cmd: 'ul' } | { cmd: 'ol' } | { cmd: 'olType'; v: number } | { cmd: 'task' }
  | { cmd: 'indent'; v: 1 | -1 }
  | { cmd: 'lineHeight'; v: string | null }
  | { cmd: 'quote' } | { cmd: 'hr' } | { cmd: 'link' }
  | { cmd: 'codeblock' }
  | { cmd: 'table' }
  | { cmd: 'filePick'; kind: 'image' | 'file'; file: File }
  | { cmd: 'insert'; kind: string; value?: string }
  | { cmd: 'unsupported'; name: string }
  | { cmd: 'find' }
  | { cmd: 'translate' } | { cmd: 'material' }
  | { cmd: 'tableBorder' } | { cmd: 'tableMerge' } | { cmd: 'valign'; v: 'top' | 'middle' | 'bottom' }

export const FONT_SIZES = ['12px', '13px', '14px', '15px', '16px', '19px', '22px', '24px', '29px', '32px', '40px', '48px']

export const LINE_HEIGHTS: { label: string; v: string | null }[] = [
  { label: '默认', v: null }, { label: '1', v: '1' }, { label: '1.15', v: '1.15' }, { label: '1.5', v: '1.5' },
  { label: '2', v: '2' }, { label: '2.5', v: '2.5' }, { label: '3', v: '3' }
]

export const CODE_LANGS = [
  'Plain Text', 'TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Rust', 'C', 'C++', 'C#',
  'SQL', 'JSON', 'YAML', 'Bash', 'HTML', 'CSS', 'Markdown'
]

export const CODE_THEMES = ['Github Light', 'Github Dark', 'Solarized Light']

/** 字体颜色 / 背景色色板（11 列，取自语雀实抓色值） */
export const PALETTE_ROWS: string[][] = [
  ['000000', '585A5A', '8A8F8D', 'D8DAD9', 'E7E9E8', 'EFF0F0', 'F4F5F5', 'FAFAFA', 'FFFFFF'],
  ['DF2A3F', 'ED740C', 'ECAA04', 'FBDE28', '74B602', '1DC0C9', '117CEE', '2F4BDA', '601BDE', 'D22D8D'],
  ['FBE4E7', 'FDE6D3', 'F9EFCD', 'FBF5CB', 'E8F7CF', 'CEF5F7', 'D9EAFC', 'D9CBFC', 'E6DCF9', 'FBDFEF'],
  ['F1A2AB', 'F8B881', 'F5D480', 'FCE75A', 'C1E77E', '81DFE4', '81BBF8', '96A7FD', 'BA9BF2', 'F297CC'],
  ['E4495B', 'F38F39', 'F3BB2F', 'EDCE02', '8CCF17', '01B2BC', '2F8EF4', '4861E0', '7E45E8', 'E746A4'],
  ['AD1A2B', 'C75C00', 'C99103', 'A58F04', '5C8D07', '07787E', '0C68CA', '213BC0', '4C16B1', 'AE146E'],
  ['70000D', '663000', '664900', '665800', '2A4200', '004347', '00346B', '101E60', '270070', '5C0036']
]

/** 渐变色（仅字体颜色面板；值为 CSS linear-gradient） */
export const GRADIENTS = [
  'linear-gradient(90deg, #2ABCBF 0%, #3836DD 100%)',
  'linear-gradient(90deg, #2249FE 0%, #C74AA8 100%)',
  'linear-gradient(90deg, #FF6F04 0%, #F330AB 100%)',
  'linear-gradient(90deg, #F4AA06 0%, #E54631 100%)'
]

export const EMOJIS = ['😀', '😂', '🤣', '😊', '😍', '🤔', '😎', '😭', '😡', '👍', '👏', '🙏', '💪', '🤝', '✌️', '👌', '🔥', '⭐', '✨', '❤️', '💔', '🎉', '🎊', '🚀', '💡', '📌', '✅', '❌', '⚠️', '❓', '❗', '💯', '🎯', '📝', '📅', '⏰', '🤖', '👀', '🧠', '🎁']
