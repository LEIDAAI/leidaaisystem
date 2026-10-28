<script setup lang="ts" generic="T">
import { onMounted, shallowRef, ref } from 'vue'
import type { PageData, ProTableHandle } from '@/api/types'

interface Props {
  /** 数据加载函数：入参为分页与筛选参数，返回契约分页结构 */
  fetcher: (query: { page: number; pageSize: number } & Record<string, unknown>) => Promise<PageData<T>>
  /** 初始每页条数 */
  pageSize?: number
  /** 是否立即加载 */
  immediate?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  pageSize: 20,
  immediate: true
})

const loading = ref(false)
const rows = shallowRef<T[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(props.pageSize)
let extraParams: Record<string, unknown> = {}

async function load(): Promise<void> {
  loading.value = true
  try {
    const data = await props.fetcher({ page: page.value, pageSize: size.value, ...extraParams })
    rows.value = data.list
    total.value = data.total
    if (page.value > 1 && rows.value.length === 0) {
      page.value = Math.max(1, Math.ceil(total.value / size.value))
      await load()
    }
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/** 筛选查询：重置到第一页 */
function search(params: Record<string, unknown> = {}): void {
  extraParams = params
  page.value = 1
  void load()
}

/** 写操作后刷新：保持当前筛选与页码 */
function refresh(): void {
  void load()
}

function onSizeChange(): void {
  page.value = 1
  void load()
}

defineExpose<ProTableHandle>({ search, refresh })

onMounted(() => {
  if (props.immediate) void load()
})
</script>

<template>
  <div class="pro-table">
    <div v-if="$slots.filter" class="pro-table__filter">
      <slot name="filter" />
    </div>
    <el-table v-loading="loading" :data="rows" row-key="id" empty-text="暂无符合条件的数据">
      <slot />
    </el-table>
    <div class="pro-table__footer">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="load"
        @size-change="onSizeChange"
      />
    </div>
  </div>
</template>
