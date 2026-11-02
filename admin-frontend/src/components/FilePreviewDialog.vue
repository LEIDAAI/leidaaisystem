<script setup lang="ts">
/**
 * 文件预览弹窗（专家介绍附件）：按 previewKind 分派渲染 ——
 * 图片（el-image 支持缩放）、PDF（iframe 内嵌）、文本（拉取内容 pre 展示）、其他（图标 + 元信息 + 下载兜底）。
 * blob: URL 关闭/换文件时统一 revoke，避免内存泄漏。
 */
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import {
  type IntroFileMeta, previewKind, fileKind, formatSize,
  introFileObjectUrl, introFileText, introFileArrayBuffer, downloadIntroFile
} from '@/api/files'
import { createSeqGuard } from '@/utils/race'

const props = defineProps<{ modelValue: boolean; file: IntroFileMeta | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const visible = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })

const kind = computed(() => (props.file ? previewKind(props.file) : 'other'))
const meta = computed(() => (props.file ? fileKind(props.file) : { label: '文件', emoji: '📎' }))

const objectUrl = ref('')
const textContent = ref('')
const spreadsheetData = ref<{ headers: string[]; rows: string[][] } | null>(null)
const loading = ref(false)
/** 加载竞态守卫：快速切换文件/关闭弹窗时丢弃乱序返回的旧加载结果（并回收其 blob） */
const loadGuard = createSeqGuard()

function releaseBlob(): void {
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = ''
}

watch(
  () => [props.modelValue, props.file] as const,
  async ([open]) => {
    const seq = loadGuard.next() // 关闭/换文件均先失效在途加载
    if (!open) {
      releaseBlob()
      textContent.value = ''
      spreadsheetData.value = null
      return
    }
    const f = props.file
    if (!f) return
    releaseBlob()
    textContent.value = ''
    spreadsheetData.value = null
    loading.value = true
    try {
      const k = previewKind(f)
      if (k === 'image' || k === 'pdf') {
        const url = await introFileObjectUrl(f.id)
        if (!loadGuard.isCurrent(seq)) {
          if (url.startsWith('blob:')) URL.revokeObjectURL(url) // 已过期：回收刚创建的 blob 防泄漏
          return
        }
        objectUrl.value = url
      } else if (k === 'text') {
        const t = await introFileText(f.id)
        if (!loadGuard.isCurrent(seq)) return
        // 超长文本只预览前段，避免渲染卡顿
        textContent.value = t.length > 60000 ? `${t.slice(0, 60000)}\n\n…（内容过长，仅预览前 60000 字符）` : t
      } else if (k === 'spreadsheet') {
        const buffer = await introFileArrayBuffer(f.id)
        if (!loadGuard.isCurrent(seq)) return
        const workbook = XLSX.read(buffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const firstSheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, defval: '' })
        if (jsonData.length > 0) {
          const headers = jsonData[0].map(String)
          const rows = jsonData.slice(1, 101).map(row => row.map(String))
          spreadsheetData.value = { headers, rows }
        }
      }
    } catch (e) {
      if (!loadGuard.isCurrent(seq)) return // 已被更新的加载/关闭取代：过期错误不打扰
      ElMessage.error(e instanceof Error ? e.message : '文件读取失败')
      visible.value = false
    } finally {
      if (loadGuard.isCurrent(seq)) loading.value = false
    }
  },
  { immediate: true }
)

async function onDownload(): Promise<void> {
  if (!props.file) return
  try {
    await downloadIntroFile(props.file)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '下载失败')
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="`${meta.emoji} ${file?.name || '文件预览'}`" width="720px" append-to-body class="fp-dialog">
    <div v-loading="loading" class="fp-body">
      <template v-if="file">
        <div v-if="kind === 'image'" class="fp-img-wrap">
          <el-image :src="objectUrl" fit="contain" :preview-src-list="[objectUrl]" hide-on-click-modal class="fp-img" />
          <p class="fp-tip">点击图片可全屏缩放查看</p>
        </div>
        <iframe v-else-if="kind === 'pdf'" :src="objectUrl" class="fp-pdf" title="PDF 预览" />
        <pre v-else-if="kind === 'text'" class="fp-text">{{ textContent }}</pre>
        <div v-else-if="kind === 'spreadsheet'" class="fp-sheet">
          <template v-if="spreadsheetData">
            <div class="fp-sheet-scroll">
              <table class="fp-sheet-table">
                <thead>
                  <tr>
                    <th v-for="(h, i) in spreadsheetData.headers" :key="i">{{ h }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, ri) in spreadsheetData.rows" :key="ri">
                    <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p class="fp-tip" v-if="spreadsheetData.rows.length >= 100">仅预览前 100 行数据</p>
          </template>
          <template v-else>
            <p class="fp-tip">该表格为空或无法解析</p>
          </template>
        </div>
        <div v-else class="fp-fallback">
          <div class="fp-icon">{{ meta.emoji }}</div>
          <div class="fp-name">{{ file.name }}</div>
          <div class="fp-sub">{{ meta.label }} · {{ formatSize(file.size) }} · 上传于 {{ file.uploadedAt }}</div>
          <p class="fp-tip">该类型暂不支持在线预览，可下载后查看。</p>
          <el-button type="primary" @click="onDownload">下载文件</el-button>
        </div>
      </template>
    </div>
    <template #footer>
      <div class="fp-footer">
        <span class="fp-sub">{{ file ? `${meta.label} · ${formatSize(file.size)}` : '' }}</span>
        <span class="fp-footer-btns">
          <el-button @click="visible = false">关闭</el-button>
          <el-button type="primary" @click="onDownload">下载</el-button>
        </span>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.fp-body { min-height: 120px; }
.fp-img-wrap { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.fp-img { max-width: 100%; max-height: 480px; border-radius: 4px; }
.fp-pdf { width: 100%; height: 560px; border: 1px solid var(--el-border-color-lighter); border-radius: 4px; }
.fp-text {
  max-height: 520px; overflow: auto; margin: 0; padding: 12px 14px;
  font-size: 13px; line-height: 1.7; white-space: pre-wrap; word-break: break-all;
  background: var(--el-fill-color-lighter); border-radius: 4px;
  color: var(--el-text-color-primary);
}
.fp-sheet {
  max-height: 560px; display: flex; flex-direction: column; gap: 8px;
}
.fp-sheet-scroll {
  flex: 1; overflow: auto; border: 1px solid var(--el-border-color-lighter); border-radius: 4px;
  background: var(--el-fill-color-blank);
}
.fp-sheet-table {
  width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.6;
}
.fp-sheet-table th {
  position: sticky; top: 0; z-index: 1;
  padding: 8px 12px; background: var(--el-fill-color-light);
  border-bottom: 2px solid var(--el-border-color);
  text-align: left; font-weight: 600; color: var(--el-text-color-primary);
  white-space: nowrap;
}
.fp-sheet-table td {
  padding: 6px 12px; border-bottom: 1px solid var(--el-border-color-lighter);
  color: var(--el-text-color-regular); white-space: nowrap;
}
.fp-sheet-table tbody tr:hover {
  background: var(--el-fill-color-lighter);
}
.fp-fallback { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 36px 0 28px; }
.fp-icon { font-size: 56px; line-height: 1; }
.fp-name { font-size: 15px; font-weight: 600; max-width: 90%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fp-sub { font-size: 12px; color: var(--el-text-color-secondary); }
.fp-tip { font-size: 12px; color: var(--el-text-color-secondary); margin: 0; }
.fp-footer { display: flex; align-items: center; justify-content: space-between; }
.fp-footer-btns { display: flex; gap: 8px; }
</style>
