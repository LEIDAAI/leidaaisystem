<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Grid, User, Tickets, Lock, Avatar, Setting, Connection, ChatDotRound, ChatLineRound, Collection, Cpu, MagicStick, Reading, Coin, Money } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { USE_MOCK } from '@/utils/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const menus = [
  { path: '/dashboard', title: '工作概览', perm: 'dashboard:view', icon: Grid },
  { path: '/users', title: '用户管理', perm: 'user:view', icon: User },
  { path: '/orders', title: '订单管理', perm: 'order:view', icon: Tickets },
  { path: '/experts', title: '专家管理', perm: 'expert:view', icon: Cpu },
  { path: '/skills', title: '技能管理', perm: 'skill:view', icon: Setting },
  { path: '/mcp', title: 'MCP 服务', perm: 'mcp:view', icon: Connection },
  { path: '/knowledge', title: '知识库管理', perm: 'knowledge:view', icon: Reading },
  { path: '/models', title: '模型管理', perm: 'model:view', icon: MagicStick },
  { path: '/admins', title: '管理员账号', perm: 'admin:manage', icon: Avatar },
  { path: '/roles', title: '角色与权限', perm: 'role:manage', icon: Lock },
  { path: '/plans', title: '套餐管理', perm: 'plan:view', icon: Collection },
  // v17 计费/营销扩展：加油包与计费设置复用套餐 plan:view 权限点
  { path: '/credit-packages', title: '积分加油包', perm: 'plan:view', icon: Coin },
  { path: '/billing-settings', title: '计费设置', perm: 'plan:view', icon: Money },
  { path: '/chats', title: '对话管理', perm: 'chat:view', icon: ChatDotRound },
  { path: '/feedback', title: '反馈管理', perm: 'feedback:view', icon: ChatLineRound }
]
const visibleMenus = computed(() => menus.filter((m) => auth.hasPerm(m.perm)))
const displayName = computed(() => auth.admin?.displayName || auth.admin?.username || '')
async function logout() { await auth.logout(); await router.replace('/login') }
</script>

<template>
  <el-container class="admin-layout">
    <el-aside width="208px" class="admin-aside">
      <div class="admin-logo"><svg class="brand-icon" viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="7" width="28" height="21" rx="5" fill="none" stroke="#00b96b" stroke-width="4"/><circle cx="20" cy="17.5" r="4.5" fill="#f7ba2a"/><rect x="11" y="32" width="18" height="4.5" rx="2.25" fill="#00b96b"/></svg><div>店雷达管理系统</div></div>
      <div class="nav-label">管理工作台</div>
      <el-menu :default-active="route.path" router class="admin-menu">
        <el-menu-item v-for="item in visibleMenus" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
      <div class="aside-foot"><span class="status-dot"></span>管理控制台 <small>v0.3</small></div>
    </el-aside>
    <el-container class="workspace">
      <el-header class="admin-header" height="68px">
        <el-breadcrumb separator="/"><el-breadcrumb-item>管理工作台</el-breadcrumb-item><el-breadcrumb-item>{{ route.meta.title }}</el-breadcrumb-item></el-breadcrumb>
        <div class="header-right"><el-dropdown trigger="click" @command="logout">
          <button class="admin-user"><span class="user-avatar">{{ displayName.slice(0, 1) }}</span><span>{{ displayName }}<small>{{ auth.roles.join(' / ') }}</small></span><span>⌄</span></button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown></div>
      </el-header>
      <div class="mode-banner" :class="{ real: !USE_MOCK }"><span class="status-dot"></span>{{ USE_MOCK ? '演示模式 · 未接后端' : '真实 API 模式' }}<span class="mode-description">{{ USE_MOCK ? '所有操作仅影响当前浏览器演示数据，刷新后保留；请勿输入真实敏感信息。' : '数据由已配置的管理 API 提供，操作将提交至后端。' }}</span></div>
      <el-main class="admin-main">
        <div class="page-heading"><div><div class="eyebrow">店雷达管理系统</div><h1>{{ route.meta.title }}</h1></div><span class="muted">{{ USE_MOCK ? '本地演示工作空间' : '管理工作空间' }}</span></div>
        <router-view />
        <footer class="workspace-footer">店雷达管理系统 <span>让每一次管理都有据可循</span></footer>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.admin-layout{height:100%;min-width:900px}.admin-aside{background:#142523;color:#fff;display:flex;flex-direction:column;overflow:auto}.admin-logo{display:flex;align-items:center;gap:10px;padding:24px 18px 28px;font-size:15px;font-weight:650;letter-spacing:.5px;white-space:nowrap}.brand-icon{width:34px;height:34px;flex:none}.nav-label{font-size:11px;letter-spacing:1.5px;color:#77948c;padding:0 24px 12px}.admin-menu{background:transparent;border:0;padding:0 12px;--el-menu-text-color:#b9cbc6;--el-menu-hover-bg-color:#203c35;--el-menu-active-color:#79e2ca}.admin-menu .el-menu-item{height:46px;margin-bottom:5px;border-radius:7px;font-size:13px}.admin-menu .el-menu-item.is-active{background:#21443b;color:#80e5cf}.admin-menu .el-icon{font-size:18px;margin-right:12px}.aside-foot{margin-top:auto;padding:28px 22px;color:#8da69e;font-size:11px;white-space:nowrap}.aside-foot small{margin-left:10px}.workspace{min-width:0}.admin-header{display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e5ebe8;padding:0 30px}.header-right{display:flex;align-items:center;gap:22px}.admin-user{border:0;background:none;display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer;color:#354940;font:inherit}.admin-user small{display:block;font-size:10px;color:#94a49e;margin-top:3px}.user-avatar{width:32px;height:32px;display:grid;place-items:center;background:#e8f5ef;color:#15816c;border-radius:50%;font-weight:600}.mode-banner{display:flex;align-items:center;gap:8px;min-height:38px;padding:8px 30px;background:#edf7f2;color:#2b806a;font-size:12px;border-bottom:1px solid #d8eae0}.mode-description{color:#708b80;margin-left:12px}.mode-banner.real{background:#f3f6fa}.admin-main{padding:26px 30px;overflow:auto}.page-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.eyebrow{font-size:9px;letter-spacing:2px;color:#93a49c}.page-heading h1{font-size:25px;font-weight:600;letter-spacing:1px;margin:7px 0 0;color:#203a30}.workspace-footer{display:flex;justify-content:space-between;margin-top:28px;color:#a0aea7;font-size:11px}.workspace-footer span{letter-spacing:1px}.status-dot{width:6px;height:6px;border-radius:50%;background:#31b091;display:inline-block;margin-right:4px}@media(max-width:1100px){.admin-aside{width:180px!important}.admin-main{padding:22px 18px}.mode-description{font-size:11px;margin-left:4px}}
</style>
