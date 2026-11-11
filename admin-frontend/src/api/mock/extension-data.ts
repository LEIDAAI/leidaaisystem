import dayjs from 'dayjs'
import { beijingTime } from '../../utils/chat-time'
import { escapeReportText } from '../../utils/static-chat-report'
import type { Agent, BillingSettings, ConfigItem, CreditPackage, LlmModel, PlatformType, SkillFile, Tool, Scenario, KnowledgeBase, KnowledgeFile } from '../config'
import { PLATFORMS } from '../config'

export interface Chat { id: number; userId: number; expertId: number; /** 会话标题（用户发起时的主题短句，对齐前台会话名） */ title: string; createdAt: string; deletedAt: string | null; deleteReason: string; messages: Array<{ role: string; content: string; createdAt: string }> }
export interface ConfigVersion { version: number; versionName?: string; operator?: string; note: string; createdAt: string; snapshot: ConfigItem }
export interface Extensions {
  models: LlmModelRow[]
  plans: ConfigItem[]; experts: ConfigItem[]; skills: ConfigItem[]; servers: ConfigItem[]; tools: Tool[]
  scenarios: Scenario[]; knowledgeBases: KnowledgeBase[]
  /** v25：智能体（技能归属维度，各智能体相互独立） */
  agents: Agent[]
  /** v8：知识库文档（Open WebUI 式文档管理，纯文本内容存 localStorage） */
  kbFiles: KnowledgeFile[]
  chats: Chat[]; promptHistory: Record<string, Array<{ version: number; systemPrompt: string; createdAt: string }>>
  skillCalls: Array<{ skillId: number; success: boolean; createdAt: string }>
  /** 专家（助手预设）全量版本快照：每次保存生成，可查看/恢复 */
  expertVersions: Record<string, ConfigVersion[]>
  /** 技能 SKILL.md 内容版本快照：每次保存生成，可 diff/恢复 */
  skillVersions: Record<string, ConfigVersion[]>
  /** MCP 连接配置版本快照（含连接配置与工具绑定）：每次保存生成，可 diff/恢复（v5 补齐） */
  mcpVersions: Record<string, ConfigVersion[]>
  /** 套餐配置版本快照（v17）：营销/计费字段每次保存生成，可 diff/恢复 */
  planVersions: Record<string, ConfigVersion[]>
  /** 积分加油包商品（v17）：C 端充值卡片商品 */
  creditPackages: CreditPackage[]
  /** 全局计费设置（v17）：注册赠送积分 / 升级差价策略 / 自定义积分滑杆 */
  billingSettings: BillingSettings
}

