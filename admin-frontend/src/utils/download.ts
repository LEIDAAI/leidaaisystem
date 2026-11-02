/** 将 Blob 内容以指定文件名触发浏览器下载 */
export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟释放：立即 revoke 在部分浏览器会导致下载中断
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** 将文本内容以下载方式保存（带 BOM，保证 Excel 打开中文不乱码） */
export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  downloadBlobFile(filename, new Blob(['\uFEFF' + content], { type: mime }))
}
