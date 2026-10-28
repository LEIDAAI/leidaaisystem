<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Grid, User, Tickets, Lock, Avatar, Setting, Connection, ChatDotRound, Collection, Cpu, Document } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { USE_MOCK } from '@/utils/constants'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const menus = [
  { path: '/dashboard', title: '工作概览', perm: 'dashboard:view', icon: Grid },
  { path: '/users', title: '用户管理', perm: 'user:view', icon: User },
  { path: '/orders', title: '订单管理', perm: 'order:view', icon: Tickets },
  { path: '/admins', title: '管理员账号', perm: 'admin:manage', icon: Avatar },
  { path: '/roles', title: '角色与权限', perm: 'admin:manage', icon: Lock }
]
const future = [
  { path: '/plans', title: '套餐管理', stage: 'P1', icon: Collection },
  { path: '/experts', title: '专家管理', stage: 'P1', icon: Cpu },
  { path: '/skills', title: '技能管理', stage: 'P1', icon: Setting },
  { path: '/mcp', title: 'MCP 服务', stage: 'P1', icon: Connection },
  { path: '/chats', title: '对话管理', stage: 'P2', icon: ChatDotRound },
  { path: '/audit-logs', title: '审计日志', stage: 'P2', icon: Document }
]
const visibleMenus = computed(() => [...menus, ...future.map(item=>({...item,perm:({'/plans':'plan:view','/experts':'expert:view','/skills':'skill:view','/mcp':'mcp:view','/chats':'chat:view','/audit-logs':'audit:view'} as Record<string,string>)[item.path]}))].filter(m => auth.hasPerm(m.perm)))
const displayName = computed(() => auth.admin?.displayName || auth.admin?.username || '')
async function logout() { await auth.logout(); await router.replace('/login') }
</script>

<template>
  <el-container class="admin-layout">
    <el-aside width="208px" class="admin-aside">
      <div class="admin-logo"><span class="brand-mark">L</span><div>雷达AI<small>LEIDAAI · ADMIN</small></div></div>
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
        <div class="header-right"><span class="environment">{{ USE_MOCK ? 'DEMO' : 'API' }}</span><el-dropdown trigger="click" @command="logout">
          <button class="admin-user"><span class="user-avatar">{{ displayName.slice(0, 1) }}</span><span>{{ displayName }}<small>{{ auth.roles.join(' / ') }}</small></span><span>⌄</span></button>
          <template #dropdown><el-dropdown-menu><el-dropdown-item command="logout">退出登录</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown></div>
      </el-header>
      <div class="mode-banner" :class="{ real: !USE_MOCK }"><span class="status-dot"></span>{{ USE_MOCK ? '演示模式 · 未接后端' : '真实 API 模式' }}<span class="mode-description">{{ USE_MOCK ? '所有操作仅影响当前浏览器演示数据，刷新后保留；请勿输入真实敏感信息。' : '数据由已配置的管理 API 提供，操作将提交至后端。' }}</span></div>
      <el-main class="admin-main">
        <div class="page-heading"><div><div class="eyebrow">LEIDAAI / ADMIN CONSOLE</div><h1>{{ route.meta.title }}</h1></div><span class="muted">{{ USE_MOCK ? '本地演示工作空间' : '管理工作空间' }}</span></div>
        <router-view />
        <footer class="workspace-footer">雷达AI LEIDAAI <span>让每一次管理都有据可循</span></footer>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.admin-layout{height:100%;min-width:900px}.admin-aside{background:#142523;color:#fff;display:flex;flex-direction:column;overflow:auto}.admin-logo{display:flex;align-items:center;gap:12px;padding:28px 22px 32px;font-size:22px;font-weight:650;letter-spacing:1px}.admin-logo small{display:block;font-size:9px;color:#91aaa5;letter-spacing:2px;margin-top:4px}.brand-mark{display:grid;place-items:center;width:38px;height:38px;background:#29b49c;border-radius:11px;font-family:Georgia,serif;font-size:28px;font-style:italic;color:#fff}.nav-label{font-size:11px;letter-spacing:1.5px;color:#77948c;padding:0 24px 12px}.future-label{padding-top:30px}.admin-menu{background:transparent;border:0;padding:0 12px;--el-menu-text-color:#b9cbc6;--el-menu-hover-bg-color:#203c35;--el-menu-active-color:#79e2ca}.admin-menu .el-menu-item{height:46px;margin-bottom:5px;border-radius:7px;font-size:13px}.admin-menu .el-menu-item.is-active{background:#21443b;color:#80e5cf}.admin-menu .el-icon{font-size:18px;margin-right:12px}.future-menu .el-menu-item{height:39px}.future-menu small{margin-left:auto;font-size:10px}.aside-foot{margin-top:auto;padding:28px 22px;color:#8da69e;font-size:11px;white-space:nowrap}.aside-foot small{margin-left:10px}.workspace{min-width:0}.admin-header{display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e5ebe8;padding:0 30px}.header-right{display:flex;align-items:center;gap:22px}.environment{font-size:10px;letter-spacing:1px;color:#548477;border:1px solid #d9e9e2;border-radius:4px;padding:4px 7px}.admin-user{border:0;background:none;display:flex;align-items:center;gap:10px;text-align:left;cursor:pointer;color:#354940;font:inherit}.admin-user small{display:block;font-size:10px;color:#94a49e;margin-top:3px}.user-avatar{width:32px;height:32px;display:grid;place-items:center;background:#e8f5ef;color:#15816c;border-radius:50%;font-weight:600}.mode-banner{display:flex;align-items:center;gap:8px;min-height:38px;padding:8px 30px;background:#edf7f2;color:#2b806a;font-size:12px;border-bottom:1px solid #d8eae0}.mode-description{color:#708b80;margin-left:12px}.mode-banner.real{background:#f3f6fa}.admin-main{padding:26px 30px;overflow:auto}.page-heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}.eyebrow{font-size:9px;letter-spacing:2px;color:#93a49c}.page-heading h1{font-size:25px;font-weight:600;letter-spacing:1px;margin:7px 0 0;color:#203a30}.workspace-footer{display:flex;justify-content:space-between;margin-top:28px;color:#a0aea7;font-size:11px}.workspace-footer span{letter-spacing:1px}.status-dot{width:6px;height:6px;border-radius:50%;background:#31b091;display:inline-block;margin-right:4px}@media(max-width:1100px){.admin-aside{width:180px!important}.admin-main{padding:22px 18px}.mode-description{font-size:11px;margin-left:4px}}
</style>
