import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'

import App from './App.vue'
import router from './router'
import { perm } from './directives/perm'
import { setSessionExpiredHandler } from './api/request'
import { useAuthStore } from './stores/auth'
import './styles/index.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.directive('perm', perm)

// 401 会话失效时同步清空 pinia 内存会话（否则路由守卫仍读到内存 token 导致弹回）
setSessionExpiredHandler(() => useAuthStore().clearSession())

app.mount('#app')
