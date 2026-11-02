<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>
<template>
  <div class="page">
    <div class="page-card" style="padding: 60px 0">
      <el-result icon="warning" title="404" sub-title="页面不存在或已被移除，请检查地址是否正确">
        <template #extra>
          <el-button type="primary" @click="router.replace('/')">返回首页</el-button>
        </template>
      </el-result>
    </div>
  </div>
</template>
