<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const title = computed(() => (route.meta.title as string) || '功能建设')
</script>

<template>
  <div class="page">
    <div class="page-card placeholder-card">
      <el-empty :description="`「${title}」功能建设中，将在后续版本（P1/P2）上线`">
        <template #image>
          <svg viewBox="0 0 1024 1024" width="120" height="120" aria-hidden="true">
            <path
              fill="#dcdfe6"
              d="M512 128c-212 0-384 172-384 384s172 384 384 384 384-172 384-384-172-384-384-384z m0 704c-176.4 0-320-143.6-320-320s143.6-320 320-320 320 143.6 320 320-143.6 320-320 320z"
            />
            <path fill="#dcdfe6" d="M480 480h64v224h-64z M480 352h64v64h-64z" />
          </svg>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.placeholder-card {
  padding: 60px 0;
}
</style>
