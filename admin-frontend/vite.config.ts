import { fileURLToPath, URL } from 'node:url'

import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 开发环境本地 LLM 代理（仅 dev 生效）：绕过浏览器 CORS，把 /__llm-proxy/* 转发到
 * 请求头 x-llm-base-url 指定的 OpenAI 兼容端点（如 http://192.168.1.10:8080/v1）。
 * 鉴权头原样透传，Key 不落盘不打印；生产环境由 Java 后端代理（/admin/api/models/probe 与 preview-chat），本插件不参与。
 */
function llmDevProxy(): Plugin {
  return {
    name: 'dev-llm-proxy',
    configureServer(server) {
      server.middlewares.use('/__llm-proxy', (req, res) => {
        const send = (status: number, body: unknown): void => {
          res.statusCode = status
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        const base = String(req.headers['x-llm-base-url'] || '').trim().replace(/\/+$/, '')
        if (!/^https?:\/\//i.test(base)) { send(400, { error: '缺少或非法 x-llm-base-url 请求头' }); return }
        // connect 挂载前缀已被剥离：req.url 形如 /models、/chat/completions
        const rest = (req.url || '').replace(/^\//, '')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const headers: Record<string, string> = {}
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v !== 'string') continue
            if (['host', 'connection', 'origin', 'referer', 'cookie', 'x-llm-base-url'].includes(k) || k.startsWith('sec-') || k.startsWith('accept-encoding')) continue
            headers[k] = v
          }
          const method = (req.method || 'GET').toUpperCase()
          const body = ['GET', 'HEAD'].includes(method) ? undefined : Buffer.concat(chunks).toString('utf8') || undefined
          fetch(`${base}/${rest}`, { method, headers, body })
            .then(async (up) => {
              res.statusCode = up.status
              res.setHeader('content-type', up.headers.get('content-type') || 'application/json; charset=utf-8')
              res.end(Buffer.from(await up.arrayBuffer()))
            })
            .catch((e: Error) => send(502, { error: `代理请求失败：${e.message}` }))
        })
      })
    }
  }
}

export default defineConfig(({ command }) => ({
  // 静态托管（GitHub Pages 等子路径部署）用相对 base；dev 保持根路径
  base: command === 'build' ? './' : '/',
  plugins: [vue(), llmDevProxy()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  // @tiptap 依赖只在路由级动态 import 的知识库页才被加载，dev server 运行中触发增量
  // 预构建会产生混批 chunk（?v= hash 不一致）→ @tiptap/core 双实例 →
  // "Schema is missing its top node type ('doc')"。全部列入 include 首启即预构建，避免二次 optimize。
  optimizeDeps: {
    include: [
      '@tiptap/vue-3', '@tiptap/core',
      '@tiptap/starter-kit',
      '@tiptap/extension-color', '@tiptap/extension-highlight', '@tiptap/extension-image',
      '@tiptap/extension-link', '@tiptap/extension-placeholder',
      '@tiptap/extension-table', '@tiptap/extension-table-cell',
      '@tiptap/extension-table-header', '@tiptap/extension-table-row',
      '@tiptap/extension-task-item', '@tiptap/extension-task-list',
      '@tiptap/extension-text-align', '@tiptap/extension-text-style',
      '@tiptap/extension-underline'
    ]
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      '/admin/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
}))
