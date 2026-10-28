import { watchEffect, type Directive } from 'vue'

import { useAuthStore } from '@/stores/auth'

/**
 * 按钮级权限指令：v-perm="'user:ban'"
 * 响应权限变化，当前账号无权限时隐藏元素。
 */
const stops = new WeakMap<HTMLElement, () => void>()
export const perm: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const auth = useAuthStore()
    const display = el.style.display
    stops.set(el, watchEffect(() => { el.style.display = auth.hasPerm(binding.value) ? display : 'none' }))
  },
  unmounted(el) { stops.get(el)?.(); stops.delete(el) }
}
