<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="page">
    <div class="page-card forbidden-card">
      <el-empty description="无权限访问该页面，请联系管理员分配相应权限">
        <el-button type="primary" @click="router.back()">返回上一页</el-button>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.forbidden-card {
  padding: 60px 0;
}
</style>
