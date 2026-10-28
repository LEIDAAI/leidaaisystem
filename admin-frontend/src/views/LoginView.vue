<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { USE_MOCK } from '@/utils/constants'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const error = ref('')
const form = reactive({ username: '', password: '' })
const accounts = [
  { username: 'admin', password: 'admin123', label: '超级管理员', hint: '全部 P0 权限' },
  { username: 'support', password: 'support123', label: '客服', hint: '用户、订单查看及订单备注' },
  { username: 'viewer', password: 'viewer123', label: '只读观察员', hint: '查看用户、订单；订单备注沿用契约权限' }
]
const rules: FormRules = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}
async function handleSubmit() {
  if (loading.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  loading.value = true
  error.value = ''
  try {
    await auth.login(form.username.trim(), form.password)
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') && !route.query.redirect.startsWith('//') ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) { error.value = e instanceof Error ? e.message : '登录失败' } finally { loading.value = false }
}
function fill(account: typeof accounts[number]) { form.username = account.username; form.password = account.password; error.value = '' }
</script>

<template>
  <div class="login-page">
    <section class="login-story">
      <div class="login-brand"><span>L</span>雷达AI <small>LEIDAAI</small></div>
      <div class="story-copy"><div class="story-eyebrow">ADMINISTRATION WORKSPACE</div><h1>有序管理，<br>让业务清晰可见。</h1><p>用户、订单与团队权限，<br>在一个工作台中高效协同。</p><div class="story-line"></div><small>雷达AI · 管理控制台 / P0</small></div>
      <div class="radar-art" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
      <div class="story-footer">LEIDAAI <span>专注每一个重要决策</span></div>
    </section>
    <section class="login-panel"><div class="login-card">
      <span class="login-badge">{{ USE_MOCK ? '演示工作空间' : '管理工作空间' }}</span><h2>欢迎回来</h2><p class="login-subtitle">使用管理员账号登录雷达AI</p>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large" @submit.prevent="handleSubmit">
        <el-form-item label="管理员账号" prop="username"><el-input v-model="form.username" placeholder="请输入账号" autocomplete="username" /></el-form-item>
        <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" placeholder="请输入密码" show-password autocomplete="current-password" /></el-form-item>
        <el-button native-type="submit" type="primary" class="login-submit" size="large" :loading="loading">登录工作台 →</el-button>
      </el-form>
      <div v-if="USE_MOCK" class="demo-accounts"><div class="demo-title">演示账号 <span>点击填入，密码将真实校验</span></div><button v-for="account in accounts" :key="account.username" @click="fill(account)" :title="account.hint"><span>{{ account.label }}</span><code>{{ account.username }} / {{ account.password }}</code></button><p>演示模式 · 未接后端<br>数据保存在当前浏览器，请勿使用真实密码或敏感信息。</p></div>
    </div><div class="login-footer">© {{ new Date().getFullYear() }} 雷达AI LEIDAAI</div></section>
  </div>
</template>

<style scoped>
.login-page{height:100%;min-height:720px;display:grid;grid-template-columns:48% 52%;background:#f8faf9}.login-story{position:relative;overflow:hidden;background:#142d25;color:#fff;padding:45px 11%;display:flex;flex-direction:column}.login-brand{display:flex;align-items:center;gap:12px;font-size:25px;font-weight:600;white-space:nowrap}.login-brand>span{background:#27ae90;width:39px;height:39px;display:grid;place-items:center;border-radius:10px;font-family:Georgia,serif;font-style:italic}.login-brand small{font-size:12px;letter-spacing:2px;font-weight:400;color:#7fa99b}.story-copy{position:relative;z-index:1;margin:auto 0}.story-eyebrow{color:#72b5a1;font-size:10px;letter-spacing:2px}.story-copy h1{font-size:42px;line-height:1.5;letter-spacing:3px;font-weight:500;margin:25px 0}.story-copy p{font-size:15px;line-height:2;color:#a9c5b8}.story-line{width:42px;height:2px;background:#43b698;margin:35px 0 20px}.story-copy small{font-size:11px;color:#75a390;letter-spacing:2px}.story-footer{display:flex;gap:22px;font-size:10px;letter-spacing:2px;color:#729482;white-space:nowrap}.radar-art{position:absolute;width:560px;height:560px;right:-260px;bottom:-150px;border:1px solid #305f4c;border-radius:50%;background:conic-gradient(from 220deg,transparent 65%,#3ba97f19 98%,#51b89035)}.radar-art i{position:absolute;border:1px solid #305f4c;border-radius:50%;inset:65px}.radar-art i:nth-child(2){inset:130px}.radar-art i:nth-child(3){inset:195px}.radar-art b{position:absolute;width:8px;height:8px;border-radius:50%;background:#7ce0b4;top:140px;left:150px;box-shadow:0 0 20px #9affbf}.login-panel{display:flex;align-items:center;justify-content:center;flex-direction:column;padding:44px}.login-card{width:380px;max-width:100%}.login-badge{font-size:11px;color:#229879;background:#e8f5ef;padding:6px 9px;border-radius:4px}.login-card h2{font-size:30px;font-weight:600;color:#213f30;margin:24px 0 10px;letter-spacing:2px}.login-subtitle{font-size:13px;color:#92a297;margin-bottom:35px}.login-submit{width:100%;margin-top:8px}.demo-accounts{margin-top:32px;padding-top:22px;border-top:1px solid #e3ebe5}.demo-title{font-size:12px;color:#45614f;margin-bottom:12px}.demo-title span{color:#97a79c;font-size:10px;margin-left:12px}.demo-accounts button{display:flex;justify-content:space-between;align-items:center;width:100%;padding:9px 10px;margin-bottom:6px;border:1px solid #e5ece7;background:#fff;border-radius:5px;color:#668170;cursor:pointer;font-size:11px}.demo-accounts button:hover{border-color:#49ae8b;background:#f0faf4}.demo-accounts code{font-size:11px;color:#81978a}.demo-accounts p{font-size:10px;line-height:1.9;color:#a2afa5;margin-top:16px}.login-footer{font-size:10px;color:#a3afa6;margin-top:30px;letter-spacing:1px}.error-alert{margin-bottom:18px}@media(max-width:900px){.login-page{grid-template-columns:1fr}.login-story{display:none}.login-panel{padding:32px}}
</style>
