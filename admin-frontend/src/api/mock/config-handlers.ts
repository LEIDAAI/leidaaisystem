import { db, nextMockId, nowStr, stampStr, permissionCodesOf } from './db'
import { CAPABILITY_KEYS, defaultCapabilities, redact, detectPlatforms, seedBillingSettings } from './extension-data'
import type { LlmModelRow } from './extension-data'
import { simulatePreviewChat, type PreviewDraftLike } from './preview-engine'
import { normalizeFrontendPerms, PLATFORMS, hostOf } from '../config'
import type { BillingSettings, ConfigItem, ConfigKind, ConfigVersion, CreditPackage, Entitlement, KnowledgeBase, KnowledgeFile, LlmModel, PlatformType, ProbedModel, ProbeModelsResult, Scenario, Tool } from '../config'

export interface Context { params: Record<string,string>; query: Record<string,unknown>; body: unknown; adminId: number; token: string }
export interface Services {
  route: (method:string,path:string,handler:(ctx:Context)=>unknown)=>void
  error: new (code:number,message:string)=>Error
  audit: (adminId:number,action:string,type:string,id:string|number,before:unknown,after:unknown)=>void
}
export function resources(): Entitlement[] {
  return [ ...db.experts.map(e=>({ resourceType:'EXPERT' as const, resourceId:e.id,resourceName:e.name,quotaType:'CHAT_COUNT' as const,quotaLimit:100,quotaPeriod:'MONTH' as const })), ...db.skills.map(e=>({ resourceType:'SKILL' as const,resourceId:e.id,resourceName:e.name,quotaType:'SKILL_CALL' as const,quotaLimit:100,quotaPeriod:'MONTH' as const })), ...db.tools.map(e=>({resourceType:'MCP_TOOL' as const,resourceId:e.id,resourceName:e.name,quotaType:'SKILL_CALL' as const,quotaLimit:100,quotaPeriod:'MONTH' as const})) ]
}
export function validateEntitlements(value:unknown, ErrorType:Services['error']): Entitlement[] {
  if (!Array.isArray(value)) throw new ErrorType(422,'权益必须是数组')
  const seen = new Set<string>()
  return value.map((v:Entitlement) => {
    const resource = resources().find(r=>r.resourceType===v.resourceType && r.resourceId===v.resourceId)
    const key = `${v.resourceType}:${v.resourceId}`
    if (!resource || seen.has(key) || !Number.isInteger(v.quotaLimit) || v.quotaLimit<0 || !['DAY','MONTH','LIFETIME'].includes(v.quotaPeriod) || v.quotaType!==resource.quotaType) throw new ErrorType(422,'权益资源、计量类型、非负整数限额、周期必须有效且不能重复')
    seen.add(key)
    return { ...resource, quotaLimit:v.quotaLimit,quotaPeriod:v.quotaPeriod,used:0 }
  })
}
/** v13：套餐权益不再表单编辑，保存时按各资源侧已设置的可见性派生覆盖写入（status=1 且 PUBLIC/缺省 或 PLAN 命中该套餐；MCP 按所属服务可见性取其全部工具；缺省视为全员可见，与 MCP 保存归一化一致） */
function derivePlanEntitlements(planId:number): Entitlement[] {
  const visible=(v?:{type?:string;planIds?:number[]})=>Boolean(!v || v.type==='PUBLIC' || (v.type==='PLAN' && (v.planIds||[]).includes(planId)))
  const out:Entitlement[]=[]
  db.experts.forEach(e=>{ if(e.status===1 && visible(e.visibility)) out.push({ resourceType:'EXPERT', resourceId:e.id, resourceName:e.name, quotaType:'CHAT_COUNT', quotaLimit:100, quotaPeriod:'MONTH', used:0 }) })
  db.skills.forEach(s=>{ if(s.status===1 && visible(s.visibility)) out.push({ resourceType:'SKILL', resourceId:s.id, resourceName:s.name, quotaType:'SKILL_CALL', quotaLimit:100, quotaPeriod:'MONTH', used:0 }) })
  db.tools.forEach(t=>{ const sv=db.servers.find(s=>s.id===t.serverId); if(sv && sv.status===1 && visible(sv.visibility)) out.push({ resourceType:'MCP_TOOL', resourceId:t.id, resourceName:t.name, quotaType:'SKILL_CALL', quotaLimit:100, quotaPeriod:'MONTH', used:0 }) })
  return out
}

/** 引用了指定资源的套餐/个体权益来源清单（删除拦截用，报错指明来源便于解除） */
function entitledBy(resourceType:'EXPERT'|'SKILL'|'MCP_TOOL', ids:number[]): string[] {
  const by: string[] = []
  db.plans.forEach(p=>(p.entitlements||[]).forEach(e=>{ if(e.resourceType===resourceType && ids.includes(e.resourceId)) by.push(`套餐「${p.name}」`) }))
  db.users.forEach(u=>(u.entitlements||[]).forEach(e=>{ if(e.resourceType===resourceType && ids.includes(e.resourceId)) by.push(`用户「${u.wechatNickname}#${u.id}」`) }))
  return [...new Set(by)]
}

