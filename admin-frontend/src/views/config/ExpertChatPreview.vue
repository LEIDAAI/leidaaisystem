<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { listTools, previewChat, revealModelKey, type LlmModel, type PreviewChatTrace, type Tool } from '@/api/config'
import { CAPABILITY_LABELS } from '@/api/mock/extension-data'
import { useAuthStore } from '@/stores/auth'
import type { FormDraft } from './PlanFormDrawer.vue'

/**
 * 专家编辑抽屉右侧「对话预览」面板：左侧表单当前草稿态（未保存修改）实时生效。
 * Mock 模式走演示引擎（POST /experts/preview-chat，确定性仿真并标注「模拟回复」）；
 * 「真实调用」为浏览器直连 OpenAI 兼容端点（演示环境，仅超级管理员可见）。
 */
const props = defineProps<{ draft: FormDraft; models: LlmModel[] }>()

const auth = useAuthStore()
/** 真实调用开关仅超级管理员角色可见（浏览器直连演示，Key 不出本机） */
const isAdmin = computed(() => auth.roles.includes('SUPER_ADMIN'))
const realMode = ref(false)

interface ChatMsg { role: 'user' | 'assistant'; content: string; mode?: 'mock' | 'real'; trace?: PreviewChatTrace; isError?: boolean }
const messages = ref<ChatMsg[]>([])
const input = ref('')
const pending = ref(false)
const sessionId = ref(`preview-${Date.now()}`)
const listEl = ref<HTMLElement | null>(null)

// 绑定 MCP 连接的已启用工具数（工具清单来自 /mcp/tools，失败按 0 展示）
const tools = ref<Tool[]>([])
onMounted(async () => {
  try { tools.value = await listTools() } catch { tools.value = [] }
})

// ---- 当前生效配置 chips（全部取自草稿） ----
const modelInfo = computed(() => props.models.find((m) => m.code === props.draft.baseModel))
const modelLabel = computed(() => (props.draft.baseModel ? (modelInfo.value ? `${modelInfo.value.name}（${modelInfo.value.code}）` : String(props.draft.baseModel)) : ''))
const temperature = computed<number | null>(() => {
  const mp = props.draft.modelParams && typeof props.draft.modelParams === 'object' ? (props.draft.modelParams as Record<string, unknown>) : undefined
  if (mp && typeof mp.temperature === 'number' && Number.isFinite(mp.temperature)) return mp.temperature
  const dt = modelInfo.value?.defaultParams?.temperature
  return typeof dt === 'number' ? dt : null
})
const skillCount = computed(() => (props.draft.skillIds || []).length)
const toolCount = computed(() => tools.value.filter((t) => t.enabled && (props.draft.mcpServerIds || []).includes(t.serverId)).length)
const capabilityCount = computed(() => Object.values(props.draft.capabilities || {}).filter(Boolean).length)
const capabilityTitle = computed(() => Object.entries(props.draft.capabilities || {}).filter(([, v]) => v).map(([k]) => CAPABILITY_LABELS[k] || k).join('、') || '均未开启')
const suggestions = computed(() => (props.draft.suggestedQuestions || []).map((q) => String(q).trim()).filter(Boolean))

function scrollBottom(): void {
  void nextTick(() => { if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight })
}

async function send(text?: string): Promise<void> {
  const message = (text ?? input.value).trim()
  if (!message || pending.value) return
  input.value = ''
  messages.value.push({ role: 'user', content: message })
  pending.value = true
  scrollBottom()
  try {
    if (realMode.value) await sendReal(message)
    else await sendMock(message)
  } catch (e) {
    messages.value.push({ role: 'assistant', content: e instanceof Error ? e.message : String(e), mode: realMode.value ? 'real' : 'mock', isError: true })
  } finally {
    pending.value = false
    scrollBottom()
  }
}

/** 演示引擎路径：draft 草稿全量随请求下发，回复由草稿确定性生成 */
async function sendMock(message: string): Promise<void> {
  const history = messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content }))
  const r = await previewChat({
    draft: JSON.parse(JSON.stringify(props.draft)) as Record<string, unknown>,
    sessionId: sessionId.value,
    message,
    history
  })
  messages.value.push({ role: 'assistant', content: r.reply, mode: 'mock', trace: r.trace })
}

function pushError(content: string): void {
  messages.value.push({ role: 'assistant', content, mode: 'real', isError: true })
}

