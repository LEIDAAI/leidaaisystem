<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { saveConfig, PLATFORMS, PLATFORM_META, type ConfigItem, type PlatformType } from '@/api/config'
import VersionConfirmDialog from './VersionConfirmDialog.vue'
import type { FormDraft } from './PlanFormDrawer.vue'

/** MCP = 工具服务器连接表单（附录 12.3：MCP / OpenAPI 双类型；v5 每次保存生成连接配置快照） */
const props = defineProps<{ modelValue: boolean; item: Partial<ConfigItem> | null; canEdit: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
type McpDraft = FormDraft & { argsText?: string; toolFilterText?: string }
const saving = ref(false)
const draft = ref<McpDraft>({})

watch(
  () => [props.modelValue, props.item] as const,
  ([visible]) => {
    if (!visible) return
    draft.value = {
      status: 1, connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: '', path: '', command: '', args: [],
      authConfig: { type: 'NONE' }, toolFilter: [], platforms: ['1688'], ...JSON.parse(JSON.stringify(props.item || {}))
    }
    if (!draft.value.authConfig || typeof draft.value.authConfig !== 'object') draft.value.authConfig = { type: 'NONE' }
    if (!Array.isArray(draft.value.platforms)) draft.value.platforms = ['1688']
    draft.value.platforms = draft.value.platforms.filter((p) => PLATFORMS.includes(p as PlatformType))
    if (!draft.value.platforms.length) draft.value.platforms = ['1688']
    if (!Array.isArray(draft.value.args)) draft.value.args = []
    if (!Array.isArray(draft.value.toolFilter)) draft.value.toolFilter = []
    draft.value.argsText = JSON.stringify(draft.value.args)
    draft.value.toolFilterText = (draft.value.toolFilter as string[]).join('\n')
  },
  { immediate: true }
)

/** 保存（发布）：先弹版本确认框（默认时间戳版本名可改），确认后才写库并生成快照 */
const versionDialog = ref(false)
function onSaveClick(): void {
  if (!props.canEdit) return
  versionDialog.value = true
}

async function save(v: { versionName: string; note: string }): Promise<void> {
  if (!props.canEdit) return
  saving.value = true
  try {
    let args: string[] = []
    if (draft.value.argsText !== undefined) {
      try { args = JSON.parse(draft.value.argsText) as string[] } catch { ElMessage.error('启动参数须为 JSON 字符串数组'); return }
    }
    // 工具过滤：文本域每行（或逗号分隔）一个工具名，留空 = 开放全部
    const toolFilter = String(draft.value.toolFilterText || '')
      .split(/[\n,，]/).map((s) => s.trim()).filter(Boolean)
    if (!draft.value.platforms || !draft.value.platforms.length) {
      ElMessage.error('平台维度至少选择一个')
      return
    }
    await saveConfig('mcp/servers', {
      ...draft.value, args, toolFilter,
      platforms: draft.value.platforms.filter((p) => PLATFORMS.includes(p as PlatformType)),
      versionName: v.versionName, note: v.note
    })
    ElMessage.success('连接配置已保存，版本 +1（快照已写入版本历史）；凭据已按掩码入库，请执行「连接测试」验证')
    emit('saved')
    emit('update:modelValue', false)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <el-drawer :model-value="modelValue" :title="`${item?.id ? '编辑连接' : '新建工具服务器连接'}`" size="700px" destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <el-form label-width="120px" :disabled="!canEdit">
      <el-form-item label="连接编码"><el-input v-model="draft.code" :disabled="Boolean(item?.id)" placeholder="如 gateway / dld / amazon_data" /></el-form-item>
      <el-form-item label="名称"><el-input v-model="draft.name" /></el-form-item>
      <el-form-item label="平台">
        <el-select v-model="draft.platforms" multiple style="width:100%" placeholder="至少选择一个平台">
          <el-option v-for="p in PLATFORMS" :key="p" :value="p" :label="PLATFORM_META[p].label" />
        </el-select>
        <p class="muted">平台维度多选（至少一个）：专家按平台联动时仅显示有平台交集的连接。</p>
      </el-form-item>
      <el-form-item label="连接类型">
        <el-radio-group v-model="draft.connType">
          <el-radio-button value="MCP">MCP（协议发现工具）</el-radio-button>
          <el-radio-button value="OpenAPI">OpenAPI（schema 解析）</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <template v-if="draft.connType === 'MCP'">
        <el-form-item label="传输方式">
          <el-select v-model="draft.transport" style="width:260px">
            <el-option value="STREAMABLE_HTTP" label="STREAMABLE_HTTP" />
            <el-option value="SSE" label="SSE" />
            <el-option value="STDIO" label="STDIO" />
          </el-select>
        </el-form-item>
        <template v-if="draft.transport !== 'STDIO'">
          <el-form-item label="服务地址"><el-input v-model="draft.endpoint" placeholder="https://..." /></el-form-item>
          <el-form-item label="端点路径"><el-input v-model="draft.path" placeholder="/mcp" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="启动命令"><el-input v-model="draft.command" placeholder="如 node / python" /></el-form-item>
          <el-form-item label="启动参数"><el-input v-model="draft.argsText" type="textarea" :rows="2" placeholder="JSON 数组，如 [&quot;-y&quot;,&quot;server.js&quot;]" /></el-form-item>
        </template>
      </template>
      <template v-else>
        <el-form-item label="服务地址"><el-input v-model="draft.endpoint" placeholder="https://..." /></el-form-item>
        <el-form-item label="Schema 路径"><el-input v-model="draft.path" placeholder="/openapi.json 或 xxx/openapi.json" /></el-form-item>
      </template>
      <el-form-item label="鉴权方式">
        <el-select v-model="draft.authConfig!.type" style="width:200px">
          <el-option value="NONE" label="无鉴权" />
          <el-option value="BEARER" label="Bearer Token" />
          <el-option value="API_KEY" label="API Key" />
          <el-option value="HEADER" label="自定义请求头" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="draft.authConfig!.type === 'API_KEY' || draft.authConfig!.type === 'HEADER'" label="请求头名称">
        <el-input v-model="draft.authConfig!.headerName" placeholder="如 X-Api-Key / Authorization" style="width:240px" />
      </el-form-item>
      <el-form-item v-if="draft.authConfig!.type !== 'NONE'" label="鉴权凭据">
        <el-input v-model="draft.authConfig!.credential" type="password" autocomplete="new-password" :placeholder="item?.id ? '留空表示不修改已有凭据' : '仅输入演示凭据，保存后永不回显'" />
        <p class="muted">凭据应用层加密存储，界面与接口均只回显掩码 ****。</p>
      </el-form-item>
      <el-form-item label="工具过滤">
        <el-input v-model="draft.toolFilterText" type="textarea" :rows="3" placeholder="每行一个工具名（也可逗号分隔），留空 = 开放全部工具；工具发现结果受此清单过滤" />
        <p class="muted">简化为单一过滤文本域：命中清单的工具才会对助手可见（可作黑/白名单使用）。</p>
      </el-form-item>
      <el-form-item label="状态"><el-switch v-model="draft.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">关闭</el-button>
      <el-button v-if="canEdit" type="primary" :loading="saving" @click="onSaveClick">保存连接</el-button>
    </template>
    <VersionConfirmDialog
      v-model="versionDialog"
      title="发布版本确认"
      description="确认后将写库、版本 +1 并生成连接配置快照（含工具绑定，进入版本历史）。"
      @confirm="save"
    />
  </el-drawer>
</template>
