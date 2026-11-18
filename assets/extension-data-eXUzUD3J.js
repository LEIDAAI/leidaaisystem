import{a9 as L}from"./index-B_U5o0HH.js";import{b as G}from"./chat-time-B4KqbtEa.js";import{e as X}from"./static-chat-report-sgeU36L8.js";import{P as B}from"./config-CLowoP58.js";const y=.0049,J=[{key:"amazon",label:"亚马逊 Sorftime",plan:"¥99 档",monthlyCost:99,quota:3e4,unitCost:.0033,markup:10,creditsPerCall:7,margin:1-.0033/(7*y),granularity:"逐工具扣量（1/2/5/10/60/150/450 额度/次）",tools:[{name:"amazon_product_search",label:"商品搜索",quotaPerCall:1},{name:"amazon_product_detail",label:"商品详情",quotaPerCall:1},{name:"amazon_category_report",label:"类目报告",quotaPerCall:2},{name:"amazon_keyword_research",label:"关键词研究",quotaPerCall:5},{name:"amazon_reviews",label:"评论抓取",quotaPerCall:10},{name:"amazon_patent_keyword",label:"专利检索",quotaPerCall:60},{name:"amazon_patent_image",label:"专利图搜",quotaPerCall:450}]},{key:"yunqi-ozon",label:"云启 OZON",plan:"¥398 档",monthlyCost:398,quota:3e4,unitCost:.0133,markup:10,creditsPerCall:27,margin:1-.0133/(27*y),granularity:"按次扣（不分工具）；字典/字段/额度查询不计次",tools:[{name:"yq_ozon_goods_search",label:"Ozon 商品搜索"},{name:"yq_ozon_goods_detail",label:"Ozon 商品详情"},{name:"yq_ozon_spu_search",label:"Ozon SPU 搜索"},{name:"yq_ozon_spu_detail",label:"Ozon SPU 详情"},{name:"yq_ozon_mall_search",label:"Ozon 店铺搜索"},{name:"yq_ozon_mall_detail",label:"Ozon 店铺详情"},{name:"yq_ozon_market_stat",label:"Ozon 大盘统计"},{name:"yq_ozon_brand_search",label:"Ozon 品牌搜索"},{name:"yq_dict_lookup",label:"字典查询"},{name:"yq_fields_lookup",label:"字段查询"},{name:"yq_quota_status",label:"配额查询"}]},{key:"yunqi-temu",label:"云启 TEMU",plan:"¥398 档（与 OZON 共额度池）",monthlyCost:0,quota:0,unitCost:.0133,markup:10,creditsPerCall:27,margin:1-.0133/(27*y),granularity:"按次扣（不分工具）",tools:[{name:"yq_goods_search",label:"TEMU 商品搜索"},{name:"yq_goods_detail",label:"TEMU 商品详情"},{name:"yq_goods_comment",label:"TEMU 商品评论"},{name:"yq_goods_img_search",label:"TEMU 图搜"},{name:"yq_goods_data",label:"TEMU 商品数据"},{name:"yq_mall_search",label:"TEMU 店铺搜索"},{name:"yq_mall_detail",label:"TEMU 店铺详情"},{name:"yq_brand_search",label:"TEMU 品牌搜索"},{name:"yq_market_semi",label:"TEMU 大盘半托管"},{name:"yq_market_fully",label:"TEMU 大盘全托管"}]},{key:"dld-1688",label:"1688 店雷达",plan:"旗舰年付 ¥2,598",monthlyCost:216.5,quota:12e3,unitCost:.018,markup:5,creditsPerCall:18,margin:1-.018/(18*y),granularity:"按次扣（1 次业务操作 = 1 点）",tools:[{name:"product_search_list",label:"选品库"},{name:"cross_border_product_search_list",label:"跨境选品库"},{name:"product_trend_new_list",label:"趋势新品"},{name:"product_billboard_list",label:"商品榜"},{name:"product_info",label:"商品分析"},{name:"monitor_shop_analysis",label:"店铺分析"},{name:"get_category_info",label:"类目查询"},{name:"image_search",label:"图搜"},{name:"shop_rank_list",label:"店铺榜"},{name:"ali_offer_realtime_detail",label:"属性与证书"},{name:"ali_offer_sku_prices",label:"SKU 价格"},{name:"monitor_shop_add",label:"店铺监控"},{name:"monitor_offer_add",label:"商品监控"},{name:"get_ali_offerRates",label:"评论抓取"},{name:"global_image_search",label:"全网图搜"}]},{key:"fastmoss",label:"TK FastMoss",plan:"Max 首年 ¥439",monthlyCost:439,quota:5e3,unitCost:.0878,markup:10,creditsPerCall:179,margin:1-.0878/(179*y),granularity:"按 credits 扣",tools:[{name:"echotik_video_search",label:"TK 视频搜索"},{name:"echotik_influencer_ranklist",label:"达人榜"},{name:"echotik_live_list",label:"直播榜"}]},{key:"shopee",label:"虾皮 Shopee",plan:"基础 ¥999",monthlyCost:999,quota:1e4,unitCost:.0999,markup:10,creditsPerCall:204,margin:1-.0999/(204*y),granularity:"按次扣",tools:[{name:"shopee_product_search",label:"虾皮商品搜索"},{name:"shopee_shop_search",label:"虾皮店铺搜索"}]}],ee={label:"DeepSeek",inputCostPerMillion:2,outputCostPerMillion:8,markup:10,inputCreditsPerKToken:4,outputCreditsPerKToken:16};function te(e,r){const d=(r==null?void 0:r.quotaPerCall)??1;return Number((e.unitCost*d).toFixed(6))}function oe(e,r){const d=(r==null?void 0:r.quotaPerCall)??1,s=e.unitCost*d*e.markup/y;return Math.ceil(s)}function ne(e,r){const d=r*y;if(!(d<=0))return 1-e/d}const ae=Object.freeze(Object.defineProperty({__proto__:null,CHANNEL_RULES:J,CREDIT_UNIT_PRICE:y,MODEL_RULE:ee,marginOf:ne,toolCostPrice:te,toolCredits:oe},Symbol.toStringTag,{value:"Module"})),re=["file_context","file_upload","vision","web_search","image_generation","code_interpreter","terminal","citations","status_updates","memory","builtin_tools","usage"],be={file_context:"文件上下文",file_upload:"文件上传",vision:"图片理解",web_search:"联网搜索",image_generation:"图像生成",code_interpreter:"代码解释器",terminal:"终端执行",citations:"引用来源",status_updates:"状态推送",memory:"长期记忆",builtin_tools:"内置工具",usage:"用量统计"},se={11:[{name:"docs/搜索流程.md",content:`# 搜索流程

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

所有图表必须标注数据来源与统计口径。`}]};function E(e={}){const r={file_context:!1,file_upload:!1,vision:!1,web_search:!1,image_generation:!1,code_interpreter:!1,terminal:!1,citations:!1,status_updates:!1,memory:!1,builtin_tools:!1,usage:!1};for(const d of re)typeof e[d]=="boolean"&&(r[d]=e[d]);return typeof e.file=="boolean"&&(e.file_context===void 0&&(r.file_context=e.file),e.file_upload===void 0&&(r.file_upload=e.file)),r}const ie=`# {技能名称}

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
`;function le(e,r){return ie.replace("{技能名称}",e).replace("<!-- 描述什么意图/问题应路由到本技能 -->",r||"（待补充触发意图）")}const x="http://192.168.1.10:8080/v1",j="sk-demo-internal-gateway";function V(){const e=new Date().toISOString();return[{id:41,code:"glm-5.3",name:"GLM-5.3",provider:"OpenAI兼容",endpoint:x,apiKey:j,defaultParams:{temperature:.7,max_tokens:4096},remark:"1688选品助手默认基础模型（内网演示网关）",status:1,createdAt:e,updatedAt:e},{id:42,code:"glm-4.7",name:"GLM-4.7",provider:"智谱",endpoint:"https://open.bigmodel.cn/api/paas/v4",apiKey:"sk-mock-glm47-3c4d",defaultParams:{temperature:.7,max_tokens:4096},remark:"",status:1,createdAt:e,updatedAt:e},{id:43,code:"deepseek-v3",name:"DeepSeek-V3",provider:"OpenAI兼容",endpoint:"https://api.deepseek.com/v1",apiKey:"sk-mock-ds3-5e6f",defaultParams:{temperature:.5,max_tokens:8192},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:e,updatedAt:e},{id:44,code:"qwen-max",name:"Qwen-Max",provider:"OpenAI兼容",endpoint:"https://dashscope.aliyuncs.com/compatible-mode/v1",apiKey:"",defaultParams:{temperature:.7,max_tokens:6e3},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:e,updatedAt:e}]}function de(e){const r=`${e.code||""} ${e.name||""} ${e.description||""}`.toLowerCase();return/ozon/.test(r)?["OZON"]:/amazon|亚马逊/.test(r)?["AMAZON"]:/temu/.test(r)?["TEMU"]:/tiktok/.test(r)?["TIKTOK"]:/shopee|虾皮/.test(r)?["SHOPEE"]:["1688"]}function ye(){const e={status:1,version:1,updatedAt:L().format("YYYY-MM-DD HH:mm:ss"),refreshStatus:"APPLIED",appliedVersion:1,refreshMessage:"Mock 演示配置已生效；未连接 AgentScope"},r=[{...e,id:1,code:"product-selection-assistant",name:"1688分销选品",description:"面向 1688 分销场景的选品助手：关键词分析、竞品监控、类目趋势与利润测算，一键生成选品报告。",avatarUrl:"",baseModel:"glm-5.3",platforms:["1688"],scenarioId:1,systemPrompt:"你是1688分销选品助手，请基于可验证的数据回答。先理解选品意图，再路由到合适技能；调用工具前先确认参数契约；输出结论必须附带数据来源与校验结果。",skillIds:[11,12,13,14,15,16,17],mcpServerIds:[1],mcpToolIds:[21],suggestedQuestions:['帮我分析"收纳盒"关键词的竞争度',"对比近30天竞品价格并测算分销毛利","生成一份厨房收纳类目的选品报告"],capabilities:E({file:!0,web_search:!0,citations:!0}),tags:["选品","1688","分销"],visibility:{type:"PUBLIC",planIds:[]},isDefault:!0,titleHtml:"1688分销选品专家",introduction:"<p>深耕 1688 分销场景的数据选品助手。支持从<b>关键词竞争度</b>、<b>竞品价格监控</b>、<b>类目趋势</b>三个维度完成选品决策，并一键生成选品报告。</p><ul><li>覆盖 1688 全类目榜单与价格带分布</li><li>内置利润测算与分销毛利模型</li><li>输出结论均附带数据来源校验</li></ul>",greeting:"你好！我是 1688 分销选品专家，可以帮你分析关键词、监控竞品、测算利润并生成选品报告。",coreAbilities:["关键词竞争度分析","竞品价格与销量监控","类目趋势洞察","分销利润测算","一键生成选品报告"],referencePrompts:['帮我分析"收纳盒"关键词在1688的竞争度',"对比近30天收纳类目TOP10竞品的价格分布","生成一份厨房收纳类目的月度选品报告"],nextQuestionConfig:{enabled:!0,model:"deepseek-v4.1-flash",mode:"default"}},{...e,id:2,code:"cross-border-selection",name:"跨境电商选品",description:"面向跨境电商（亚马逊/TikTok）场景的选品助手，结合平台榜单与趋势数据。",avatarUrl:"",baseModel:"deepseek-v3",platforms:["AMAZON","TEMU"],scenarioId:4,systemPrompt:"你是跨境电商选品助手，请基于可验证的数据回答，注意不同站点的价格与合规差异。",skillIds:[12,14,16],mcpServerIds:[1,3,4],suggestedQuestions:["美国站家居类目最近什么品好卖？"],capabilities:E({file:!0,vision:!0,web_search:!0}),tags:["选品","跨境"],visibility:{type:"PLAN",planIds:[2,3]},isDefault:!1,titleHtml:"跨境电商选品专家",introduction:"<p>面向<b>亚马逊 / Temu / TikTok</b> 等跨境站点的选品助手，结合平台榜单、广告数据与站点合规差异给出选品建议。</p>",greeting:"你好！我是跨境电商选品专家，告诉我目标站点与类目，我来帮你找品。",coreAbilities:["亚马逊 BSR 榜单解读","Temu 爆款趋势追踪","站点合规与价格差异提示"],referencePrompts:["美国站家居类目最近什么品好卖？","对比亚马逊与Temu同款收纳盒的价格带"],nextQuestionConfig:{enabled:!0,mode:"default"}},{...e,id:3,code:"douyin-selection",name:"抖音带货选品",description:"面向抖音直播/短视频带货的选品助手，结合达人带货榜与内容趋势。",avatarUrl:"",baseModel:"glm-4.7",platforms:["1688","OZON","AMAZON","TEMU"],systemPrompt:"你是抖音带货选品助手，请基于可验证的数据回答，并给出内容选题建议。",skillIds:[12,17],mcpServerIds:[5],suggestedQuestions:["最近什么商品在短视频渠道转化好？"],capabilities:E({vision:!0,status_updates:!0}),tags:["选品","抖音"],visibility:{type:"PLAN",planIds:[3,4]},isDefault:!1,titleHtml:"抖音带货选品专家",introduction:"<p>面向抖音直播/短视频带货的选品助手，结合<b>达人带货榜</b>与<b>内容趋势</b>，给出选品与内容选题双建议。</p>",greeting:"你好！我是抖音带货选品专家，可以帮你分析达人带货榜和内容趋势。",coreAbilities:["达人带货榜分析","爆款视频内容拆解","选品与内容选题联动建议"],referencePrompts:["最近一周美妆类目哪些达人在带货？","帮我拆解一条百万播放的收纳好物视频"],nextQuestionConfig:{enabled:!1,mode:"default"}}],s=[{id:11,code:"dld-selection-search",name:"1688选品搜索",description:"按关键词/类目在 1688 搜索候选商品并返回结构化清单，适用于选品前期调研",content:`# 1688选品搜索

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
前置数据不足时输出精简版并明示缺口。`}].map(({id:o,code:a,name:g,description:i,content:l})=>({...e,id:o,code:a,name:g,description:i,content:l,files:se[o]||[],platforms:{11:["1688"],12:["1688","AMAZON","TEMU"],13:["1688"],14:["1688","AMAZON","TEMU"],15:["1688"],16:["1688","AMAZON","TEMU"],17:["1688","OZON","AMAZON","TEMU"]}[o]||["1688"],scenarioId:{11:1,12:3,13:1,14:1,15:2,16:1,17:1}[o],agentId:1,paramSchema:{type:"object",properties:{keyword:{type:"string"}},required:["keyword"]},execConfig:{handler:"demo",timeoutMs:3e4}})),c=[{...e,id:1,code:"gateway",name:"聚合网关（OpenAPI）",platforms:["1688","AMAZON","TEMU"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:2,code:"dld",name:"有维AI数据（MCP）",platforms:["1688"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://dld.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:3,code:"amazon_data",name:"亚马逊数据（MCP）",platforms:["AMAZON"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://amazon-data.example.com",path:"/mcp",authConfig:{type:"API_KEY",headerName:"X-Api-Key",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:4,code:"gateway-amazon",name:"亚马逊网关（OpenAPI）",platforms:["AMAZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-amazon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:5,code:"echotik",name:"EchoTik 达人数据（MCP）",platforms:["1688","OZON","AMAZON","TEMU"],connType:"MCP",transport:"SSE",endpoint:"https://echotik.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...e,id:6,code:"gateway-ozon",name:"Ozon 网关（OpenAPI）",platforms:["OZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-ozon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"}],u=[{id:1,name:"分销选品",platformId:"1688",description:"1688 平台分销场景下的选品分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"供应链对接",platformId:"1688",description:"1688 平台供应商对接与管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"竞品监控",platformId:"1688",description:"1688 平台竞品价格与销量监控",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:4,name:"亚马逊选品",platformId:"AMAZON",description:"亚马逊平台商品选择与榜单分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:5,name:"跨境物流",platformId:"AMAZON",description:"亚马逊跨境物流与仓储管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:6,name:"Temu 爆款追踪",platformId:"TEMU",description:"Temu 平台爆款商品趋势追踪",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:7,name:"Ozon 选品",platformId:"OZON",description:"Ozon 平台商品选择与市场分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:8,name:"TikTok 带货",platformId:"TIKTOK",description:"TikTok 直播带货选品与内容分析",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:9,name:"Shopee 运营",platformId:"SHOPEE",description:"Shopee 平台店铺运营与商品管理",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],b=[{id:1,name:"有维AI",code:"youwei",description:"有维AI 自有智能体，默认承载现有选品技能",status:1,sort:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"WorkBuddy",code:"workbuddy",description:"WorkBuddy 智能体，技能独立维护",status:1,sort:2,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"千问",code:"qwen",description:"千问智能体，技能独立维护",status:1,sort:3,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],f=[{id:1,name:"1688 选品指南",description:"1688 平台选品策略与最佳实践",platform:"1688",access:"PUBLIC",fileCount:2,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:2,name:"跨境电商合规手册",description:"各平台跨境电商合规要求与政策",platform:"AMAZON",access:"PUBLIC",fileCount:2,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:3,name:"利润测算模型",description:"分销利润测算公式与案例",platform:"1688",access:"PUBLIC",fileCount:1,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:4,name:"竞品分析模板",description:"竞品分析标准模板与方法论",access:"PRIVATE",fileCount:0,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},{id:5,name:"TikTok 内容运营指南",description:"TikTok 短视频与直播运营策略",platform:"TIKTOK",access:"PUBLIC",fileCount:1,status:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],A=o=>new Date(Date.now()-o*864e5).toISOString(),O=[{id:71,kbId:1,name:"1688选品核心指标说明.md",size:0,createdAt:A(12),updatedAt:A(3),content:`# 1688 选品核心指标说明

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
3. 结论输出时必须列出指标快照表，便于回溯。`},{id:72,kbId:1,name:"2026年Q4厨房收纳类目简报.md",size:0,createdAt:A(6),updatedAt:A(1),content:`# 2026 年 Q4 厨房收纳类目简报

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
- 密封罐类目注意物流破损风险，建议选择带缓冲包装的供应商。`},{id:73,kbId:2,name:"Ozon realFBS 中国至俄罗斯物流线路摘要.md",size:0,createdAt:A(9),updatedAt:A(2),content:`# Ozon realFBS 中国 → 俄罗斯物流线路摘要

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
3. 空运线路禁止含电池、液体类商品。`},{id:74,kbId:2,name:"跨境电商合规检查清单.md",size:0,createdAt:A(20),updatedAt:A(20),content:`# 跨境电商合规检查清单

上架与发货前逐项核对，任一项不通过即暂停流程。

| 检查项 | 适用平台 | 要求 | 责任角色 |
| --- | --- | --- | --- |
| CE / EAC 认证 | Ozon、亚马逊欧站 | 按品类提供证书扫描件 | 供应商 |
| 商品标签双语化 | 全平台 | 俄语/英语必填字段完整 | 运营 |
| 知识产权排查 | 全平台 | 商标与外观专利检索无风险 | 法务 |
| 申报价值一致性 | 全平台 | 报关价与售价逻辑自洽 | 物流 |
| 禁限售词检查 | TikTok、Temu | 标题与详情过滤敏感词 | 运营 |`},{id:75,kbId:3,name:"分销毛利测算公式与示例.md",size:0,createdAt:A(30),updatedAt:A(5),content:`# 分销毛利测算公式与示例

## 公式

> 毛利 = 售价 − 拿货价 − 物流费 − 平台费用（佣金 + 履约）

## 测算示例

| 案例 | 拿货价（元） | 售价（元） | 物流（元） | 平台费用（元） | 毛利（元） | 毛利率 |
| --- | --- | --- | --- | --- | --- | --- |
| 收纳盒 A | 6.8 | 29.9 | 4.5 | 3.6 | 15.0 | 50.2% |
| 调料架 B | 11.2 | 39.9 | 7.8 | 4.8 | 16.1 | 40.4% |
| 密封罐 C | 9.5 | 35.0 | 9.2 | 4.2 | 12.1 | 34.6% |

## 结论约定

毛利率低于 15% 的案例必须输出负向警示，不得隐藏或四舍五入掩盖。`},{id:76,kbId:5,name:"TikTok 爆款视频结构模板.md",size:0,createdAt:A(15),updatedAt:A(15),content:`# TikTok 爆款视频结构模板

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
| 数据背书 | 「月销 10 万件的秘密」 | 爆款复刻 |`}],h=["全部 AI 专家与技能","全平台商品分析","数据报表导出","批量选品与监控"],n=[{sort:1,tagline:"每月 1 万 AI 积分",features:[...h],billingCycles:[{cycle:"MONTHLY",price:99},{cycle:"YEARLY",price:990}]},{sort:2,badge:"最受欢迎",tagline:"每月 3 万 AI 积分",features:[...h],billingCycles:[{cycle:"MONTHLY",price:299},{cycle:"YEARLY",price:2990}]},{sort:3,tagline:"每月 10 万 AI 积分",features:[...h],billingCycles:[{cycle:"MONTHLY",price:2999}]}],t=["标准版","高级版","旗舰版"].map((o,a)=>({...e,id:a+2,code:`plan_${a+2}`,name:o,price:[99,299,2999][a],durationDays:30,credits:[1e4,3e4,1e5][a],entitlements:[],planType:"NORMAL",...n[a]}));return{models:V(),plans:t,experts:r,skills:s,servers:c,scenarios:u,agents:b,knowledgeBases:f,kbFiles:O,tools:[{id:21,serverId:1,name:"ali_product_search",enabled:!0},{id:22,serverId:1,name:"ali_keyword_trend",enabled:!0},{id:23,serverId:2,name:"dld_product_search",enabled:!0},{id:24,serverId:3,name:"amazon_bsr_ranking",enabled:!0},{id:25,serverId:4,name:"amazon_sales_estimate",enabled:!0},{id:26,serverId:5,name:"echotik_video_search",enabled:!0}],chats:Array.from({length:24},(o,a)=>{const g=Date.now()-(a*37+a%4*5)*36e5,i=m=>new Date(g+m*6e4).toISOString(),l=Y[a%Y.length],p={id:a+1,userId:a%8+1,expertId:a%3+1,title:l,createdAt:i(0),deletedAt:a===7?new Date(Date.now()-864e5).toISOString():null,deleteReason:a===7?"用户申请删除，消息含个人联系方式":"",messages:[{role:"user",content:`${l}，预算 50-200 元，帮我分析下竞争和利润，联系 demo${a}@example.com 手机13800138000`,createdAt:i(0)},{role:"assistant",content:`收到，开始分析「${l}」：先按平台检索候选商品，再做价格带与竞争度评估。`,createdAt:i(1)},{role:"assistant",content:"候选商品已检索完成，正在进行销量趋势与毛利率测算…",createdAt:i(2)},{role:"assistant",content:"分析完成：候选对比表格与选品分析报告已生成，可在会话详情中查看。",createdAt:i(4)}]};return me(p),p}),promptHistory:Object.fromEntries(r.map(o=>[o.id,[{version:1,systemPrompt:o.systemPrompt,createdAt:o.updatedAt}]])),skillCalls:Array.from({length:24},(o,a)=>({skillId:a%2+11,success:a%5!==0,createdAt:new Date(Date.now()-a*864e5).toISOString()})),expertVersions:Object.fromEntries(r.map(o=>[o.id,[{version:o.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:o.updatedAt,snapshot:structuredClone(o)}]])),skillVersions:Object.fromEntries(s.map(o=>[o.id,[{version:o.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:o.updatedAt,snapshot:structuredClone(o)}]])),mcpVersions:Object.fromEntries(c.map(o=>[o.id,[{version:o.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:o.updatedAt,snapshot:structuredClone(o)}]])),planVersions:Object.fromEntries(t.map(o=>[o.id,[{version:o.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:o.updatedAt,snapshot:structuredClone(o)}]])),creditPackages:ce(),billingSettings:pe(),creditRecords:[]}}function ce(){const e=L().format("YYYY-MM-DD HH:mm:ss");return[{id:1,name:"体验包",credits:500,bonusCredits:0,price:45,originalPrice:void 0,sort:1,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:e,updatedAt:e},{id:2,name:"常用包",credits:2e3,bonusCredits:0,price:168,originalPrice:void 0,sort:2,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:e,updatedAt:e},{id:3,name:"专业包",credits:8e3,bonusCredits:0,price:600,originalPrice:void 0,badge:"超值",sort:3,status:1,remark:"仅有效会员可购买；付费积分有效期 365 天，不随会员到期清零",createdAt:e,updatedAt:e}]}function pe(){return{registerBonus:100,upgradePolicy:"PRORATED",creditSlider:{enabled:!0,min:1e3,max:1e5,step:1e3,defaultValue:1e3,unitPrice:.015,tiers:[{min:1e3,rate:.015},{min:4e4,rate:.0115},{min:5e4,rate:.0095}]}}}function _e(e){const r=n=>{var t;return(t=e.tools.find(o=>o.id===n))==null?void 0:t.serverId};(!Array.isArray(e.models)||!e.models.length)&&(e.models=V()),e.models=e.models.map(n=>({...n,apiKey:typeof n.apiKey=="string"?n.apiKey:void 0,defaultParams:n.defaultParams&&typeof n.defaultParams=="object"&&!Array.isArray(n.defaultParams)?n.defaultParams:{},createdAt:n.createdAt||n.updatedAt||new Date().toISOString()}));const d=()=>e.models.reduce((n,t)=>Math.max(n,t.id),40)+1,s=e.models.find(n=>n.code==="glm-5.3");if(s&&(!s.apiKey||s.apiKey.startsWith("sk-mock-"))&&(s.provider="OpenAI兼容",s.endpoint=x,s.apiKey=j,s.updatedAt=new Date().toISOString()),!e.models.some(n=>n.endpoint===x)){const n=new Date().toISOString();e.models.push({id:d(),code:"deepseek-v4.1-flash",name:"DeepSeek-V4.1-Flash",provider:"OpenAI兼容",endpoint:x,apiKey:j,defaultParams:{temperature:.5,max_tokens:8192},remark:"演示网关自动注册",status:1,createdAt:n,updatedAt:n})}const c=(n,t)=>{const o=a=>typeof a=="string"&&B.includes(a);if(Array.isArray(n.platforms)){const a=[...new Set(n.platforms.filter(o))];if(a.length)return a}return o(n.platform)?[n.platform]:n.platform==="ALL"?[...B]:de(t)},u=e.experts||[],b=e.skills||[],f=e.servers||[];u.forEach(n=>{var g;const t=n;(t.description===void 0||t.description==="")&&(t.description=n.intro||n.name),t.baseModel||(t.baseModel=String(((g=n.modelParams)==null?void 0:g.model)||"glm-5.3"));const o=e.models.find(i=>i.code===t.baseModel||i.name===t.baseModel);if(o&&(t.baseModel=o.code),!e.models.some(i=>i.code===t.baseModel)){const i=new Date().toISOString();e.models.push({id:d(),code:t.baseModel,name:t.baseModel,provider:"自定义",endpoint:"",defaultParams:{},remark:"旧数据 base_model 自动迁移注册",status:1,createdAt:i,updatedAt:i})}n.platforms=c(n,n),!t.capabilities||typeof t.capabilities!="object"?t.capabilities=E():t.capabilities=E(t.capabilities),Array.isArray(t.suggestedQuestions)||(t.suggestedQuestions=[]),Array.isArray(t.tags)||(t.tags=[]),(!t.visibility||!["PUBLIC","PLAN","PRIVATE"].includes(t.visibility.type))&&(t.visibility={type:"PUBLIC",planIds:[]});const a=(n.mcpToolIds||[]).map(r).filter(i=>typeof i=="number");if((!Array.isArray(t.mcpServerIds)||!t.mcpServerIds.length)&&(t.mcpServerIds=[...new Set(a)]),t.mcpToolSelection&&typeof t.mcpToolSelection=="object"&&!Array.isArray(t.mcpToolSelection)){const i={};for(const[l,p]of Object.entries(t.mcpToolSelection)){const m=Number(l);if(!t.mcpServerIds.includes(m)||!Array.isArray(p))continue;const S=p.filter(_=>e.tools.some(k=>k.id===_&&k.serverId===m));S.length&&(i[l]=S)}Object.keys(i).length?t.mcpToolSelection=i:delete t.mcpToolSelection}else t.mcpToolSelection!==void 0&&delete t.mcpToolSelection;typeof t.titleHtml!="string"&&(t.titleHtml=""),typeof t.introduction!="string"&&(t.introduction=""),typeof t.greeting!="string"&&(t.greeting=""),Array.isArray(t.coreAbilities)||(t.coreAbilities=[]),Array.isArray(t.referencePrompts)||(t.referencePrompts=[]),(!t.nextQuestionConfig||typeof t.nextQuestionConfig!="object")&&(t.nextQuestionConfig={enabled:!0,mode:"default"})}),b.forEach(n=>{const t=n;(!t.content||!String(t.content).trim())&&(t.content=le(n.name,n.description||"")),Array.isArray(t.files)||(t.files=[]),n.platforms=c(n,n)}),f.forEach(n=>{const t=n;if(t.connType||(t.connType="MCP"),n.transport==="HTTP"&&(n.transport="STREAMABLE_HTTP"),(!t.authConfig||typeof t.authConfig!="object")&&(t.authConfig={type:"NONE"}),!t.path)try{const o=new URL(n.endpoint||"");t.path=o.pathname!=="/"?o.pathname:"/mcp",n.endpoint=o.origin}catch{t.path="/mcp"}Array.isArray(t.toolFilter)||(t.toolFilter=[]),(!t.visibility||!["PUBLIC","PLAN","PRIVATE"].includes(t.visibility.type))&&(t.visibility={type:"PUBLIC",planIds:[]}),n.platforms=c(n,n)});const A=(n,t,o)=>{const a=L(n),g=a.isValid()?a.format("YYYYMMDDHHmmss"):L().format("YYYYMMDDHHmmss");if(!t.some(l=>l!==o&&l.versionName===g))return g;let i=2;for(;t.some(l=>l!==o&&l.versionName===`${g}-${i}`);)i++;return`${g}-${i}`},O=n=>{if(n)for(const t of Object.values(n)){const o=t||[];o.forEach(a=>{(!a.versionName||a.versionName==="未命名")&&(a.versionName=A(a.createdAt,o,a)),a.operator||(a.operator="")})}};O(e.expertVersions),O(e.skillVersions),O(e.mcpVersions);const h=(n,t)=>{const o=t||{};return n.forEach(a=>{var g;o[g=String(a.id)]||(o[g]=[{version:a.version,versionName:A(a.updatedAt,[]),operator:"",note:"迁移补记：旧数据迁移初始快照",createdAt:a.updatedAt,snapshot:structuredClone(a)}])}),o};e.expertVersions=h(u,e.expertVersions),e.skillVersions=h(b,e.skillVersions),e.mcpVersions=h(f,e.mcpVersions)}function T(e){return typeof e=="string"?e.replace(/\bbearer\s+[\w.~+\/-]+=*/gi,"[凭据已移除]").replace(/\b(?:token|password|secret|api[_-]?key|authorization|credential)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;，；。<>}"']+)/gi,"[凭据已移除]").replace(/\bsk-[a-z0-9_-]+/gi,"[凭据已移除]").replace(new RegExp("(?<!\\d)1[3-9]\\d{9}(?!\\d)","g"),"[手机号已脱敏]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[邮箱已脱敏]"):Array.isArray(e)?e.map(T):e&&typeof e=="object"?Object.fromEntries(Object.entries(e).filter(([r])=>!/token|password|secret|credential|authorization|authConfig|execConfig|systemPrompt|messages/i.test(r)).map(([r,d])=>[r,T(d)])):e}const Y=["亚马逊厨房硅胶厨具套装选品","Ozon 冬季车载防雪挡风罩选品","TikTok 宠物自动喂食器选品","1688 家用迷你缝纫机选品","Temu 折叠衣物收纳箱选品","虾皮直播补光灯手机支架选品","亚马逊露营折叠桌椅选品","Ozon 车载无线吸尘器选品"],Z=[e=>`再帮我看下 ${e} 里 100 元以内的款，把销量前 3 的利润对比一下`,e=>`${e} 这种品换到 Ozon 平台还卖得动吗？帮我按新平台再评估一轮`,e=>`${e} 这批款如果统一做促销价，毛利率还能保住多少？帮我重算一版对比`];function me(e){var u,b;if(e.messages.filter(f=>f.role==="user").length>=2)return;const r=(((u=e.messages.find(f=>f.role==="user"))==null?void 0:u.content)||"选品咨询").split("，")[0].split("。")[0],d=Z[e.id%Z.length](r),s=((b=e.messages[e.messages.length-1])==null?void 0:b.createdAt)||e.createdAt,c=f=>new Date(new Date(s).getTime()+f*6e4).toISOString();e.messages.push({role:"user",content:d,createdAt:c(6)},{role:"assistant",content:`收到追问，针对「${r}」补充条件重新检索并测算中…`,createdAt:c(7)},{role:"assistant",content:"补充分析完成：新一轮候选对比与结论已生成，可在会话详情中查看。",createdAt:c(9)})}function Q(e,r,d,s){r=T(r),s=T(s||"—");const c=X,u=l=>{const p=Math.abs(Math.sin(d+l*13))*1e4;return p-Math.floor(p)},b=12+Math.floor(u(1)*29),f=l=>new Date(new Date(e.createdAt).getTime()+l*6e4).toISOString(),A=[{title:"解析需求",detail:`提取品类「${r}」的关键词与筛选条件：预算区间、目标平台、最低毛利率 ≥ 18%。`,tools:["意图解析"],durationSec:3+Math.floor(u(2)*5),at:f(0)},{title:"检索候选商品",detail:`并行调用商品搜索与趋势接口，命中 ${b} 个候选，去重与黑名单过滤后保留 8 个进入分析。`,tools:["ali_product_search","keyword_trend"],durationSec:8+Math.floor(u(3)*22),at:f(1)},{title:"数据分析",detail:"对候选商品计算价格带分布、月销量趋势、竞品集中度与预估毛利，输出推荐排序。",tools:["sales_estimate","bsr_ranking"],durationSec:15+Math.floor(u(4)*30),at:f(2)},{title:"生成报告",detail:"汇总分析结论，生成候选对比表格与 HTML 选品分析报告。",tools:["report_generator"],durationSec:4+Math.floor(u(5)*6),at:f(3)}],O=["硅胶厨具三件套","折叠收纳箱（3 件装）","车载防雪挡风罩","宠物自动喂食器","迷你缝纫机家用款"],h=["1688","OZON","AMAZON","TEMU","TIKTOK"],n=O.map((l,p)=>{const m=(28+u(10+p)*170).toFixed(2),S=(300+Math.floor(u(20+p)*8700)).toLocaleString(),_=["低","中","高"][Math.floor(u(30+p)*3)],k=(18+u(40+p)*33).toFixed(1),I=(6.5+u(50+p)*3.4).toFixed(1);return[l,h[Math.floor(u(60+p)*5)],`¥${m}`,`${S} 件`,_,`${k}%`,I]}).sort((l,p)=>Number(p[6])-Number(l[6])).map((l,p)=>[String(p+1),...l]),t={title:"候选商品对比",columns:["排名","商品","平台","参考价","月销量","竞争度","预估毛利率","推荐指数"],rows:n},o=n[0].map(c),a=n.map(l=>`<tr>${l.map(p=>`<td>${c(p)}</td>`).join("")}</tr>`).join(""),g=n.slice(0,3).map((l,p)=>{const m=l.map(c);return`<li><b>TOP${p+1} ${m[1]}</b>（${m[2]}）：参考价 ${m[3]}，月销 ${m[4]}，竞争度${m[5]}，预估毛利率 ${m[6]}，推荐指数 ${m[7]}。</li>`}).join(""),i=`<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>选品分析报告 · ${c(r)}</title><style>body{font-family:"PingFang SC","Microsoft YaHei",sans-serif;max-width:860px;margin:32px auto;color:#262626;line-height:1.7;padding:0 20px}h1{font-size:22px;border-bottom:3px solid #2563eb;padding-bottom:12px}.meta{color:#8c8c8c;font-size:13px}h2{font-size:17px;margin-top:28px;color:#1d4ed8}table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}th{background:#eff6ff;color:#1e40af}th,td{border:1px solid #d9d9d9;padding:8px 10px;text-align:center}.tag{display:inline-block;background:#eff6ff;color:#1d4ed8;border-radius:4px;padding:2px 8px;font-size:12px;margin-right:8px}ul{padding-left:20px}footer{margin-top:32px;color:#8c8c8c;font-size:12px;border-top:1px dashed #d9d9d9;padding-top:12px}</style></head><body><h1>选品分析报告</h1><p class="meta">会话 #${c(e.id)} · 专家 ${c(s)} · ${c(G(e.createdAt))}（北京时间 UTC+08:00） · <span class="tag">Mock 演示数据</span></p><h2>一、需求概述</h2><p>用户发起「${c(r)}」选品咨询：要求在预算区间内筛选竞争度适中、毛利率不低于 18% 的候选商品，并给出推荐排序。</p><h2>二、候选商品对比</h2><table><thead><tr>${t.columns.map(l=>`<th>${c(l)}</th>`).join("")}</tr></thead><tbody>${a}</tbody></table><h2>三、分析结论</h2><ul>${g}</ul><p>综合推荐：<b>${o[1]}</b>（推荐指数 ${o[7]}），建议先小批量测款，根据转化数据决定是否放量。</p><footer>有维AI 生成 · 数据为 Mock 演示，实盘决策请以真实数据核实</footer></body></html>`;return{steps:A,table:t,reportHtml:i}}function he(e,r){const d=e.messages.filter(s=>s.role==="user").map(s=>T(s.content).split("，")[0].split("。")[0]);return Q(e,d.join("；")||"选品咨询",e.id*97,r)}function Se(e,r,d){const s=e.messages.filter(u=>u.role==="user")[r],c=T((s==null?void 0:s.content)||"选品咨询").split("，")[0].split("。")[0];return Q({...e,createdAt:(s==null?void 0:s.createdAt)||e.createdAt},c,e.id*97+(r+1)*131,d)}function Oe(e,r){const{CHANNEL_RULES:d,MODEL_RULE:s,toolCostPrice:c,toolCredits:u,marginOf:b}=ae,f={OZON:{project:"OZON 选品分析",channelKey:"yunqi-ozon",tools:["yq_ozon_goods_search"],detailCalls:10},TEMU:{project:"TEMU 选品分析",channelKey:"yunqi-temu",tools:["yq_goods_search"],detailCalls:10},亚马逊:{project:"亚马逊选品分析",channelKey:"amazon",tools:["amazon_product_search"],detailCalls:10},1688:{project:"1688 分销选品",channelKey:"dld-1688",tools:["product_search_list"],detailCalls:10},TK:{project:"TK 内容选品",channelKey:"fastmoss",tools:["echotik_video_search"],detailCalls:10},虾皮:{project:"虾皮选品分析",channelKey:"shopee",tools:["shopee_product_search"],detailCalls:10}},A=t=>/Ozon/i.test(t)?f.OZON:/Temu|TEMU/i.test(t)?f.TEMU:/亚马逊/.test(t)?f.亚马逊:/1688/.test(t)?f[1688]:/TikTok|TK/i.test(t)?f.TK:/虾皮|Shopee/i.test(t)?f.虾皮:f.OZON,O=t=>d.find(o=>o.key===t),h=[];let n=1;return e.forEach((t,o)=>{const a=r.find(m=>m.id===t.userId)||r[0];if(!a)return;const g=A(t.title),i=O(g.channelKey),l=i.tools.find(m=>m.name===g.tools[0])||i.tools[0];t.messages.filter(m=>m.role==="user").map(m=>m.createdAt).forEach((m,S)=>{const _=[],k=c(i,l),I=u(i,l);_.push({name:l.label,code:l.name,type:"MCP_TOOL",channel:i.label,basis:`1 次有效调用（${i.granularity}；单位成本 ¥${i.unitCost}/次，×${i.markup} 倍）`,credits:I,costPrice:k,userPrice:Number((I*y).toFixed(4)),grossMargin:b(k,I),markup:i.markup,cost:k,quantity:1,unit:"次"});const N=S===0?g.detailCalls:Math.max(2,Math.round(g.detailCalls/3)),z=Number((k*N).toFixed(6)),K=I*N;_.push({name:`${l.label.replace("搜索","详情")}`,code:l.name.replace("search","detail"),type:"MCP_TOOL",channel:i.label,basis:`补查详情 ${N} 次（${i.granularity}）`,credits:K,costPrice:z,userPrice:Number((K*y).toFixed(4)),grossMargin:b(z,K),markup:i.markup,cost:z,quantity:N,unit:"次"});const w=38e3+(o*431+S*617)%24e3,D=3600+(o*137+S*211)%2200,U=Math.ceil(w/1e3*s.inputCreditsPerKToken),$=Math.ceil(D/1e3*s.outputCreditsPerKToken),q=Number((w/1e6*s.inputCostPerMillion).toFixed(6)),R=Number((D/1e6*s.outputCostPerMillion).toFixed(6));_.push({name:`${s.label} 输入`,code:"deepseek-input",type:"LLM_MODEL",channel:s.label,basis:`${(w/1e3).toFixed(1)}K tokens（¥${s.inputCostPerMillion}/百万，${s.inputCreditsPerKToken} 分/千 tokens，含系统提示+工具定义+历史+工具返回）`,credits:U,costPrice:q,userPrice:Number((U*y).toFixed(4)),grossMargin:b(q,U),markup:s.markup,cost:q,quantity:w,unit:"tokens"}),_.push({name:`${s.label} 输出`,code:"deepseek-output",type:"LLM_MODEL",channel:s.label,basis:`${(D/1e3).toFixed(1)}K tokens（¥${s.outputCostPerMillion}/百万，${s.outputCreditsPerKToken} 分/千 tokens）`,credits:$,costPrice:R,userPrice:Number(($*y).toFixed(4)),grossMargin:b(R,$),markup:s.markup,cost:R,quantity:D,unit:"tokens"}),(o+S)%4===1&&_.push({name:"选品分析报告生成",code:"skill-report",type:"SKILL",channel:"应用内",basis:"技能内部执行，不单独计费",credits:0,costPrice:0,userPrice:0,cost:0});const v=_.reduce((P,F)=>P+F.credits,0),H=Number(_.reduce((P,F)=>P+(F.costPrice||0),0).toFixed(6)),W=Number((v*y).toFixed(4)),C=(o*7+S)%11===3,M=(o*5+S)%17===5;h.push({id:n++,userId:a.id,phone:a.phone,wechatNickname:a.wechatNickname,chatId:t.id,projectName:g.project,content:String(t.title||"").slice(0,40),createdAt:m,status:M?"REFUNDED":C?"FREE":"CHARGED",credits:M?v:C?0:-v,breakdown:C||M?_.map(P=>({...P,credits:0,userPrice:0,grossMargin:void 0})):_,cost:H,userPriceTotal:C||M?0:W,grossMargin:C||M?void 0:b(H,v),source:"Mock 演示计量（方案 v1 口径）"})})}),h.sort((t,o)=>o.createdAt.localeCompare(t.createdAt))}export{be as C,se as S,re as a,Oe as b,me as c,E as d,ce as e,pe as f,de as g,Se as h,he as i,y as j,_e as m,T as r,ye as s};
