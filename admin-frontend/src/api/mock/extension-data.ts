import dayjs from 'dayjs'
import type { ConfigItem, LlmModel, PlatformType, SkillFile, Tool } from '../config'

export interface Chat { id: number; userId: number; expertId: number; createdAt: string; deletedAt: string | null; deleteReason: string; messages: Array<{ role: string; content: string; createdAt: string }> }
export interface ConfigVersion { version: number; versionName?: string; operator?: string; note: string; createdAt: string; snapshot: ConfigItem }
export interface Extensions {
  models: LlmModelRow[]
  plans: ConfigItem[]; experts: ConfigItem[]; skills: ConfigItem[]; servers: ConfigItem[]; tools: Tool[]
  chats: Chat[]; promptHistory: Record<string, Array<{ version: number; systemPrompt: string; createdAt: string }>>
  skillCalls: Array<{ skillId: number; success: boolean; createdAt: string }>
  /** 专家（助手预设）全量版本快照：每次保存生成，可查看/恢复 */
  expertVersions: Record<string, ConfigVersion[]>
  /** 技能 SKILL.md 内容版本快照：每次保存生成，可 diff/恢复 */
  skillVersions: Record<string, ConfigVersion[]>
  /** MCP 连接配置版本快照（含连接配置与工具绑定）：每次保存生成，可 diff/恢复（v5 补齐） */
  mcpVersions: Record<string, ConfigVersion[]>
}

/** 存储行：在 API 形态基础上额外持有 API Key 明文（仅 mock 存储层，任何接口响应不得返回） */
export type LlmModelRow = LlmModel & { apiKey?: string }

/** 平台枚举（与 schema.sql platforms 增列注释一致；多选数组至少一个，无单值「通用」） */
export const PLATFORM_VALUES: PlatformType[] = ['1688', 'OZON', 'AMAZON', 'TEMU', 'TIKTOK', 'SHOPEE']

/** 专家能力开关字典（用户确认的 OpenWebUI 能力集；v3 旧键 file 映射为 file_context+file_upload） */
export const CAPABILITY_KEYS = ['file_context', 'file_upload', 'vision', 'web_search', 'image_generation', 'code_interpreter', 'terminal', 'citations', 'status_updates', 'memory', 'builtin_tools', 'usage'] as const
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

/** 能力开关显示名（表单与对话预览面板共用） */
export const CAPABILITY_LABELS: Record<string, string> = {
  file_context: '文件上下文', file_upload: '文件上传', vision: '图片理解', web_search: '联网搜索',
  image_generation: '图像生成', code_interpreter: '代码解释器', terminal: '终端执行',
  citations: '引用来源', status_updates: '状态推送', memory: '长期记忆', builtin_tools: '内置工具', usage: '用量统计'
}

export function defaultCapabilities(partial: Record<string, boolean> = {}): Record<CapabilityKey, boolean> {
  const caps = {
    file_context: false, file_upload: false, vision: false, web_search: false, image_generation: false,
    code_interpreter: false, terminal: false, citations: false, status_updates: false, memory: false,
    builtin_tools: false, usage: false
  }
  for (const k of CAPABILITY_KEYS) if (typeof partial[k] === 'boolean') caps[k] = partial[k] as boolean
  // 旧 schema 的 file 键拆分映射（只增不删的兼容迁移）
  if (typeof partial.file === 'boolean') {
    if (partial.file_context === undefined) caps.file_context = partial.file
    if (partial.file_upload === undefined) caps.file_upload = partial.file
  }
  return caps
}

/** SKILL.md 正文结构提示（写入表单占位与迁移兜底） */
export const SKILL_MD_TEMPLATE = `# {技能名称}

## 触发条件
<!-- 描述什么意图/问题应路由到本技能 -->

## 不适用范围
<!-- 明确不处理的场景，防止误路由 -->

## 参数契约
<!-- 输入参数名、类型、必填性与示例 -->

## 执行步骤
<!-- 1. ... 2. ... -->

## 结果校验
<!-- 如何判断执行成功 -->

## 输出约定
<!-- 输出结构与展示格式 -->

## 异常边界
<!-- 超时/失败/部分成功时的行为 -->
`

export function skillMdOf(name: string, description: string): string {
  return SKILL_MD_TEMPLATE.replace('{技能名称}', name).replace('<!-- 描述什么意图/问题应路由到本技能 -->', description || '（待补充触发意图）')
}

