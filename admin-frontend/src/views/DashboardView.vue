<script setup lang="ts">
import { computed,onMounted,ref } from 'vue'
import { dashboard,type Dashboard } from '@/api/operations'
import { USE_MOCK } from '@/utils/constants'
const data=ref<Dashboard>(),loading=ref(false)
const cards=computed(()=>data.value?[['用户总数',data.value.userTotal],['今日新增用户',data.value.userToday],['订单总数',data.value.orderTotal],['净支付金额',`¥${data.value.revenueTotal.toFixed(2)}`],['未删除会话',data.value.chatTotal],['专家 / 技能 / MCP',`${data.value.expertTotal} / ${data.value.skillTotal} / ${data.value.serverTotal}`]]:[])
const max=computed(()=>Math.max(1,...(data.value?.trend.flatMap(d=>[d.users,d.orders,d.chats]) || [])))
/** 折线横向步距：按点数动态均分（固定写死会在点数变化时溢出画布） */
const step=computed(()=>{const n=data.value?.trend.length??0;return n>1?620/(n-1):0})
function points(key:'users'|'orders'|'chats'){return data.value?.trend.map((d,i)=>`${50+i*step.value},${180-d[key]/max.value*140}`).join(' ')}
async function load(){loading.value=true;try{data.value=await dashboard()}finally{loading.value=false}}
onMounted(load)
</script>
<template><div v-loading="loading"><el-alert :title="data?.source || (USE_MOCK?'Mock 本地实际记录汇总，非生产数据':'等待真实统计API返回')" :closable="false" style="margin-bottom:20px"/><el-button @click="load" style="margin-bottom:16px">更新统计</el-button><el-row :gutter="16"><el-col v-for="card in cards" :key="card[0]" :span="8"><el-card shadow="never" style="margin-bottom:16px"><div class="muted">{{card[0]}}</div><strong style="font-size:28px;line-height:2">{{card[1]}}</strong></el-card></el-col></el-row><el-card v-if="data" shadow="never"><h3>近七日新增趋势</h3><p class="muted">用户（绿） · 订单（蓝） · 未删除会话（橙）</p><svg viewBox="0 0 700 230" role="img" aria-label="近七日用户、订单、会话数量趋势" style="width:100%;max-height:320px"><line x1="40" y1="180" x2="670" y2="180" stroke="#ccd8d2"/><polyline v-for="(key,i) in (['users','orders','chats'] as const)" :key="key" :points="points(key)" fill="none" :stroke="['#249c7d','#588bd7','#dba24c'][i]" stroke-width="3"/><text v-for="(d,i) in data.trend" :key="d.date" :x="50+i*step" y="210" text-anchor="middle" font-size="11" fill="#6a8074">{{d.date.slice(5)}}</text></svg><el-table :data="data.trend"><el-table-column prop="date" label="日期"/><el-table-column prop="users" label="新增用户"/><el-table-column prop="orders" label="新增订单"/><el-table-column prop="chats" label="会话"/></el-table></el-card></div></template>