/** 真实调用：浏览器直连 `${endpoint}/chat/completions`（OpenAI 兼容，Bearer 鉴权）；开发环境直连失败自动经 Vite 代理兜底 */
async function sendReal(message: string): Promise<void> {
  const model = modelInfo.value
  if (!model) {
    pushError('未选择基础模型：请先在左侧「基本信息 → 基础模型」中选择模型管理中已注册的模型，再进行真实调用。')
    return
  }
  // 明文 Key 演示专用获取（mock db 明文存储、界面仅见掩码）；未配置时不发起外部请求
  let apiKey = ''
  try { apiKey = (await revealModelKey(model.id)).apiKey } catch { apiKey = '' }
  if (!model.endpoint || !apiKey) {
    pushError(`所选模型「${model.name}（${model.code}）」未配置接入地址或 API Key（在「模型管理」中配置）。当前为演示环境：未配 Key 时不发起外部请求；可补全配置后重试，或关闭「真实调用」改用后端代理模式（演示引擎）。`)
    return
  }
  const mp = props.draft.modelParams && typeof props.draft.modelParams === 'object' ? (props.draft.modelParams as Record<string, unknown>) : undefined
  const temperature = mp && typeof mp.temperature === 'number' ? mp.temperature : (typeof model.defaultParams?.temperature === 'number' ? model.defaultParams.temperature : 0.7)
  const msgs = [
    { role: 'system', content: String(props.draft.systemPrompt || '') },
    ...messages.value.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ]
  const started = performance.now()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  const base = model.endpoint.replace(/\/+$/, '')
  const payload = JSON.stringify({ model: model.code, messages: msgs, temperature })
  const init = (extraHeaders: Record<string, string>): RequestInit => ({
    method: 'POST', signal: ctrl.signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: payload
  })
  let res: Response
  try {
    try {
      res = await fetch(`${base}/chat/completions`, init({}))
    } catch (directErr) {
      // 直连失败（多为 CORS）：开发环境经 Vite 本地代理兜底重试一次；用户主动超时/中止不重试
      if ((directErr as Error)?.name === 'AbortError' || /abort/i.test(String(directErr)) || !import.meta.env.DEV) throw directErr
      res = await fetch(`/__llm-proxy/chat/completions`, init({ 'x-llm-base-url': base }))
    }
  } catch (e) {
    clearTimeout(timer)
    if ((e as Error)?.name === 'AbortError' || /abort/i.test(String(e))) {
      pushError('真实调用超时（20s）：端点不可达或响应过慢；请检查接入地址，或改用后端代理模式（关闭「真实调用」开关）。')
    } else {
      pushError('浏览器直连失败：多为 CORS 拦截或网络不可达（供应商端点未允许跨域）。可改用后端代理模式（关闭「真实调用」开关，走 /experts/preview-chat 由 Java 后端代理），或检查接入地址。')
    }
    return
  }
  clearTimeout(timer)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403) {
      pushError(`鉴权失败（HTTP ${res.status}）：API Key 无效或未授权，请到「模型管理」检查该模型的密钥配置。`)
    } else {
      pushError(`真实调用失败（HTTP ${res.status}）：${text.slice(0, 160) || '供应商无响应体'}。可检查接入地址路径（须为 OpenAI 兼容 /chat/completions），或改用后端代理模式。`)
    }
    return
  }
  const data = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null
  const reply = data?.choices?.[0]?.message?.content
  if (typeof reply !== 'string' || !reply) {
    pushError('真实调用响应格式异常：未找到 choices[0].message.content（OpenAI 兼容字段），请确认端点为 OpenAI 兼容接口。')
    return
  }
  messages.value.push({
    role: 'assistant', content: reply, mode: 'real',
    trace: { matchedSkills: [], toolCalls: [], model: model.code, latencyMs: Math.round(performance.now() - started) }
  })
}

