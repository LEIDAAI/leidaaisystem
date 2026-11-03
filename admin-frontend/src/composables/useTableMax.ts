import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * 表格限高：视口高度 − 表格顶部偏移 − 底部预留（悬浮分页/边距）。
 * 配合 el-table 的 max-height：表格改为内部滚动，横向滚动条固定在表格底部始终可见可拖。
 */
export function useTableMaxHeight(bottomGap = 100): { max: Ref<number | undefined>; bind: (el: unknown) => void } {
  const max = ref<number | undefined>(undefined)
  let table: HTMLElement | null = null
  const calc = (): void => {
    if (!table || !table.isConnected) return
    max.value = Math.max(260, Math.round(window.innerHeight - table.getBoundingClientRect().top - bottomGap))
  }
  /** 挂到 el-table 的 :ref（兼容组件实例 / 原生元素），渲染后测量 */
  const bind = (el: unknown): void => {
    const inst = el as { $el?: unknown } | HTMLElement | null
    if (!inst) { table = null; return }
    table = inst instanceof HTMLElement ? inst : (inst.$el instanceof HTMLElement ? inst.$el : null)
    if (table) requestAnimationFrame(calc)
  }
  onMounted(() => window.addEventListener('resize', calc))
  onBeforeUnmount(() => window.removeEventListener('resize', calc))
  return { max, bind }
}
