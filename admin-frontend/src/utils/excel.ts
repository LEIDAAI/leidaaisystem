import dayjs from 'dayjs'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface ExcelColumn {
  header: string
  width: number
  kind?: 'text' | 'integer' | 'money' | 'datetime'
}

export function excelDateTime(value: unknown): string {
  if (!(value instanceof Date) && typeof value !== 'string') return '—'
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) return '—'
  const date = dayjs(value)
  if (!date.isValid()) return '—'
  if (typeof value === 'string' && !/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && !date.format('YYYY-MM-DD HH:mm:ss').startsWith(value.replace('T', ' ').slice(0, 19))) return '—'
  return date.format('YYYY-MM-DD HH:mm:ss')
}

/** 后台表格统一样式；字符串按文本写入，不将用户内容解析成公式。 */
export async function createExcelBlob(name: string, columns: ExcelColumn[], rows: unknown[][]): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] })
  sheet.columns = columns.map(column => ({ header: column.header, width: Math.max(column.width, column.kind === 'datetime' ? 23 : 0) }))
  for (const values of rows) {
    const row = sheet.addRow(columns.map((column, index) => {
      const value = values[index]
      if (column.kind === 'datetime') return excelDateTime(value)
      if (value === null || value === undefined || value === '') return '—'
      if (column.kind === 'integer' || column.kind === 'money') {
        const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
        return Number.isFinite(number) && (column.kind !== 'integer' || Number.isInteger(number)) ? number : '—'
      }
      return String(value)
    }))
    let lines = 1
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      const width = sheet.getColumn(index).width ?? 18
      const length = (text: string) => Array.from(text).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? 2 : 1), 0)
      lines = Math.max(lines, String(cell.value ?? '').split(/\r?\n/).reduce((sum, line) => sum + Math.max(1, Math.ceil(length(line) / Math.max(1, width - 2))), 0))
    })
    row.height = Math.min(409, Math.max(28, lines * 16 + 10))
  }
  sheet.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, index) => {
      const header = rowNumber === 1
      const kind = columns[index - 1]?.kind
      cell.font = { name: '微软雅黑', size: header ? 11 : 10, bold: header, color: { argb: header ? 'FFFFFFFF' : 'FF3C4652' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: header ? 'FF00A83E' : rowNumber % 2 === 0 ? 'FFFFFFFF' : 'FFE9F7EE' } }
      const edge = { style: 'thin' as const, color: { argb: 'FFBFE7CB' } }
      cell.border = { top: edge, bottom: edge, left: edge, right: edge }
      cell.alignment = { vertical: 'middle', horizontal: header ? 'center' : typeof cell.value === 'number' ? 'right' : 'left', wrapText: true }
      cell.numFmt = !header && typeof cell.value === 'number' ? kind === 'money' ? '#,##0.00' : '0' : '@'
    })
  })
  sheet.getRow(1).height = 26
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: columns.length } }
  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([new Uint8Array(buffer)], { type: XLSX_MIME })
}