/** 清空会话：重置消息与 sessionId（草稿联动无需重置） */
function clearSession(): void {
  messages.value = []
  input.value = ''
  sessionId.value = `preview-${Date.now()}`
}
</script>
<template>
  <div class="ecp">
    <div class="ecp-head">
      <div class="ecp-title">
        <span>对话预览</span>
        <el-tag size="small" type="warning" effect="plain">草稿实时生效，无需保存</el-tag>
      </div>
      <div class="ecp-chips">
        <el-tag size="small" :type="modelLabel ? 'primary' : 'danger'">模型：{{ modelLabel || '未选择' }}</el-tag>
        <el-tag size="small" type="info">温度：{{ temperature ?? '未设置' }}</el-tag>
        <el-tag size="small" type="info">技能 {{ skillCount }}</el-tag>
        <el-tag size="small" type="info" :title="`绑定 MCP 连接 ${(draft.mcpServerIds || []).length} 个`">MCP 工具 {{ toolCount }}</el-tag>
        <el-tag size="small" type="info" :title="capabilityTitle">能力 {{ capabilityCount }}/12</el-tag>
      </div>
      <div class="ecp-actions">
        <template v-if="isAdmin">
          <el-switch v-model="realMode" size="small" active-text="真实调用" />
          <small class="muted">浏览器直连，Key 不出本机（演示环境）</small>
        </template>
        <span class="spacer" />
        <el-button size="small" :disabled="pending" @click="clearSession">清空会话</el-button>
      </div>
    </div>
    <div ref="listEl" class="ecp-list">
      <div v-if="!messages.length" class="ecp-empty">
        <p class="muted">空会话：以下是草稿中的建议问题，点击即发送。</p>
        <el-button v-for="(q, i) in suggestions" :key="i" size="small" plain style="margin:0 8px 8px 0" @click="send(q)">{{ q }}</el-button>
        <p v-if="!suggestions.length" class="muted">（草稿未配置建议问题，请直接在下方输入）</p>
      </div>
      <div v-for="(m, i) in messages" :key="i" class="ecp-msg" :class="m.role">
        <div class="ecp-meta">
          <el-tag v-if="m.role === 'assistant' && m.mode === 'mock'" size="small" type="warning" effect="plain">模拟回复（演示引擎）</el-tag>
          <el-tag v-else-if="m.role === 'assistant' && m.mode === 'real'" size="small" type="success" effect="plain">真实调用</el-tag>
        </div>
        <div class="ecp-bubble" :class="{ error: m.isError }">{{ m.content }}</div>
        <el-collapse v-if="m.trace && (m.trace.matchedSkills.length || m.trace.toolCalls.length)" class="ecp-trace">
          <el-collapse-item :title="`调用轨迹（技能 ${m.trace.matchedSkills.length} · 工具 ${m.trace.toolCalls.length} · ${m.trace.latencyMs}ms · 模型 ${m.trace.model || '-'}）`">
            <div class="ecp-trace-row">技能路由：
              <el-tag v-for="s in m.trace.matchedSkills" :key="s.id" size="small" style="margin-right:4px">{{ s.name }}</el-tag>
              <span v-if="!m.trace.matchedSkills.length" class="muted">无命中</span>
            </div>
            <div v-for="(t, ti) in m.trace.toolCalls" :key="ti" class="ecp-trace-row">
              <code>{{ t.server }} · {{ t.tool }}</code>
              <div class="muted">{{ JSON.stringify(t.args) }}</div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
      <div v-if="pending" class="ecp-msg assistant">
        <div class="ecp-bubble muted">生成中…{{ realMode ? '（真实调用，最长 20s）' : '（演示引擎模拟延迟 400–900ms）' }}</div>
      </div>
    </div>
    <div class="ecp-input">
      <el-input
        v-model="input"
        type="textarea"
        :rows="2"
        :disabled="pending"
        placeholder="输入调试消息，Enter 发送（Shift+Enter 换行）"
        @keydown.enter.exact.prevent="send()"
      />
      <el-button type="primary" :loading="pending" @click="send()">发送</el-button>
    </div>
  </div>
</template>
<style scoped>
.ecp { display: flex; flex-direction: column; flex: 1; min-height: 0; width: 100%; }
.ecp-head { border-bottom: 1px solid var(--el-border-color-lighter); padding-bottom: 10px; }
.ecp-title { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 8px; }
.ecp-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ecp-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ecp-actions .spacer { flex: 1; }
.ecp-list { flex: 1; overflow-y: auto; min-height: 0; padding: 10px 4px 6px 0; }
.ecp-empty { padding: 16px 4px; }
.ecp-msg { margin-bottom: 12px; }
.ecp-msg.user { text-align: right; }
.ecp-msg.user .ecp-bubble { background: var(--el-color-primary-light-9); border-color: var(--el-color-primary-light-7); text-align: left; }
.ecp-meta { min-height: 6px; margin-bottom: 3px; }
.ecp-bubble { display: inline-block; max-width: 94%; white-space: pre-wrap; word-break: break-word; border: 1px solid var(--el-border-color-lighter); border-radius: 8px; padding: 8px 10px; background: var(--el-fill-color-lighter); font-size: 13px; line-height: 1.65; }
.ecp-bubble.error { border-color: var(--el-color-danger-light-5); background: var(--el-color-danger-light-9); color: var(--el-color-danger); }
.ecp-trace { margin-top: 4px; text-align: left; }
.ecp-trace :deep(.el-collapse-item__header) { font-size: 12px; height: 30px; line-height: 30px; background: transparent; }
.ecp-trace-row { font-size: 12px; margin: 2px 0 6px; }
.ecp-input { display: flex; gap: 8px; align-items: flex-end; border-top: 1px solid var(--el-border-color-lighter); padding-top: 10px; }
</style>
