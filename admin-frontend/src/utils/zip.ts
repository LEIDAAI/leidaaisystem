/**
 * 手写 store-only ZIP 打包（无压缩，仅存储），用于技能「Export Zip」。
 * 无第三方依赖：CRC32 手写实现 + 本地文件头/中央目录按 ZIP 规范拼装。
 * 中文文件名使用 UTF-8 标志位（bit 11）。
 */

/** CRC-32（IEEE 802.3），查表法 */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

interface ZipEntry {
  nameBytes: Uint8Array
  data: Uint8Array
  crc: number
  offset: number
}

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** DOS 时间格式（2 字节日期 + 2 字节时间） */
function dosDateTime(date: Date): { date: number; time: number } {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f)
  const d = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { date: d & 0xffff, time: time & 0xffff }
}

/** 将多个文本文件打包为 store-only ZIP Blob（${filename} 不可含 \\ 或以 / 开头） */
export function zipFiles(entries: Array<{ name: string; content: string }>): Blob {
  const { date, time } = dosDateTime(new Date())
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  const built: ZipEntry[] = []
  let offset = 0

  const pushU16 = (arr: number[], v: number): void => { arr.push(v & 0xff, (v >>> 8) & 0xff) }
  const pushU32 = (arr: number[], v: number): void => { arr.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff) }

  for (const e of entries) {
    const nameBytes = textBytes(e.name.replace(/\\/g, '/'))
    const data = textBytes(e.content)
    const crc = crc32(data)
    built.push({ nameBytes, data, crc, offset })

    // 本地文件头：PK\x03\x04
    const head: number[] = []
    pushU32(head, 0x04034b50)
    pushU16(head, 20) // 版本
    pushU16(head, 0x0800) // UTF-8 标志 + store
    pushU16(head, 0) // 压缩方式：store
    pushU16(head, time)
    pushU16(head, date)
    pushU32(head, crc)
    pushU32(head, data.length) // 压缩后大小
    pushU32(head, data.length) // 原始大小
    pushU16(head, nameBytes.length)
    pushU16(head, 0) // 额外字段长度
    localParts.push(new Uint8Array(head), nameBytes, data)
    offset += head.length + nameBytes.length + data.length
  }

  let centralSize = 0
  for (const e of built) {
    // 中央目录：PK\x01\x02
    const c: number[] = []
    pushU32(c, 0x02014b50)
    pushU16(c, 20) // 创建版本
    pushU16(c, 20) // 解压版本
    pushU16(c, 0x0800)
    pushU16(c, 0)
    pushU16(c, time)
    pushU16(c, date)
    pushU32(c, e.crc)
    pushU32(c, e.data.length)
    pushU32(c, e.data.length)
    pushU16(c, e.nameBytes.length)
    pushU16(c, 0)
    pushU16(c, 0)
    pushU16(c, 0)
    pushU16(c, 0)
    pushU32(c, 0)
    pushU32(c, e.offset)
    centralParts.push(new Uint8Array(c), e.nameBytes)
    centralSize += c.length + e.nameBytes.length
  }

  // 中央目录结束记录：PK\x05\x06
  const end: number[] = []
  pushU32(end, 0x06054b50)
  pushU16(end, 0)
  pushU16(end, 0)
  pushU16(end, built.length)
  pushU16(end, built.length)
  pushU32(end, centralSize)
  pushU32(end, offset)
  pushU16(end, 0)

  return new Blob([...localParts, ...centralParts, new Uint8Array(end)], { type: 'application/zip' })
}

/** 解析上传的 ZIP（仅支持 store-only）：返回 文件名 → 文本内容 的映射（其他压缩方式抛错） */
export async function unzipTextFiles(file: File): Promise<Record<string, string>> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const dv = new DataView(buf.buffer)
  const out: Record<string, string> = {}
  const decoder = new TextDecoder()
  // 从尾部定位中央目录结束记录（注释长度为 0 时位于文件末尾 22 字节）
  let endOffset = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { endOffset = i; break }
  }
  if (endOffset < 0) throw new Error('无效的 ZIP 文件')
  const count = dv.getUint16(endOffset + 10, true)
  let p = dv.getUint32(endOffset + 16, true)
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP 中央目录解析失败')
    const method = dv.getUint16(p + 10, true)
    const size = dv.getUint32(p + 24, true)
    const nameLen = dv.getUint16(p + 28, true)
    const extraLen = dv.getUint16(p + 30, true)
    const commentLen = dv.getUint16(p + 32, true)
    const localOffset = dv.getUint32(p + 42, true)
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen))
    if (method !== 0) throw new Error(`文件 ${name} 使用了压缩存储，仅支持无压缩（store）ZIP；请重新导出`)
    // 读取本地头后的数据
    const lNameLen = dv.getUint16(localOffset + 26, true)
    const lExtraLen = dv.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    out[name] = decoder.decode(buf.subarray(dataStart, dataStart + size))
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}