/** 存储行：在 API 形态基础上额外持有 API Key 明文（仅 mock 存储层，任何接口响应不得返回） */
export type LlmModelRow = LlmModel & { apiKey?: string }

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
// Key 经环境变量注入，源码不落明文；未配置时用占位值（预览真实调用会失败，但不泄露任何凭据）
export const DEMO_GATEWAY_KEY = import.meta.env.VITE_DEMO_GATEWAY_KEY || 'sk-demo-internal-gateway'

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
  const base = { status: 1, version: 1, updatedAt: dayjs().format('YYYY-MM-DD HH:mm:ss'), refreshStatus: 'APPLIED' as const, appliedVersion: 1, refreshMessage: 'Mock 演示配置已生效；未连接 AgentScope' }
  // 专家 = 助手预设（附录 12.1）；id 1 对齐 1688选品助手完整示例：7 个绑定技能 + server:gateway + 3 条建议问题
  // v5：baseModel 存模型管理中的模型 code（显示名经模型表解析）；platforms 为平台维度多选（至少一个）
  const experts: ConfigItem[] = [
    {
      ...base, id: 1, code: 'product-selection-assistant', name: '1688分销选品',
      description: '面向 1688 分销场景的选品助手：关键词分析、竞品监控、类目趋势与利润测算，一键生成选品报告。',
      avatarUrl: '', baseModel: 'glm-5.3', platforms: ['1688'], scenarioId: 1,
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
      avatarUrl: '', baseModel: 'deepseek-v3', platforms: ['AMAZON', 'TEMU'], scenarioId: 4,
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
    // v7 场景分组：按技能功能分配到对应场景
    scenarioId: ({ 11: 1, 12: 3, 13: 1, 14: 1, 15: 2, 16: 1, 17: 1 } as Record<number, number>)[id],
    // v25 归属智能体：存量技能默认归有维AI（id=1），各智能体相互独立
    agentId: 1,
    paramSchema: { type: 'object', properties: { keyword: { type: 'string' } }, required: ['keyword'] },
    execConfig: { handler: 'demo', timeoutMs: 30000 }
  }))
  // MCP = 工具服务器连接（附录 12.3）；对齐实例目录：gateway(OpenAPI)/dld(MCP)/amazon_data(MCP)/gateway-amazon(OpenAPI)/echotik(MCP)/gateway-ozon(OpenAPI)
  // v5：platforms 按所服务平台标注（聚合网关覆盖多平台；echotik 通用=全平台）
  const servers: ConfigItem[] = [
    { ...base, id: 1, code: 'gateway', name: '聚合网关（OpenAPI）', platforms: ['1688', 'AMAZON', 'TEMU'], connType: 'OpenAPI', transport: 'STREAMABLE_HTTP', endpoint: 'https://gateway.example.com', path: '/openapi.json', authConfig: { type: 'BEARER', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 2, code: 'dld', name: '有维AI数据（MCP）', platforms: ['1688'], connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: 'https://dld.example.com', path: '/mcp', authConfig: { type: 'NONE' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 3, code: 'amazon_data', name: '亚马逊数据（MCP）', platforms: ['AMAZON'], connType: 'MCP', transport: 'STREAMABLE_HTTP', endpoint: 'https://amazon-data.example.com', path: '/mcp', authConfig: { type: 'API_KEY', headerName: 'X-Api-Key', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 4, code: 'gateway-amazon', name: '亚马逊网关（OpenAPI）', platforms: ['AMAZON'], connType: 'OpenAPI', transport: 'STREAMABLE_HTTP', endpoint: 'https://gateway-amazon.example.com', path: '/openapi.json', authConfig: { type: 'BEARER', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 5, code: 'echotik', name: 'EchoTik 达人数据（MCP）', platforms: ['1688', 'OZON', 'AMAZON', 'TEMU'], connType: 'MCP', transport: 'SSE', endpoint: 'https://echotik.example.com', path: '/mcp', authConfig: { type: 'NONE' }, toolFilter: [], healthStatus: 'UNKNOWN' },
    { ...base, id: 6, code: 'gateway-ozon', name: 'Ozon 网关（OpenAPI）', platforms: ['OZON'], connType: 'OpenAPI', transport: 'STREAMABLE_HTTP', endpoint: 'https://gateway-ozon.example.com', path: '/openapi.json', authConfig: { type: 'BEARER', credential: 'MOCK_SECRET_CONFIGURED' }, toolFilter: [], healthStatus: 'UNKNOWN' }
  ]
  // 场景（v7）：平台下的细分场景，用于技能分组
  const scenarios: Scenario[] = [
    { id: 1, name: '分销选品', platformId: '1688', description: '1688 平台分销场景下的选品分析', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 2, name: '供应链对接', platformId: '1688', description: '1688 平台供应商对接与管理', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 3, name: '竞品监控', platformId: '1688', description: '1688 平台竞品价格与销量监控', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 4, name: '亚马逊选品', platformId: 'AMAZON', description: '亚马逊平台商品选择与榜单分析', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 5, name: '跨境物流', platformId: 'AMAZON', description: '亚马逊跨境物流与仓储管理', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 6, name: 'Temu 爆款追踪', platformId: 'TEMU', description: 'Temu 平台爆款商品趋势追踪', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 7, name: 'Ozon 选品', platformId: 'OZON', description: 'Ozon 平台商品选择与市场分析', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 8, name: 'TikTok 带货', platformId: 'TIKTOK', description: 'TikTok 直播带货选品与内容分析', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 9, name: 'Shopee 运营', platformId: 'SHOPEE', description: 'Shopee 平台店铺运营与商品管理', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ]
  // 智能体（v25）：独立于平台/场景的技能归属维度，三个智能体互不关联
  const agents: Agent[] = [
    { id: 1, name: '有维AI', code: 'youwei', description: '有维AI 自有智能体，默认承载现有选品技能', status: 1, sort: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 2, name: 'WorkBuddy', code: 'workbuddy', description: 'WorkBuddy 智能体，技能独立维护', status: 1, sort: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 3, name: '千问', code: 'qwen', description: '千问智能体，技能独立维护', status: 1, sort: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ]
  // 知识库（v7）：专家可绑定的知识资源；v8 增加 access 权限（对齐 Open WebUI：私有/公开）
  const knowledgeBases: KnowledgeBase[] = [
    { id: 1, name: '1688 选品指南', description: '1688 平台选品策略与最佳实践', platform: '1688', access: 'PUBLIC', fileCount: 2, status: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 2, name: '跨境电商合规手册', description: '各平台跨境电商合规要求与政策', platform: 'AMAZON', access: 'PUBLIC', fileCount: 2, status: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 3, name: '利润测算模型', description: '分销利润测算公式与案例', platform: '1688', access: 'PUBLIC', fileCount: 1, status: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 4, name: '竞品分析模板', description: '竞品分析标准模板与方法论', access: 'PRIVATE', fileCount: 0, status: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 5, name: 'TikTok 内容运营指南', description: 'TikTok 短视频与直播运营策略', platform: 'TIKTOK', access: 'PUBLIC', fileCount: 1, status: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
  ]
  // v8：知识库示例文档（含 Markdown 表格，用于真实渲染预览演示；fileCount 与上表保持一致）
  const kbFileAt = (daysAgoN: number): string => new Date(Date.now() - daysAgoN * 86400000).toISOString()
  const kbFiles: KnowledgeFile[] = [
    {
      id: 71, kbId: 1, name: '1688选品核心指标说明.md', size: 0, createdAt: kbFileAt(12), updatedAt: kbFileAt(3),
      content: `# 1688 选品核心指标说明

选品决策依赖以下核心指标，结论必须附带数据来源与采集时间。

## 指标定义与健康区间

| 指标 | 含义 | 健康区间 | 说明 |
| --- | --- | --- | --- |
| 竞争度 | 搜索结果数 / 搜索热度比值 | < 0.35 | 越低代表供给缺口越大 |
| 复购率 | 90 天内重复采购买家占比 | > 18% | 分销场景核心指标 |
| 起批量 | 最低起订数量 | ≤ 10 件 | 过高不利于中小分销商 |
| 拿货毛利 | 售价 - 拿货价 - 物流 | > 25% | 低于 15% 建议放弃 |
| 48h 发货率 | 48 小时内发货订单占比 | > 95% | 供应链稳定性指标 |

## 使用约定

1. 竞争度与复购率优先级高于毛利，二者不达标直接淘汰。
2. 数据源以有维AI 1688 接口为准，禁止凭经验臆造。
3. 结论输出时必须列出指标快照表，便于回溯。`
    },
    {
      id: 72, kbId: 1, name: '2026年Q4厨房收纳类目简报.md', size: 0, createdAt: kbFileAt(6), updatedAt: kbFileAt(1),
      content: `# 2026 年 Q4 厨房收纳类目简报

## 类目大盘

Q4 受年终备货驱动，厨房收纳类目销量环比明显增长，抽屉式收纳盒与调料架为两大主力款式。

| 子类目 | 月销量（件） | 环比 | 客单价（元） | 备注 |
| --- | --- | --- | --- | --- |
| 抽屉式收纳盒 | 486,000 | +22.4% | 18.5 | 头部集中在 3-5 家 |
| 调料架 | 312,000 | +15.1% | 12.8 | 不锈钢材质占比上升 |
| 水槽置物架 | 198,000 | +9.7% | 24.0 | 下沉市场增速快 |
| 密封罐套装 | 154,000 | +4.2% | 16.2 | 玻璃材质退货率高 |

## 选品建议

- 优先关注抽屉式收纳盒中「带滚轮」细分款，竞争度低且毛利空间好。
- 密封罐类目注意物流破损风险，建议选择带缓冲包装的供应商。`
    },
    {
      id: 73, kbId: 2, name: 'Ozon realFBS 中国至俄罗斯物流线路摘要.md', size: 0, createdAt: kbFileAt(9), updatedAt: kbFileAt(2),
      content: `# Ozon realFBS 中国 → 俄罗斯物流线路摘要

realFBS 模式下卖家自发货，物流线路选择直接影响时效与履约评分。

## 主流线路对比

| 线路 | 时效（天） | 参考运费（元/kg） | 计泡比 | 适用品类 |
| --- | --- | --- | --- | --- |
| 空运专线 | 8-12 | 42.0 | 1:8000 | 高客单、小件 |
| 中俄班列 | 18-25 | 18.5 | 1:6000 | 中等体积常规货 |
| 海外仓补货（海运） | 35-45 | 9.8 | 1:5000 | 大件、备货型 |
| 卡航专线 | 14-20 | 22.0 | 1:7000 | 平衡时效与成本 |

## 履约要求

1. realFBS 订单须在 48 小时内交付物流，超时影响店铺评分。
2. 每单需附俄语报关信息，品名与申报价值保持一致。
3. 空运线路禁止含电池、液体类商品。`
    },
    {
      id: 74, kbId: 2, name: '跨境电商合规检查清单.md', size: 0, createdAt: kbFileAt(20), updatedAt: kbFileAt(20),
      content: `# 跨境电商合规检查清单

上架与发货前逐项核对，任一项不通过即暂停流程。

| 检查项 | 适用平台 | 要求 | 责任角色 |
| --- | --- | --- | --- |
| CE / EAC 认证 | Ozon、亚马逊欧站 | 按品类提供证书扫描件 | 供应商 |
| 商品标签双语化 | 全平台 | 俄语/英语必填字段完整 | 运营 |
| 知识产权排查 | 全平台 | 商标与外观专利检索无风险 | 法务 |
| 申报价值一致性 | 全平台 | 报关价与售价逻辑自洽 | 物流 |
| 禁限售词检查 | TikTok、Temu | 标题与详情过滤敏感词 | 运营 |`
    },
    {
      id: 75, kbId: 3, name: '分销毛利测算公式与示例.md', size: 0, createdAt: kbFileAt(30), updatedAt: kbFileAt(5),
      content: `# 分销毛利测算公式与示例

## 公式

> 毛利 = 售价 − 拿货价 − 物流费 − 平台费用（佣金 + 履约）

## 测算示例

| 案例 | 拿货价（元） | 售价（元） | 物流（元） | 平台费用（元） | 毛利（元） | 毛利率 |
| --- | --- | --- | --- | --- | --- | --- |
| 收纳盒 A | 6.8 | 29.9 | 4.5 | 3.6 | 15.0 | 50.2% |
| 调料架 B | 11.2 | 39.9 | 7.8 | 4.8 | 16.1 | 40.4% |
| 密封罐 C | 9.5 | 35.0 | 9.2 | 4.2 | 12.1 | 34.6% |

## 结论约定

毛利率低于 15% 的案例必须输出负向警示，不得隐藏或四舍五入掩盖。`
    },
    {
      id: 76, kbId: 5, name: 'TikTok 爆款视频结构模板.md', size: 0, createdAt: kbFileAt(15), updatedAt: kbFileAt(15),
      content: `# TikTok 爆款视频结构模板

## 三段式结构

1. **0-3s 钩子**：痛点提问或效果冲击画面，决定完播率。
2. **3-20s 演示**：产品使用前后对比，字幕同步卖点。
3. **20-30s 转化**：引导点击购物车，附促销信息。

## 钩子类型参考

| 钩子类型 | 示例开场 | 适用场景 |
| --- | --- | --- |
| 痛点提问 | 「厨房永远乱？三秒搞定」 | 家居收纳 |
| 效果冲击 | 使用后 vs 使用前对比 | 清洁、整理 |
| 悬念揭秘 | 「主播们都不说的拿货渠道」 | 分销带货 |
| 数据背书 | 「月销 10 万件的秘密」 | 爆款复刻 |`
    }
  ]
  // v17：套餐营销示例（sort/tagline/badge/features/月年付计费周期）；GIFT 赠送套餐不配置任何营销字段
  const commonFeatures = ['全部 AI 专家与技能', '全平台商品分析', '数据报表导出', '批量选品与监控']
  const PLAN_EXTRAS: Array<Partial<ConfigItem>> = [
    { sort: 1, tagline: '每月 1 万 AI 积分', features: [...commonFeatures], billingCycles: [{ cycle: 'MONTHLY', price: 99 }, { cycle: 'YEARLY', price: 990 }] },
    { sort: 2, badge: '最受欢迎', tagline: '每月 3 万 AI 积分', features: [...commonFeatures], billingCycles: [{ cycle: 'MONTHLY', price: 299 }, { cycle: 'YEARLY', price: 2990 }] },
    { sort: 3, tagline: '每月 10 万 AI 积分', features: [...commonFeatures], billingCycles: [{ cycle: 'MONTHLY', price: 2999 }] }
  ]
  const plans: ConfigItem[] = ['标准版','高级版','旗舰版'].map((name,i) => ({ ...base, id:i+2, code:`plan_${i+2}`, name, price:[99,299,2999][i], durationDays:30, credits:[10000,30000,100000][i], entitlements:[], planType:'NORMAL' as const, ...PLAN_EXTRAS[i] }))
  return {
    models: seedLlmModels(),
    plans,
    experts,
    skills,
    servers,
    scenarios,
    agents,
    knowledgeBases,
    kbFiles,
    tools: [
      { id: 21, serverId: 1, name: 'ali_product_search', enabled: true },
      { id: 22, serverId: 1, name: 'ali_keyword_trend', enabled: true },
      { id: 23, serverId: 2, name: 'dld_product_search', enabled: true },
      { id: 24, serverId: 3, name: 'amazon_bsr_ranking', enabled: true },
      { id: 25, serverId: 4, name: 'amazon_sales_estimate', enabled: true },
      { id: 26, serverId: 5, name: 'echotik_video_search', enabled: true }
    ],
    chats: Array.from({ length:24 },(_,i) => {
      const base = Date.now()-(i*37+(i%4)*5)*3600000
      const t=(min:number)=>new Date(base+min*60000).toISOString()
      const topic=CHAT_TOPICS[i%CHAT_TOPICS.length]
      const chat: Chat = { id:i+1,userId:i%8+1,expertId:i%3+1,title:topic,createdAt:t(0),deletedAt:i===7?new Date(Date.now()-86400000).toISOString():null,deleteReason:i===7?'用户申请删除，消息含个人联系方式':'',messages:[
        { role:'user',content:`${topic}，预算 50-200 元，帮我分析下竞争和利润，联系 demo${i}@example.com 手机13800138000`,createdAt:t(0) },
        { role:'assistant',content:`收到，开始分析「${topic}」：先按平台检索候选商品，再做价格带与竞争度评估。`,createdAt:t(1) },
        { role:'assistant',content:'候选商品已检索完成，正在进行销量趋势与毛利率测算…',createdAt:t(2) },
        { role:'assistant',content:'分析完成：候选对比表格与选品分析报告已生成，可在会话详情中查看。',createdAt:t(4) }
      ] }
      appendAskRounds(chat) // v13：每个种子会话含 2 轮问话（第 2 轮为用户追问）
      return chat
    }),
    promptHistory:Object.fromEntries(experts.map(e => [e.id,[{ version:1, systemPrompt:e.systemPrompt!,createdAt:e.updatedAt }]])),
    skillCalls:Array.from({ length:24 },(_,i) => ({ skillId:i%2+11, success:i%5!==0,createdAt:new Date(Date.now()-i*86400000).toISOString() })),
    expertVersions: Object.fromEntries(experts.map(e => [e.id, [{ version: e.version, versionName: 'v1（初始种子）', operator: 'admin', note: '初始种子数据', createdAt: e.updatedAt, snapshot: structuredClone(e) }]])),
    skillVersions: Object.fromEntries(skills.map(s => [s.id, [{ version: s.version, versionName: 'v1（初始种子）', operator: 'admin', note: '初始种子数据', createdAt: s.updatedAt, snapshot: structuredClone(s) }]])),
    mcpVersions: Object.fromEntries(servers.map(s => [s.id, [{ version: s.version, versionName: 'v1（初始种子）', operator: 'admin', note: '初始种子数据', createdAt: s.updatedAt, snapshot: structuredClone(s) }]])),
    planVersions: Object.fromEntries(plans.map(p => [p.id, [{ version: p.version, versionName: 'v1（初始种子）', operator: 'admin', note: '初始种子数据', createdAt: p.updatedAt, snapshot: structuredClone(p) }]])),
    creditPackages: seedCreditPackages(),
    billingSettings: seedBillingSettings()
  }
}

/** v17：积分加油包商品种子（3 档常规在售，status 全 1：体验/常用/专业）。
 * 规则 v0.2 拍板：无真实原价依据不配置划线价（originalPrice 留空），接入真实原价后再维护。 */
export function seedCreditPackages(): CreditPackage[] {
  const at = dayjs().format('YYYY-MM-DD HH:mm:ss')
  return [
    { id: 1, name: '体验包', credits: 500, bonusCredits: 0, price: 45, originalPrice: undefined, sort: 1, status: 1, remark: '仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零', createdAt: at, updatedAt: at },
    { id: 2, name: '常用包', credits: 2000, bonusCredits: 0, price: 168, originalPrice: undefined, sort: 2, status: 1, remark: '仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零', createdAt: at, updatedAt: at },
    { id: 3, name: '专业包', credits: 8000, bonusCredits: 0, price: 600, originalPrice: undefined, badge: '超值', sort: 3, status: 1, remark: '仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零', createdAt: at, updatedAt: at }
  ]
}

/** v17：全局计费设置默认值（注册赠送 100 积分；升级差价按实付价折算；自定义积分滑杆）。
 * v21 阶梯单价对齐前台拍板口径：3 万 0.015 / 4 万 0.0115 / 5 万起 0.0095 元/积分，总价随数量单调不减。 */
export function seedBillingSettings(): BillingSettings {
  return {
    registerBonus: 100,
    upgradePolicy: 'PRORATED',
    creditSlider: { enabled: true, min: 1000, max: 100000, step: 1000, defaultValue: 1000, unitPrice: 0.015, tiers: [{ min: 1000, rate: 0.015 }, { min: 40000, rate: 0.0115 }, { min: 50000, rate: 0.0095 }] }
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
    const valid = (v: unknown): v is PlatformType => typeof v === 'string' && (PLATFORMS as string[]).includes(v)
    if (Array.isArray(item.platforms)) {
      const arr = [...new Set(item.platforms.filter(valid))]
      if (arr.length) return arr
    }
    if (valid(item.platform)) return [item.platform]
    if (item.platform === 'ALL') return [...PLATFORMS]
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
    // v9：绑定级 MCP 工具裁剪幂等清理（仅保留已绑定服务下真实存在的工具；无效形态整体丢弃）
    if (legacy.mcpToolSelection && typeof legacy.mcpToolSelection === 'object' && !Array.isArray(legacy.mcpToolSelection)) {
      const cleaned: Record<string, number[]> = {}
      for (const [k, v] of Object.entries(legacy.mcpToolSelection)) {
        const sid = Number(k)
        if (!legacy.mcpServerIds!.includes(sid) || !Array.isArray(v)) continue
        const ids = v.filter(id => target.tools.some(t => t.id === id && t.serverId === sid))
        if (ids.length) cleaned[k] = ids
      }
      if (Object.keys(cleaned).length) legacy.mcpToolSelection = cleaned
      else delete legacy.mcpToolSelection
    } else if (legacy.mcpToolSelection !== undefined) delete legacy.mcpToolSelection
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
    // v9：MCP 前台可见性幂等补默认（历史数据视为全员可见；仅控制 C 端展示，不影响专家调用）
    if (!legacy.visibility || !['PUBLIC', 'PLAN', 'PRIVATE'].includes(legacy.visibility.type)) legacy.visibility = { type: 'PUBLIC', planIds: [] }
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

export function redact(value: string): string
export function redact(value: unknown): unknown
export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value
    .replace(/\bbearer\s+[\w.~+\/-]+=*/gi, '[凭据已移除]')
    .replace(/\b(?:token|password|secret|api[_-]?key|authorization|credential)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;，；。<>}"']+)/gi, '[凭据已移除]')
    .replace(/\bsk-[a-z0-9_-]+/gi, '[凭据已移除]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[手机号已脱敏]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[邮箱已脱敏]')
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !/token|password|secret|credential|authorization|authConfig|execConfig|systemPrompt|messages/i.test(k)).map(([k,v])=>[k,redact(v)]))
  return value
}

// -------------------------------------------------------------- 对话分析产物（对话管理演示）
/** 对话话题种子（每次会话 = 用户发起的一次选品咨询） */
const CHAT_TOPICS = ['亚马逊厨房硅胶厨具套装选品','Ozon 冬季车载防雪挡风罩选品','TikTok 宠物自动喂食器选品','1688 家用迷你缝纫机选品','Temu 折叠衣物收纳箱选品','虾皮直播补光灯手机支架选品','亚马逊露营折叠桌椅选品','Ozon 车载无线吸尘器选品']

export interface ChatAnalysisStep { title:string;detail:string;tools:string[];durationSec:number;at:string }
export interface ChatAnalysisTable { title:string;columns:string[];rows:string[][] }
export interface ChatAnalysis { steps:ChatAnalysisStep[];table:ChatAnalysisTable;reportHtml:string }

// v13：追问文案模板（按会话 ID 轮换，确定性生成；种子与存量迁移共用）
const FOLLOW_ASKS: Array<(topic: string) => string> = [
  topic => `再帮我看下 ${topic} 里 100 元以内的款，把销量前 3 的利润对比一下`,
  topic => `${topic} 这种品换到 Ozon 平台还卖得动吗？帮我按新平台再评估一轮`,
  topic => `${topic} 这批款如果统一做促销价，毛利率还能保住多少？帮我重算一版对比`
]

/** 追加一轮用户追问（1 条 user + 2 条 assistant）到会话末尾；幂等：已有 ≥2 条用户消息则跳过 */
export function appendAskRounds(c: Chat): void {
  if (c.messages.filter(m => m.role === 'user').length >= 2) return
  const topic = (c.messages.find(m => m.role === 'user')?.content || '选品咨询').split('，')[0].split('。')[0]
  const ask = FOLLOW_ASKS[c.id % FOLLOW_ASKS.length](topic)
  const lastAt = c.messages[c.messages.length - 1]?.createdAt || c.createdAt
  const at = (min: number) => new Date(new Date(lastAt).getTime() + min * 60000).toISOString()
  c.messages.push(
    { role: 'user', content: ask, createdAt: at(6) },
    { role: 'assistant', content: `收到追问，针对「${topic}」补充条件重新检索并测算中…`, createdAt: at(7) },
    { role: 'assistant', content: '补充分析完成：新一轮候选对比与结论已生成，可在会话详情中查看。', createdAt: at(9) }
  )
}

/** 分析产物公共生成（mock：模拟 Agent 选品分析产物，不落库）；seedBase 决定随机序列，topic 决定需求描述 */
function genChatAnalysis(c: Chat, topic: string, seedBase: number, expertName?: string): ChatAnalysis {
  topic = redact(topic)
  expertName = redact(expertName || '—')
  const esc = escapeReportText
  const rand=(n:number)=>{ const x=Math.abs(Math.sin(seedBase+n*13))*10000; return x-Math.floor(x) }
  const hitCount=12+Math.floor(rand(1)*29)
  const stepAt=(min:number)=>new Date(new Date(c.createdAt).getTime()+min*60000).toISOString()
  const steps:ChatAnalysisStep[]=[
    { title:'解析需求', detail:`提取品类「${topic}」的关键词与筛选条件：预算区间、目标平台、最低毛利率 ≥ 18%。`, tools:['意图解析'], durationSec:3+Math.floor(rand(2)*5), at:stepAt(0) },
    { title:'检索候选商品', detail:`并行调用商品搜索与趋势接口，命中 ${hitCount} 个候选，去重与黑名单过滤后保留 8 个进入分析。`, tools:['ali_product_search','keyword_trend'], durationSec:8+Math.floor(rand(3)*22), at:stepAt(1) },
    { title:'数据分析', detail:'对候选商品计算价格带分布、月销量趋势、竞品集中度与预估毛利，输出推荐排序。', tools:['sales_estimate','bsr_ranking'], durationSec:15+Math.floor(rand(4)*30), at:stepAt(2) },
    { title:'生成报告', detail:'汇总分析结论，生成候选对比表格与 HTML 选品分析报告。', tools:['report_generator'], durationSec:4+Math.floor(rand(5)*6), at:stepAt(3) }
  ]
  const names=['硅胶厨具三件套','折叠收纳箱（3 件装）','车载防雪挡风罩','宠物自动喂食器','迷你缝纫机家用款']
  const platforms=['1688','OZON','AMAZON','TEMU','TIKTOK']
  const rows=names.map((n,idx)=>{
    const price=(28+rand(10+idx)*170).toFixed(2)
    const sales=(300+Math.floor(rand(20+idx)*8700)).toLocaleString()
    const comp=['低','中','高'][Math.floor(rand(30+idx)*3)]
    const margin=(18+rand(40+idx)*33).toFixed(1)
    const score=(6.5+rand(50+idx)*3.4).toFixed(1)
    return [n,platforms[Math.floor(rand(60+idx)*5)],`¥${price}`,`${sales} 件`,comp,`${margin}%`,score]
  }).sort((a,b)=>Number(b[6])-Number(a[6])).map((r,i)=>[String(i+1),...r])
  const table:ChatAnalysisTable={ title:'候选商品对比', columns:['排名','商品','平台','参考价','月销量','竞争度','预估毛利率','推荐指数'], rows }
  const best=rows[0].map(esc)
  const tr=rows.map(r=>`<tr>${r.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')
  const li=rows.slice(0,3).map((row,i)=>{const r=row.map(esc);return `<li><b>TOP${i+1} ${r[1]}</b>（${r[2]}）：参考价 ${r[3]}，月销 ${r[4]}，竞争度${r[5]}，预估毛利率 ${r[6]}，推荐指数 ${r[7]}。</li>`}).join('')
  const reportHtml=`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>选品分析报告 · ${esc(topic)}</title><style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:860px;margin:32px auto;color:#262626;line-height:1.7;padding:0 20px}h1{font-size:22px;border-bottom:3px solid #2563eb;padding-bottom:12px}.meta{color:#8c8c8c;font-size:13px}h2{font-size:17px;margin-top:28px;color:#1d4ed8}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th{background:#eff6ff;color:#1e40af}th,td{border:1px solid #d9d9d9;padding:8px 10px;text-align:center}.tag{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 8px;font-size:12px;margin-right:8px}ul{padding-left:20px}footer{margin-top:32px;color:#8c8c8c;font-size:12px;border-top:1px dashed #d9d9d9;padding-top:12px}</style></head><body><h1>选品分析报告</h1><p class="meta">会话 #${esc(c.id)} · 专家 ${esc(expertName)} · ${esc(beijingTime(c.createdAt))}（北京时间 UTC+08:00） · <span class="tag">Mock 演示数据</span></p><h2>一、需求概述</h2><p>用户发起「${esc(topic)}」选品咨询：要求在预算区间内筛选竞争度适中、毛利率不低于 18% 的候选商品，并给出推荐排序。</p><h2>二、候选商品对比</h2><table><thead><tr>${table.columns.map(col=>`<th>${esc(col)}</th>`).join('')}</tr></thead><tbody>${tr}</tbody></table><h2>三、分析结论</h2><ul>${li}</ul><p>综合推荐：<b>${best[1]}</b>（推荐指数 ${best[7]}），建议先小批量测款，根据转化数据决定是否放量。</p><footer>有维AI 生成 · 数据为 Mock 演示，实盘决策请以真实数据核实</footer></body></html>`
  return { steps, table, reportHtml }
}

/** 会话级分析（行右侧「查看分析」/ 三级页 = 该会话所有问话的分析结果）：话题 = 全部问话拼接 */
export function buildChatAnalysis(c: Chat, expertName?: string): ChatAnalysis {
  const topics = c.messages.filter(m => m.role === 'user').map(m => redact(m.content).split('，')[0].split('。')[0])
  return genChatAnalysis(c, topics.join('；') || '选品咨询', c.id * 97, expertName)
}

/** 单问话分析（展开区每轮问话的「查看分析」）：话题 = 第 askIdx 条用户消息 */
export function buildAskAnalysis(c: Chat, askIdx: number, expertName?: string): ChatAnalysis {
  const ask = c.messages.filter(m => m.role === 'user')[askIdx]
  const topic = redact(ask?.content || '选品咨询').split('，')[0].split('。')[0]
  return genChatAnalysis({ ...c, createdAt: ask?.createdAt || c.createdAt }, topic, c.id * 97 + (askIdx + 1) * 131, expertName)
}