/** 演示网关（内网 OpenAI 兼容端点）：种子与迁移共用；专家预览「真实调用」经此走通演示（Key 仅存 mock db，界面只显掩码） */
export const DEMO_GATEWAY_ENDPOINT = 'http://192.168.1.10:8080/v1'
export const DEMO_GATEWAY_KEY = 'sk-4a2e997b4531ad4ed0c85d499ed00273ef06962c0790862929171a51352eb718'

/** 基础 LLM 模型注册预置（v5：GLM-5.3/GLM-4.7/deepseek-v3/qwen-max；glm-5.3 指向内网演示网关可真实调用） */
export function seedLlmModels(): LlmModelRow[] {
  const createdAt = new Date().toISOString()
  return [
    { id: 41, code: 'glm-5.3', name: 'GLM-5.3', provider: 'OpenAI兼容', endpoint: DEMO_GATEWAY_ENDPOINT, apiKey: DEMO_GATEWAY_KEY, defaultParams: { temperature: 0.7, max_tokens: 4096 }, remark: '1688选品助手默认基础模型（内网演示网关）', status: 1, createdAt, updatedAt: createdAt },
    { id: 42, code: 'glm-4.7', name: 'GLM-4.7', provider: '智谱', endpoint: 'https://open.bigmodel.cn/api/paas/v4', apiKey: 'sk-mock-glm47-3c4d', defaultParams: { temperature: 0.7, max_tokens: 4096 }, remark: '', status: 1, createdAt, updatedAt: createdAt },
    { id: 43, code: 'deepseek-v3', name: 'DeepSeek-V3', provider: 'OpenAI兼容', endpoint: 'https://api.deepseek.com/v1', apiKey: 'sk-mock-ds3-5e6f', defaultParams: { temperature: 0.5, max_tokens: 8192 }, remark: 'OpenAI 兼容接入（端点仅示意）', status: 1, createdAt, updatedAt: createdAt },
    { id: 44, code: 'qwen-max', name: 'Qwen-Max', provider: 'OpenAI兼容', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: '', defaultParams: { temperature: 0.7, max_tokens: 6000 }, remark: 'OpenAI 兼容接入（端点仅示意）', status: 1, createdAt, updatedAt: createdAt }
  ]
}

/**
 * 存量数据平台回填（v4→v5 迁移规则）：按 code/name/description 关键词推断——
 * ozon→OZON、amazon/亚马逊→AMAZON、temu→TEMU、tiktok→TIKTOK、shopee/虾皮→SHOPEE，否则默认 ['1688']。
 */
export function detectPlatforms(item: Pick<ConfigItem, 'code' | 'name' | 'description'>): PlatformType[] {
  const text = `${item.code || ''} ${item.name || ''} ${item.description || ''}`.toLowerCase()
  if (/ozon/.test(text)) return ['OZON']
  if (/amazon|亚马逊/.test(text)) return ['AMAZON']
  if (/temu/.test(text)) return ['TEMU']
  if (/tiktok/.test(text)) return ['TIKTOK']
  if (/shopee|虾皮/.test(text)) return ['SHOPEE']
  return ['1688']
}

