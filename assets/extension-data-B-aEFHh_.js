import{O}from"./index-C7bpoUQj.js";const M=["1688","OZON","AMAZON","TEMU"],N=["file_context","file_upload","vision","web_search","image_generation","code_interpreter","terminal","citations","status_updates","memory","builtin_tools","usage"],v={file_context:"文件上下文",file_upload:"文件上传",vision:"图片理解",web_search:"联网搜索",image_generation:"图像生成",code_interpreter:"代码解释器",terminal:"终端执行",citations:"引用来源",status_updates:"状态推送",memory:"长期记忆",builtin_tools:"内置工具",usage:"用量统计"};function y(t={}){const n={file_context:!1,file_upload:!1,vision:!1,web_search:!1,image_generation:!1,code_interpreter:!1,terminal:!1,citations:!1,status_updates:!1,memory:!1,builtin_tools:!1,usage:!1};for(const c of N)typeof t[c]=="boolean"&&(n[c]=t[c]);return typeof t.file=="boolean"&&(t.file_context===void 0&&(n.file_context=t.file),t.file_upload===void 0&&(n.file_upload=t.file)),n}const S=`# {技能名称}

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
`;function T(t,n){return S.replace("{技能名称}",t).replace("<!-- 描述什么意图/问题应路由到本技能 -->",n||"（待补充触发意图）")}const b="http://192.168.1.10:8080/v1",_="sk-4a2e997b4531ad4ed0c85d499ed00273ef06962c0790862929171a51352eb718";function I(){const t=new Date().toISOString();return[{id:41,code:"glm-5.3",name:"GLM-5.3",provider:"OpenAI兼容",endpoint:b,apiKey:_,defaultParams:{temperature:.7,max_tokens:4096},remark:"1688选品助手默认基础模型（内网演示网关）",status:1,createdAt:t,updatedAt:t},{id:42,code:"glm-4.7",name:"GLM-4.7",provider:"智谱",endpoint:"https://open.bigmodel.cn/api/paas/v4",apiKey:"sk-mock-glm47-3c4d",defaultParams:{temperature:.7,max_tokens:4096},remark:"",status:1,createdAt:t,updatedAt:t},{id:43,code:"deepseek-v3",name:"DeepSeek-V3",provider:"OpenAI兼容",endpoint:"https://api.deepseek.com/v1",apiKey:"sk-mock-ds3-5e6f",defaultParams:{temperature:.5,max_tokens:8192},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:t,updatedAt:t},{id:44,code:"qwen-max",name:"Qwen-Max",provider:"OpenAI兼容",endpoint:"https://dashscope.aliyuncs.com/compatible-mode/v1",apiKey:"",defaultParams:{temperature:.7,max_tokens:6e3},remark:"OpenAI 兼容接入（端点仅示意）",status:1,createdAt:t,updatedAt:t}]}function P(t){const n=`${t.code||""} ${t.name||""} ${t.description||""}`.toLowerCase();return/ozon/.test(n)?["OZON"]:/amazon|亚马逊/.test(n)?["AMAZON"]:/temu/.test(n)?["TEMU"]:["1688"]}function C(){const t={status:1,version:1,updatedAt:new Date().toISOString(),refreshStatus:"APPLIED",appliedVersion:1,refreshMessage:"Mock 演示配置已生效；未连接 AgentScope"},n=[{...t,id:1,code:"product-selection-assistant",name:"1688分销选品",description:"面向 1688 分销场景的选品助手：关键词分析、竞品监控、类目趋势与利润测算，一键生成选品报告。",avatarUrl:"",baseModel:"glm-5.3",platforms:["1688"],systemPrompt:"你是1688分销选品助手，请基于可验证的数据回答。先理解选品意图，再路由到合适技能；调用工具前先确认参数契约；输出结论必须附带数据来源与校验结果。",skillIds:[11,12,13,14,15,16,17],mcpServerIds:[1],mcpToolIds:[21],suggestedQuestions:['帮我分析"收纳盒"关键词的竞争度',"对比近30天竞品价格并测算分销毛利","生成一份厨房收纳类目的选品报告"],capabilities:y({file:!0,web_search:!0,citations:!0}),tags:["选品","1688","分销"],visibility:{type:"PUBLIC",planIds:[]},isDefault:!0,titleHtml:"1688分销选品专家",introduction:"<p>深耕 1688 分销场景的数据选品助手。支持从<b>关键词竞争度</b>、<b>竞品价格监控</b>、<b>类目趋势</b>三个维度完成选品决策，并一键生成选品报告。</p><ul><li>覆盖 1688 全类目榜单与价格带分布</li><li>内置利润测算与分销毛利模型</li><li>输出结论均附带数据来源校验</li></ul>",greeting:"你好！我是 1688 分销选品专家，可以帮你分析关键词、监控竞品、测算利润并生成选品报告。",coreAbilities:["关键词竞争度分析","竞品价格与销量监控","类目趋势洞察","分销利润测算","一键生成选品报告"],referencePrompts:['帮我分析"收纳盒"关键词在1688的竞争度',"对比近30天收纳类目TOP10竞品的价格分布","生成一份厨房收纳类目的月度选品报告"],nextQuestionConfig:{enabled:!0,model:"deepseek-v4.1-flash",mode:"default"}},{...t,id:2,code:"cross-border-selection",name:"跨境电商选品",description:"面向跨境电商（亚马逊/TikTok）场景的选品助手，结合平台榜单与趋势数据。",avatarUrl:"",baseModel:"deepseek-v3",platforms:["AMAZON","TEMU"],systemPrompt:"你是跨境电商选品助手，请基于可验证的数据回答，注意不同站点的价格与合规差异。",skillIds:[12,14,16],mcpServerIds:[1,3,4],suggestedQuestions:["美国站家居类目最近什么品好卖？"],capabilities:y({file:!0,vision:!0,web_search:!0}),tags:["选品","跨境"],visibility:{type:"PLAN",planIds:[2,3]},isDefault:!1,titleHtml:"跨境电商选品专家",introduction:"<p>面向<b>亚马逊 / Temu / TikTok</b> 等跨境站点的选品助手，结合平台榜单、广告数据与站点合规差异给出选品建议。</p>",greeting:"你好！我是跨境电商选品专家，告诉我目标站点与类目，我来帮你找品。",coreAbilities:["亚马逊 BSR 榜单解读","Temu 爆款趋势追踪","站点合规与价格差异提示"],referencePrompts:["美国站家居类目最近什么品好卖？","对比亚马逊与Temu同款收纳盒的价格带"],nextQuestionConfig:{enabled:!0,mode:"default"}},{...t,id:3,code:"douyin-selection",name:"抖音带货选品",description:"面向抖音直播/短视频带货的选品助手，结合达人带货榜与内容趋势。",avatarUrl:"",baseModel:"glm-4.7",platforms:["1688","OZON","AMAZON","TEMU"],systemPrompt:"你是抖音带货选品助手，请基于可验证的数据回答，并给出内容选题建议。",skillIds:[12,17],mcpServerIds:[5],suggestedQuestions:["最近什么商品在短视频渠道转化好？"],capabilities:y({vision:!0,status_updates:!0}),tags:["选品","抖音"],visibility:{type:"PLAN",planIds:[3,4]},isDefault:!1,titleHtml:"抖音带货选品专家",introduction:"<p>面向抖音直播/短视频带货的选品助手，结合<b>达人带货榜</b>与<b>内容趋势</b>，给出选品与内容选题双建议。</p>",greeting:"你好！我是抖音带货选品专家，可以帮你分析达人带货榜和内容趋势。",coreAbilities:["达人带货榜分析","爆款视频内容拆解","选品与内容选题联动建议"],referencePrompts:["最近一周美妆类目哪些达人在带货？","帮我拆解一条百万播放的收纳好物视频"],nextQuestionConfig:{enabled:!1,mode:"default"}}],p=[{id:11,code:"dld-selection-search",name:"1688选品搜索",description:"按关键词/类目在 1688 搜索候选商品并返回结构化清单，适用于选品前期调研",content:`# 1688选品搜索

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
前置数据不足时输出精简版并明示缺口。`}].map(({id:s,code:a,name:m,description:g,content:u})=>({...t,id:s,code:a,name:m,description:g,content:u,files:[],platforms:{11:["1688"],12:["1688","AMAZON","TEMU"],13:["1688"],14:["1688","AMAZON","TEMU"],15:["1688"],16:["1688","AMAZON","TEMU"],17:["1688","OZON","AMAZON","TEMU"]}[s]||["1688"],paramSchema:{type:"object",properties:{keyword:{type:"string"}},required:["keyword"]},execConfig:{handler:"demo",timeoutMs:3e4}})),f=[{...t,id:1,code:"gateway",name:"聚合网关（OpenAPI）",platforms:["1688","AMAZON","TEMU"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:2,code:"dld",name:"店雷达数据（MCP）",platforms:["1688"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://dld.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:3,code:"amazon_data",name:"亚马逊数据（MCP）",platforms:["AMAZON"],connType:"MCP",transport:"STREAMABLE_HTTP",endpoint:"https://amazon-data.example.com",path:"/mcp",authConfig:{type:"API_KEY",headerName:"X-Api-Key",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:4,code:"gateway-amazon",name:"亚马逊网关（OpenAPI）",platforms:["AMAZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-amazon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:5,code:"echotik",name:"EchoTik 达人数据（MCP）",platforms:["1688","OZON","AMAZON","TEMU"],connType:"MCP",transport:"SSE",endpoint:"https://echotik.example.com",path:"/mcp",authConfig:{type:"NONE"},toolFilter:[],healthStatus:"UNKNOWN"},{...t,id:6,code:"gateway-ozon",name:"Ozon 网关（OpenAPI）",platforms:["OZON"],connType:"OpenAPI",transport:"STREAMABLE_HTTP",endpoint:"https://gateway-ozon.example.com",path:"/openapi.json",authConfig:{type:"BEARER",credential:"MOCK_SECRET_CONFIGURED"},toolFilter:[],healthStatus:"UNKNOWN"}];return{models:I(),plans:["免费版","标准版","专业版","企业版"].map((s,a)=>({...t,id:a+1,code:`plan_${a+1}`,name:s,price:[0,99,299,2999][a],durationDays:30,entitlements:[]})),experts:n,skills:p,servers:f,tools:[{id:21,serverId:1,name:"ali_product_search",enabled:!0},{id:22,serverId:1,name:"ali_keyword_trend",enabled:!0},{id:23,serverId:2,name:"dld_product_search",enabled:!0},{id:24,serverId:3,name:"amazon_bsr_ranking",enabled:!0},{id:25,serverId:4,name:"amazon_sales_estimate",enabled:!0},{id:26,serverId:5,name:"echotik_video_search",enabled:!0}],chats:Array.from({length:16},(s,a)=>{const m=new Date(Date.now()-a*864e5).toISOString();return{id:a+1,userId:a%8+1,expertId:a%3+1,createdAt:m,deletedAt:null,deleteReason:"",messages:[{role:"user",content:`演示选品咨询 ${a+1}，联系 demo${a}@example.com 手机13800138000`,createdAt:m},{role:"assistant",content:"这是 Mock 演示回复，请核实商品数据。",createdAt:m}]}}),promptHistory:Object.fromEntries(n.map(s=>[s.id,[{version:1,systemPrompt:s.systemPrompt,createdAt:s.updatedAt}]])),skillCalls:Array.from({length:24},(s,a)=>({skillId:a%2+11,success:a%5!==0,createdAt:new Date(Date.now()-a*864e5).toISOString()})),expertVersions:Object.fromEntries(n.map(s=>[s.id,[{version:s.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:s.updatedAt,snapshot:structuredClone(s)}]])),skillVersions:Object.fromEntries(p.map(s=>[s.id,[{version:s.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:s.updatedAt,snapshot:structuredClone(s)}]])),mcpVersions:Object.fromEntries(f.map(s=>[s.id,[{version:s.version,versionName:"v1（初始种子）",operator:"admin",note:"初始种子数据",createdAt:s.updatedAt,snapshot:structuredClone(s)}]]))}}function w(t){const n=o=>{var e;return(e=t.tools.find(i=>i.id===o))==null?void 0:e.serverId};(!Array.isArray(t.models)||!t.models.length)&&(t.models=I()),t.models=t.models.map(o=>({...o,apiKey:typeof o.apiKey=="string"?o.apiKey:void 0,defaultParams:o.defaultParams&&typeof o.defaultParams=="object"&&!Array.isArray(o.defaultParams)?o.defaultParams:{},createdAt:o.createdAt||o.updatedAt||new Date().toISOString()}));const c=()=>t.models.reduce((o,e)=>Math.max(o,e.id),40)+1,p=t.models.find(o=>o.code==="glm-5.3");if(p&&(!p.apiKey||p.apiKey.startsWith("sk-mock-"))&&(p.provider="OpenAI兼容",p.endpoint=b,p.apiKey=_,p.updatedAt=new Date().toISOString()),!t.models.some(o=>o.endpoint===b)){const o=new Date().toISOString();t.models.push({id:c(),code:"deepseek-v4.1-flash",name:"DeepSeek-V4.1-Flash",provider:"OpenAI兼容",endpoint:b,apiKey:_,defaultParams:{temperature:.5,max_tokens:8192},remark:"演示网关自动注册",status:1,createdAt:o,updatedAt:o})}const f=(o,e)=>{const i=r=>typeof r=="string"&&M.includes(r);if(Array.isArray(o.platforms)){const r=[...new Set(o.platforms.filter(i))];if(r.length)return r}return i(o.platform)?[o.platform]:o.platform==="ALL"?["1688","OZON","AMAZON","TEMU"]:P(e)},s=t.experts||[],a=t.skills||[],m=t.servers||[];s.forEach(o=>{var l;const e=o;(e.description===void 0||e.description==="")&&(e.description=o.intro||o.name),e.baseModel||(e.baseModel=String(((l=o.modelParams)==null?void 0:l.model)||"glm-5.3"));const i=t.models.find(d=>d.code===e.baseModel||d.name===e.baseModel);if(i&&(e.baseModel=i.code),!t.models.some(d=>d.code===e.baseModel)){const d=new Date().toISOString();t.models.push({id:c(),code:e.baseModel,name:e.baseModel,provider:"自定义",endpoint:"",defaultParams:{},remark:"旧数据 base_model 自动迁移注册",status:1,createdAt:d,updatedAt:d})}o.platforms=f(o,o),!e.capabilities||typeof e.capabilities!="object"?e.capabilities=y():e.capabilities=y(e.capabilities),Array.isArray(e.suggestedQuestions)||(e.suggestedQuestions=[]),Array.isArray(e.tags)||(e.tags=[]),(!e.visibility||!["PUBLIC","PLAN","PRIVATE"].includes(e.visibility.type))&&(e.visibility={type:"PUBLIC",planIds:[]});const r=(o.mcpToolIds||[]).map(n).filter(d=>typeof d=="number");(!Array.isArray(e.mcpServerIds)||!e.mcpServerIds.length)&&(e.mcpServerIds=[...new Set(r)]),typeof e.titleHtml!="string"&&(e.titleHtml=""),typeof e.introduction!="string"&&(e.introduction=""),typeof e.greeting!="string"&&(e.greeting=""),Array.isArray(e.coreAbilities)||(e.coreAbilities=[]),Array.isArray(e.referencePrompts)||(e.referencePrompts=[]),(!e.nextQuestionConfig||typeof e.nextQuestionConfig!="object")&&(e.nextQuestionConfig={enabled:!0,mode:"default"})}),a.forEach(o=>{const e=o;(!e.content||!String(e.content).trim())&&(e.content=T(o.name,o.description||"")),Array.isArray(e.files)||(e.files=[]),o.platforms=f(o,o)}),m.forEach(o=>{const e=o;if(e.connType||(e.connType="MCP"),o.transport==="HTTP"&&(o.transport="STREAMABLE_HTTP"),(!e.authConfig||typeof e.authConfig!="object")&&(e.authConfig={type:"NONE"}),!e.path)try{const i=new URL(o.endpoint||"");e.path=i.pathname!=="/"?i.pathname:"/mcp",o.endpoint=i.origin}catch{e.path="/mcp"}Array.isArray(e.toolFilter)||(e.toolFilter=[]),o.platforms=f(o,o)});const g=(o,e,i)=>{const r=O(o),l=r.isValid()?r.format("YYYYMMDDHHmmss"):O().format("YYYYMMDDHHmmss");if(!e.some(A=>A!==i&&A.versionName===l))return l;let d=2;for(;e.some(A=>A!==i&&A.versionName===`${l}-${d}`);)d++;return`${l}-${d}`},u=o=>{if(o)for(const e of Object.values(o)){const i=e||[];i.forEach(r=>{(!r.versionName||r.versionName==="未命名")&&(r.versionName=g(r.createdAt,i,r)),r.operator||(r.operator="")})}};u(t.expertVersions),u(t.skillVersions),u(t.mcpVersions);const h=(o,e)=>{const i=e||{};return o.forEach(r=>{var l;i[l=String(r.id)]||(i[l]=[{version:r.version,versionName:g(r.updatedAt,[]),operator:"",note:"迁移补记：旧数据迁移初始快照",createdAt:r.updatedAt,snapshot:structuredClone(r)}])}),i};t.expertVersions=h(s,t.expertVersions),t.skillVersions=h(a,t.skillVersions),t.mcpVersions=h(m,t.mcpVersions)}function E(t){return typeof t=="string"?t.replace(/(?:bearer\s+)[\w.\-]+/gi,"[凭据已移除]").replace(/\b(?:token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;"}]+/gi,"[凭据已移除]").replace(/\b1[3-9]\d{9}\b/g,"[手机号已脱敏]").replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,"[邮箱已脱敏]"):Array.isArray(t)?t.map(E):t&&typeof t=="object"?Object.fromEntries(Object.entries(t).filter(([n])=>!/token|password|secret|credential|authorization|authConfig|execConfig|systemPrompt|messages/i.test(n)).map(([n,c])=>[n,E(c)])):t}export{v as C,M as P,N as a,y as d,w as m,E as r,C as s};
