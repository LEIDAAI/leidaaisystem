import { ref, watchEffect, type Directive, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const bindings = new WeakMap<HTMLElement, { code: Ref<string>; stop: () => void }>()

/** 同时响应权限集合与指令参数变化，卸载时释放监听。 */
export const perm: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const auth = useAuthStore()
    const display = el.style.display
    const code = ref(binding.value)
    const stop = watchEffect(() => { el.style.display = auth.hasPerm(code.value) ? display : 'none' }, { flush: 'sync' })
    bindings.set(el, { code, stop })
  },
  updated(el, binding) {
    const state = bindings.get(el)
    if (state) state.code.value = binding.value
  },
  unmounted(el) { bindings.get(el)?.stop(); bindings.delete(el) }
}
