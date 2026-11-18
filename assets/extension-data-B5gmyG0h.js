import{a9 as w}from"./index-BbQzBM08.js";import{b as j}from"./chat-time-DTEVM40E.js";import{e as F}from"./static-chat-report-sgeU36L8.js";import{P as L}from"./config-S34vSkqh.js";const B=["file_context","file_upload","vision","web_search","image_generation","code_interpreter","terminal","citations","status_updates","memory","builtin_tools","usage"],te={file_context:"文件上下文",file_upload:"文件上传",vision:"图片理解",web_search:"联网搜索",image_generation:"图像生成",code_interpreter:"代码解释器",terminal:"终端执行",citations:"引用来源",status_updates:"状态推送",memory:"长期记忆",builtin_tools:"内置工具",usage:"用量统计"},H={11:[{name:"docs/搜索流程.md",content:`# 搜索流程

1. 解析关键词与类目
2. 分页拉取候选商品
3. 过滤与去重
4. 输出候选清单`},{name:"docs/字段字典.md",content:`# 字段字典

| 字段 | 含义 |
| --- | --- |
| keyword | 搜索关键词 |
| category_id | 1688 类目 ID |
| page_size | 每页条数 |`},{name:"references/类目映射.md",content:`# 类目映射

- 厨房收纳 → 家居日用
- 户外用品 → 运动户外
- 宠物用品 → 宠物生活`},{name:"scripts/export-result.md",content:`# 导出说明

导出 CSV 时按「结论 / 证据 / 风险」三列输出，仅导出结论通过的候选。`}],12:[{name:"docs/价格模型.md",content:`# 价格模型

到手价 = 报价 × (1 − 优惠) + 运费；跨境成本另计。`},{name:"references/竞品口径.md",content:`# 竞品口径

同款以标题核心词 + 规格近似匹配，销量取近 30 天。`}],13:[{name:"docs/分析步骤.md",content:`# 分析步骤

1. 拉取会话内候选
2. 计算关键词竞争度
3. 输出机会与风险清单`}],14:[{name:"docs/解析规则.md",content:`# 解析规则

优先解析 SKU 属性与包装规格，缺失时回退标题关键词。`},{name:"scripts/parse-notes.md",content:`# 解析备注

型号后缀（如 Pro / Max）需单独归一，避免误判为不同 SKU。`}],17:[{name:"docs/报告结构.md",content:`# 报告结构

结论前置 → 章节（市场 / 竞品 / 利润 / 风险）→ 数据来源标注。`},{name:"references/图表规范.md",content:`# 图表规范

所有图表必须标注数据来源与统计口径。`}]};function E(e={}){const r={file_context:!1,file_upload:!1,vision:!1,web_search:!1,image_generation:!1,code_interpreter:!1,terminal:!1,citations:!1,status_updates:!1,memory:!1,builtin_tools:!1,usage:!1};for(const f of B)typeof e[f]=="boolean"&&(r[f]=e[f]);return typeof e.file=="boolean"&&(e.file_context===void 0&&(r.file_context=e.file),e.file_upload===void 0&&(r.file_upload=e.file)),r}const Y=`# {技能名称}

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
`;function V(e,r){return Y.replace("{技能名称}",e).replace("<!-- 描述什么意图/问题应路由到本技能 -->",r||"（待补充触发意图）")}const _="http://192.168.1.10:8080/v1",v="sk-demo-internal-gateway";function z(){const e=new Date().toISOString();return[{id:41,code:"glm-5.3",name:"GLM-5.3",provider:"OpenAI兼容",endpoint:_,apiKey:v,defaultParams:{temperature:.7,max_tokens:4096},remark:"1688选品助手默认基础模型（内网演示网关）",status:1,createdAt:e,updatedAt:e},{id:42,code:"glm-4.7",name:"GLM-4.7",provider:"智谱",endpoint:"https://open.bigmodel.cn/api/paas/v4",apiKey:"sk-mock-glm47-3c4d",defaultParams:{temperature:.7,max_tokens:4096},remark:"",status:1,createdAt:e,updatedAt:e},{id:43,code:"deepseek-v3",name:"DeepSeek-V3",provider:"OpenAI兼容",endpoint:"https://api.deepseek.com/v1",apiKey:"sk-mock-ds3-5e6f",defaultParams:{temperature:.5,max_tokens:8192},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:e,updatedAt:e},{id:44,code:"qwen-max",name:"Qwen-Max",provider:"OpenAI兼容",endpoint:"https://dashscope.aliyuncs.com/compatible-mode/v1",apiKey:"",defaultParams:{temperature:.7,max_tokens:6e3},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:e,updatedAt:e}]}function Z(e){const r=`${e.code||""} ${e.name||""} ${e.description||""}`.toLowerCase();return/ozon/.test(r)?["OZON"]:/amazon|亚马逊/.test(r)?["AMAZON"]:/temu/.test(r)?["TEMU"]:/tiktok/.test(r)?["TIKTOK"]:/shopee|虾皮/.test(r)?["SHOPEE"]:["1688"]}function oe(){const e={status:1,version:1,updatedAt:w().format("YYYY-MM-DD HH:mm:ss"),refreshStatus:"APPLIED",appliedVersion:1,refreshMessage:"Mock 演示配置已生效；未连接 AgentScope"},r=[{...e,id:1,code:"product-selection-assistant",name:"1688分销选品",description:"面向 1688 分销场景的选品助手：关键词分析、竞品监控、类目趋势与利润测算，一键生成选品报告。",avatarUrl:"",baseModel:"glm-5.3",platforms:["1688"],scenarioId:1,systemPrompt:"你是1688分销选品助手，请基于可验证的数据回答。先理解选品意图，再路由到合适技能；调用工具前先确认参数契约；输出结论必须附带数据来源与校验结果。",skillIds:[11,12,13,14,15,16,17],mcpServerIds:[1],mcpToolIds:[21],suggestedQuestions:['帮我分析"收纳盒"关键词的竞争度',"对比近30天竞品价格并测算分销毛利","生成一份厨房收纳类目的选品报告"],capabilities:E({file:!0,web_search:!0,citations:!0}),tags:["选品","1688","分销"],visibility:{type:"PUBLIC",planIds:[]},isDefault:!0,titleHtml:"1688分销选品专家",introduction:"<p>深耕 1688 分销场景的数据选品助手。支持从<b>关键词竞争度</b>、<b>竞品价格监控</b>、<b>类目趋势</b>三个维度完成选品决策，并一键生成选品报告。</p><ul><li>覆盖 1688 全类目榜单与价格带分布</li><li>内置利润测算与分销毛利模型</li><li>输出结论均附带数据来源校验</li></ul>",greeting:"你好！我是 1688 分销选品专家，可以帮你分析关键词、监控竞品、测算利润并生成选品报告。",coreAbilities:["关键词竞争度分析","竞品价格与销量监控","类目趋势洞察","分销利润测算","一键生成选品报告"],referencePrompts:['帮我分析"收纳盒"关键词在1688的竞争度',"对比近30天收纳类目TOP10竞品的价格分布","生成一份厨房收纳类目的月度选品报告"],nextQuestionConfig:{enabled:!0,model:"deepseek-v4.1-flash",mode:"default"}},{...e,id:2,code:"cross-border-selection",name:"跨境电商选品",description:"面向跨境电商（亚马逊/TikTok）场景的选品助手，结合平台榜单与趋势数据。",avatarUrl:"",baseModel:"deepseek-v3",platforms:["AMAZON","TEMU"],scenarioId:4,systemPrompt:"你是跨境电商选品助手，请基于可验证的数据回答，注意不同站点的价格与合规差异。",skillIds:[12,14,16],mcpServerIds:[1,3,4],suggestedQuestions:["美国站家居类目最近什么品好卖？"],capabilities:E({file:!0,vision:!0,web_search:!0}),tags:["选品","跨境"],visibility:{type:"PLAN",planIds:[2,3]},isDefault:!1,titleHtml:"跨境电商选品专家",introduction:"<p>面向<b>亚马逊 / Temu / TikTok</b> 等跨境站点的选品助手，结合平台榜单、广告数据与站点合规差异给出选品建议。</p>",greeting:"你好！我是跨境电商选品专家，告诉我目标站点与类目，我来帮你找品。",coreAbilities:["亚马逊 BSR 榜单解读","Temu 爆款趋势追踪","站点合规与价格差异提示"],referencePrompts:["美国站家居类目最近什么品好卖？","对比亚马逊与Temu同款收纳盒的价格带"],nextQuestionConfig:{enabled:!0,mode:"default"}},{...e,id:3,code:"douyin-selection",name:"抖音带货选品",description:"面向抖音直播/短视频带货的选品助手，结合达人带货榜与内容趋势。",avatarUrl:"",baseModel:"glm-4.7",platforms:["1688","OZON","AMAZON","TEMU"],systemPrompt:"你是抖音带货选品助手，请基于可验证的数据回答，并给出内容选题建议。",skillIds:[12,17],mcpServerIds:[5],suggestedQuestions:["最近什么商品在短视频渠道转化好？"],capabilities:E({vision:!0,status_updates:!0}),tags:["选品","抖音"],visibility:{type:"PLAN",planIds:[3,4]},isDefault:!1,titleHtml:"抖音带货选品专家",introduction:"<p>面向抖音直播/短视频带货的选品助手，结合<b>达人带货榜</b>与<b>内容趋势</b>，给出选品与内容选题双建议。</p>",greeting:"你好！我是抖音带货选品专家，可以帮你分析达人带货榜和内容趋势。",coreAbilities:["达人带货榜分析","爆款视频内容拆解","选品与内容选题联动建议"],referencePrompts:["最近一周美妆类目哪些达人在带货？","帮我拆解一条百万播放的收纳好物视频"],nextQuestionConfig:{enabled:!1,mode:"default"}}],c=[{id:11,code:"dld-selection-search",name:"1688选品搜索",description:"按关键词/类目在 1688 搜索候选商品并返回结构化清单，适用于选品前期调研",content:`# 1688选品搜索

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
接口超时（>10s）返回部分结果并标注"数据不完整"；无结果时给出放宽关键词的建议。`},{id:12,code:"competitor-price-monitor",name:"竞品价格监控",description:"持续跟踪竞品价格与销量变化，识别异常波动",content:`# 竞品价格监控

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
单商品失败不影响整批；全部失败时返回错误与建议重试时间。`},{id:13,code:"category-trend-analysis",name:"类目趋势分析",description:"追踪类目大盘趋势与热销榜单变化，发现增量机会",content:`# 类目趋势分析

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
类目无效时提示最近似类目候选，不臆造数据。`},{id:14,code:"product-detail-parse",name:"商品详情解析",description:"解析商品 SKU、价格带、主图与卖点，输出结构化商品档案",content:`# 商品详情解析

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
链接失效时提示并请求确认 ID；下架商品标注状态。`},{id:15,code:"shop-rank-analysis",name:"店铺排行分析",description:"分析店铺销量排行与爆款结构，定位对标店铺",content:`# 店铺排行分析

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
数据缺失时降级为销量口径并说明。`},{id:16,code:"profit-calc",name:"利润测算",description:"按拿货价、物流与平台费用测算分销毛利与建议售价",content:`# 利润测算

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
售价低于成本时给出负毛利警示，不隐藏。`},{id:17,code:"selection-report-gen",name:"选品报告生成",description:"汇总各技能结论，生成结构化选品报告",content:`# 选品报告生成

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
前置数据不足时输出精简版并明示缺口。`}].map(({id:n,code:s,name:u,description:l,content:a})=>({...e,id:n,code:s,name:u,description:l,content:a,files:H[n]||[],platforms:{11:["1688"],12:["1688","AMAZON","TEMU"],13:["1688"],14:["1688","AMAZON","TEMU"],15:["1688"],16:["1688","AMAZON","TEMU"],17:["1688","OZON","AMAZON","TEMU"]}[n]||["1688"],scenarioId:{11:1,12:3,13:1,14:1,15:2,16:1,17:1}[n],agentId:1,paramSchema:{type:"object",properties:{keyword:{type:"string"}},required:["keyword"]},execConfig:{handler:"demo",timeoutMs:3e4}})),p=[{...e,id:1,code:"gateway",name:"聚合网关（OpenAPI）",platforms:["1688","AMAZON","TEMU"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:2,code:"dld",name:"有维AI数据（MCP）",platforms:["1688"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://dld.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:3,code:"amazon_data",name:"亚马逊数据（MCP）",platforms:["AMAZON"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://amazon-data.example.com",path:"/mcp",authConfig:{type:"API_KEY",headerName:"X-Api-Key",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:4,code:"gateway-amazon",name:"亚马逊网关（OpenAPI）",platforms:["AMAZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-amazon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:5,code:"echotik",name:"EchoTik 达人数据（MCP）",platforms:["1688","OZON","AMAZON","TEMU"],connType:"MCP",transport:"SSE",endpoint:"https://echotik.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:6,code:"gateway-ozon",name:"Ozon 网关（OpenAPI）",platforms:["OZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-ozon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"}],m=[{id:1,name:"分销选品",platformId:"1688",description:"1688 平台分销场景下的选品分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"供应链对接",platformId:"1688",description:"1688 平台供应商对接与管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"竞品监控",platformId:"1688",description:"1688 平台竞品价格与销量监控",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:4,name:"亚马逊选品",platformId:"AMAZON",description:"亚马逊平台商品选择与榜单分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:5,name:"跨境物流",platformId:"AMAZON",description:"亚马逊跨境物流与仓储管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:6,name:"Temu 爆款追踪",platformId:"TEMU",description:"Temu 平台爆款商品趋势追踪",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:7,name:"Ozon 选品",platformId:"OZON",description:"Ozon 平台商品选择与市场分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:8,name:"TikTok 带货",platformId:"TIKTOK",description:"TikTok 直播带货选品与内容分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:9,name:"Shopee 运营",platformId:"SHOPEE",description:"Shopee 平台店铺运营与商品管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],b=[{id:1,name:"有维AI",code:"youwei",description:"有维AI 自有智能体，默认承载现有选品技能",status:1,sort:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"WorkBuddy",code:"workbuddy",description:"WorkBuddy 智能体，技能独立维护",status:1,sort:2,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"千问",code:"qwen",description:"千问智能体，技能独立维护",status:1,sort:3,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],g=[{id:1,name:"1688 选品指南",description:"1688 平台选品策略与最佳实践",platform:"1688",access:"PUBLIC",fileCount:2,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"跨境电商合规手册",description:"各平台跨境电商合规要求与政策",platform:"AMAZON",access:"PUBLIC",fileCount:2,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"利润测算模型",description:"分销利润测算公式与案例",platform:"1688",access:"PUBLIC",fileCount:1,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:4,name:"竞品分析模板",description:"竞品分析标准模板与方法论",access:"PRIVATE",fileCount:0,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:5,name:"TikTok 内容运营指南",description:"TikTok 短视频与直播运营策略",platform:"TIKTOK",access:"PUBLIC",fileCount:1,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],i=n=>new Date(Date.now()-n*864e5).toISOString(),S=[{id:71,kbId:1,name:"1688选品核心指标说明.md",size:0,createdAt:i(12),updatedAt:i(3),content:`# 1688 选品核心指标说明

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
3. 结论输出时必须列出指标快照表，便于回溯。`},{id:72,kbId:1,name:"2026年Q4厨房收纳类目简报.md",size:0,createdAt:i(6),updatedAt:i(1),content:`# 2026 年 Q4 厨房收纳类目简报

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
- 密封罐类目注意物流破损风险，建议选择带缓冲包装的供应商。`},{id:73,kbId:2,name:"Ozon realFBS 中国至俄罗斯物流线路摘要.md",size:0,createdAt:i(9),updatedAt:i(2),content:`# Ozon realFBS 中国 → 俄罗斯物流线路摘要

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
3. 空运线路禁止含电池、液体类商品。`},{id:74,kbId:2,name:"跨境电商合规检查清单.md",size:0,createdAt:i(20),updatedAt:i(20),content:`# 跨境电商合规检查清单

上架与发货前逐项核对，任一项不通过即暂停流程。

| 检查项 | 适用平台 | 要求 | 责任角色 |
| --- | --- | --- | --- |
| CE / EAC 认证 | Ozon、亚马逊欧站 | 按品类提供证书扫描件 | 供应商 |
| 商品标签双语化 | 全平台 | 俄语/英语必填字段完整 | 运营 |
| 知识产权排查 | 全平台 | 商标与外观专利检索无风险 | 法务 |
| 申报价值一致性 | 全平台 | 报关价与售价逻辑自洽 | 物流 |
| 禁限售词检查 | TikTok、Temu | 标题与详情过滤敏感词 | 运营 |`},{id:75,kbId:3,name:"分销毛利测算公式与示例.md",size:0,createdAt:i(30),updatedAt:i(5),content:`# 分销毛利测算公式与示例

## 公式

> 毛利 = 售价 − 拿货价 − 物流费 − 平台费用（佣金 + 履约）

## 测算示例

| 案例 | 拿货价（元） | 售价（元） | 物流（元） | 平台费用（元） | 毛利（元） | 毛利率 |
| --- | --- | --- | --- | --- | --- | --- |
| 收纳盒 A | 6.8 | 29.9 | 4.5 | 3.6 | 15.0 | 50.2% |
| 调料架 B | 11.2 | 39.9 | 7.8 | 4.8 | 16.1 | 40.4% |
| 密封罐 C | 9.5 | 35.0 | 9.2 | 4.2 | 12.1 | 34.6% |

## 结论约定

毛利率低于 15% 的案例必须输出负向警示，不得隐藏或四舍五入掩盖。`},{id:76,kbId:5,name:"TikTok 爆款视频结构模板.md",size:0,createdAt:i(15),updatedAt:i(15),content:`# TikTok 爆款视频结构模板

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
| 数据背书 | 「月销 10 万件的秘密」 | 爆款复刻 |`}],y=["全部 AI 专家与技能","全平台商品分析","数据报表导出","批量选品与监控"],o=[{sort:1,tagline:"每月 1 万 AI 积分",features:[...y],billingCycles:[{cycle:"MONTHLY",price:99},{cycle:"YEARLY",price:990}]},{sort:2,badge:"最受欢迎",tagline:"每月 3 万 AI 积分",features:[...y],billingCycles:[{cycle:"MONTHLY",price:299},{cycle:"YEARLY",price:2990}]},{sort:3,tagline:"每月 10 万 AI 积分",features:[...y],billingCycles:[{cycle:"MONTHLY",price:2999}]}],t=["标准版","高级版","旗舰版"].map((n,s)=>({...e,id:s+2,code:`plan_${s+2}`,name:n,price:[99,299,2999][s],durationDays:30,credits:[1e4,3e4,1e5][s],entitlements:[],planType:"NORMAL",...o[s]}));return{models:z(),plans:t,experts:r,skills:c,servers:p,scenarios:m,agents:b,knowledgeBases:g,kbFiles:S,tools:[{id:21,serverId:1,name:"ali_product_search",enabled:!0},{id:22,serverId:1,name:"ali_keyword_trend",enabled:!0},{id:23,serverId:2,name:"dld_product_search",enabled:!0},{id:24,serverId:3,name:"amazon_bsr_ranking",enabled:!0},{id:25,serverId:4,name:"amazon_sales_estimate",enabled:!0},{id:26,serverId:5,name:"echotik_video_search",enabled:!0}],chats:Array.from({length:24},(n,s)=>{const u=Date.now()-(s*37+s%4*5)*36e5,l=A=>new Date(u+A*6e4).toISOString(),a=K[s%K.length],d={id:s+1,userId:s%8+1,expertId:s%3+1,title:a,createdAt:l(0),deletedAt:s===7?new Date(Date.now()-864e5).toISOString():null,deleteReason:s===7?"用户申请删除，消息含个人联系方式":"",messages:[{role:"user",content:`${a}，预算 50-200 元，帮我分析下竞争和利润，联系 demo${s}@example.com 手机13800138000`,createdAt:l(0)},{role:"assistant",content:`收到，开始分析「${a}」：先按平台检索候选商品，再做价格带与竞争度评估。`,createdAt:l(1)},{role:"assistant",content:"候选商品已检索完成，正在进行销量趋势与毛利率测算…",createdAt:l(2)},{role:"assistant",content:"分析完成：候选对比表格与选品分析报告已生成，可在会话详情中查看。",createdAt:l(4)}]};return G(d),d}),promptHistory:Object.fromEntries(r.map(n=>[n.id,[{version:1,systemPrompt:n.systemPrompt,createdAt:n.updatedAt}]])),skillCalls:Array.from({length:24},(n,s)=>({skillId:s%2+11,success:s%5!==0,createdAt:new Date(Date.now()-s*864e5).toISOString()})),expertVersions:Object.fromEntries(r.map(n=>[n.id,[{version:n.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:n.updatedAt,snapshot:structuredClone(n)}]])),skillVersions:Object.fromEntries(c.map(n=>[n.id,[{version:n.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:n.updatedAt,snapshot:structuredClone(n)}]])),mcpVersions:Object.fromEntries(p.map(n=>[n.id,[{version:n.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:n.updatedAt,snapshot:structuredClone(n)}]])),planVersions:Object.fromEntries(t.map(n=>[n.id,[{version:n.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:n.updatedAt,snapshot:structuredClone(n)}]])),creditPackages:Q(),billingSettings:W(),creditRecords:[]}}function Q(){const e=w().format("YYYY-MM-DD HH:mm:ss");return[{id:1,name:"体验包",credits:500,bonusCredits:0,price:45,originalPrice:void 0,sort:1,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:e,updatedAt:e},{id:2,name:"常用包",credits:2e3,bonusCredits:0,price:168,originalPrice:void 0,sort:2,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:e,updatedAt:e},{id:3,name:"专业包",credits:8e3,bonusCredits:0,price:600,originalPrice:void 0,badge:"超值",sort:3,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:e,updatedAt:e}]}function W(){return{registerBonus:100,upgradePolicy:"PRORATED",creditSlider:{enabled:!0,min:1e3,max:1e5,step:1e3,defaultValue:1e3,unitPrice:.015,tiers:[{min:1e3,rate:.015},{min:4e4,rate:.0115},{min:5e4,rate:.0095}]}}}function ne(e){const r=o=>{var t;return(t=e.tools.find(n=>n.id===o))==null?void 0:t.serverId};(!Array.isArray(e.models)||!e.models.length)&&(e.models=z()),e.models=e.models.map(o=>({...o,apiKey:typeof o.apiKey=="string"?o.apiKey:void 0,defaultParams:o.defaultParams&&typeof o.defaultParams=="object"&&!Array.isArray(o.defaultParams)?o.defaultParams:{},createdAt:o.createdAt||o.updatedAt||new Date().toISOString()}));const f=()=>e.models.reduce((o,t)=>Math.max(o,t.id),40)+1,c=e.models.find(o=>o.code==="glm-5.3");if(c&&(!c.apiKey||c.apiKey.startsWith("sk-mock-"))&&(c.provider="OpenAI兼容",c.endpoint=_,c.apiKey=v,c.updatedAt=new Date().toISOString()),!e.models.some(o=>o.endpoint===_)){const o=new Date().toISOString();e.models.push({id:f(),code:"deepseek-v4.1-flash",name:"DeepSeek-V4.1-Flash",provider:"OpenAI兼容",endpoint:_,apiKey:v,defaultParams:{temperature:.5,max_tokens:8192},remark:"演示网关自动注册",status:1,createdAt:o,updatedAt:o})}const p=(o,t)=>{const n=s=>typeof s=="string"&&L.includes(s);if(Array.isArray(o.platforms)){const s=[...new Set(o.platforms.filter(n))];if(s.length)return s}return n(o.platform)?[o.platform]:o.platform==="ALL"?[...L]:Z(t)},m=e.experts||[],b=e.skills||[],g=e.servers||[];m.forEach(o=>{var u;const t=o;(t.description===void 0||t.description==="")&&(t.description=o.intro||o.name),t.baseModel||(t.baseModel=String(((u=o.modelParams)==null?void 0:u.model)||"glm-5.3"));const n=e.models.find(l=>l.code===t.baseModel||l.name===t.baseModel);if(n&&(t.baseModel=n.code),!e.models.some(l=>l.code===t.baseModel)){const l=new Date().toISOString();e.models.push({id:f(),code:t.baseModel,name:t.baseModel,provider:"自定义",endpoint:"",defaultParams:{},remark:"旧数据 base_model 自动迁移注册",status:1,createdAt:l,updatedAt:l})}o.platforms=p(o,o),!t.capabilities||typeof t.capabilities!="object"?t.capabilities=E():t.capabilities=E(t.capabilities),Array.isArray(t.suggestedQuestions)||(t.suggestedQuestions=[]),Array.isArray(t.tags)||(t.tags=[]),(!t.visibility||!["PUBLIC","PLAN","PRIVATE"].includes(t.visibility.type))&&(t.visibility={type:"PUBLIC",planIds:[]});const s=(o.mcpToolIds||[]).map(r).filter(l=>typeof l=="number");if((!Array.isArray(t.mcpServerIds)||!t.mcpServerIds.length)&&(t.mcpServerIds=[...new Set(s)]),t.mcpToolSelection&&typeof t.mcpToolSelection=="object"&&!Array.isArray(t.mcpToolSelection)){const l={};for(const[a,d]of Object.entries(t.mcpToolSelection)){const A=Number(a);if(!t.mcpServerIds.includes(A)||!Array.isArray(d))continue;const h=d.filter(T=>e.tools.some(I=>I.id===T&&I.serverId===A));h.length&&(l[a]=h)}Object.keys(l).length?t.mcpToolSelection=l:delete t.mcpToolSelection}else t.mcpToolSelection!==void 0&&delete t.mcpToolSelection;typeof t.titleHtml!="string"&&(t.titleHtml=""),typeof t.introduction!="string"&&(t.introduction=""),typeof t.greeting!="string"&&(t.greeting=""),Array.isArray(t.coreAbilities)||(t.coreAbilities=[]),Array.isArray(t.referencePrompts)||(t.referencePrompts=[]),(!t.nextQuestionConfig||typeof t.nextQuestionConfig!="object")&&(t.nextQuestionConfig={enabled:!0,mode:"default"})}),b.forEach(o=>{const t=o;(!t.content||!String(t.content).trim())&&(t.content=V(o.name,o.description||"")),Array.isArray(t.files)||(t.files=[]),o.platforms=p(o,o)}),g.forEach(o=>{const t=o;if(t.connType||(t.connType="MCP"),o.transport==="HTTP"&&(o.transport="STREAMABLE_HTTP"),(!t.authConfig||typeof t.authConfig!="object")&&(t.authConfig={type:"NONE"}),!t.path)try{const n=new URL(o.endpoint||"");t.path=n.pathname!=="/"?n.pathname:"/mcp",o.endpoint=n.origin}catch{t.path="/mcp"}Array.isArray(t.toolFilter)||(t.toolFilter=[]),(!t.visibility||!["PUBLIC","PLAN","PRIVATE"].includes(t.visibility.type))&&(t.visibility={type:"PUBLIC",planIds:[]}),o.platforms=p(o,o)});const i=(o,t,n)=>{const s=w(o),u=s.isValid()?s.format("YYYYMMDDHHmmss"):w().format("YYYYMMDDHHmmss");if(!t.some(a=>a!==n&&a.versionName===u))return u;let l=2;for(;t.some(a=>a!==n&&a.versionName===`${u}-${l}`);)l++;return`${u}-${l}`},S=o=>{if(o)for(const t of Object.values(o)){const n=t||[];n.forEach(s=>{(!s.versionName||s.versionName==="未命名")&&(s.versionName=i(s.createdAt,n,s)),s.operator||(s.operator="")})}};S(e.expertVersions),S(e.skillVersions),S(e.mcpVersions);const y=(o,t)=>{const n=t||{};return o.forEach(s=>{var u;n[u=String(s.id)]||(n[u]=[{version:s.version,versionName:i(s.updatedAt,[]),operator:"",note:"迁移补记：旧数据迁移初始快照",createdAt:s.updatedAt,snapshot:structuredClone(s)}])}),n};e.expertVersions=y(m,e.expertVersions),e.skillVersions=y(b,e.skillVersions),e.mcpVersions=y(g,e.mcpVersions)}function O(e){return typeof e=="string"?e.replace(/\bbearer\s+[\w.~+\/-]+=*/gi,"[凭据已移除]").replace(/\b(?:token|password|secret|api[_-]?key|authorization|credential)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;，；。<>}"']+)/gi,"[凭据已移除]").replace(/\bsk-[a-z0-9_-]+/gi,"[凭据已移除]").replace(new RegExp("(?<!\\d)1[3-9]\\d{9}(?!\\d)","g"),"[手机号已脱敏]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[邮箱已脱敏]"):Array.isArray(e)?e.map(O):e&&typeof e=="object"?Object.fromEntries(Object.entries(e).filter(([r])=>!/token|password|secret|credential|authorization|authConfig|execConfig|systemPrompt|messages/i.test(r)).map(([r,f])=>[r,O(f)])):e}const K=["亚马逊厨房硅胶厨具套装选品","Ozon 冬季车载防雪挡风罩选品","TikTok 宠物自动喂食器选品","1688 家用迷你缝纫机选品","Temu 折叠衣物收纳箱选品","虾皮直播补光灯手机支架选品","亚马逊露营折叠桌椅选品","Ozon 车载无线吸尘器选品"],$=[e=>`再帮我看下 ${e} 里 100 元以内的款，把销量前 3 的利润对比一下`,e=>`${e} 这种品换到 Ozon 平台还卖得动吗？帮我按新平台再评估一轮`,e=>`${e} 这批款如果统一做促销价，毛利率还能保住多少？帮我重算一版对比`];function G(e){var m,b;if(e.messages.filter(g=>g.role==="user").length>=2)return;const r=(((m=e.messages.find(g=>g.role==="user"))==null?void 0:m.content)||"选品咨询").split("，")[0].split("。")[0],f=$[e.id%$.length](r),c=((b=e.messages[e.messages.length-1])==null?void 0:b.createdAt)||e.createdAt,p=g=>new Date(new Date(c).getTime()+g*6e4).toISOString();e.messages.push({role:"user",content:f,createdAt:p(6)},{role:"assistant",content:`收到追问，针对「${r}」补充条件重新检索并测算中…`,createdAt:p(7)},{role:"assistant",content:"补充分析完成：新一轮候选对比与结论已生成，可在会话详情中查看。",createdAt:p(9)})}function U(e,r,f,c){r=O(r),c=O(c||"—");const p=F,m=a=>{const d=Math.abs(Math.sin(f+a*13))*1e4;return d-Math.floor(d)},b=12+Math.floor(m(1)*29),g=a=>new Date(new Date(e.createdAt).getTime()+a*6e4).toISOString(),i=[{title:"解析需求",detail:`提取品类「${r}」的关键词与筛选条件：预算区间、目标平台、最低毛利率 ≥ 18%。`,tools:["意图解析"],durationSec:3+Math.floor(m(2)*5),at:g(0)},{title:"检索候选商品",detail:`并行调用商品搜索与趋势接口，命中 ${b} 个候选，去重与黑名单过滤后保留 8 个进入分析。`,tools:["ali_product_search","keyword_trend"],durationSec:8+Math.floor(m(3)*22),at:g(1)},{title:"数据分析",detail:"对候选商品计算价格带分布、月销量趋势、竞品集中度与预估毛利，输出推荐排序。",tools:["sales_estimate","bsr_ranking"],durationSec:15+Math.floor(m(4)*30),at:g(2)},{title:"生成报告",detail:"汇总分析结论，生成候选对比表格与 HTML 选品分析报告。",tools:["report_generator"],durationSec:4+Math.floor(m(5)*6),at:g(3)}],S=["硅胶厨具三件套","折叠收纳箱（3 件装）","车载防雪挡风罩","宠物自动喂食器","迷你缝纫机家用款"],y=["1688","OZON","AMAZON","TEMU","TIKTOK"],o=S.map((a,d)=>{const A=(28+m(10+d)*170).toFixed(2),h=(300+Math.floor(m(20+d)*8700)).toLocaleString(),T=["低","中","高"][Math.floor(m(30+d)*3)],I=(18+m(40+d)*33).toFixed(1),C=(6.5+m(50+d)*3.4).toFixed(1);return[a,y[Math.floor(m(60+d)*5)],`¥${A}`,`${h} 件`,T,`${I}%`,C]}).sort((a,d)=>Number(d[6])-Number(a[6])).map((a,d)=>[String(d+1),...a]),t={title:"候选商品对比",columns:["排名","商品","平台","参考价","月销量","竞争度","预估毛利率","推荐指数"],rows:o},n=o[0].map(p),s=o.map(a=>`<tr>${a.map(d=>`<td>${p(d)}</td>`).join("")}</tr>`).join(""),u=o.slice(0,3).map((a,d)=>{const A=a.map(p);return`<li><b>TOP${d+1} ${A[1]}</b>（${A[2]}）：参考价 ${A[3]}，月销 ${A[4]}，竞争度${A[5]}，预估毛利率 ${A[6]}，推荐指数 ${A[7]}。</li>`}).join(""),l=`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>选品分析报告 · ${p(r)}</title><style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:860px;margin:32px auto;color:#262626;line-height:1.7;padding:0 20px}h1{font-size:22px;border-bottom:3px solid #2563eb;padding-bottom:12px}.meta{color:#8c8c8c;font-size:13px}h2{font-size:17px;margin-top:28px;color:#1d4ed8}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th{background:#eff6ff;color:#1e40af}th,td{border:1px solid #d9d9d9;padding:8px 10px;text-align:center}.tag{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 8px;font-size:12px;margin-right:8px}ul{padding-left:20px}footer{margin-top:32px;color:#8c8c8c;font-size:12px;border-top:1px dashed #d9d9d9;padding-top:12px}</style></head><body><h1>选品分析报告</h1><p class="meta">会话 #${p(e.id)} · 专家 ${p(c)} · ${p(j(e.createdAt))}（北京时间 UTC+08:00） · <span class="tag">Mock 演示数据</span></p><h2>一、需求概述</h2><p>用户发起「${p(r)}」选品咨询：要求在预算区间内筛选竞争度适中、毛利率不低于 18% 的候选商品，并给出推荐排序。</p><h2>二、候选商品对比</h2><table><thead><tr>${t.columns.map(a=>`<th>${p(a)}</th>`).join("")}</tr></thead><tbody>${s}</tbody></table><h2>三、分析结论</h2><ul>${u}</ul><p>综合推荐：<b>${n[1]}</b>（推荐指数 ${n[7]}），建议先小批量测款，根据转化数据决定是否放量。</p><footer>有维AI 生成 · 数据为 Mock 演示，实盘决策请以真实数据核实</footer></body></html>`;return{steps:i,table:t,reportHtml:l}}function se(e,r){const f=e.messages.filter(c=>c.role==="user").map(c=>O(c.content).split("，")[0].split("。")[0]);return U(e,f.join("；")||"选品咨询",e.id*97,r)}function re(e,r,f){const c=e.messages.filter(m=>m.role==="user")[r],p=O((c==null?void 0:c.content)||"选品咨询").split("，")[0].split("。")[0];return U({...e,createdAt:(c==null?void 0:c.createdAt)||e.createdAt},p,e.id*97+(r+1)*131,f)}function ae(e,r){const f={"deepseek-v4.1-flash":{name:"DeepSeek-V4.1-Flash",in:2,out:8},"glm-5.3":{name:"GLM-5.3",in:4,out:16},"deepseek-v3":{name:"DeepSeek-V3",in:2,out:8},"qwen-max":{name:"Qwen-Max",in:2.4,out:9.6}},c={amazon:{name:"亚马逊数据接口（第三方 MCP）",price:.0033,label:"第三方工具"},ozon:{name:"Ozon 数据接口",price:.0021,label:"第三方工具"},temu:{name:"TEMU 数据接口",price:.0018,label:"第三方工具"},ali:{name:"1688 数据接口",price:.0015,label:"第三方工具"},echotik:{name:"EchoTik 数据",price:.0042,label:"第三方工具"}},p=i=>/亚马逊/.test(i)?{project:"亚马逊选品分析",toolKey:"amazon"}:/Ozon/.test(i)?{project:"Ozon 选品分析",toolKey:"ozon"}:/Temu|TEMU/.test(i)?{project:"TEMU 选品分析",toolKey:"temu"}:/1688/.test(i)?{project:"1688 分销选品",toolKey:"ali"}:/虾皮|TikTok/i.test(i)?{project:"内容电商选品",toolKey:"echotik"}:{project:"跨境电商选品",toolKey:"ali"},m=Object.keys(f),b=[];let g=1;return e.forEach((i,S)=>{const y=r.find(a=>a.id===i.userId)||r[0];if(!y)return;const{project:o,toolKey:t}=p(i.title),n=c[t],s=m[S%m.length],u=f[s];i.messages.filter(a=>a.role==="user").map(a=>a.createdAt).forEach((a,d)=>{const A=4200+(S*733+d*977)%18e3,h=780+(S*211+d*397)%2600,T=Math.ceil((A/1e6*u.in+h/1e6*u.out)/.0049),I=1+(S+d)%3,C=Math.ceil(n.price*I/.0049),k=[{name:u.name,type:"LLM_MODEL",basis:`输入 ${(A/1e3).toFixed(1)}K · 输出 ${(h/1e3).toFixed(1)}K tokens（¥${u.in}/M 输入、¥${u.out}/M 输出）`,credits:T,cost:Number((A/1e6*u.in+h/1e6*u.out).toFixed(4)),quantity:A+h},{name:n.name,type:"MCP_TOOL",basis:`${n.label}调用 ${I} 次（收单价 ¥${n.price}/次）`,credits:C,cost:Number((n.price*I).toFixed(4)),quantity:I}];(S+d)%3===2&&k.push({name:"选品分析报告生成",type:"SKILL",basis:"技能内部执行，不单独计费",credits:0,cost:0});const x=k.reduce((M,N)=>M+N.credits,0),R=k.reduce((M,N)=>M+(N.cost||0),0),D=(S*7+d)%11===3,P=(S*5+d)%17===5;b.push({id:g++,userId:y.id,phone:y.phone,wechatNickname:y.wechatNickname,chatId:i.id,projectName:o,content:String(i.title||"").slice(0,40),createdAt:a,status:P?"REFUNDED":D?"FREE":"CHARGED",credits:P?x:D?0:-x,breakdown:D||P?k.map(M=>({...M,credits:0})):k,cost:Number(R.toFixed(4)),source:"Mock 演示计量"})})}),b.sort((i,S)=>S.createdAt.localeCompare(i.createdAt))}export{te as C,H as S,B as a,ae as b,G as c,E as d,Q as e,W as f,Z as g,re as h,se as i,ne as m,O as r,oe as s};
