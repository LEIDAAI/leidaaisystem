<script setup lang="ts">
import { computed } from 'vue'

type TagType = 'success' | 'warning' | 'danger' | 'info' | 'primary'

interface Props {
  kind: 'user' | 'admin' | 'role' | 'order'
  value: string | number
}

const props = defineProps<Props>()

const PRESETS: Record<Props['kind'], Record<string | number, { label: string; type: TagType }>> = {
  user: {
    1: { label: '正常', type: 'success' },
    0: { label: '已封禁', type: 'danger' }
  },
  admin: {
    1: { label: '启用', type: 'success' },
    0: { label: '禁用', type: 'info' }
  },
  role: {
    1: { label: '启用', type: 'success' },
    0: { label: '禁用', type: 'info' }
  },
  order: {
    PENDING: { label: '待支付', type: 'warning' },
    PAID: { label: '已支付', type: 'success' },
    REFUNDED: { label: '已退款', type: 'info' },
    CLOSED: { label: '已关闭', type: 'danger' }
  }
}

const current = computed(() => PRESETS[props.kind][props.value])
</script>

<template>
  <el-tag v-if="current" :type="current.type" disable-transitions>{{ current.label }}</el-tag>
  <el-tag v-else type="info" disable-transitions>{{ value }}</el-tag>
</template>
