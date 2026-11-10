import{a7 as M}from"./index-Dt7Zq1Ru.js";import{b as x}from"./chat-time-CXjtQWjT.js";import{e as L}from"./static-chat-report-sgeU36L8.js";import{P}from"./config-B3zH15WD.js";const K=["file_context","file_upload","vision","web_search","image_generation","code_interpreter","terminal","citations","status_updates","memory","builtin_tools","usage"],Z={file_context:"文件上下文",file_upload:"文件上传",vision:"图片理解",web_search:"联网搜索",image_generation:"图像生成",code_interpreter:"代码解释器",terminal:"终端执行",citations:"引用来源",status_updates:"状态推送",memory:"长期记忆",builtin_tools:"内置工具",usage:"用量统计"};function I(t={}){const i={file_context:!1,file_upload:!1,vision:!1,web_search:!1,image_generation:!1,code_interpreter:!1,terminal:!1,citations:!1,status_updates:!1,memory:!1,builtin_tools:!1,usage:!1};for(const f of K)typeof t[f]=="boolean"&&(i[f]=t[f]);return typeof t.file=="boolean"&&(t.file_context===void 0&&(i.file_context=t.file),t.file_upload===void 0&&(i.file_upload=t.file)),i}const $=`# {技能名称}

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
`;function U(t,i){return $.replace("{技能名称}",t).replace("<!-- 描述什么意图/问题应路由到本技能 -->",i||"（待补充触发意图）")}const k="http://192.168.1.10:8080/v1",E="sk-demo-internal-gateway";function D(){const t=new Date().toISOString();return[{id:41,code:"glm-5.3",name:"GLM-5.3",provider:"OpenAI兼容",endpoint:k,apiKey:E,defaultParams:{temperature:.7,max_tokens:4096},remark:"1688选品助手默认基础模型（内网演示网关）",status:1,createdAt:t,updatedAt:t},{id:42,code:"glm-4.7",name:"GLM-4.7",provider:"智谱",endpoint:"https://open.bigmodel.cn/api/paas/v4",apiKey:"sk-mock-glm47-3c4d",defaultParams:{temperature:.7,max_tokens:4096},remark:"",status:1,createdAt:t,updatedAt:t},{id:43,code:"deepseek-v3",name:"DeepSeek-V3",provider:"OpenAI兼容",endpoint:"https://api.deepseek.com/v1",apiKey:"sk-mock-ds3-5e6f",defaultParams:{temperature:.5,max_tokens:8192},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:t,updatedAt:t},{id:44,code:"qwen-max",name:"Qwen-Max",provider:"OpenAI兼容",endpoint:"https://dashscope.aliyuncs.com/compatible-mode/v1",apiKey:"",defaultParams:{temperature:.7,max_tokens:6e3},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:t,updatedAt:t}]}function z(t){const i=`${t.code||""} ${t.name||""} ${t.description||""}`.toLowerCase();return/ozon/.test(i)?["OZON"]:/amazon|亚马逊/.test(i)?["AMAZON"]:/temu/.test(i)?["TEMU"]:/tiktok/.test(i)?["TIKTOK"]:/shopee|虾皮/.test(i)?["SHOPEE"]:["1688"]}function Q(){const t={status:1,version:1,updatedAt:M().format("YYYY-MM-DD HH:mm:ss"),refreshStatus:"APPLIED",appliedVersion:1,refreshMessage:"Mock 演示配置已生效；未连接 AgentScope"},i=[{...t,id:1,code:"product-selection-assistant",name:"1688分销选品",description:"面向 1688 分销场景的选品助手：关键词分析、竞品监控、类目趋势与利润测算，一键生成选品报告。",avatarUrl:"",baseModel:"glm-5.3",platforms:["1688"],scenarioId:1,systemPrompt:"你是1688分销选品助手，请基于可验证的数据回答。先理解选品意图，再路由到合适技能；调用工具前先确认参数契约；输出结论必须附带数据来源与校验结果。",skillIds:[11,12,13,14,15,16,17],mcpServerIds:[1],mcpToolIds:[21],suggestedQuestions:['帮我分析"收纳盒"关键词的竞争度',"对比近30天竞品价格并测算分销毛利","生成一份厨房收纳类目的选品报告"],capabilities:I({file:!0,web_search:!0,citations:!0}),tags:["选品","1688","分销"],visibility:{type:"PUBLIC",planIds:[]},isDefault:!0,titleHtml:"1688分销选品专家",introduction:"<p>深耕 1688 分销场景的数据选品助手。支持从<b>关键词竞争度</b>、<b>竞品价格监控</b>、<b>类目趋势</b>三个维度完成选品决策，并一键生成选品报告。</p><ul><li>覆盖 1688 全类目榜单与价格带分布</li><li>内置利润测算与分销毛利模型</li><li>输出结论均附带数据来源校验</li></ul>",greeting:"你好！我是 1688 分销选品专家，可以帮你分析关键词、监控竞品、测算利润并生成选品报告。",coreAbilities:["关键词竞争度分析","竞品价格与销量监控","类目趋势洞察","分销利润测算","一键生成选品报告"],referencePrompts:['帮我分析"收纳盒"关键词在1688的竞争度',"对比近30天收纳类目TOP10竞品的价格分布","生成一份厨房收纳类目的月度选品报告"],nextQuestionConfig:{enabled:!0,model:"deepseek-v4.1-flash",mode:"default"}},{...t,id:2,code:"cross-border-selection",name:"跨境电商选品",description:"面向跨境电商（亚马逊/TikTok）场景的选品助手，结合平台榜单与趋势数据。",avatarUrl:"",baseModel:"deepseek-v3",platforms:["AMAZON","TEMU"],scenarioId:4,systemPrompt:"你是跨境电商选品助手，请基于可验证的数据回答，注意不同站点的价格与合规差异。",skillIds:[12,14,16],mcpServerIds:[1,3,4],suggestedQuestions:["美国站家居类目最近什么品好卖？"],capabilities:I({file:!0,vision:!0,web_search:!0}),tags:["选品","跨境"],visibility:{type:"PLAN",planIds:[2,3]},isDefault:!1,titleHtml:"跨境电商选品专家",introduction:"<p>面向<b>亚马逊 / Temu / TikTok</b> 等跨境站点的选品助手，结合平台榜单、广告数据与站点合规差异给出选品建议。</p>",greeting:"你好！我是跨境电商选品专家，告诉我目标站点与类目，我来帮你找品。",coreAbilities:["亚马逊 BSR 榜单解读","Temu 爆款趋势追踪","站点合规与价格差异提示"],referencePrompts:["美国站家居类目最近什么品好卖？","对比亚马逊与Temu同款收纳盒的价格带"],nextQuestionConfig:{enabled:!0,mode:"default"}},{...t,id:3,code:"douyin-selection",name:"抖音带货选品",description:"面向抖音直播/短视频带货的选品助手，结合达人带货榜与内容趋势。",avatarUrl:"",baseModel:"glm-4.7",platforms:["1688","OZON","AMAZON","TEMU"],systemPrompt:"你是抖音带货选品助手，请基于可验证的数据回答，并给出内容选题建议。",skillIds:[12,17],mcpServerIds:[5],suggestedQuestions:["最近什么商品在短视频渠道转化好？"],capabilities:I({vision:!0,status_updates:!0}),tags:["选品","抖音"],visibility:{type:"PLAN",planIds:[3,4]},isDefault:!1,titleHtml:"抖音带货选品专家",introduction:"<p>面向抖音直播/短视频带货的选品助手，结合<b>达人带货榜</b>与<b>内容趋势</b>，给出选品与内容选题双建议。</p>",greeting:"你好！我是抖音带货选品专家，可以帮你分析达人带货榜和内容趋势。",coreAbilities:["达人带货榜分析","爆款视频内容拆解","选品与内容选题联动建议"],referencePrompts:["最近一周美妆类目哪些达人在带货？","帮我拆解一条百万播放的收纳好物视频"],nextQuestionConfig:{enabled:!1,mode:"default"}}],a=[{id:11,code:"dld-selection-search",name:"1688选品搜索",description:"按关键词/类目在 1688 搜索候选商品并返回结构化清单，适用于选品前期调研",content:`# 1688选品搜索

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
前置数据不足时输出精简版并明示缺口。`}].map(({id:e,code:n,name:r,description:u,content:c})=>({...t,id:e,code:n,name:r,description:u,content:c,files:[],platforms:{11:["1688"],12:["1688","AMAZON","TEMU"],13:["1688"],14:["1688","AMAZON","TEMU"],15:["1688"],16:["1688","AMAZON","TEMU"],17:["1688","OZON","AMAZON","TEMU"]}[e]||["1688"],scenarioId:{11:1,12:3,13:1,14:1,15:2,16:1,17:1}[e],paramSchema:{type:"object",properties:{keyword:{type:"string"}},required:["keyword"]},execConfig:{handler:"demo",timeoutMs:3e4}})),l=[{...t,id:1,code:"gateway",name:"聚合网关（OpenAPI）",platforms:["1688","AMAZON","TEMU"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:2,code:"dld",name:"店雷达数据（MCP）",platforms:["1688"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://dld.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:3,code:"amazon_data",name:"亚马逊数据（MCP）",platforms:["AMAZON"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://amazon-data.example.com",path:"/mcp",authConfig:{type:"API_KEY",headerName:"X-Api-Key",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:4,code:"gateway-amazon",name:"亚马逊网关（OpenAPI）",platforms:["AMAZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-amazon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:5,code:"echotik",name:"EchoTik 达人数据（MCP）",platforms:["1688","OZON","AMAZON","TEMU"],connType:"MCP",transport:"SSE",endpoint:"https://echotik.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:6,code:"gateway-ozon",name:"Ozon 网关（OpenAPI）",platforms:["OZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-ozon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"}],m=[{id:1,name:"分销选品",platformId:"1688",description:"1688 平台分销场景下的选品分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"供应链对接",platformId:"1688",description:"1688 平台供应商对接与管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"竞品监控",platformId:"1688",description:"1688 平台竞品价格与销量监控",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:4,name:"亚马逊选品",platformId:"AMAZON",description:"亚马逊平台商品选择与榜单分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:5,name:"跨境物流",platformId:"AMAZON",description:"亚马逊跨境物流与仓储管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:6,name:"Temu 爆款追踪",platformId:"TEMU",description:"Temu 平台爆款商品趋势追踪",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:7,name:"Ozon 选品",platformId:"OZON",description:"Ozon 平台商品选择与市场分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:8,name:"TikTok 带货",platformId:"TIKTOK",description:"TikTok 直播带货选品与内容分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:9,name:"Shopee 运营",platformId:"SHOPEE",description:"Shopee 平台店铺运营与商品管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],g=[{id:1,name:"1688 选品指南",description:"1688 平台选品策略与最佳实践",platform:"1688",access:"PUBLIC",fileCount:2,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"跨境电商合规手册",description:"各平台跨境电商合规要求与政策",platform:"AMAZON",access:"PUBLIC",fileCount:2,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"利润测算模型",description:"分销利润测算公式与案例",platform:"1688",access:"PUBLIC",fileCount:1,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:4,name:"竞品分析模板",description:"竞品分析标准模板与方法论",access:"PRIVATE",fileCount:0,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:5,name:"TikTok 内容运营指南",description:"TikTok 短视频与直播运营策略",platform:"TIKTOK",access:"PUBLIC",fileCount:1,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],d=e=>new Date(Date.now()-e*864e5).toISOString(),y=[{id:71,kbId:1,name:"1688选品核心指标说明.md",size:0,createdAt:d(12),updatedAt:d(3),content:`# 1688 选品核心指标说明

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
2. 数据源以店雷达 1688 接口为准，禁止凭经验臆造。
3. 结论输出时必须列出指标快照表，便于回溯。`},{id:72,kbId:1,name:"2026年Q4厨房收纳类目简报.md",size:0,createdAt:d(6),updatedAt:d(1),content:`# 2026 年 Q4 厨房收纳类目简报

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
- 密封罐类目注意物流破损风险，建议选择带缓冲包装的供应商。`},{id:73,kbId:2,name:"Ozon realFBS 中国至俄罗斯物流线路摘要.md",size:0,createdAt:d(9),updatedAt:d(2),content:`# Ozon realFBS 中国 → 俄罗斯物流线路摘要

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
3. 空运线路禁止含电池、液体类商品。`},{id:74,kbId:2,name:"跨境电商合规检查清单.md",size:0,createdAt:d(20),updatedAt:d(20),content:`# 跨境电商合规检查清单

上架与发货前逐项核对，任一项不通过即暂停流程。

| 检查项 | 适用平台 | 要求 | 责任角色 |
| --- | --- | --- | --- |
| CE / EAC 认证 | Ozon、亚马逊欧站 | 按品类提供证书扫描件 | 供应商 |
| 商品标签双语化 | 全平台 | 俄语/英语必填字段完整 | 运营 |
| 知识产权排查 | 全平台 | 商标与外观专利检索无风险 | 法务 |
| 申报价值一致性 | 全平台 | 报关价与售价逻辑自洽 | 物流 |
| 禁限售词检查 | TikTok、Temu | 标题与详情过滤敏感词 | 运营 |`},{id:75,kbId:3,name:"分销毛利测算公式与示例.md",size:0,createdAt:d(30),updatedAt:d(5),content:`# 分销毛利测算公式与示例

## 公式

> 毛利 = 售价 − 拿货价 − 物流费 − 平台费用（佣金 + 履约）

## 测算示例

| 案例 | 拿货价（元） | 售价（元） | 物流（元） | 平台费用（元） | 毛利（元） | 毛利率 |
| --- | --- | --- | --- | --- | --- | --- |
| 收纳盒 A | 6.8 | 29.9 | 4.5 | 3.6 | 15.0 | 50.2% |
| 调料架 B | 11.2 | 39.9 | 7.8 | 4.8 | 16.1 | 40.4% |
| 密封罐 C | 9.5 | 35.0 | 9.2 | 4.2 | 12.1 | 34.6% |

## 结论约定

毛利率低于 15% 的案例必须输出负向警示，不得隐藏或四舍五入掩盖。`},{id:76,kbId:5,name:"TikTok 爆款视频结构模板.md",size:0,createdAt:d(15),updatedAt:d(15),content:`# TikTok 爆款视频结构模板

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
| 数据背书 | 「月销 10 万件的秘密」 | 爆款复刻 |`}],S=["全部 AI 专家与技能","全平台商品分析","数据报表导出","批量选品与监控"],b=[{sort:1,tagline:"每月 1 万 AI 积分",features:[...S],billingCycles:[{cycle:"MONTHLY",price:99},{cycle:"YEARLY",price:990}]},{sort:2,badge:"最受欢迎",tagline:"每月 3 万 AI 积分",features:[...S],billingCycles:[{cycle:"MONTHLY",price:299},{cycle:"YEARLY",price:2990}]},{sort:3,tagline:"每月 10 万 AI 积分",features:[...S],billingCycles:[{cycle:"MONTHLY",price:2999}]}],o=["标准版","高级版","旗舰版"].map((e,n)=>({...t,id:n+2,code:`plan_${n+2}`,name:e,price:[99,299,2999][n],durationDays:30,credits:[1e4,3e4,1e5][n],entitlements:[],planType:"NORMAL",...b[n]}));return{models:D(),plans:o,experts:i,skills:a,servers:l,scenarios:m,knowledgeBases:g,kbFiles:y,tools:[{id:21,serverId:1,name:"ali_product_search",enabled:!0},{id:22,serverId:1,name:"ali_keyword_trend",enabled:!0},{id:23,serverId:2,name:"dld_product_search",enabled:!0},{id:24,serverId:3,name:"amazon_bsr_ranking",enabled:!0},{id:25,serverId:4,name:"amazon_sales_estimate",enabled:!0},{id:26,serverId:5,name:"echotik_video_search",enabled:!0}],chats:Array.from({length:24},(e,n)=>{const r=Date.now()-(n*37+n%4*5)*36e5,u=p=>new Date(r+p*6e4).toISOString(),c=w[n%w.length],s={id:n+1,userId:n%8+1,expertId:n%3+1,title:c,createdAt:u(0),deletedAt:n===7?new Date(Date.now()-864e5).toISOString():null,deleteReason:n===7?"用户申请删除，消息含个人联系方式":"",messages:[{role:"user",content:`${c}，预算 50-200 元，帮我分析下竞争和利润，联系 demo${n}@example.com 手机13800138000`,createdAt:u(0)},{role:"assistant",content:`收到，开始分析「${c}」：先按平台检索候选商品，再做价格带与竞争度评估。`,createdAt:u(1)},{role:"assistant",content:"候选商品已检索完成，正在进行销量趋势与毛利率测算…",createdAt:u(2)},{role:"assistant",content:"分析完成：候选对比表格与选品分析报告已生成，可在会话详情中查看。",createdAt:u(4)}]};return B(s),s}),promptHistory:Object.fromEntries(i.map(e=>[e.id,[{version:1,systemPrompt:e.systemPrompt,createdAt:e.updatedAt}]])),skillCalls:Array.from({length:24},(e,n)=>({skillId:n%2+11,success:n%5!==0,createdAt:new Date(Date.now()-n*864e5).toISOString()})),expertVersions:Object.fromEntries(i.map(e=>[e.id,[{version:e.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:e.updatedAt,snapshot:structuredClone(e)}]])),skillVersions:Object.fromEntries(a.map(e=>[e.id,[{version:e.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:e.updatedAt,snapshot:structuredClone(e)}]])),mcpVersions:Object.fromEntries(l.map(e=>[e.id,[{version:e.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:e.updatedAt,snapshot:structuredClone(e)}]])),planVersions:Object.fromEntries(o.map(e=>[e.id,[{version:e.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:e.updatedAt,snapshot:structuredClone(e)}]])),creditPackages:R(),billingSettings:Y()}}function R(){const t=M().format("YYYY-MM-DD HH:mm:ss");return[{id:1,name:"体验包",credits:500,bonusCredits:0,price:45,originalPrice:void 0,sort:1,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:t,updatedAt:t},{id:2,name:"常用包",credits:2e3,bonusCredits:0,price:168,originalPrice:void 0,sort:2,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:t,updatedAt:t},{id:3,name:"专业包",credits:8e3,bonusCredits:0,price:600,originalPrice:void 0,badge:"超值",sort:3,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:t,updatedAt:t}]}function Y(){return{registerBonus:100,upgradePolicy:"PRORATED",creditSlider:{enabled:!0,min:1e3,max:1e5,step:1e3,defaultValue:1e3,unitPrice:.015,tiers:[{min:1e3,rate:.015},{min:4e4,rate:.0115},{min:5e4,rate:.0095}]}}}function W(t){const i=o=>{var e;return(e=t.tools.find(n=>n.id===o))==null?void 0:e.serverId};(!Array.isArray(t.models)||!t.models.length)&&(t.models=D()),t.models=t.models.map(o=>({...o,apiKey:typeof o.apiKey=="string"?o.apiKey:void 0,defaultParams:o.defaultParams&&typeof o.defaultParams=="object"&&!Array.isArray(o.defaultParams)?o.defaultParams:{},createdAt:o.createdAt||o.updatedAt||new Date().toISOString()}));const f=()=>t.models.reduce((o,e)=>Math.max(o,e.id),40)+1,a=t.models.find(o=>o.code==="glm-5.3");if(a&&(!a.apiKey||a.apiKey.startsWith("sk-mock-"))&&(a.provider="OpenAI兼容",a.endpoint=k,a.apiKey=E,a.updatedAt=new Date().toISOString()),!t.models.some(o=>o.endpoint===k)){const o=new Date().toISOString();t.models.push({id:f(),code:"deepseek-v4.1-flash",name:"DeepSeek-V4.1-Flash",provider:"OpenAI兼容",endpoint:k,apiKey:E,defaultParams:{temperature:.5,max_tokens:8192},remark:"演示网关自动注册",status:1,createdAt:o,updatedAt:o})}const l=(o,e)=>{const n=r=>typeof r=="string"&&P.includes(r);if(Array.isArray(o.platforms)){const r=[...new Set(o.platforms.filter(n))];if(r.length)return r}return n(o.platform)?[o.platform]:o.platform==="ALL"?[...P]:z(e)},m=t.experts||[],g=t.skills||[],d=t.servers||[];m.forEach(o=>{var u;const e=o;(e.description===void 0||e.description==="")&&(e.description=o.intro||o.name),e.baseModel||(e.baseModel=String(((u=o.modelParams)==null?void 0:u.model)||"glm-5.3"));const n=t.models.find(c=>c.code===e.baseModel||c.name===e.baseModel);if(n&&(e.baseModel=n.code),!t.models.some(c=>c.code===e.baseModel)){const c=new Date().toISOString();t.models.push({id:f(),code:e.baseModel,name:e.baseModel,provider:"自定义",endpoint:"",defaultParams:{},remark:"旧数据 base_model 自动迁移注册",status:1,createdAt:c,updatedAt:c})}o.platforms=l(o,o),!e.capabilities||typeof e.capabilities!="object"?e.capabilities=I():e.capabilities=I(e.capabilities),Array.isArray(e.suggestedQuestions)||(e.suggestedQuestions=[]),Array.isArray(e.tags)||(e.tags=[]),(!e.visibility||!["PUBLIC","PLAN","PRIVATE"].includes(e.visibility.type))&&(e.visibility={type:"PUBLIC",planIds:[]});const r=(o.mcpToolIds||[]).map(i).filter(c=>typeof c=="number");if((!Array.isArray(e.mcpServerIds)||!e.mcpServerIds.length)&&(e.mcpServerIds=[...new Set(r)]),e.mcpToolSelection&&typeof e.mcpToolSelection=="object"&&!Array.isArray(e.mcpToolSelection)){const c={};for(const[s,p]of Object.entries(e.mcpToolSelection)){const A=Number(s);if(!e.mcpServerIds.includes(A)||!Array.isArray(p))continue;const O=p.filter(_=>t.tools.some(T=>T.id===_&&T.serverId===A));O.length&&(c[s]=O)}Object.keys(c).length?e.mcpToolSelection=c:delete e.mcpToolSelection}else e.mcpToolSelection!==void 0&&delete e.mcpToolSelection;typeof e.titleHtml!="string"&&(e.titleHtml=""),typeof e.introduction!="string"&&(e.introduction=""),typeof e.greeting!="string"&&(e.greeting=""),Array.isArray(e.coreAbilities)||(e.coreAbilities=[]),Array.isArray(e.referencePrompts)||(e.referencePrompts=[]),(!e.nextQuestionConfig||typeof e.nextQuestionConfig!="object")&&(e.nextQuestionConfig={enabled:!0,mode:"default"})}),g.forEach(o=>{const e=o;(!e.content||!String(e.content).trim())&&(e.content=U(o.name,o.description||"")),Array.isArray(e.files)||(e.files=[]),o.platforms=l(o,o)}),d.forEach(o=>{const e=o;if(e.connType||(e.connType="MCP"),o.transport==="HTTP"&&(o.transport="STREAMABLE_HTTP"),(!e.authConfig||typeof e.authConfig!="object")&&(e.authConfig={type:"NONE"}),!e.path)try{const n=new URL(o.endpoint||"");e.path=n.pathname!=="/"?n.pathname:"/mcp",o.endpoint=n.origin}catch{e.path="/mcp"}Array.isArray(e.toolFilter)||(e.toolFilter=[]),(!e.visibility||!["PUBLIC","PLAN","PRIVATE"].includes(e.visibility.type))&&(e.visibility={type:"PUBLIC",planIds:[]}),o.platforms=l(o,o)});const y=(o,e,n)=>{const r=M(o),u=r.isValid()?r.format("YYYYMMDDHHmmss"):M().format("YYYYMMDDHHmmss");if(!e.some(s=>s!==n&&s.versionName===u))return u;let c=2;for(;e.some(s=>s!==n&&s.versionName===`${u}-${c}`);)c++;return`${u}-${c}`},S=o=>{if(o)for(const e of Object.values(o)){const n=e||[];n.forEach(r=>{(!r.versionName||r.versionName==="未命名")&&(r.versionName=y(r.createdAt,n,r)),r.operator||(r.operator="")})}};S(t.expertVersions),S(t.skillVersions),S(t.mcpVersions);const b=(o,e)=>{const n=e||{};return o.forEach(r=>{var u;n[u=String(r.id)]||(n[u]=[{version:r.version,versionName:y(r.updatedAt,[]),operator:"",note:"迁移补记：旧数据迁移初始快照",createdAt:r.updatedAt,snapshot:structuredClone(r)}])}),n};t.expertVersions=b(m,t.expertVersions),t.skillVersions=b(g,t.skillVersions),t.mcpVersions=b(d,t.mcpVersions)}function h(t){return typeof t=="string"?t.replace(/\bbearer\s+[\w.~+\/-]+=*/gi,"[凭据已移除]").replace(/\b(?:token|password|secret|api[_-]?key|authorization|credential)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;，；。<>}"']+)/gi,"[凭据已移除]").replace(/\bsk-[a-z0-9_-]+/gi,"[凭据已移除]").replace(new RegExp("(?<!\\d)1[3-9]\\d{9}(?!\\d)","g"),"[手机号已脱敏]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[邮箱已脱敏]"):Array.isArray(t)?t.map(h):t&&typeof t=="object"?Object.fromEntries(Object.entries(t).filter(([i])=>!/token|password|secret|credential|authorization|authConfig|execConfig|systemPrompt|messages/i.test(i)).map(([i,f])=>[i,h(f)])):t}const w=["亚马逊厨房硅胶厨具套装选品","Ozon 冬季车载防雪挡风罩选品","TikTok 宠物自动喂食器选品","1688 家用迷你缝纫机选品","Temu 折叠衣物收纳箱选品","虾皮直播补光灯手机支架选品","亚马逊露营折叠桌椅选品","Ozon 车载无线吸尘器选品"],C=[t=>`再帮我看下 ${t} 里 100 元以内的款，把销量前 3 的利润对比一下`,t=>`${t} 这种品换到 Ozon 平台还卖得动吗？帮我按新平台再评估一轮`,t=>`${t} 这批款如果统一做促销价，毛利率还能保住多少？帮我重算一版对比`];function B(t){var m,g;if(t.messages.filter(d=>d.role==="user").length>=2)return;const i=(((m=t.messages.find(d=>d.role==="user"))==null?void 0:m.content)||"选品咨询").split("，")[0].split("。")[0],f=C[t.id%C.length](i),a=((g=t.messages[t.messages.length-1])==null?void 0:g.createdAt)||t.createdAt,l=d=>new Date(new Date(a).getTime()+d*6e4).toISOString();t.messages.push({role:"user",content:f,createdAt:l(6)},{role:"assistant",content:`收到追问，针对「${i}」补充条件重新检索并测算中…`,createdAt:l(7)},{role:"assistant",content:"补充分析完成：新一轮候选对比与结论已生成，可在会话详情中查看。",createdAt:l(9)})}function v(t,i,f,a){i=h(i),a=h(a||"—");const l=L,m=s=>{const p=Math.abs(Math.sin(f+s*13))*1e4;return p-Math.floor(p)},g=12+Math.floor(m(1)*29),d=s=>new Date(new Date(t.createdAt).getTime()+s*6e4).toISOString(),y=[{title:"解析需求",detail:`提取品类「${i}」的关键词与筛选条件：预算区间、目标平台、最低毛利率 ≥ 18%。`,tools:["意图解析"],durationSec:3+Math.floor(m(2)*5),at:d(0)},{title:"检索候选商品",detail:`并行调用商品搜索与趋势接口，命中 ${g} 个候选，去重与黑名单过滤后保留 8 个进入分析。`,tools:["ali_product_search","keyword_trend"],durationSec:8+Math.floor(m(3)*22),at:d(1)},{title:"数据分析",detail:"对候选商品计算价格带分布、月销量趋势、竞品集中度与预估毛利，输出推荐排序。",tools:["sales_estimate","bsr_ranking"],durationSec:15+Math.floor(m(4)*30),at:d(2)},{title:"生成报告",detail:"汇总分析结论，生成候选对比表格与 HTML 选品分析报告。",tools:["report_generator"],durationSec:4+Math.floor(m(5)*6),at:d(3)}],S=["硅胶厨具三件套","折叠收纳箱（3 件装）","车载防雪挡风罩","宠物自动喂食器","迷你缝纫机家用款"],b=["1688","OZON","AMAZON","TEMU","TIKTOK"],o=S.map((s,p)=>{const A=(28+m(10+p)*170).toFixed(2),O=(300+Math.floor(m(20+p)*8700)).toLocaleString(),_=["低","中","高"][Math.floor(m(30+p)*3)],T=(18+m(40+p)*33).toFixed(1),N=(6.5+m(50+p)*3.4).toFixed(1);return[s,b[Math.floor(m(60+p)*5)],`¥${A}`,`${O} 件`,_,`${T}%`,N]}).sort((s,p)=>Number(p[6])-Number(s[6])).map((s,p)=>[String(p+1),...s]),e={title:"候选商品对比",columns:["排名","商品","平台","参考价","月销量","竞争度","预估毛利率","推荐指数"],rows:o},n=o[0].map(l),r=o.map(s=>`<tr>${s.map(p=>`<td>${l(p)}</td>`).join("")}</tr>`).join(""),u=o.slice(0,3).map((s,p)=>{const A=s.map(l);return`<li><b>TOP${p+1} ${A[1]}</b>（${A[2]}）：参考价 ${A[3]}，月销 ${A[4]}，竞争度${A[5]}，预估毛利率 ${A[6]}，推荐指数 ${A[7]}。</li>`}).join(""),c=`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>选品分析报告 · ${l(i)}</title><style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:860px;margin:32px auto;color:#262626;line-height:1.7;padding:0 20px}h1{font-size:22px;border-bottom:3px solid #2563eb;padding-bottom:12px}.meta{color:#8c8c8c;font-size:13px}h2{font-size:17px;margin-top:28px;color:#1d4ed8}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th{background:#eff6ff;color:#1e40af}th,td{border:1px solid #d9d9d9;padding:8px 10px;text-align:center}.tag{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 8px;font-size:12px;margin-right:8px}ul{padding-left:20px}footer{margin-top:32px;color:#8c8c8c;font-size:12px;border-top:1px dashed #d9d9d9;padding-top:12px}</style></head><body><h1>选品分析报告</h1><p class="meta">会话 #${l(t.id)} · 专家 ${l(a)} · ${l(x(t.createdAt))}（北京时间 UTC+08:00） · <span class="tag">Mock 演示数据</span></p><h2>一、需求概述</h2><p>用户发起「${l(i)}」选品咨询：要求在预算区间内筛选竞争度适中、毛利率不低于 18% 的候选商品，并给出推荐排序。</p><h2>二、候选商品对比</h2><table><thead><tr>${e.columns.map(s=>`<th>${l(s)}</th>`).join("")}</tr></thead><tbody>${r}</tbody></table><h2>三、分析结论</h2><ul>${u}</ul><p>综合推荐：<b>${n[1]}</b>（推荐指数 ${n[7]}），建议先小批量测款，根据转化数据决定是否放量。</p><footer>店雷达 AI 生成 · 数据为 Mock 演示，实盘决策请以真实数据核实</footer></body></html>`;return{steps:y,table:e,reportHtml:c}}function G(t,i){const f=t.messages.filter(a=>a.role==="user").map(a=>h(a.content).split("，")[0].split("。")[0]);return v(t,f.join("；")||"选品咨询",t.id*97,i)}function q(t,i,f){const a=t.messages.filter(m=>m.role==="user")[i],l=h((a==null?void 0:a.content)||"选品咨询").split("，")[0].split("。")[0];return v({...t,createdAt:(a==null?void 0:a.createdAt)||t.createdAt},l,t.id*97+(i+1)*131,f)}export{Z as C,K as a,B as b,R as c,I as d,Y as e,z as f,q as g,G as h,W as m,h as r,Q as s};
