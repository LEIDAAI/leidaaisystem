<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listResources, type Entitlement } from '@/api/config'
const props=defineProps<{ modelValue:Entitlement[]; disabled?:boolean }>()
const emit=defineEmits<{ 'update:modelValue':[Entitlement[]] }>()
const resources=ref<Entitlement[]>([])
const selected=ref('')
onMounted(async()=>{ resources.value=await listResources() })
function add(){ const r=resources.value.find(r=>`${r.resourceType}:${r.resourceId}`===selected.value);if(r && !props.modelValue.some(e=>e.resourceType===r.resourceType && e.resourceId===r.resourceId)) emit('update:modelValue',[...props.modelValue,{...r}]) }
</script>
<template>
  <div v-if="!disabled" style="display:flex;gap:8px;margin:12px 0"><el-select v-model="selected" placeholder="选择专家 / 技能 / MCP工具" filterable style="width:320px"><el-option v-for="r in resources" :key="`${r.resourceType}:${r.resourceId}`" :value="`${r.resourceType}:${r.resourceId}`" :label="`${r.resourceType} · ${r.resourceName}`" /></el-select><el-button @click="add">新增权益</el-button></div>
  <el-table :data="modelValue" border><el-table-column label="资源" min-width="160"><template #default="{row}">{{row.resourceType}} · {{row.resourceName || row.resourceId}}</template></el-table-column><el-table-column prop="quotaType" label="计量" width="125"/><el-table-column label="限额" width="150"><template #default="{row}"><el-input-number v-model="row.quotaLimit" :min="0" :precision="0" :disabled="disabled" style="width:125px" /></template></el-table-column><el-table-column label="周期" width="140"><template #default="{row}"><el-select v-model="row.quotaPeriod" :disabled="disabled"><el-option label="自然日" value="DAY"/><el-option label="自然月" value="MONTH"/><el-option label="终身累计" value="LIFETIME"/></el-select></template></el-table-column><el-table-column v-if="!disabled" width="70"><template #default="{$index}"><el-button link type="danger" @click="emit('update:modelValue',modelValue.filter((_,i)=>i!==$index))">移除</el-button></template></el-table-column></el-table>
  <p class="muted">限额 0 表示不允许使用；DAY / MONTH 按 Asia/Shanghai 自然日 / 自然月重置，LIFETIME 不重置。</p>
</template>