export function seedExtensions(): Extensions {
  const base = { status: 1, version: 1, updatedAt: new Date().toISOString(), refreshStatus: 'APPLIED' as const, appliedVersion: 1, refreshMessage: 'Mock 演示配置已生效；未连接 AgentScope' }
  // 专家 = 助手预设（附录 12.1）；id 1 对齐 1688选品助手完整示例：7 个绑定技能 + server:gateway + 3 条建议问题
  // v5：baseModel 存模型管理中的模型 code（显示名经模型表解析）；platforms 为平台维度多选（至少一个）
  const experts: ConfigItem[] = [
    {
      ...base, id: 1, code: 'product-selection-assistant', name: '1688分销选品',
      description: '面向 1688 分销场景的选品助手：关键词分析、竞品监控、类目趋势与利润测算，一键生成选品报告。',
      avatarUrl: '', baseModel: 'glm-5.3', platforms: ['1688'],
      systemPrompt: '你是1688分销选品助手，请基于可验证的数据回答。先理解选品意图，再路由到合适技能；调用工具前先确认参数契约；输出结论必须附带数据来源与校验结果。',
      skillIds: [11, 12, 13, 14, 15, 16, 17], mcpServerIds: [1], mcpToolIds: [21],
      suggestedQuestions: ['帮我分析"收纳盒"关键词的竞争度', '对比近30天竞品价格并测算分销毛利', '生成一份厨房收纳类目的选品报告'],
      capabilities: defaultCapabilities({ file: true, web_search: true, citations: true }),
      tags: ['选品', '1688', '分销'], visibility: { type: 'PUBLIC', planIds: [] }, isDefault: true,
      titleHtml: '1688分销选品专家',
      introduction: '<p>深耕 1688 分销场景的数据选品助手。支持从<b>关键词竞争度</b>、<b>竞品价格监控</b>、<b>类目趋势</b>三个维度完成选品决策，并一键生成选品报告。</p><ul><li>覆盖 1688 全类目榜单与价格带分布</li><li>内置利润测算与分销毛利模型</li><li>输出结论均附带数据来源校验</li></ul>',
      greeting: '你好！我是 1688 分销选品专家，可以帮你分析关键词、监控竞品、测算利润并生成选品报告。',
      coreAbilities: ['关键词竞争度分析', '竞品价格与销量监控', '类目趋势洞察', '分销利润测算', '一键生成选品报告'],
      referencePrompts: ['帮我分析"收纳盒"关键词在1688的竞争度', '对比近30天收纳类目TOP10竞品的价格分布', '生成一份厨房收纳类目的月度选品报告'],
      nextQuestionConfig: { enabled: true, model: 'deepseek-v4.1-flash', mode: 'default' }
    },
    {
      ...base, id: 2, code: 'cross-border-selection', name: '跨境电商选品',
      description: '面向跨境电商（亚马逊/TikTok）场景的选品助手，结合平台榜单与趋势数据。',
      avatarUrl: '', baseModel: 'deepseek-v3', platforms: ['AMAZON', 'TEMU'],
      systemPrompt: '你是跨境电商选品助手，请基于可验证的数据回答，注意不同站点的价格与合规差异。',
      skillIds: [12, 14, 16], mcpServerIds: [1, 3, 4],
      suggestedQuestions: ['美国站家居类目最近什么品好卖？'],
      capabilities: defaultCapabilities({ file: true, vision: true, web_search: true }),
      tags: ['选品', '跨境'], visibility: { type: 'PLAN', planIds: [2, 3] }, isDefault: false,
      titleHtml: '跨境电商选品专家',
      introduction: '<p>面向<b>亚马逊 / Temu / TikTok</b> 等跨境站点的选品助手，结合平台榜单、广告数据与站点合规差异给出选品建议。</p>',
      greeting: '你好！我是跨境电商选品专家，告诉我目标站点与类目，我来帮你找品。',
      coreAbilities: ['亚马逊 BSR 榜单解读', 'Temu 爆款趋势追踪', '站点合规与价格差异提示'],
      referencePrompts: ['美国站家居类目最近什么品好卖？', '对比亚马逊与Temu同款收纳盒的价格带'],
      nextQuestionConfig: { enabled: true, mode: 'default' }
    },
    {
      ...base, id: 3, code: 'douyin-selection', name: '抖音带货选品',
      description: '面向抖音直播/短视频带货的选品助手，结合达人带货榜与内容趋势。',
      avatarUrl: '', baseModel: 'glm-4.7', platforms: ['1688', 'OZON', 'AMAZON', 'TEMU'],
      systemPrompt: '你是抖音带货选品助手，请基于可验证的数据回答，并给出内容选题建议。',
      skillIds: [12, 17], mcpServerIds: [5],
      suggestedQuestions: ['最近什么商品在短视频渠道转化好？'],
      capabilities: defaultCapabilities({ vision: true, status_updates: true }),
      tags: ['选品', '抖音'], visibility: { type: 'PLAN', planIds: [3, 4] }, isDefault: false,
      titleHtml: '抖音带货选品专家',
      introduction: '<p>面向抖音直播/短视频带货的选品助手，结合<b>达人带货榜</b>与<b>内容趋势</b>，给出选品与内容选题双建议。</p>',
      greeting: '你好！我是抖音带货选品专家，可以帮你分析达人带货榜和内容趋势。',
      coreAbilities: ['达人带货榜分析', '爆款视频内容拆解', '选品与内容选题联动建议'],
      referencePrompts: ['最近一周美妆类目哪些达人在带货？', '帮我拆解一条百万播放的收纳好物视频'],
      nextQuestionConfig: { enabled: false, mode: 'default' }
    }
  ]
  // 技能 = SKILL.md 内容型（附录 12.2）；id 11-17 共 7 个，支撑 1688选品助手完整示例；正文为简版 SKILL.md 示例
  const SKILL_SEEDS: Array<{ id: number; code: string; name: string; description: string; content: string }> = [
    {
      id: 11, code: 'dld-selection-search', name: '1688选品搜索',
      description: '按关键词/类目在 1688 搜索候选商品并返回结构化清单，适用于选品前期调研',
      content: `# 1688选品搜索

## 触发条件
用户给出品类、关键词或使用场景（如"厨房收纳"），需要寻找候选商品/货源时触发。

## 不适用范围
不做价格趋势解读与利润测算（分别由趋势分析与利润测算技能承接）。

## 参数契约
- keyword: string，必填，搜索关键词
- category_id: string，可选，1688 类目 ID
- page_size: number，可选，默认 20，最大 50

## 执行步骤
1. 调用 ali_product_search 检索候选商品
2. 按销量与复购率预排序，过滤无货源商品
3. 返回前 N 条结构化清单

## 结果校验
每条结果必须包含商品 ID、标题、拿货价、起批量；缺失任一字段则剔除。

## 输出约定
Markdown 表格：商品ID / 标题 / 拿货价 / 起批量 / 销量；结尾附数据来源与检索时间。

## 异常边界
接口超时（>10s）返回部分结果并标注"数据不完整"；无结果时给出放宽关键词的建议。`
    },
    {
      id: 12, code: 'competitor-price-monitor', name: '竞品价格监控',
      description: '持续跟踪竞品价格与销量变化，识别异常波动',
      content: `# 竞品价格监控

## 触发条件
用户需要跟踪指定商品/竞品的价格与销量变化时触发。

## 不适用范围
不负责寻找新商品（由选品搜索承接），不做利润测算。

## 参数契约
- product_ids: string[]，必填，监控商品 ID（≤20 个）
- days: number，可选，回看天数，默认 30

## 执行步骤
1. 按商品 ID 拉取价格/销量时间序列
2. 识别异常波动（单日涨跌 > 15%）并标注

## 结果校验
时间序列需覆盖请求天数的 80% 以上，否则标注"样本不足"。

## 输出约定
每商品一段：当前价 / 区间均价 / 波动摘要；异常波动用【异常】标出。

## 异常边界
单商品失败不影响整批；全部失败时返回错误与建议重试时间。`
    },
    {
      id: 13, code: 'category-trend-analysis', name: '类目趋势分析',
      description: '追踪类目大盘趋势与热销榜单变化，发现增量机会',
      content: `# 类目趋势分析

## 触发条件
用户询问某类目大盘趋势、热销榜单或增量机会时触发。

## 不适用范围
不针对单个商品做分析（见竞品价格监控 / 商品详情解析）。

## 参数契约
- category_id: string，必填，类目 ID
- range: '7d'|'30d'|'90d'，可选，默认 30d

## 执行步骤
1. 拉取类目大盘销量与趋势曲线
2. 叠加热销榜单，识别上升子类目

## 结果校验
趋势点数需与所选区间一致，缺失则标注。

## 输出约定
趋势摘要（3 句内）+ 上升子类目清单表格。

## 异常边界
类目无效时提示最近似类目候选，不臆造数据。`
    },
    {
      id: 14, code: 'product-detail-parse', name: '商品详情解析',
      description: '解析商品 SKU、价格带、主图与卖点，输出结构化商品档案',
      content: `# 商品详情解析

## 触发条件
用户提供 1688 商品链接或 ID，需要结构化商品档案时触发。

## 不适用范围
不做价格趋势与竞品对比。

## 参数契约
- product_id: string，必填，商品 ID 或链接

## 执行步骤
1. 拉取商品详情与 SKU 列表
2. 提炼价格带、主图卖点与资质信息

## 结果校验
SKU 数量 > 0 且含价格，否则视为解析失败。

## 输出约定
商品档案：标题 / 价格带 / SKU 概览 / 卖点 / 风险提示。

## 异常边界
链接失效时提示并请求确认 ID；下架商品标注状态。`
    },
    {
      id: 15, code: 'shop-rank-analysis', name: '店铺排行分析',
      description: '分析店铺销量排行与爆款结构，定位对标店铺',
      content: `# 店铺排行分析

## 触发条件
用户需要定位对标店铺或了解店铺排行时触发。

## 不适用范围
不做商品级分析。

## 参数契约
- category_id: string，必填
- metric: 'sales'|'growth'，可选，默认 sales

## 执行步骤
1. 拉取类目店铺排行
2. 汇总头部店铺爆款结构

## 结果校验
至少返回 5 家有效店铺，否则标注样本不足。

## 输出约定
表格：店铺 / 销量 / 主营类目 / 爆款数；附对标建议一句。

## 异常边界
数据缺失时降级为销量口径并说明。`
    },
    {
      id: 16, code: 'profit-calc', name: '利润测算',
      description: '按拿货价、物流与平台费用测算分销毛利与建议售价',
      content: `# 利润测算

## 触发条件
用户给出拿货价与售价，需要测算分销毛利时触发。

## 不适用范围
不负责选品与比价。

## 参数契约
- cost: number，必填，拿货价（元）
- price: number，必填，预售售价（元）
- shipping: number，可选，物流费（默认按重量估算）

## 执行步骤
1. 计算平台费用（佣金 + 履约）
2. 毛利 = 售价 - 拿货价 - 物流 - 平台费用

## 结果校验
输出必须附计算明细，各项费用可追溯。

## 输出约定
明细表格 + 毛利率与保本售价结论。

## 异常边界
售价低于成本时给出负毛利警示，不隐藏。`
    },
    {
      id: 17, code: 'selection-report-gen', name: '选品报告生成',
      description: '汇总各技能结论，生成结构化选品报告',
      content: `# 选品报告生成

## 触发条件
用户明确要求"生成选品报告"，或已完成多个前置分析需要汇总时触发。

## 不适用范围
不做原始数据采集，只汇总既有结论。

## 参数契约
- topic: string，必填，报告主题
- sections: string[]，可选，指定章节

## 执行步骤
1. 汇总本轮会话中各技能结论
2. 按市场 / 竞品 / 利润 / 风险组织章节

## 结果校验
每个商品结论必须能溯源到前置技能输出，缺失则标注"待补充"。

## 输出约定
结构化 Markdown 报告：结论前置，图表占位符标注数据来源。

## 异常边界
前置数据不足时输出精简版并明示缺口。`
    }
  ]
  const skills: ConfigItem[] = SKILL_SEEDS.map(({ id, code, name, description, content }) => ({
    ...base, id, code, name, description,
    content,
    files: [],
    // v5 平台维度：通用分析技能覆盖多平台，1688 专属技能仅 1688
    platforms: ({ 11: ['1688'], 12: ['1688', 'AMAZON', 'TEMU'], 13: ['1688'], 14: ['1688', 'AMAZON', 'TEMU'], 15: ['1688'], 16: ['1688', 'AMAZON', 'TEMU'], 17: ['1688', 'OZON', 'AMAZON', 'TEMU'] } as Record<number, PlatformType[]>)[id] || ['1688'],
    paramSchema: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] },
    execConfig: { handler: 'demo', timeoutMs: 30000 }
  }))
  // MCP = 工具服务器连接（附录 12.3）；对齐实例目录：gateway(OpenAPI)/dld(MCP)/amazon_data(MCP)/gateway-amazon(OpenAPI)/echotik(MCP)/gateway-ozon(OpenAPI)
  // v5：platforms 按所服务平台标注（聚合网关覆盖多平台；echotik 通用=全平台）
  const servers: ConfigItem[] = [
    { ...base, id: 1, code: 'gateway', name: '聚合网关（OpenAPI）', platforms: ['1688', 'AMAZON', 'TEMU'], connType: 'OpenAPI', transport: 'STREAMABLE_HTTP', endpoint: 'https://gateway.example.com', path: '/openapi.json', authConfig: { type: 'BEARER', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 2, code: 'dld', name: '店雷达数据（MCP）', platforms: ['1688'], connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: 'https://dld.example.com', path: '/mcp', authConfig: { type: 'NONE' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 3, code: 'amazon_data', name: '亚马逊数据（MCP）', platforms: ['AMAZON'], connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: 'https://amazon-data.example.com', path: '/mcp', authConfig: { type: 'API_KEY', headerName: 'X-Api-Key', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 4, code: 'gateway-amazon', name: '亚马逊网关（OpenAPI）', platforms: ['AMAZON'], connType: 'OpenAPI', transport: 'STREAMABLE_HTTP', endpoint: 'https://gateway-amazon.example.com', path: '/openapi.json', authConfig: { type: 'BEARER', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 5, code: 'echotik', name: 'EchoTik 达人数据（MCP）', platforms: ['1688', 'OZON', 'AMAZON', 'TEMU'], connType: 'MCP', transport: 'SSE', endpoint: 'https://echotik.example.com', path: '/mcp', authConfig: { type: 'NONE' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 6, code: 'gateway-ozon', name: 'Ozon 网关（OpenAPI）', platforms: ['OZON'], connType: 'OpenAPI', transport: 'STREAMABLE_HTTP', endpoint: 'https://gateway-ozon.example.com', path: '/openapi.json', authConfig: { type: 'BEARER', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' }
  ]
  return {
    models: seedLlmModels(),
    plans: ['免费版','标准版','专业版','企业版'].map((name,i) => ({ ...base, id:i+1, code:`plan_${i+1}`, name, price:[0,99,299,2999][i], durationDays:30, entitlements:[] })),
    experts,
    skills,
    servers,
    tools: [
      { id: 21, serverId: 1, name: 'ali_product_search', enabled: true },
      { id: 22, serverId: 1, name: 'ali_keyword_trend', enabled: true },
      { id: 23, serverId: 2, name: 'dld_product_search', enabled: true },
      { id: 24, serverId: 3, name: 'amazon_bsr_ranking', enabled: true },
      { id: 25, serverId: 4, name: 'amazon_sales_estimate', enabled: true },
      { id: 26, serverId: 5, name: 'echotik_video_search', enabled: true }
    ],
    chats: Array.from({ length:16 },(_,i) => { const createdAt = new Date(Date.now()-i*86400000).toISOString(); return { id:i+1,userId:i%8+1,expertId:i%3+1,createdAt,deletedAt:null,deleteReason:'',messages:[{ role:'user',content:`演示选品咨询 ${i+1}，联系 demo${i}@example.com 手机13800138000`,createdAt },{ role:'assistant',content:'这是 Mock 演示回复，请核实商品数据。',createdAt }] } }),
    promptHistory:Object.fromEntries(experts.map(e => [e.id,[{ version:1, systemPrompt:e.systemPrompt!,createdAt:e.updatedAt }]])),
    skillCalls:Array.from({ length:24 },(_,i) => ({ skillId:i%2+11, success:i%5!==0,createdAt:new Date(Date.now()-i*86400000).toISOString() })),
    expertVersions: Object.fromEntries(experts.map(e => [e.id, [{ version: e.version, versionName: 'v1（初始种子）', operator: 'admin', note: '初始种子数据', createdAt: e.updatedAt, snapshot: structuredClone(e) }]])),
    skillVersions: Object.fromEntries(skills.map(s => [s.id, [{ version: s.version, versionName: 'v1（初始种子）', operator: 'admin', note: '初始种子数据', createdAt: s.updatedAt, snapshot: structuredClone(s) }]])),
    mcpVersions: Object.fromEntries(servers.map(s => [s.id, [{ version: s.version, versionName: 'v1（初始种子）', operator: 'admin', note: '初始种子数据', createdAt: s.updatedAt, snapshot: structuredClone(s) }]]))
  }
}

/**
 * 旧版（schema v4 及以前）配置数据增量迁移到 v5（模型管理 / 平台维度 / 版本名称）。
 * 只补默认新字段，不删除旧字段；生产语义为 ALTER TABLE 增列 + 回填，全部幂等。
 */
export function migrateLegacyConfig(target: Extensions): void {
  const serverIdOfTool = (toolId: number): number | undefined => target.tools.find(t => t.id === toolId)?.serverId
  // v5：模型注册表缺失（v4 及以前数据）时预置示例模型
  if (!Array.isArray(target.models) || !target.models.length) target.models = seedLlmModels()
  // v5：模型行规范化——补 created_at/defaultParams（中断版 v5 数据缺省时），保留 apiKey
  target.models = target.models.map(m => ({
    ...m,
    apiKey: typeof m.apiKey === 'string' ? m.apiKey : undefined,
    defaultParams: m.defaultParams && typeof m.defaultParams === 'object' && !Array.isArray(m.defaultParams) ? m.defaultParams : {},
    createdAt: m.createdAt || m.updatedAt || new Date().toISOString()
  }))
  const nextModelId = (): number => target.models.reduce((mx, m) => Math.max(mx, m.id), 40) + 1
  // v5.1：演示网关补丁（幂等）——glm-5.3 仍为初始 mock 凭据（空或 sk-mock- 前缀）时切到内网演示网关；
  // 用户已手动改过 Key/端点（非 sk-mock- 前缀）则跳过，尊重已有配置
  const glm = target.models.find(m => m.code === 'glm-5.3')
  if (glm && (!glm.apiKey || glm.apiKey.startsWith('sk-mock-'))) {
    glm.provider = 'OpenAI兼容'
    glm.endpoint = DEMO_GATEWAY_ENDPOINT
    glm.apiKey = DEMO_GATEWAY_KEY
    glm.updatedAt = new Date().toISOString()
  }
  // v5.1：没有任何模型指向演示网关时补 deepseek-v4.1-flash（幂等：按 endpoint 判重）
  if (!target.models.some(m => m.endpoint === DEMO_GATEWAY_ENDPOINT)) {
    const at = new Date().toISOString()
    target.models.push({ id: nextModelId(), code: 'deepseek-v4.1-flash', name: 'DeepSeek-V4.1-Flash', provider: 'OpenAI兼容', endpoint: DEMO_GATEWAY_ENDPOINT, apiKey: DEMO_GATEWAY_KEY, defaultParams: { temperature: 0.5, max_tokens: 8192 }, remark: '演示网关自动注册', status: 1, createdAt: at, updatedAt: at })
  }
  /** 平台迁移：platforms 数组规范化；旧单值 platform 语义保留；「ALL/通用」→ 全平台；无信息 → 关键词推断（否则 1688） */
  const normalizePlatforms = (item: ConfigItem & { platform?: unknown }, fallback: { code: string; name: string; description?: string }): PlatformType[] => {
    const valid = (v: unknown): v is PlatformType => typeof v === 'string' && (PLATFORM_VALUES as string[]).includes(v)
    if (Array.isArray(item.platforms)) {
      const arr = [...new Set(item.platforms.filter(valid))]
      if (arr.length) return arr
    }
    if (valid(item.platform)) return [item.platform]
    if (item.platform === 'ALL') return ['1688', 'OZON', 'AMAZON', 'TEMU', 'TIKTOK', 'SHOPEE']
    return detectPlatforms(fallback)
  }
  const experts = target.experts || []
  const skills = target.skills || []
  const servers = target.servers || []
  experts.forEach(e => {
    const legacy = e as ConfigItem & { platform?: unknown; description?: string; baseModel?: string; capabilities?: Record<string, boolean>; suggestedQuestions?: string[]; tags?: string[]; visibility?: ConfigItem['visibility']; mcpServerIds?: number[] }
    if (legacy.description === undefined || legacy.description === '') legacy.description = e.intro || e.name
    if (!legacy.baseModel) legacy.baseModel = String((e.modelParams as { model?: string } | undefined)?.model || 'glm-5.3')
    // v5：旧 baseModel 存的是显示名（GLM-5.3 等）时统一映射为模型 code
    const modelOf = target.models.find(m => m.code === legacy.baseModel || m.name === legacy.baseModel)
    if (modelOf) legacy.baseModel = modelOf.code
    // v5：不在模型注册表中的 base_model 自动迁移注册为「自定义」模型（幂等）
    if (!target.models.some(m => m.code === legacy.baseModel)) {
      const registeredAt = new Date().toISOString()
      target.models.push({ id: nextModelId(), code: legacy.baseModel, name: legacy.baseModel, provider: '自定义', endpoint: '', defaultParams: {}, remark: '旧数据 base_model 自动迁移注册', status: 1, createdAt: registeredAt, updatedAt: registeredAt })
    }
    e.platforms = normalizePlatforms(e, e)
    if (!legacy.capabilities || typeof legacy.capabilities !== 'object') legacy.capabilities = defaultCapabilities()
    else legacy.capabilities = defaultCapabilities(legacy.capabilities)
    if (!Array.isArray(legacy.suggestedQuestions)) legacy.suggestedQuestions = []
    if (!Array.isArray(legacy.tags)) legacy.tags = []
    if (!legacy.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(legacy.visibility.type)) legacy.visibility = { type: 'PUBLIC', planIds: [] }
    const derived = (e.mcpToolIds || []).map(serverIdOfTool).filter((v): v is number => typeof v === 'number')
    if (!Array.isArray(legacy.mcpServerIds) || !legacy.mcpServerIds.length) legacy.mcpServerIds = [...new Set(derived)]
    // v6：编排扩展字段幂等补默认（标题/介绍/开场白 HTML；核心能力/参考提示词数组；问题建议配置）
    if (typeof legacy.titleHtml !== 'string') legacy.titleHtml = ''
    if (typeof legacy.introduction !== 'string') legacy.introduction = ''
    if (typeof legacy.greeting !== 'string') legacy.greeting = ''
    if (!Array.isArray(legacy.coreAbilities)) legacy.coreAbilities = []
    if (!Array.isArray(legacy.referencePrompts)) legacy.referencePrompts = []
    if (!legacy.nextQuestionConfig || typeof legacy.nextQuestionConfig !== 'object') legacy.nextQuestionConfig = { enabled: true, mode: 'default' }
  })
  skills.forEach(s => {
    const legacy = s as ConfigItem & { platform?: unknown; content?: string; files?: SkillFile[] }
    if (!legacy.content || !String(legacy.content).trim()) legacy.content = skillMdOf(s.name, s.description || '')
    if (!Array.isArray(legacy.files)) legacy.files = []
    s.platforms = normalizePlatforms(s, s)
  })
  servers.forEach(s => {
    const legacy = s as ConfigItem & { platform?: unknown; connType?: 'MCP' | 'OpenAPI'; path?: string; toolFilter?: string[] }
    if (!legacy.connType) legacy.connType = 'MCP'
    if ((s.transport as string) === 'HTTP') s.transport = 'STREAMABLE_HTTP'
    if (!legacy.authConfig || typeof legacy.authConfig !== 'object') legacy.authConfig = { type: 'NONE' }
    if (!legacy.path) {
      try { const url = new URL(s.endpoint || ''); legacy.path = url.pathname !== '/' ? url.pathname : '/mcp'; s.endpoint = url.origin } catch { legacy.path = '/mcp' }
    }
    if (!Array.isArray(legacy.toolFilter)) legacy.toolFilter = []
    s.platforms = normalizePlatforms(s, s)
  })
  // v5：历史快照补 versionName（旧条目按其 createdAt 格式化为 yyyyMMddHHmmss，幂等——补过即跳过）/ operator；
  // 「未命名」为更早迁移的占位值，同样按 createdAt 修复
  const versionNameFrom = (createdAt: string, siblings: ConfigVersion[], self?: ConfigVersion): string => {
    const d = dayjs(createdAt)
    const base = d.isValid() ? d.format('YYYYMMDDHHmmss') : dayjs().format('YYYYMMDDHHmmss')
    if (!siblings.some(x => x !== self && x.versionName === base)) return base
    let n = 2
    while (siblings.some(x => x !== self && x.versionName === `${base}-${n}`)) n++
    return `${base}-${n}`
  }
  const backfillVersions = (versions: Record<string, ConfigVersion[]> | undefined): void => {
    if (!versions) return
    for (const list of Object.values(versions)) {
      const arr = list || []
      arr.forEach(v => {
        if (!v.versionName || v.versionName === '未命名') v.versionName = versionNameFrom(v.createdAt, arr, v)
        v.operator ||= ''
      })
    }
  }
  backfillVersions(target.expertVersions)
  backfillVersions(target.skillVersions)
  backfillVersions(target.mcpVersions)
  const initVersions = (items: ConfigItem[], store: Record<string, ConfigVersion[]> | undefined): Record<string, ConfigVersion[]> => {
    const bag = store || {}
    items.forEach(e => {
      bag[String(e.id)] ||= [{ version: e.version, versionName: versionNameFrom(e.updatedAt, []), operator: '', note: '迁移补记：旧数据迁移初始快照', createdAt: e.updatedAt, snapshot: structuredClone(e) }]
    })
    return bag
  }
  target.expertVersions = initVersions(experts, target.expertVersions)
  target.skillVersions = initVersions(skills, target.skillVersions)
  target.mcpVersions = initVersions(servers, target.mcpVersions)
}

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/(?:bearer\s+)[\w.\-]+/gi,'[凭据已移除]').replace(/\b(?:token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;"}]+/gi,'[凭据已移除]').replace(/\b1[3-9]\d{9}\b/g,'[手机号已脱敏]').replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,'[邮箱已脱敏]')
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !/token|password|secret|credential|authorization|authConfig|execConfig|systemPrompt|messages/i.test(k)).map(([k,v])=>[k,redact(v)]))
  return value
}