export function registerConfigHandlers({route,error:ErrorType,audit}:Services) {
  const fail: (message:string,code?:number)=>never = (message,code=422)=>{ throw new ErrorType(code,message) }
  const normalizeDuration = (item: ConfigItem) => {
    item.durationMode ??= item.durationDays === 0 ? 'LIFETIME' : 'CUSTOM_DAYS'
    if (!['LIFETIME','CUSTOM_DAYS','MEMBERSHIP'].includes(item.durationMode)) fail('套餐时长模式无效')
    if (item.durationMode === 'MEMBERSHIP') {
      if (item.planType !== 'GIFT') fail('仅赠送套餐支持会员期内有效')
      item.durationDays = undefined
    } else if (item.durationMode === 'LIFETIME') item.durationDays = 0
    else if (!Number.isInteger(item.durationDays) || Number(item.durationDays) < 1) fail('自定义时长须为正整数天数')
  }
  /** 引用来源报错文案：最多列 5 处，其余计数 */
  const entitledFail = (plant:'专家'|'技能'|'MCP 服务', by:string[]):never => {
    const shown = by.slice(0,5).join('、')
    throw new ErrorType(409, `${plant}被以下套餐或用户权益引用：${shown}${by.length>5?` 等 ${by.length} 处引用`:''}；请先在套餐或用户权益中解除引用`)
  }
  const perm = (ctx:Context,code:string)=>{ if(!permissionCodesOf(ctx.adminId).includes(code)) fail('无权限执行该操作',403) }
  const find = (items:ConfigItem[],id:string)=>items.find(i=>i.id===Number(id)) || fail('配置不存在',404)
  const snapshot = (item:ConfigItem)=>JSON.parse(JSON.stringify(item)) as ConfigItem
  const touch = (item:ConfigItem)=>{ item.version++; item.updatedAt=nowStr(); item.refreshStatus='PENDING'; item.refreshMessage='Mock 待刷新；未连接 AgentScope' }
  const publicItem = (item:ConfigItem)=>({ ...item, authConfig:item.authConfig ? { ...item.authConfig,credential:item.authConfig.credential?'******':undefined }:undefined })
  const collections: Array<[ConfigKind,ConfigItem[],string]> = [['plans',db.plans,'plan'],['experts',db.experts,'expert'],['skills',db.skills,'skill'],['mcp/servers',db.servers,'mcp']]
  type Module = 'plan'|'expert'|'skill'|'mcp'
  type RestoreOptions = { snapshot: ConfigItem; restoredFrom: number; tools?: Tool[] }
  /** 恢复与保存使用同一候选对象、校验和提交路径；恢复选项仅由内部路由传入。 */
  const saveFns: Partial<Record<Module, (ctx:Context, restore?:RestoreOptions)=>ConfigItem>> = {}
  const versionStore = (module:string) => module==='expert'?db.expertVersions:module==='skill'?db.skillVersions:module==='mcp'?db.mcpVersions:db.planVersions
  const configSnapshot = (module:string, item:ConfigItem):ConfigItem => snapshot(module==='mcp' ? { ...item, tools:db.tools.filter(t=>t.serverId===item.id) } : item)
  const normalizeVisibility = (value:ConfigItem['visibility']):NonNullable<ConfigItem['visibility']> => {
    const vis=value ?? { type:'PUBLIC', planIds:[] }
    if(!['PUBLIC','PLAN','PRIVATE'].includes(vis.type)) fail('可见性类型无效（PUBLIC/PLAN/PRIVATE）')
    if(vis.type==='PLAN' && (!Array.isArray(vis.planIds) || !vis.planIds.length || vis.planIds.some(id=>!db.plans.some(p=>p.id===id)))) fail('指定套餐可见性需选择有效套餐')
    return { type:vis.type, planIds:vis.type==='PLAN'?[...new Set(vis.planIds)]:[] }
  }
  const assertToolsRemovable = (ids:number[]) => {
    const by=entitledBy('MCP_TOOL',ids)
    db.experts.forEach(e=>{
      if((e.mcpToolIds||[]).some(id=>ids.includes(id)) || Object.values(e.mcpToolSelection||{}).some(selected=>selected.some(id=>ids.includes(id)))) by.push(`专家「${e.name}」工具选择`)
    })
    if(by.length) fail(`工具被以下配置引用：${[...new Set(by)].join('、')}；请先解除引用`,409)
  }
  /** v5：版本快照公共字段（版本名称留空自动生成 yyyyMMddHHmmss；操作人取当前管理员） */
  const versionMeta = (ctx:Context, body:unknown, store?:Record<string, ConfigVersion[]>, itemId?:number|string)=>{
    const custom=String((body as Record<string,unknown>)?.versionName || '').trim()
    let versionName=custom || stampStr()
    // 自动生成的 yyyyMMddHHmmss 同秒多次保存会重名：追加 -N 序号；用户自填名称仍由唯一性校验 422
    if(!custom && store && itemId!==undefined) { const base=versionName; for(let n=2;(store[String(itemId)]||[]).some(v=>v.versionName===versionName);n++) versionName=`${base}-${n}` }
    return { versionName, operator:db.admins.find(a=>a.id===ctx.adminId)?.username || 'unknown' }
  }
  /** v5：同资源内版本名称唯一校验（重复 422，保存与恢复共用） */
  const assertVersionNameUnique = (store: Record<string, ConfigVersion[]> | undefined, itemId: number|string, versionName: string): void => {
    if((store?.[String(itemId)] || []).some(v=>v.versionName===versionName)) fail(`版本名称「${versionName}」在该资源的历史版本中已存在，请更换`)
  }
  const preserveMcpBaseline = (ctx:Context, item:ConfigItem, reservedName:string) => {
    const history=db.mcpVersions[String(item.id)] ||= []
    const current=history.find(v=>v.version===item.version)
    // 只有当前版本的旧快照可以准确补齐工具；更早的缺失快照不猜测历史状态。
    if(current) { if(!current.snapshot.tools) current.snapshot.tools=structuredClone(db.tools.filter(t=>t.serverId===item.id)) }
    else {
      const base=`工具变更前 v${item.version}`
      let versionName=base
      for(let n=2;versionName===reservedName || history.some(v=>v.versionName===versionName);n++) versionName=`${base}-${n}`
      history.push({ version:item.version,...versionMeta(ctx,{ versionName },db.mcpVersions,item.id),note:'工具变更前基线',createdAt:item.updatedAt,snapshot:configSnapshot('mcp',item) })
    }
  }
  route('GET','/entitlement-resources',ctx=>{ if(!['user:entitlement','plan:view','plan:edit'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限',403); return resources() })
  for(const [kind,items,module] of collections) {
    route('GET',`/${kind}`,ctx=>{ perm(ctx,`${module}:view`); const keyword=String(ctx.query.keyword || '');const status=ctx.query.status==='' || ctx.query.status===undefined ? undefined:Number(ctx.query.status);return items.filter(i=>(!keyword || `${i.name} ${i.code}`.includes(keyword)) && (status===undefined || i.status===status)).map(i=>({ ...publicItem(i), salesCount: module==='plan'?db.orders.filter(o=>o.planId===i.id && o.status==='PAID').length:undefined, boundSkillCount: module==='expert'?(i.skillIds||[]).length:undefined, boundMcpCount: module==='expert'?(i.mcpServerIds||[]).length:undefined, boundExpertCount: module==='skill'?db.experts.filter(e=>e.skillIds?.includes(i.id)).length:undefined })) })
    route('GET',`/${kind}/:id`,ctx=>{ perm(ctx,`${module}:view`);return publicItem(find(items,ctx.params.id)) })
    const save = (ctx:Context, restore?:RestoreOptions)=>{
      perm(ctx,`${module}:edit`)
      const old = ctx.params.id ? find(items,ctx.params.id):undefined
      const input = (ctx.body || {}) as Partial<ConfigItem> & { confirmReferences?: boolean; note?: string }
      const item:ConfigItem = { ...(old ? snapshot(old):{ id:nextMockId(),code:'',name:'',status:1,version:0,updatedAt:nowStr(),refreshStatus:'PENDING',appliedVersion:0,refreshMessage:'' }) }
      const fields: Array<keyof ConfigItem> = ['code','name','status','platforms',...(module==='plan'?['price','firstPurchasePrice','durationMode','durationDays','frontendPerms','planType','credits','tagline','badge','features','billingCycles','sort','grantMode','creditExpiry','creditValidityDays']:module==='expert'?['description','avatarUrl','baseModel','systemPrompt','skillIds','mcpServerIds','knowledgeBaseIds','suggestedQuestions','capabilities','tags','visibility','isDefault','mcpToolSelection','intro','modelParams','mcpToolIds','titleHtml','introduction','introductionFiles','greeting','coreAbilities','referencePrompts','nextQuestionConfig','scenarioId']:module==='skill'?['description','content','files','group','scenarioId','agentId','paramSchema','execConfig','visibility']:['connType','endpoint','path','transport','command','args','authConfig','toolFilter','visibility','apiOperations'])] as Array<keyof ConfigItem>
      const source=restore?.snapshot || input
      for(const key of fields) if(restore || source[key]!==undefined) Object.assign(item,{[key]:source[key]===undefined?undefined:structuredClone(source[key])})
      if(restore && old && source.code===undefined) item.code=old.code
      if(old && (module==='plan' || restore) && item.code!==old.code) fail('配置编码创建后不可修改，历史恢复也必须保留当前编码')
      if(restore && module==='plan') item.durationMode ??= item.durationDays===0?'LIFETIME':'CUSTOM_DAYS'
      if(restore && module==='expert') {
        item.skillIds ??=[];item.mcpServerIds ??=[];item.knowledgeBaseIds ??=[]
        item.suggestedQuestions ??=[];item.tags ??=[];item.isDefault ??=false
      }
      item.name=String(item.name ?? '').trim();item.code=String(item.code ?? '').trim()
      if(!item.name || !/^[a-zA-Z0-9_-]+$/.test(item.code)) fail('名称必填，编码仅允许字母数字下划线短横线')
      if(items.some(i=>i.id!==item.id && i.code===item.code)) fail('编码已存在')
      if(![0,1].includes(item.status)) fail('状态无效')
      if(module!=='plan') {
        // v5：平台维度多选（专家/技能/MCP 通用），枚举 1688/OZON/AMAZON/TEMU/TIKTOK/SHOPEE，至少一个
        if(!Array.isArray(item.platforms) || !(item.platforms as unknown[]).length) {
          // 兼容回填（旧导出 JSON / 存量调用方）：旧单值 platform 映射为数组；无平台信息按关键词推断（复用 detectPlatforms），否则默认 ['1688']
          const legacyPlat=(input as Record<string,unknown>).platform
          const valid=(v:unknown):v is PlatformType=>typeof v==='string' && (PLATFORMS as string[]).includes(v)
          item.platforms = valid(legacyPlat) ? [legacyPlat] : legacyPlat==='ALL' ? [...PLATFORMS] : detectPlatforms(item)
        }
        const plats=[...new Set(item.platforms as string[])]
        if(!plats.length || plats.some(p=>!PLATFORMS.includes(p as PlatformType))) fail('平台必须为 1688/OZON/AMAZON/TEMU/TIKTOK/SHOPEE 且至少选择一个')
        item.platforms=plats as PlatformType[]
      }
      if(module==='plan') {
        if (item.planType !== undefined && !['NORMAL','GIFT'].includes(item.planType)) fail('会员套餐类型仅支持 NORMAL/GIFT；积分包请使用 credit-packages')
        if (old && (item.planType || 'NORMAL') !== (old.planType || 'NORMAL')) fail('套餐类型创建后不可修改')
        item.planType=item.planType==='GIFT'?'GIFT':'NORMAL'
        if (input.durationMode === undefined && input.durationDays !== undefined) item.durationMode = input.durationDays === 0 ? 'LIFETIME' : 'CUSTOM_DAYS'
        normalizeDuration(item)
        if(item.planType==='GIFT') {
          // 赠送套餐：价格必须为 0 元；有效天数 0=长期有效，正整数=自定义时长；不配置 AI 积分（固定 0）
          if(Number(item.price)!==0) fail('赠送套餐价格必须为 0 元')
          item.credits=0
          item.firstPurchasePrice=undefined
          item.billingCycles=undefined
        } else {
          if(!Number.isFinite(item.price) || Number(item.price)<0 || !Number.isInteger(item.durationDays) || Number(item.durationDays)<0) fail('价格须非负，有效天数须为 0（长期有效）或正整数')
          if(item.firstPurchasePrice===null || item.firstPurchasePrice===undefined) item.firstPurchasePrice=undefined
          else if(typeof item.firstPurchasePrice!=='number' || !Number.isFinite(item.firstPurchasePrice) || item.firstPurchasePrice<0 || Math.abs(item.firstPurchasePrice*100-Math.round(item.firstPurchasePrice*100))>1e-6) fail('首次购买价格须为非负金额，最多两位小数')
          // v12：常规套餐 AI 积分（可选，非负整数，缺省 0；创建手工订单时默认带出）
          const credits=Number(item.credits||0)
          if(!Number.isInteger(credits) || credits<0) fail('AI 积分须为非负整数')
          item.credits=credits
        }
        // v13：套餐权益改为按资源侧可见性派生（表单不再编辑，入参 entitlements 忽略）
        item.entitlements=derivePlanEntitlements(item.id)
        // v8：套餐前台权限归一化（缺失键默认允许，仅接受布尔）
        item.frontendPerms=normalizeFrontendPerms(item.frontendPerms)
        // v17：套餐营销/积分运营字段校验与归一化（可选字段 trim 后空串/空数组归一为 undefined，缺省值补默认）
        item.tagline=String(item.tagline ?? '').trim() || undefined
        item.badge=String(item.badge ?? '').trim() || undefined
        if(item.features!==undefined) {
          if(!Array.isArray(item.features) || item.features.some(f=>typeof f!=='string')) fail('核心卖点须为字符串数组')
          const feats=item.features.map(f=>f.trim()).filter(Boolean)
          if(feats.length>20) fail('核心卖点最多 20 条')
          item.features=feats.length?feats:undefined
        }
        if(item.billingCycles!==undefined) {
          if(!Array.isArray(item.billingCycles) || item.billingCycles.length>2) fail('计费周期最多配置月付/年付两档')
          const cycles=new Set<string>()
          for(const c of item.billingCycles) {
            if(!c || typeof c!=='object' || !['MONTHLY','YEARLY'].includes(c.cycle)) fail('计费周期类型须为 MONTHLY/YEARLY')
            if(cycles.has(c.cycle)) fail('月付/年付计费周期不能重复配置')
            cycles.add(c.cycle)
            if(!Number.isFinite(Number(c.price)) || Number(c.price)<0) fail('计费周期售价须为不小于 0 的数字')
            if(c.firstPurchasePrice===null) delete c.firstPurchasePrice
            if(c.firstPurchasePrice!==undefined && (typeof c.firstPurchasePrice!=='number' || !Number.isFinite(c.firstPurchasePrice) || c.firstPurchasePrice<0 || Math.abs(c.firstPurchasePrice*100-Math.round(c.firstPurchasePrice*100))>1e-6)) fail('计费周期首购价须为非负金额，最多两位小数')
            // 规则 v0.2 拍板：无真实原价依据不配置划线价；已有值仍维护大于售价的合法性，前台展示由"真实原价可追溯"开关控制
            if(c.originalPrice!==undefined && (!(Number(c.originalPrice)>0) || Number(c.originalPrice)<=Number(c.price))) fail('计费周期划线价须大于 0 且大于该档售价')
          }
          item.billingCycles=item.billingCycles.length?item.billingCycles:undefined
        }
        const sort=Number(item.sort ?? 0)
        if(!Number.isInteger(sort) || sort<0) fail('排序须为非负整数')
        item.sort=sort
        // v17：积分发放模式（GIFT 赠送套餐强制一次性发放）与积分有效期策略（CUSTOM_DAYS 须填正整数天数，其余清空）
        item.grantMode=item.planType==='GIFT'?'ONCE':(item.grantMode==='MONTHLY'?'MONTHLY':'ONCE')
        item.creditExpiry=item.planType==='GIFT'?'NEVER':(item.creditExpiry==='MONTH_RESET'||item.creditExpiry==='CUSTOM_DAYS'?item.creditExpiry:'NEVER')
        if(item.creditExpiry==='CUSTOM_DAYS') { if(!Number.isInteger(item.creditValidityDays) || Number(item.creditValidityDays)<1) fail('自定义积分有效期须填写正整数天数') }
        else item.creditValidityDays=undefined
      }
      if(module==='expert') {
        if(!String(item.systemPrompt||'').trim()) fail('系统提示词不能为空')
        if(!String(item.baseModel||'').trim()) fail('基础模型不能为空')
        // v5：base_model 必须是模型管理中注册的基础模型（存 code）
        if(!db.models.some(m=>m.code===item.baseModel)) fail('基础模型必须是模型管理中的有效模型（存模型编码）')
        if(!String(item.description||'').trim()) fail('能力摘要不能为空')
        if(!Array.isArray(item.skillIds) || item.skillIds.some(id=>!db.skills.some(s=>s.id===id))) fail('绑定的技能不存在')
        if(!Array.isArray(item.mcpServerIds) || item.mcpServerIds.some(id=>!db.servers.some(s=>s.id===id))) fail('绑定的MCP服务器不存在')
        // 空数组保留为全量选择；失效引用必须报错，避免恢复时静默扩大调用范围。
        if(item.mcpToolSelection!==undefined && (!item.mcpToolSelection || typeof item.mcpToolSelection!=='object' || Array.isArray(item.mcpToolSelection))) fail('MCP 工具裁剪配置无效')
        {
          const sel=item.mcpToolSelection || {}
          const cleaned: Record<string, number[]>={}
          for(const [k,v] of Object.entries(sel)){
            const sid=Number(k)
            if(!(item.mcpServerIds||[]).includes(sid) || !Array.isArray(v) || v.some(id=>!db.tools.some(t=>t.id===id&&t.serverId===sid))) fail('MCP 工具裁剪引用无效，请先修正绑定')
            cleaned[k]=[...new Set(v)]
          }
          item.mcpToolSelection=Object.keys(cleaned).length?cleaned:undefined
        }
        // v7：知识库绑定校验（缺省视为空；须为知识库管理中的有效知识库）
        if(item.knowledgeBaseIds===undefined) item.knowledgeBaseIds=[]
        if(!Array.isArray(item.knowledgeBaseIds) || item.knowledgeBaseIds.some(id=>!db.knowledgeBases.some(k=>k.id===id))) fail('绑定的知识库不存在')
        if(!Array.isArray(item.suggestedQuestions) || item.suggestedQuestions.some(q=>typeof q!=='string' || !q.trim())) fail('建议问题须为非空字符串数组')
        if(!Array.isArray(item.tags) || item.tags.some(t=>typeof t!=='string' || !t.trim())) fail('标签须为非空字符串数组')
        // v14：场景分组校验（null 视为未分组；非空须为场景管理中的有效场景）
        if(item.scenarioId===null) item.scenarioId=undefined
        if(item.scenarioId!==undefined && !db.scenarios.some(s=>s.id===item.scenarioId)) fail('专家所属场景不存在')
        // v6：编排扩展字段宽松校验（标题/介绍/开场白 HTML 字符串；核心能力/参考提示词字符串数组；问题建议配置对象）
        if(item.titleHtml!==undefined && typeof item.titleHtml!=='string') fail('专家标题须为字符串')
        if(item.introduction!==undefined && typeof item.introduction!=='string') fail('专家介绍须为字符串')
        if(item.greeting!==undefined && typeof item.greeting!=='string') fail('开场白须为字符串')
        if(item.coreAbilities!==undefined && (!Array.isArray(item.coreAbilities) || item.coreAbilities.some(a=>typeof a!=='string'))) fail('核心能力须为字符串数组')
        if(item.referencePrompts!==undefined && (!Array.isArray(item.referencePrompts) || item.referencePrompts.some(a=>typeof a!=='string'))) fail('参考提示词须为字符串数组')
        if(item.introductionFiles!==undefined && (!Array.isArray(item.introductionFiles) || item.introductionFiles.some(f=>!f || typeof f.id!=='string' || typeof f.name!=='string'))) fail('介绍附件元数据无效')
        if(item.nextQuestionConfig!==undefined) {
          const nq=item.nextQuestionConfig
          if(!nq || typeof nq!=='object' || Array.isArray(nq) || typeof nq.enabled!=='boolean' || !['default','custom'].includes(nq.mode)) fail('下一步问题建议配置无效')
          if(nq.mode==='custom' && !String(nq.customPrompt||'').trim()) fail('自定义提示词模式下须填写提示词内容')
        }
        if(item.capabilities===undefined) item.capabilities=defaultCapabilities()
        const cap=item.capabilities
        if(!cap || typeof cap!=='object' || Array.isArray(cap) || Object.values(cap).some(v=>typeof v!=='boolean')) fail('能力开关须为布尔值对象')
        for(const k of Object.keys(cap)) if(!(CAPABILITY_KEYS as readonly string[]).includes(k)) fail(`未知能力开关：${k}`)
        item.capabilities=defaultCapabilities(cap as Record<string,boolean>)
        item.visibility=normalizeVisibility(item.visibility)
        if(item.isDefault!==undefined && typeof item.isDefault!=='boolean') fail('默认专家标记须为布尔值')
        if(item.mcpToolIds!==undefined && (!Array.isArray(item.mcpToolIds) || item.mcpToolIds.some(id=>!db.tools.some(t=>t.id===id && item.mcpServerIds!.includes(t.serverId))))) fail('绑定的 MCP 工具不存在或未绑定所属服务')
        if(item.isDefault && item.status!==1) fail('默认专家必须启用')
        if(old?.isDefault && !item.isDefault) fail('请通过另一专家的设为默认操作切换默认专家')
        if(!item.isDefault && items.filter(e=>e.id!==item.id && e.isDefault).length>1) fail('当前存在多个默认专家，请先通过设为默认操作修正')
      }
      if(module==='skill') {
        item.visibility=normalizeVisibility(item.visibility)
        if(!String(item.content||'').trim()) fail('SKILL.md 内容不能为空')
        if(item.files===undefined) item.files=[]
        if(!Array.isArray(item.files) || item.files.some(f=>!f || typeof f.name!=='string' || !f.name.trim() || typeof f.content!=='string')) fail('附件文件须包含名称与内容')
        if(new Set((item.files||[]).map(f=>f.name)).size!==(item.files||[]).length) fail('附件文件名不能重复')
        // v7：场景分组校验（null 视为未分组；非空须为场景管理中的有效场景）
        if(item.scenarioId===null) item.scenarioId=undefined
        if(item.scenarioId!==undefined && !db.scenarios.some(s=>s.id===item.scenarioId)) fail('技能所属场景不存在')
        // v22：归属智能体校验（null 视为未归属公共技能；非空须为有效智能体）
        if(item.agentId===null) item.agentId=undefined
        if(item.agentId!==undefined){
          const aid=Number(item.agentId)
          if(!Number.isInteger(aid) || !(db.agents||[]).some(a=>a.id===aid)) fail('归属智能体不存在')
          item.agentId=aid
        }
        const refs=db.experts.filter(e=>e.skillIds?.includes(item.id))
        if(old?.status===1 && item.status===0 && refs.length && !input.confirmReferences) fail(`技能被以下专家引用：${refs.map(r=>r.name).join('、')}；如确认停用请勾选引用确认`,409)
      }
      if(module==='mcp') {
        if(!['MCP','OpenAPI'].includes(item.connType || '')) fail('连接类型无效（MCP/OpenAPI）')
        const path=String(item.path||'').trim()
        if(path && !path.startsWith('/')) fail('端点路径须以 / 开头')
        if(item.connType==='MCP') {
          item.apiOperations=[]
          if(!['STREAMABLE_HTTP','SSE','STDIO'].includes(item.transport || '')) fail('MCP 传输类型无效')
          if(item.transport==='STDIO') { if(!item.command?.trim() || !Array.isArray(item.args) || item.args.some(a=>typeof a!=='string')) fail('STDIO 需要启动命令及字符串参数数组'); item.endpoint=''; item.path='' }
          else { try { const url=new URL(item.endpoint || ''); if(!['http:','https:'].includes(url.protocol) || url.username || url.password) fail('地址必须为HTTP(S)，不允许内嵌鉴权') } catch { fail('HTTP/SSE 地址无效') }; item.command='';item.args=[]; if(!path) item.path='/mcp' }
        } else {
          try { const url=new URL(item.endpoint || ''); if(!['http:','https:'].includes(url.protocol) || url.username || url.password) fail('地址必须为HTTP(S)，不允许内嵌鉴权') } catch { fail('OpenAPI 地址无效') }
          if(!Array.isArray(item.apiOperations)) fail('API 接口定义须为数组')
          const operations=item.apiOperations || []
          if(!operations.length) fail('请导入 OpenAPI 文件或手工添加至少一个接口')
          const names=new Set<string>();const routes=new Set<string>()
          for(const op of operations) {
            if(!op || typeof op.name!=='string' || !op.name.trim() || typeof op.path!=='string' || !op.path.startsWith('/') || !op.path.trim() || typeof op.method!=='string' || !['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE'].includes(op.method.toUpperCase()) || (op.summary!==undefined && typeof op.summary!=='string')) fail('API 接口须填写有效的名称、HTTP 方法及以 / 开头的路径')
            op.name=op.name.trim();op.method=op.method.toUpperCase();op.path=op.path.trim()
            const routeKey=`${op.method} ${op.path}`
            if(names.has(op.name) || routes.has(routeKey)) fail(`API 接口名称或方法与路径重复：${op.name}（${routeKey}）`)
            names.add(op.name);routes.add(routeKey)
          }
          item.apiOperations=operations.map(op=>({ name:op.name,method:op.method,path:op.path,summary:op.summary?.trim() || undefined }))
          item.path=path
          item.command='';item.args=[];item.transport=undefined
        }
        const auth=item.authConfig || { type:'NONE' as const }
        if(!['NONE','BEARER','API_KEY','HEADER'].includes(auth.type)) fail('鉴权类型无效')
        if(auth.credential==='******' || !auth.credential && old?.authConfig?.type===auth.type) auth.credential=old?.authConfig?.credential
        if(auth.type!=='NONE' && !auth.credential?.trim()) fail('请填写鉴权凭据')
        if((auth.type==='API_KEY'||auth.type==='HEADER') && !/^[A-Za-z0-9-]+$/.test(auth.headerName || '')) fail('请求头名称无效')
        item.authConfig=auth.type==='NONE'?{ type:'NONE' }:{...auth,credential:'MOCK_SECRET_CONFIGURED'}
        if(!Array.isArray(item.toolFilter)) item.toolFilter=[]
        if(item.toolFilter.some(t=>typeof t!=='string' || !t.trim())) fail('工具过滤清单须为非空字符串数组')
        // v9：MCP 前台可见性归一化（仅控制 C 端展示，不影响专家绑定调用；缺省视为全员可见）
        item.visibility=normalizeVisibility(item.visibility)
        if(restore) {
          if(!Array.isArray(restore.tools)) fail('该历史版本缺少工具快照，无法完整恢复；请使用包含工具快照的版本',409)
          const ids=new Set<number>();const names=new Set<string>()
          for(const tool of restore.tools) {
            if(!tool || !Number.isSafeInteger(tool.id) || tool.id<=0 || tool.serverId!==item.id || typeof tool.name!=='string' || !tool.name.trim() || typeof tool.enabled!=='boolean' || ids.has(tool.id) || names.has(tool.name)) fail('历史工具快照无效或包含重复 ID/名称')
            if((tool.method!==undefined && (typeof tool.method!=='string' || !['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE'].includes(tool.method))) || (tool.path!==undefined && (typeof tool.path!=='string' || !tool.path.startsWith('/'))) || (tool.summary!==undefined && typeof tool.summary!=='string') || (tool.source!==undefined && !['API_IMPORT','MCP_MOCK'].includes(tool.source))) fail('历史工具定义无效')
            if(db.tools.some(t=>t.id===tool.id && t.serverId!==item.id)) fail('历史工具 ID 已被其他服务占用',409)
            if(tool.enabled && item.connType==='OpenAPI' && !(item.apiOperations||[]).some(op=>op.name===tool.name && (!item.toolFilter?.length || item.toolFilter.includes(op.name)))) fail('历史启用工具与 API 定义或过滤配置不一致')
            ids.add(tool.id);names.add(tool.name)
          }
          assertToolsRemovable(db.tools.filter(t=>t.serverId===item.id && !ids.has(t.id)).map(t=>t.id))
        }
      }
      const before=old?configSnapshot(module,old):null
      const store=versionStore(module)
      const vMeta=versionMeta(ctx,ctx.body,store,item.id)
      const skipVersion=!restore && Boolean((input as Record<string,unknown>).skipVersion)
      if(!skipVersion) assertVersionNameUnique(store,item.id,vMeta.versionName)
      touch(item)
      // 至此全部校验已完成；后续同步提交内容、默认关系、工具、历史和审计。
      if(module==='expert' && item.isDefault) items.filter(e=>e.id!==item.id && e.isDefault).forEach(e=>{
        const prev=snapshot(e);e.isDefault=false;touch(e)
        const meta=versionMeta(ctx,{},db.expertVersions,e.id)
        ;(db.expertVersions[String(e.id)] ||= []).push({ version:e.version,...meta,note:'切换默认专家',createdAt:e.updatedAt,snapshot:snapshot(e) })
        audit(ctx.adminId,'expert.default','expert',e.id,prev,snapshot(e))
      })
      if(module==='mcp' && old) preserveMcpBaseline(ctx,old,vMeta.versionName)
      if(old) Object.assign(old,item); else items.push(item)
      if(module==='mcp' && restore) db.tools=[...db.tools.filter(t=>t.serverId!==item.id),...structuredClone(restore.tools!)]
      if(!skipVersion) {
        if(module==='expert') (db.promptHistory[item.id] ||= []).push({ version:item.version,systemPrompt:item.systemPrompt!,createdAt:item.updatedAt })
        ;(store[String(item.id)] ||= []).push({ version:item.version,...vMeta,note:String(input.note || (restore?`恢复自 v${restore.restoredFrom}`:old?'保存配置':'创建配置')),createdAt:item.updatedAt,snapshot:configSnapshot(module,item) })
      }
      const after={ ...publicItem(configSnapshot(module,item)),...(!skipVersion?{ versionName:vMeta.versionName }:{}),...(restore?{ restoredFrom:restore.restoredFrom }:{}) }
      audit(ctx.adminId,restore?`${module}.version.restore`:`${module}.${old?'update':'create'}`,module,item.id,before,after)
      return publicItem(item)
    }
    saveFns[module as 'plan'|'expert'|'skill'|'mcp'] = save
    route('POST',`/${kind}`,save);route('PUT',`/${kind}/:id`,save)
    route('PUT',`/${kind}/:id/status`,ctx=>save({...ctx,body:{ status:(ctx.body as Record<string,unknown>).status, confirmReferences:(ctx.body as Record<string,unknown>).confirmReferences }}))
    route('DELETE',`/${kind}/:id`,ctx=>{
      perm(ctx,`${module}:edit`);const item=find(items,ctx.params.id)
      if(module==='plan') {
        if(db.users.some(u=>u.planId===item.id) || db.orders.some(o=>o.planId===item.id)) fail('套餐已被用户或订单引用，不能删除',409)
        const by:string[]=[]
        for(const [label,resources] of [['专家',db.experts],['技能',db.skills],['MCP 服务',db.servers],['知识库',db.knowledgeBases]] as const) {
          resources.forEach(r=>{ if(r.visibility?.type==='PLAN' && r.visibility.planIds?.includes(item.id)) by.push(`${label}「${r.name}」`) })
        }
        if(by.length) fail(`套餐被以下资源的可见范围引用：${by.join('、')}；请先解除引用，不能删除`,409)
      } else if(module==='expert') {
        const by=entitledBy('EXPERT',[item.id]);if(by.length) entitledFail('专家',by)
        if(item.isDefault) fail('默认专家不能删除，请先切换其他专家为默认',409)
        if(db.chats.some(c=>c.expertId===item.id)) fail('专家存在历史会话，不能删除',409)
      } else if(module==='skill') {
        const by=entitledBy('SKILL',[item.id]);if(by.length) entitledFail('技能',by)
        const refs=db.experts.filter(e=>e.skillIds?.includes(item.id))
        if(refs.length) fail(`技能被以下专家引用：${refs.map(r=>r.name).join('、')}；请先解除引用，不能删除`,409)
      } else {
        const toolIds=db.tools.filter(t=>t.serverId===item.id).map(t=>t.id)
        const by=entitledBy('MCP_TOOL',toolIds);if(by.length) entitledFail('MCP 服务',by)
        assertToolsRemovable(toolIds)
        const refs=db.experts.filter(e=>e.mcpServerIds?.includes(item.id))
        if(refs.length) fail(`MCP 服务被专家引用（${refs.map(r=>r.name).join('、')}），不能删除`,409)
        db.tools=db.tools.filter(t=>t.serverId!==item.id)
      }
      items.splice(items.indexOf(item),1)
      audit(ctx.adminId,`${module}.delete`,module,item.id,item,null);return null
    })
    route('POST',`/${kind}/:id/refresh`,ctx=>{
      perm(ctx,`${module}:edit`);const item=find(items,ctx.params.id);const before=snapshot(item)
      const simulateFailure=Boolean((ctx.body as Record<string,unknown>)?.simulateFailure)
      item.refreshStatus=simulateFailure?'FAILED':'APPLIED';item.refreshMessage=simulateFailure?'Mock 模拟刷新失败，可重试':'Mock 刷新成功；未连接 AgentScope'
      if(!simulateFailure) item.appliedVersion=item.version
      audit(ctx.adminId,`${module}.refresh`,module,item.id,before,item);return publicItem(item)
    })
  }
  // -------------------------------------------------- 模型管理（基础 LLM 模型注册，v5；专家 base_model 由此选择）
  // api_key 保存后永不回显明文：接口只回显掩码 ****abcd；编辑留空=不修改
  const maskKey = (apiKey?: string): string => (apiKey ? `****${apiKey.slice(-4)}` : '')
  const publicModel = (m: LlmModelRow): LlmModel => {
    const { apiKey: _apiKey, ...rest } = m
    return { ...rest, modelId:m.modelId || m.code, apiKeyMasked: maskKey(m.apiKey) }
  }
  const findModel = (id:string):LlmModelRow=>db.models.find(m=>m.id===Number(id)) || fail('模型不存在',404)
  route('GET','/models',ctx=>{
    perm(ctx,'model:view')
    const keyword=String(ctx.query.keyword || '');const status=ctx.query.status==='' || ctx.query.status===undefined ? undefined:Number(ctx.query.status)
    // v6 域名区分：domain（接入地址 host）服务端筛选；domain 列表全量返回供筛选项
    const domain=String(ctx.query.domain || '').trim()
    // v5 契约：分页 + keyword/status 筛选，返回 {total, list}；按域名分组排序（同域名模型相邻）
    const list=db.models.filter(m=>(!keyword || `${m.name} ${m.code}`.includes(keyword)) && (status===undefined || m.status===status) && (!domain || hostOf(m.endpoint)===domain)).sort((a,b)=>hostOf(a.endpoint).localeCompare(hostOf(b.endpoint)) || a.id-b.id).map(publicModel)
    const page=Math.max(1,Number(ctx.query.page)||1);const pageSize=Math.min(100,Math.max(1,Number(ctx.query.pageSize)||20))
    const domains=[...new Set(db.models.map(m=>hostOf(m.endpoint)).filter(Boolean))].sort()
    return { total:list.length, list:list.slice((page-1)*pageSize,page*pageSize), domains }
  })
  route('GET','/models/:id',ctx=>{perm(ctx,'model:view');return publicModel(findModel(ctx.params.id))})
  const saveModel = (ctx:Context)=>{
    perm(ctx,'model:edit')
    const old = ctx.params.id ? findModel(ctx.params.id) : undefined
    const input=(ctx.body || {}) as Record<string,unknown>
    // code 创建后不可改（服务端强制：编辑时忽略载荷中的 code，一律保留原值）
    const code=old?old.code:String(input.code || '').trim();const name=String(input.name || '').trim();const provider=String(input.provider || '').trim()
    if(!name || !/^[a-zA-Z0-9._-]+$/.test(code)) fail('名称必填，编码仅允许字母数字点下划线短横线')
    if(!provider) fail('供应商必填（智谱/OpenAI兼容/Anthropic兼容/自定义，可扩展）')
    if(db.models.some(m=>m.id!==(old?.id ?? 0) && m.code===code)) fail('编码已存在')
    const endpoint=String(input.endpoint || '').trim()
    if(endpoint && !/^https?:\/\//i.test(endpoint)) fail('接入地址须以 http(s):// 开头')
    // default_params：JSON 对象（temperature、max_tokens 等）；未传则保留原值
    let defaultParams:Record<string,unknown> = old?.defaultParams || {}
    if(input.defaultParams!==undefined) {
      if(!input.defaultParams || typeof input.defaultParams!=='object' || Array.isArray(input.defaultParams)) fail('默认参数须为 JSON 对象')
      defaultParams=input.defaultParams as Record<string,unknown>
    }
    // api_key：填写则更新；留空/未传=不修改（新建即未配置）；状态：编辑未传沿用原值，新建/显式传入按 0|1
    const apiKey = typeof input.apiKey==='string' && input.apiKey.trim() ? input.apiKey.trim() : old?.apiKey
    const status = input.status===undefined ? (old?.status ?? 1) : (input.status===0?0:1)
    const modelId=input.modelId===undefined?(old?.modelId || code):input.modelId
    if(typeof modelId!=='string' || !modelId.trim() || /[\u0000-\u001f\u007f]/.test(modelId)) fail('供应商模型 modelId 须为非空标识，不能包含控制字符')
    if(db.models.some(m=>m.id!==old?.id && (m.endpoint||'').replace(/\/+$/,'')===endpoint.replace(/\/+$/,'') && (m.modelId||m.code)===modelId)) fail('同一接入地址的供应商模型已存在')
    const item:LlmModelRow={ id:old?.id ?? nextMockId(), code, modelId, name, provider, endpoint, apiKey, defaultParams, remark:String(input.remark || '').trim(), status, createdAt:old?.createdAt || nowStr(), updatedAt:nowStr() }
    const before=old?publicModel(old):null
    if(old) { const legacy=old as unknown as Record<string,unknown>; delete legacy.maxContext; delete legacy.capabilities; Object.assign(old,item) } else db.models.push(item)
    audit(ctx.adminId,`model.${old?'update':'create'}`,'model',item.id,before,publicModel(item))
    return publicModel(item)
  }
  route('POST','/models',saveModel);route('PUT','/models/:id',saveModel)
  // 批量接入（渠道式）：「链接 + 密钥」探测出的模型清单勾选后一次落库；共享 endpoint/apiKey/provider，同渠道按 modelId 去重，内部 code 冲突追加后缀
  route('POST','/models/batch',ctx=>{
    perm(ctx,'model:edit')
    const b=(ctx.body || {}) as Record<string,unknown>
    const arr=Array.isArray(b.items)?(b.items as Array<Record<string,unknown>>):[]
    if(!arr.length) fail('批量添加列表为空，请先探测并勾选模型')
    const provider=String(b.provider || '').trim() || 'OpenAI兼容'
    const endpoint=String(b.endpoint || '').trim()
    if(endpoint && !/^https?:\/\//i.test(endpoint)) fail('接入地址须以 http(s):// 开头')
    const apiKey=typeof b.apiKey==='string' && b.apiKey.trim() ? b.apiKey.trim() : undefined
    const status=(b.status===0?0:1) as 0|1
    const created:LlmModel[]=[];const skipped:string[]=[]
    const pending:LlmModelRow[]=[]
    for(const it of arr){
      if(!it || typeof it!=='object') fail('批量模型条目须为对象')
      const raw=String(it.code || '').trim()
      const modelId=it.modelId===undefined?raw:it.modelId
      if(typeof modelId!=='string' || !modelId.trim() || /[\u0000-\u001f\u007f]/.test(modelId)) fail('供应商模型 modelId 须为非空标识，不能包含控制字符')
      // 同渠道按原始 modelId 去重；清洗后的 code 冲突仅追加后缀，不丢失模型。
      const existing=[...db.models,...pending]
      if(existing.some(m=>(m.endpoint||'').replace(/\/+$/,'')===endpoint.replace(/\/+$/,'') && (m.modelId||m.code)===modelId)) { skipped.push(modelId);continue }
      const base=raw.replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'') || 'model'
      let code=base
      for(let n=2;existing.some(m=>m.code===code);n++) code=`${base}-${n}`
      pending.push({ id:nextMockId(), code, modelId, name:String(it.name || '').trim() || modelId, provider, endpoint, apiKey, defaultParams:{ temperature:0.7, max_tokens:4096 }, remark:String(b.remark || '').trim(), status, createdAt:nowStr(), updatedAt:nowStr() })
    }
    for(const item of pending) {
      db.models.push(item);created.push(publicModel(item))
      audit(ctx.adminId,'model.create','model',item.id,null,publicModel(item))
    }
    audit(ctx.adminId,'model.batch','model',0,null,{ requested:arr.length,created:created.length,skipped:skipped.length })
    return { created:created.length, skipped, list:created }
  })
  route('PUT','/models/:id/status',ctx=>{
    perm(ctx,'model:edit');const m=findModel(ctx.params.id)
    const status=Number((ctx.body as Record<string,unknown>)?.status)
    if(![0,1].includes(status)) fail('状态无效')
    const before=publicModel(m);m.status=status as 0|1;m.updatedAt=nowStr()
    // 事件契约：启停同保存一样发布 type=MODEL 变更事件（契约文档体现，mock 不需真实运行时）
    audit(ctx.adminId,'model.status','model',m.id,before,publicModel(m));return publicModel(m)
  })
  route('POST','/models/:id/test',ctx=>{
    perm(ctx,'model:edit');const m=findModel(ctx.params.id)
    // 连通测试为 Mock 模拟：网络可达 / 认证 / 模型可用 三项演示判定，不发真实网络请求，结果逐项展示并明示演示模拟
    const netOk=/^https:\/\//i.test(m.endpoint||'')
    const authOk=Boolean(m.apiKey)
    const modelOk=m.status===1
    const ok=netOk&&authOk&&modelOk
    const mark=(v:boolean)=>v?'✓ 通过':'✗ 未通过'
    const detail=`Mock 模拟连通测试（演示模拟，未发起真实网络请求）：网络可达 ${mark(netOk)}（${netOk?'HTTPS 接入地址有效':'接入地址缺失或非 HTTPS'}）；认证 ${mark(authOk)}（${authOk?'API Key 已配置':'未配置 API Key'}）；模型可用 ${mark(modelOk)}（${modelOk?'已启用':'已停用'}）`
    const result={ result:ok?'SUCCESS':'FAILED' as const, detail, latencyMs:80+Math.round(Math.random()*240), testedAt:nowStr() }
    audit(ctx.adminId,'model.test','model',m.id,null,{ result:result.result })
    return result
  })
  route('DELETE','/models/:id',ctx=>{
    perm(ctx,'model:edit');const m=findModel(ctx.params.id)
    // 被专家 base_model 引用时 409 硬拦截（不提供确认删除通道），提示引用专家数与清单
    const refs=db.experts.filter(e=>e.baseModel===m.code)
    if(refs.length) fail(`模型被 ${refs.length} 位专家的基础模型引用（${refs.map(r=>r.name).join('、')}），不能删除`,409)
    db.models.splice(db.models.indexOf(m),1)
    audit(ctx.adminId,'model.delete','model',m.id,publicModel(m),null);return null
  })

  // -------------------------------------------------- 专家草稿对话预览（编辑抽屉右侧实时调试，演示引擎）
  // 真实模式契约同路径：由 Java 后端按模型管理配置代理转发（OpenAI 兼容，Key 不出后端）
  route('POST','/experts/preview-chat',ctx=>{
    perm(ctx,'expert:view')
    const b=(ctx.body || {}) as Record<string,unknown>
    if(!b.draft || typeof b.draft!=='object' || Array.isArray(b.draft)) fail('draft 草稿对象不能为空')
    const draft=b.draft as PreviewDraftLike
    const message=typeof b.message==='string' ? b.message.trim() : ''
    const history=Array.isArray(b.history) ? (b.history as unknown[]).filter((h): h is {role:string;content:string} => Boolean(h) && typeof h==='object' && ['user','assistant'].includes(String((h as Record<string,unknown>).role)) && typeof (h as Record<string,unknown>).content==='string') : []
    if(!message) fail('消息不能为空')
    if(Array.isArray(b.history) && (b.history as unknown[]).length!==history.length) fail('history 须为 {role: user|assistant, content: string} 数组')
    const result=simulatePreviewChat({ draft, message, history })
    // 人为延迟 400–900ms（与 trace.latencyMs 一致，确定性）
    return new Promise(resolve=>setTimeout(()=>resolve(result),result.trace.latencyMs))
  })
  // 演示专用：预览面板「真实调用」浏览器直连需要明文 API Key（仅超管；生产走后端代理，Key 不下发浏览器）
  route('POST','/models/:id/reveal-key',ctx=>{
    perm(ctx,'model:view')
    const admin=db.admins.find(a=>a.id===ctx.adminId)
    if(!admin || !db.roles.some(r=>r.code==='SUPER_ADMIN' && admin.roleIds.includes(r.id))) fail('真实调用直连密钥仅超级管理员可获取（演示环境）',403)
    const m=findModel(ctx.params.id)
    audit(ctx.adminId,'model.key.reveal','model',m.id,null,{ revealed:true, masked:maskKey(m.apiKey) })
    return { apiKey:m.apiKey || '' }
  })

  // -------------------------------------------------- 模型端点探测（填地址 + Key 自动发现模型列表）
  // 开发模式经 Vite 本地代理 /__llm-proxy 转发（绕过浏览器 CORS，Key 仅随请求头透传不落盘）；代理不可用时回退浏览器直连。
  // 路径回退：先 {base}/models，404 再试 {base}/v1/models（兼容未带 /v1 的地址）。
  route('POST','/models/probe', async ctx=>{
    perm(ctx,'model:view')
    const b=(ctx.body || {}) as Record<string,unknown>
    const baseUrl=String(b.baseUrl || '').trim().replace(/\/+$/,'')
    const apiKey=String(b.apiKey || '').trim()
    if(!/^https?:\/\//i.test(baseUrl)) fail('接入地址须以 http(s):// 开头')
    // ---- Mock 演示端点：demo.* / *.local 域名不发真实网络请求，
    // 按「链接+密钥」直接返回该渠道模拟模型清单（演示数据，via=mock-demo）；
    // 其余地址（如内网真实网关 192.168.1.10）走下方真实拉取路径 ----
    let demoHost=''
    try { demoHost=new URL(baseUrl).hostname } catch { /* 已在上面校验过协议 */ }
    if(/^demo\.|\.local$/i.test(demoHost)) {
      const catalogs:Array<{match:RegExp, models:Array<[string,string]>}>= [
        { match:/bigmodel|zhipu/i, models:[['glm-5.3','GLM-5.3'],['glm-5.3-air','GLM-5.3-Air'],['glm-5.3-flash','GLM-5.3-Flash'],['glm-4.7','GLM-4.7'],['glm-4.7-plus','GLM-4.7-Plus'],['glm-4.5v','GLM-4.5V'],['cogview-4','CogView-4'],['cogvideox-3','CogVideoX-3'],['embedding-3','Embedding-3']] },
        { match:/openai/i, models:[['gpt-5.2','GPT-5.2'],['gpt-5.2-mini','GPT-5.2-Mini'],['gpt-4.1','GPT-4.1'],['gpt-4.1-mini','GPT-4.1-Mini'],['gpt-4o','GPT-4o'],['gpt-4o-mini','GPT-4o-Mini'],['o3','o3'],['o4-mini','o4-mini'],['text-embedding-3-large','text-embedding-3-large'],['dall-e-3','DALL·E 3'],['whisper-1','Whisper']] },
        // 兜底清单：未识别演示域名共用
        { match:/.*/, models:[['glm-5.3','GLM-5.3'],['glm-4.7','GLM-4.7'],['deepseek-v3.2','DeepSeek-V3.2'],['deepseek-r2','DeepSeek-R2'],['qwen3-max','Qwen3-Max'],['qwen-max','Qwen-Max'],['qwen-plus','Qwen-Plus'],['kimi-k2','Kimi-K2'],['doubao-seed-1.6','Doubao-Seed-1.6'],['gemini-3-pro','Gemini-3-Pro'],['claude-sonnet-4.5','Claude-Sonnet-4.5'],['gpt-4o','GPT-4o']] }
      ]
      const cat=catalogs.find(c=>c.match.test(baseUrl))!
      const models=cat.models.map(([id,name])=>({ id, displayName:name, ownedBy:demoHost }))
      return { models, resolvedUrl:`${baseUrl}/models`, via:'mock-demo（演示数据，未发起真实网络请求）' } satisfies ProbeModelsResult
    }
    const parse=(res:Response, url:string):Promise<ProbedModel[]>=>res.json().then((data:unknown)=>{
      if(!res.ok) throw new ErrorType(422, `HTTP ${res.status}`)
      const arr=(data as { data?: unknown } | null)?.data
      if(!Array.isArray(arr)) throw new ErrorType(422, `响应不是 OpenAI 兼容 {data:[{id}]} 结构`)
      return (arr as Array<Record<string,unknown>>).map(m=>({ id:String(m.id || ''), displayName:String(m.display_name || m.name || m.id || ''), ownedBy:m.owned_by?String(m.owned_by):undefined })).filter(m=>m.id)
    }).catch(async(e:unknown)=>{
      if(e instanceof ErrorType) throw e
      throw new ErrorType(422, `HTTP ${res.status}（${url} 响应解析失败）`)
    })
    // 代理路径约定：/__llm-proxy/<相对 baseUrl 的路径>（如 /models），由代理拼接 `${baseUrl}${path}`；勿用 URL.pathname（会把 base 自带的 /v1 重复拼入）
    // 仅开发模式尝试该通道：线上静态站无此代理（GitHub Pages 会以 404 HTML 应答，徒增「响应解析失败」困惑）
    // https 页面直连 http 渠道必被浏览器混合内容拦截（实测 fetch 挂起数十秒不失败），直接短路给出明确指引
    if(location.protocol==='https:' && /^http:\/\//i.test(baseUrl)) fail(`线上站点为 https，浏览器禁止直连 http 渠道（${baseUrl}）。真实拉取请在开发模式（npm run dev，本地 /#/models）使用，或由后端提供代理端点（/admin/api/models/probe）。`, 422)
    const attempts:Array<{label:string, run:(url:string)=>Promise<Response>}>=[
      ...(import.meta.env.DEV ? [{ label:'vite-dev-proxy', run:(url:string):Promise<Response>=>fetch(`/__llm-proxy${url.startsWith(baseUrl)?url.slice(baseUrl.length):new URL(url).pathname}`, { headers:{ 'Content-Type':'application/json', ...(apiKey?{ Authorization:`Bearer ${apiKey}` }:{}) , 'x-llm-base-url':baseUrl } }) }] : []),
      // 直连加 15s 超时：网关不可达/被浏览器拦截时 fetch 可能长时间挂起，超时转为可控失败
      { label:'direct', run:(url:string)=>{ const c=new AbortController(); const t=setTimeout(()=>c.abort(), 15000); return fetch(url, { headers:{ 'Content-Type':'application/json', ...(apiKey?{ Authorization:`Bearer ${apiKey}` }:{}) }, signal:c.signal }).finally(()=>clearTimeout(t)) } }
    ]
    const candidates=[`${baseUrl}/models`, ...(/\/v\d+$/.test(baseUrl)?[]:[`${baseUrl}/v1/models`])]
    const errors:string[]=[]
    for(const url of candidates) for(const a of attempts) {
      try {
        const models=await parse(await a.run(url), url)
        return { models, resolvedUrl:url, via:a.label } satisfies ProbeModelsResult
      } catch(e) {
        const msg=e instanceof ErrorType ? e.message : (e as Error).name==='AbortError' ? '请求超时（15s 无响应，可能被浏览器拦截或网关不可达）' : String(e)
        errors.push(`[${a.label}] ${url}：${msg}`)
      }
    }
    // 线上静态站（https）直连 http 内网渠道必被混合内容 + CORS 双重拦截，属部署形态限制而非配置错误，提示应指向可行路径
    const hint=import.meta.env.DEV
      ? '提示：请确认地址为 OpenAI 兼容端点（如 http://host:8080/v1）且密钥有效；浏览器直连失败多为 CORS 拦截。'
      : '提示：线上静态站点受浏览器 CORS 与 https 混合内容限制，无法直连内网渠道；真实拉取请在开发模式（npm run dev，本地 /#/models）使用，或由后端提供代理端点（/admin/api/models/probe）。'
    fail(`模型探测失败。${errors.join('；')}。${hint}`, 422)
  })

  route('PUT','/experts/:id/default',ctx=>saveFns.expert!({...ctx,body:{ isDefault:true,note:'设为默认专家' }}))
  route('GET','/experts/:id/prompt-versions',ctx=>{perm(ctx,'expert:view');find(db.experts,ctx.params.id);return (db.promptHistory[ctx.params.id] || []).map(h=>({ ...h, systemPrompt:String(redact(h.systemPrompt)) }))})

  // -------------------------------------------------- 版本历史（专家全量 / 技能 SKILL.md）
  // v5：versionName 留空时默认「恢复自 <源版本名>」（源版本无名称则用 v{N}）
  const restoreNameOf = (input:Record<string,unknown>, hist:ConfigVersion):string=>{
    const custom=String((input as Record<string,unknown>).versionName || '').trim()
    return custom || `恢复自 ${hist.versionName || `v${hist.version}`}`
  }
  const restoreVersion = (ctx:Context, module:Module, items:ConfigItem[]) => {
    perm(ctx,`${module}:edit`)
    const item=find(items,ctx.params.id)
    const input=(ctx.body || {}) as Record<string,unknown>
    const store=versionStore(module)
    const hist=(store[String(item.id)] || []).find(v=>v.version===Number(input.version))
    if(!hist) fail('版本不存在',404)
    let versionName=restoreNameOf(input,hist)
    if(!String(input.versionName || '').trim()) {
      const base=versionName
      for(let n=2;(store[String(item.id)] || []).some(v=>v.versionName===versionName);n++) versionName=`${base}-${n}`
    }
    const snap=snapshot(hist.snapshot)
    if(module==='mcp' && snap.tools===undefined && hist.version===item.version) snap.tools=structuredClone(db.tools.filter(t=>t.serverId===item.id))
    return saveFns[module]!({...ctx,body:{ versionName,note:input.note,confirmReferences:input.confirmReferences }},{ snapshot:snap,restoredFrom:hist.version,tools:snap.tools })
  }
  route('GET','/experts/:id/versions',ctx=>{perm(ctx,'expert:view');const item=find(db.experts,ctx.params.id);return (db.expertVersions[String(item.id)] || []).slice().sort((a,b)=>b.version-a.version).map(v=>({ ...v, snapshot:publicItem(v.snapshot) }))})
  route('POST','/experts/:id/restore',ctx=>restoreVersion(ctx,'expert',db.experts))
  route('GET','/skills/:id/versions',ctx=>{perm(ctx,'skill:view');const item=find(db.skills,ctx.params.id);return (db.skillVersions[String(item.id)] || []).slice().sort((a,b)=>b.version-a.version).map(v=>({ ...v, snapshot:publicItem(v.snapshot) }))})
  route('POST','/skills/:id/restore',ctx=>restoreVersion(ctx,'skill',db.skills))

  // -------------------------------------------------- 套餐版本历史（v17 补齐：营销/计费字段快照，恢复生成新版本）
  route('GET','/plans/:id/versions',ctx=>{perm(ctx,'plan:view');const item=find(db.plans,ctx.params.id);return (db.planVersions[String(item.id)] || []).slice().sort((a,b)=>b.version-a.version).map(v=>({ ...v, snapshot:publicItem(v.snapshot) }))})
  route('POST','/plans/:id/restore',ctx=>restoreVersion(ctx,'plan',db.plans))

  // -------------------------------------------------- MCP 版本历史（v5 补齐：连接配置与工具绑定快照，恢复生成新版本）
  route('GET','/mcp/servers/:id/versions',ctx=>{perm(ctx,'mcp:view');const item=find(db.servers,ctx.params.id);return (db.mcpVersions[String(item.id)] || []).slice().sort((a,b)=>b.version-a.version).map(v=>({ ...v, snapshot:publicItem(v.snapshot) }))})
  route('POST','/mcp/servers/:id/restore',ctx=>restoreVersion(ctx,'mcp',db.servers))

  // -------------------------------------------------- v17：积分加油包商品 + 全局计费设置（复用套餐权限）
  const saveCreditPackage = (ctx:Context)=>{
    perm(ctx,'plan:edit')
    const old=ctx.params.id?db.creditPackages.find(p=>p.id===Number(ctx.params.id)) || fail('加油包不存在',404):undefined
    const input=(ctx.body || {}) as Record<string,unknown>
    const name=String(input.name || '').trim()
    if(!name) fail('加油包名称必填')
    const credits=Number(input.credits ?? 0)
    if(!Number.isInteger(credits) || credits<=0) fail('积分数量须为大于 0 的整数')
    // R02 拍板：付费积分包一律无赠送积分；购买赠分属常规促销，已移除，运营特批走订单特批并审计
    const bonusCredits=Number(input.bonusCredits ?? 0)
    if(!Number.isInteger(bonusCredits) || bonusCredits!==0) fail('按已拍板规则，付费积分包不含赠送积分，请保持赠送积分为 0；运营特批请走订单特批流程')
    const price=Number(input.price ?? 0)
    if(!Number.isFinite(price) || price<0) fail('售价须为不小于 0 的数字')
    const originalPrice=input.originalPrice===undefined || input.originalPrice===null?undefined:Number(input.originalPrice)
    if(originalPrice!==undefined && (!(originalPrice>0) || originalPrice<=price)) fail('划线价须为大于 0 且大于售价的数字')
    const badge=String(input.badge || '').trim()
    const sort=Number(input.sort ?? 0)
    if(!Number.isInteger(sort) || sort<0) fail('排序须为非负整数')
    const status=input.status===undefined?(old?.status ?? 1):(input.status===0?0:1)
    if(![0,1].includes(status)) fail('状态无效')
    const remark=String(input.remark || '').trim()
    if(remark.length>200) fail('备注最多 200 字')
    const item:CreditPackage= old
      ? { ...old, name, credits, bonusCredits, price, originalPrice, badge:badge||undefined, sort, status:status as 0|1, remark:remark||undefined, updatedAt:nowStr() }
      : { id:nextMockId(), name, credits, bonusCredits, price, originalPrice, badge:badge||undefined, sort, status:status as 0|1, remark:remark||undefined, createdAt:nowStr(), updatedAt:nowStr() }
    const before=old?structuredClone(old):null
    if(old) Object.assign(old,item); else db.creditPackages.push(item)
    audit(ctx.adminId,`credit-package.${old?'update':'create'}`,'credit_package',item.id,before,structuredClone(item));return item
  }
  route('GET','/credit-packages',ctx=>{perm(ctx,'plan:view');return [...db.creditPackages].sort((a,b)=>a.sort-b.sort || a.id-b.id)})
  route('POST','/credit-packages',saveCreditPackage);route('PUT','/credit-packages/:id',saveCreditPackage)
  route('DELETE','/credit-packages/:id',ctx=>{perm(ctx,'plan:edit');const item=db.creditPackages.find(p=>p.id===Number(ctx.params.id)) || fail('加油包不存在',404);db.creditPackages.splice(db.creditPackages.indexOf(item),1);audit(ctx.adminId,'credit-package.delete','credit_package',item.id,item,null);return null})

  route('GET','/billing-settings',ctx=>{perm(ctx,'plan:view');if(!db.billingSettings) db.billingSettings=seedBillingSettings();return db.billingSettings})
  route('PUT','/billing-settings',ctx=>{
    perm(ctx,'plan:edit')
    const input=(ctx.body || {}) as Record<string,unknown>
    const before=db.billingSettings?{ ...db.billingSettings }:null
    const registerBonus=Number(input.registerBonus)
    if(!Number.isInteger(registerBonus) || registerBonus<0) fail('注册赠送积分须为非负整数')
    // R02 拍板：注册仅赠送 100 分一批，无其他注册赠分来源；运营特批/反馈奖励属独立特批，不走该配置
    if(registerBonus!==100) fail('按已拍板规则，注册赠送积分固定为 100；运营特批请走订单特批流程并审计')
    // R01 拍板：升级按实付价折算补差、负数取 0；FULL_PRICE 不再是可选策略，旧枚举仅作迁移兼容
    if(String(input.upgradePolicy)!=='PRORATED') fail('按已拍板规则，升级计费固定为按实付价折算（PRORATED），不支持整价重购')
    const slider=(input.creditSlider && typeof input.creditSlider==='object' && !Array.isArray(input.creditSlider)?input.creditSlider:{}) as Record<string,unknown>
    if(typeof slider.enabled!=='boolean') fail('积分滑杆开关须为布尔值')
    const min=Number(slider.min);const max=Number(slider.max);const step=Number(slider.step)
    const unitPrice=Number(slider.unitPrice)
    const defaultValue=Number(slider.defaultValue ?? min)
    // v21 阶梯单价：升序区间 tiers（命中"≥min"的最大档），与前台"量大更优惠、总价随数量单调不减"拍板口径一致。
    // 兼容：未传 tiers 时按单价的单一区间（unitPrice 为最低档）生成；tiers 有值时以 tiers 为准并回写 unitPrice=最低档。
    let tiersIn: Array<{min:number;rate:number}> | undefined
    if(Array.isArray(slider.tiers) && slider.tiers.length){
      tiersIn=slider.tiers.map(t=>({ min:Number((t as Record<string,unknown>).min), rate:Number((t as Record<string,unknown>).rate) }))
      if(!tiersIn.every(t=>Number.isSafeInteger(t.min) && t.min>0 && Number.isFinite(t.rate) && t.rate>0)) fail('阶梯区间须为正整数起购量与大于 0 的单价')
      // 区间按 min 升序去重，起购量须落在滑杆范围内且与步长对齐
      tiersIn.sort((a,b)=>a.min-b.min)
      if(new Set(tiersIn.map(t=>t.min)).size!==tiersIn.length) fail('阶梯起购量不能重复')
      if(tiersIn[0]!.min!==min) fail('最低档起购量须等于滑杆下限')
      if(tiersIn.some(t=>(t.min-min)%step!==0)) fail('阶梯起购量须从下限起按步长对齐')
      // 单价随档位递减（量大更优惠），且任意两档按各自单价算总价不得倒挂：min2×rate2 ≥ min1×rate1
      for(let i=1;i<tiersIn.length;i++){
        if(tiersIn[i]!.rate>tiersIn[i-1]!.rate) fail('高档单价须不高于低档单价（量大更优惠）')
        if(Math.round(tiersIn[i]!.min*tiersIn[i]!.rate*100) < Math.round(tiersIn[i-1]!.min*tiersIn[i-1]!.rate*100)) fail('阶梯总价须随数量单调不减，请调整档位单价')
      }
      if(Math.round(max*tiersIn[tiersIn.length-1]!.rate*100) < Math.round(tiersIn[tiersIn.length-1]!.min*tiersIn[tiersIn.length-1]!.rate*100)) fail('上限总价不得低于最高档起购总价')
    }
    const tiers = tiersIn && tiersIn.length ? tiersIn : [{ min, rate: unitPrice }]
    const effectiveUnitPrice = tiers[0]!.rate
    if(slider.enabled) {
      if(![min,max,step].every(v=>Number.isSafeInteger(v) && v>0) || min>=max || (max-min)%step!==0) fail('滑杆范围须为正整数、min 小于 max，且步长能整除范围差值')
      if(!Number.isSafeInteger(defaultValue) || defaultValue<min || defaultValue>max || (defaultValue-min)%step!==0) fail('默认积分须在范围内且从下限起按步长对齐')
      if(!Number.isFinite(effectiveUnitPrice) || effectiveUnitPrice<=0) fail('积分单价须为大于 0 的数字')
    } else if(![min,max,step,defaultValue].every(v=>Number.isSafeInteger(v) && v>=0) || !Number.isFinite(effectiveUnitPrice) || effectiveUnitPrice<0) fail('停用滑杆参数须为非负数')
    const item: BillingSettings = { registerBonus, upgradePolicy:String(input.upgradePolicy) as BillingSettings['upgradePolicy'], creditSlider:{ enabled:slider.enabled===true, min, max, step, defaultValue, unitPrice:effectiveUnitPrice, tiers } }
    db.billingSettings=item
    audit(ctx.adminId,'billing-settings.update','billing_settings',0,before,item);return db.billingSettings
  })

  // -------------------------------------------------- 导出 / 导入 / 克隆（预设迁移，凭据脱敏）
  const exportPayload = (item:ConfigItem)=>{ const { id:_i,version:_v,appliedVersion:_a,refreshStatus:_r,refreshMessage:_m,updatedAt:_u,...rest }=item; return rest }
  /** v5：导出 JSON 附当前版本名称 versionName（含 platforms 业务字段），导入时随载荷进入版本历史 */
  const latestVersionNameOf = (store: Record<string, ConfigVersion[]> | undefined, id: number | string): string => (store?.[String(id)] || []).slice().sort((a,b)=>b.version-a.version)[0]?.versionName || ''
  route('GET','/experts/:id/export',ctx=>{perm(ctx,'expert:export');const item=find(db.experts,ctx.params.id);audit(ctx.adminId,'expert.export','expert',item.id,null,{ code:item.code });return { filename:`expert-${item.code}.json`, content:JSON.stringify({ ...exportPayload(item), versionName:latestVersionNameOf(db.expertVersions,item.id) },null,2) }})
  route('GET','/skills/:id/export',ctx=>{perm(ctx,'skill:export');const item=find(db.skills,ctx.params.id);audit(ctx.adminId,'skill.export','skill',item.id,null,{ code:item.code });return { filename:`skill-${item.code}.json`, content:JSON.stringify({ ...exportPayload(item), versionName:latestVersionNameOf(db.skillVersions,item.id) },null,2) }})
  route('POST','/experts/import',ctx=>{
    perm(ctx,'expert:edit');const payload=ctx.body as Partial<ConfigItem>
    if(!payload || typeof payload!=='object' || Array.isArray(payload)) fail('导入内容须为专家预设 JSON 对象')
    const code=String(payload.code||'').trim()
    if(!code) fail('导入 JSON 缺少 code 字段')
    if(db.experts.some(i=>i.code===code)) fail(`编码 ${code} 已存在，导入失败；请先修改导出文件中的 code`,409)
    return saveFns.expert!({...ctx, params:{}, body:payload })
  })
  route('POST','/skills/import',ctx=>{
    perm(ctx,'skill:edit');const payload=ctx.body as Partial<ConfigItem>
    if(!payload || typeof payload!=='object' || Array.isArray(payload)) fail('导入内容须为技能 JSON 对象')
    const code=String(payload.code||'').trim()
    if(!code) fail('导入 JSON 缺少 code 字段')
    if(db.skills.some(i=>i.code===code)) fail(`编码 ${code} 已存在，导入失败；请先修改导出文件中的 code`,409)
    return saveFns.skill!({...ctx, params:{}, body:payload })
  })
  route('POST','/skills/:id/clone',ctx=>{
    perm(ctx,'skill:clone');const src=find(db.skills,ctx.params.id)
    let code=`${src.code}_copy`;let n=2
    while(db.skills.some(s=>s.code===code)) code=`${src.code}_copy${n++}`
    const body={ ...JSON.parse(JSON.stringify(src)), code, name:`${src.name} 副本`, status:0, note:`克隆自 ${src.code}` } as Partial<ConfigItem>
    return saveFns.skill!({...ctx, params:{}, body })
  })

  // -------------------------------------------------- 技能统计 / MCP 工具与连接
  route('GET','/skills/:id/stats',ctx=>{perm(ctx,'skill:view');const item=find(db.skills,ctx.params.id);const calls=db.skillCalls.filter(c=>c.skillId===item.id && Date.now()-Date.parse(c.createdAt)<=30*86400000);return { calls7:calls.filter(c=>Date.now()-Date.parse(c.createdAt)<=7*86400000).length,calls30:calls.length,successRate:calls.length?calls.filter(c=>c.success).length/calls.length:0,source:'Mock 本地调用记录' }})
  route('GET','/mcp/tools',ctx=>{if(!['mcp:view','expert:view'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限执行该操作',403);return db.tools})
  route('PUT','/mcp/tools/:id/enabled',ctx=>{
    perm(ctx,'mcp:edit')
    const tool=db.tools.find(t=>t.id===Number(ctx.params.id)) || fail('工具不存在',404)
    const input=(ctx.body || {}) as Record<string,unknown>
    const enabled=input.enabled
    if(typeof enabled!=='boolean') fail('enabled须为布尔值')
    const before=structuredClone(tool)
    const server=find(db.servers,String(tool.serverId))
    if(enabled && server.connType==='OpenAPI' && !(server.apiOperations||[]).some(op=>op.name===tool.name && (!server.toolFilter?.length || server.toolFilter.includes(op.name)))) fail('接口定义已移除或被过滤，请重新导入并发现工具')
    const vMeta=versionMeta(ctx,input,db.mcpVersions,server.id)
    assertVersionNameUnique(db.mcpVersions,server.id,vMeta.versionName)
    preserveMcpBaseline(ctx,server,vMeta.versionName)
    tool.enabled=enabled;touch(server)
    ;(db.mcpVersions[String(server.id)] ||= []).push({ version:server.version,...vMeta,note:String(input.note||'更新工具启用状态'),createdAt:server.updatedAt,snapshot:configSnapshot('mcp',server) })
    audit(ctx.adminId,'mcp.tool.enabled','mcp_tool',tool.id,before,structuredClone(tool))
    return tool
  })
  route('POST','/mcp/servers/:id/discover',ctx=>{
    perm(ctx,'mcp:edit');const item=find(db.servers,ctx.params.id)
    if(item.status!==1) fail('请先启用服务')
    const filter=(item.toolFilter||[]).filter(t=>t.trim())
    const input=(ctx.body || {}) as Record<string,unknown>
    const vMeta=versionMeta(ctx,input,db.mcpVersions,item.id)
    assertVersionNameUnique(db.mcpVersions,item.id,vMeta.versionName)
    preserveMcpBaseline(ctx,item,vMeta.versionName)
    if(item.connType==='OpenAPI') {
      const operations=(item.apiOperations||[]).filter(op=>!filter.length || filter.includes(op.name))
      const names=new Set(operations.map(op=>op.name))
      for(const tool of db.tools.filter(t=>t.serverId===item.id)) {
        if(!names.has(tool.name)) { tool.enabled=false;continue }
        const op=operations.find(o=>o.name===tool.name)!
        Object.assign(tool,{ method:op.method,path:op.path,summary:op.summary,source:'API_IMPORT' as const })
      }
      for(const op of operations) if(!db.tools.some(t=>t.serverId===item.id && t.name===op.name)) db.tools.push({ id:nextMockId(),serverId:item.id,name:op.name,enabled:true,method:op.method,path:op.path,summary:op.summary,source:'API_IMPORT' })
      touch(item)
      audit(ctx.adminId,'mcp.discover','mcp',item.id,null,{ generated:[...names],source:'已导入 API 定义；未调用用户 API' })
    } else {
      const PLATFORM_TOOLS:Record<string,string[]>={ amazon:['amazon_bsr_ranking','amazon_sales_estimate','amazon_reviews_fetch'], ozon:['ozon_category_filter','ozon_product_search','ozon_price_history'], temu:['temu_product_search','temu_price_trend','temu_reviews'], echotik:['echotik_video_search','echotik_influencer_ranklist','echotik_live_list'], tiktok:['tiktok_shop_ranking','tiktok_video_search'], ali:['ali_product_search','ali_keyword_trend','ali_shop_rank','ali_billboard_list'], dld:['ali_product_search','ali_keyword_trend','ali_shop_rank','ali_billboard_list'] }
      const key=Object.keys(PLATFORM_TOOLS).find(k=>String(item.code).toLowerCase().includes(k))
      const sampleNames=key?PLATFORM_TOOLS[key]:['product_search','product_detail','keyword_trend','seller_search','category_tree']
      const names=filter.length?sampleNames.filter(n=>filter.includes(n)):sampleNames
      for(const tool of db.tools.filter(t=>t.serverId===item.id && t.source==='API_IMPORT')) tool.enabled=false
      for(const name of names) {
        const existing=db.tools.find(t=>t.serverId===item.id && t.name===name)
        if(existing?.source==='API_IMPORT') Object.assign(existing,{ enabled:true,source:'MCP_MOCK' as const,method:undefined,path:undefined,summary:undefined })
        else if(!existing) db.tools.push({ id:nextMockId(), serverId:item.id, name, enabled:true, source:'MCP_MOCK' })
      }
      touch(item)
      audit(ctx.adminId,'mcp.discover','mcp',item.id,null,{ generated:names,source:'MCP Mock 示例工具，无网络调用' })
    }
    ;(db.mcpVersions[String(item.id)] ||= []).push({ version:item.version,...vMeta,note:String(input.note||'发现工具'),createdAt:item.updatedAt,snapshot:configSnapshot('mcp',item) })
    return db.tools.filter(t=>t.serverId===item.id)
  })
  route('POST','/mcp/servers/:id/health-check',ctx=>{perm(ctx,'mcp:edit');const item=find(db.servers,ctx.params.id);item.healthStatus=item.status===1?'HEALTHY':'UNAVAILABLE';item.lastHealthAt=nowStr();item.healthDetail='Mock 模拟检查，未请求真实服务';audit(ctx.adminId,'mcp.health','mcp',item.id,null,{healthStatus:item.healthStatus});return publicItem(item)})
  route('POST','/mcp/servers/:id/test-connection',ctx=>{
    perm(ctx,'mcp:edit');const item=find(db.servers,ctx.params.id)
    const auth=item.authConfig
    const authOk=!auth || auth.type==='NONE' || Boolean(auth.credential)
    const httpsOk=/^https:\/\//i.test(item.endpoint||'')
    const healthy=item.status===1 && httpsOk && authOk
    item.healthStatus=healthy?'HEALTHY':'UNAVAILABLE'
    item.lastHealthAt=nowStr()
    item.healthDetail=healthy?'Mock 连接测试通过：HTTPS 地址且鉴权配置完整':`Mock 连接失败：${item.status!==1?'服务未启用':!httpsOk?'地址非 HTTPS（演示规则要求 https）':'鉴权凭据缺失'}`
    audit(ctx.adminId,'mcp.test','mcp',item.id,null,{ healthStatus:item.healthStatus })
    return { healthStatus:item.healthStatus, healthDetail:item.healthDetail, lastHealthAt:item.lastHealthAt }
  })

  // -------------------------------------------------- v7：技能场景（平台→场景 两级分组；技能通过 scenarioId 归入场景）
  route('GET','/scenarios',ctx=>{if(!['skill:view','expert:view'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限执行该操作',403);const order=(p:PlatformType)=>PLATFORMS.indexOf(p);return [...db.scenarios].sort((a,b)=>order(a.platformId)-order(b.platformId) || a.id-b.id)})
  const saveScenario=(ctx:Context)=>{
    if(!['skill:edit','expert:edit'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限执行该操作',403)
    const old=ctx.params.id?db.scenarios.find(s=>s.id===Number(ctx.params.id)):undefined
    const input=(ctx.body||{}) as Record<string,unknown>
    const name=String(input.name||'').trim()
    const platformId=String(input.platformId||'')
    if(!name) fail('场景名称必填')
    if(!PLATFORMS.includes(platformId as PlatformType)) fail('所属平台无效')
    if(db.scenarios.some(s=>s.id!==old?.id && s.platformId===platformId && s.name===name)) fail('同一平台下场景名称已存在')
    const item:Scenario = old ? { ...old, name, platformId:platformId as PlatformType, description:String(input.description||'').trim(), updatedAt:nowStr() } : { id:nextMockId(), name, platformId:platformId as PlatformType, description:String(input.description||'').trim(), createdAt:nowStr(), updatedAt:nowStr() }
    if(old) Object.assign(old,item); else db.scenarios.push(item)
    audit(ctx.adminId,`scenario.${old?'update':'create'}`,'scenario',item.id,old||null,item);return item
  }
  route('POST','/scenarios',saveScenario);route('PUT','/scenarios/:id',saveScenario)
  // -------------------------------------------------- v22：智能体（技能归属维度；与平台/场景正交，各智能体互不关联）
  route('GET','/agents',ctx=>{if(!['skill:view','expert:view'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限执行该操作',403);return [...(db.agents||[])].sort((a,b)=>(a.sort??0)-(b.sort??0) || a.id-b.id)})
  route('DELETE','/scenarios/:id',ctx=>{
    if(!['skill:edit','expert:edit'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限执行该操作',403);const item=db.scenarios.find(s=>s.id===Number(ctx.params.id)) || fail('场景不存在',404)
    const refs=[...db.skills.filter(sk=>sk.scenarioId===item.id).map(sk=>`技能「${sk.name}」`),...db.experts.filter(ex=>ex.scenarioId===item.id).map(ex=>`专家「${ex.name}」`)]
    if(refs.length) fail(`场景被以下资源引用：${refs.join('、')}；请先解除引用，不能删除`,409)
    db.scenarios.splice(db.scenarios.indexOf(item),1)
    audit(ctx.adminId,'scenario.delete','scenario',item.id,item,null);return null
  })

  // -------------------------------------------------- v7/v8：知识库（专家可绑定；knowledge:edit 管理，expert:view 可读列表供编排选择；v8 文档数实时统计 + 访问权限）
  /** v8：文档字节数（与前端展示一致） */
  const fileSizeOf=(content:string)=>new TextEncoder().encode(content).length
  /** v8：文档数按 kbFiles 实时统计，替代旧的手填 fileCount */
  const kbWithCount=(kb:KnowledgeBase)=>({ ...kb, fileCount:db.kbFiles.filter(f=>f.kbId===kb.id).length })
  route('GET','/knowledge-bases',ctx=>{if(!['knowledge:view','expert:view'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限执行该操作',403);return db.knowledgeBases.map(kbWithCount)})
  const saveKb=(ctx:Context)=>{
    perm(ctx,'knowledge:edit')
    const old=ctx.params.id?db.knowledgeBases.find(k=>k.id===Number(ctx.params.id)):undefined
    const input=(ctx.body||{}) as Record<string,unknown>
    const name=String(input.name||'').trim()
    if(!name) fail('知识库名称必填')
    const platform=String(input.platform||'').trim()
    if(platform && !PLATFORMS.includes(platform as PlatformType)) fail('所属平台无效')
    // v14：前端可见性归一化（与专家/MCP 同款三段；旧调用方只传 access=PRIVATE 时兼容）→ access 由其派生（旧消费方兼容）
    const visibility=normalizeVisibility(input.visibility!==undefined ? input.visibility as ConfigItem['visibility'] : input.access!==undefined ? { type:input.access==='PRIVATE'?'PRIVATE':'PUBLIC',planIds:[] } : old?.visibility)
    const access=visibility.type==='PRIVATE'?'PRIVATE':'PUBLIC'
    const tags=Array.isArray(input.tags)?input.tags.map(t=>String(t).trim()).filter(Boolean):[]
    const item:KnowledgeBase = old ? { ...old, name, description:String(input.description||'').trim(), platform:(platform||undefined) as PlatformType|undefined, access, visibility, tags, updatedAt:nowStr() } : { id:nextMockId(), name, description:String(input.description||'').trim(), platform:(platform||undefined) as PlatformType|undefined, access, visibility, tags, fileCount:0, status:1, createdAt:nowStr(), updatedAt:nowStr() }
    if(old) Object.assign(old,item); else db.knowledgeBases.push(item)
    audit(ctx.adminId,`knowledge.${old?'update':'create'}`,'knowledge',item.id,old||null,item);return item
  }
  route('POST','/knowledge-bases',saveKb);route('PUT','/knowledge-bases/:id',saveKb)
  route('PUT','/knowledge-bases/:id/status',ctx=>{
    perm(ctx,'knowledge:edit');const item=db.knowledgeBases.find(k=>k.id===Number(ctx.params.id)) || fail('知识库不存在',404)
    const status=Number((ctx.body as Record<string,unknown>).status)
    if(![0,1].includes(status)) fail('状态无效')
    const before={...item};item.status=status;item.updatedAt=nowStr()
    audit(ctx.adminId,'knowledge.status','knowledge',item.id,before,item);return item
  })
  route('DELETE','/knowledge-bases/:id',ctx=>{
    perm(ctx,'knowledge:edit');const item=db.knowledgeBases.find(k=>k.id===Number(ctx.params.id)) || fail('知识库不存在',404)
    const refs=db.experts.filter(e=>e.knowledgeBaseIds?.includes(item.id))
    if(refs.length) fail(`知识库被以下专家引用：${refs.map(r=>r.name).join('、')}；请先解除引用，不能删除`,409)
    // v8：级联删除库内文档
    db.kbFiles=db.kbFiles.filter(f=>f.kbId!==item.id)
    db.knowledgeBases.splice(db.knowledgeBases.indexOf(item),1)
    audit(ctx.adminId,'knowledge.delete','knowledge',item.id,item,null);return null
  })

  // -------------------------------------------------- v8：知识库文档 CRUD（Open WebUI 风格：文件名 + 内容 + 大小；512KB 上限防 localStorage 爆量）
  const KB_FILE_LIMIT=512*1024
  route('GET','/knowledge-bases/:id/files',ctx=>{
    if(!['knowledge:view','expert:view'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限执行该操作',403)
    const kb=db.knowledgeBases.find(k=>k.id===Number(ctx.params.id)) || fail('知识库不存在',404)
    return db.kbFiles.filter(f=>f.kbId===kb.id).map(f=>({...f,size:fileSizeOf(f.content)}))
  })
  const saveKbFile=(ctx:Context)=>{
    perm(ctx,'knowledge:edit')
    const kb=db.knowledgeBases.find(k=>k.id===Number(ctx.params.id)) || fail('知识库不存在',404)
    const input=(ctx.body||{}) as Record<string,unknown>
    const old=ctx.params.fileId?db.kbFiles.find(f=>f.id===Number(ctx.params.fileId)&&f.kbId===kb.id) || fail('文档不存在',404):undefined
    const name=String(input.name||'').trim()
    if(!name) fail('文档名称必填')
    const content=String(input.content??'')
    if(new TextEncoder().encode(content).length>KB_FILE_LIMIT) fail('文档内容超过 512KB 上限')
    const item:KnowledgeFile={ ...(old||{ id:nextMockId(),kbId:kb.id,name:'',content:'',size:0,createdAt:nowStr(),updatedAt:nowStr() }), name, content, size:fileSizeOf(content), updatedAt:nowStr() }
    if(old) Object.assign(old,item); else db.kbFiles.push(item)
    kb.updatedAt=nowStr()
    audit(ctx.adminId,`knowledge.file.${old?'update':'create'}`,'knowledge_file',item.id,old?{name:old.name}:null,{name,kbId:kb.id});return item
  }
  route('POST','/knowledge-bases/:id/files',saveKbFile);route('PUT','/knowledge-bases/:id/files/:fileId',saveKbFile)
  route('DELETE','/knowledge-bases/:id/files/:fileId',ctx=>{
    perm(ctx,'knowledge:edit')
    const kb=db.knowledgeBases.find(k=>k.id===Number(ctx.params.id)) || fail('知识库不存在',404)
    const item=db.kbFiles.find(f=>f.id===Number(ctx.params.fileId)&&f.kbId===kb.id) || fail('文档不存在',404)
    db.kbFiles.splice(db.kbFiles.indexOf(item),1)
    kb.updatedAt=nowStr()
    audit(ctx.adminId,'knowledge.file.delete','knowledge_file',item.id,{name:item.name},null);return null
  })
}
