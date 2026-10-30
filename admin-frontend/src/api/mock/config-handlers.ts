import { db, nextMockId, nowStr, stampStr, permissionCodesOf } from './db'
import { CAPABILITY_KEYS, defaultCapabilities, PLATFORM_VALUES, redact } from './extension-data'
import type { LlmModelRow } from './extension-data'
import { simulatePreviewChat, type PreviewDraftLike } from './preview-engine'
import type { ConfigItem, ConfigKind, ConfigVersion, Entitlement, LlmModel, PlatformType, ProbedModel, ProbeModelsResult } from '../config'

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

/** 引用了指定资源的套餐/个体权益来源清单（删除拦截用，报错指明来源便于解除） */
function entitledBy(resourceType:'EXPERT'|'SKILL'|'MCP_TOOL', ids:number[]): string[] {
  const by: string[] = []
  db.plans.forEach(p=>(p.entitlements||[]).forEach(e=>{ if(e.resourceType===resourceType && ids.includes(e.resourceId)) by.push(`套餐「${p.name}」`) }))
  db.users.forEach(u=>(u.entitlements||[]).forEach(e=>{ if(e.resourceType===resourceType && ids.includes(e.resourceId)) by.push(`用户「${u.nickname}#${u.id}」`) }))
  return [...new Set(by)]
}

export function registerConfigHandlers({route,error:ErrorType,audit}:Services) {
  const fail = (message:string,code=422):never=>{ throw new ErrorType(code,message) }
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
  /** 供导入/克隆复用的按模块保存入口 */
  const saveFns: Partial<Record<'plan'|'expert'|'skill'|'mcp', (ctx:Context)=>ConfigItem>> = {}
  /** v5：版本快照公共字段（版本名称留空自动生成 yyyyMMddHHmmss；操作人取当前管理员） */
  const versionMeta = (ctx:Context, body:unknown)=>({ versionName:String((body as Record<string,unknown>)?.versionName || '').trim() || stampStr(), operator:db.admins.find(a=>a.id===ctx.adminId)?.username || 'unknown' })
  /** v5：同资源内版本名称唯一校验（重复 422，保存与恢复共用） */
  const assertVersionNameUnique = (store: Record<string, ConfigVersion[]> | undefined, itemId: number|string, versionName: string): void => {
    if((store?.[String(itemId)] || []).some(v=>v.versionName===versionName)) fail(`版本名称「${versionName}」在该资源的历史版本中已存在，请更换`)
  }
  route('GET','/entitlement-resources',ctx=>{ if(!['user:entitlement','plan:view','plan:edit'].some(p=>permissionCodesOf(ctx.adminId).includes(p))) fail('无权限',403); return resources() })
  for(const [kind,items,module] of collections) {
    route('GET',`/${kind}`,ctx=>{ perm(ctx,`${module}:view`); const keyword=String(ctx.query.keyword || '');const status=ctx.query.status==='' || ctx.query.status===undefined ? undefined:Number(ctx.query.status);return items.filter(i=>(!keyword || `${i.name} ${i.code}`.includes(keyword)) && (status===undefined || i.status===status)).map(i=>({ ...publicItem(i), salesCount: module==='plan'?db.orders.filter(o=>o.planId===i.id && o.status==='PAID').length:undefined, boundSkillCount: module==='expert'?(i.skillIds||[]).length:undefined, boundMcpCount: module==='expert'?(i.mcpServerIds||[]).length:undefined, boundExpertCount: module==='skill'?db.experts.filter(e=>e.skillIds?.includes(i.id)).length:undefined })) })
    route('GET',`/${kind}/:id`,ctx=>{ perm(ctx,`${module}:view`);return publicItem(find(items,ctx.params.id)) })
    const save = (ctx:Context)=>{
      perm(ctx,`${module}:edit`)
      const old = ctx.params.id ? find(items,ctx.params.id):undefined
      const input = (ctx.body || {}) as Partial<ConfigItem> & { confirmReferences?: boolean; note?: string }
      const item:ConfigItem = { ...(old ? snapshot(old):{ id:nextMockId(),code:'',name:'',status:1,version:0,updatedAt:nowStr(),refreshStatus:'PENDING',appliedVersion:0,refreshMessage:'' }) }
      const fields: Array<keyof ConfigItem> = ['code','name','status','platforms',...(module==='plan'?['price','durationDays','entitlements']:module==='expert'?['description','avatarUrl','baseModel','systemPrompt','skillIds','mcpServerIds','suggestedQuestions','capabilities','tags','visibility','isDefault','intro','modelParams','mcpToolIds','titleHtml','introduction','greeting','coreAbilities','referencePrompts','nextQuestionConfig']:module==='skill'?['description','content','files','paramSchema','execConfig']:['connType','endpoint','path','transport','command','args','authConfig','toolFilter'])] as Array<keyof ConfigItem>
      for(const key of fields) if(input[key]!==undefined) Object.assign(item,{[key]:input[key]})
      item.name=String(item.name).trim();item.code=String(item.code).trim()
      if(!item.name || !/^[a-zA-Z0-9_-]+$/.test(item.code)) fail('名称必填，编码仅允许字母数字下划线短横线')
      if(items.some(i=>i.id!==item.id && i.code===item.code)) fail('编码已存在')
      if(![0,1].includes(item.status)) fail('状态无效')
      if(module!=='plan') {
        // v5：平台维度多选（专家/技能/MCP 通用），枚举 1688/OZON/AMAZON/TEMU，至少一个
        if(!Array.isArray(item.platforms) || !(item.platforms as unknown[]).length) {
          // 兼容回填（旧导出 JSON / 存量调用方）：旧单值 platform 映射为数组；无平台信息按 code 关键词推断，否则默认 ['1688']
          const legacyPlat=(input as Record<string,unknown>).platform
          const valid=(v:unknown):v is PlatformType=>typeof v==='string' && (PLATFORM_VALUES as string[]).includes(v)
          const text=`${item.code} ${item.name}`.toLowerCase()
          item.platforms = valid(legacyPlat) ? [legacyPlat] : legacyPlat==='ALL' ? ['1688','OZON','AMAZON','TEMU'] : /ozon/.test(text) ? ['OZON'] : /amazon|亚马逊/.test(text) ? ['AMAZON'] : /temu/.test(text) ? ['TEMU'] : ['1688']
        }
        const plats=[...new Set(item.platforms as string[])]
        if(!plats.length || plats.some(p=>!PLATFORM_VALUES.includes(p as PlatformType))) fail('平台必须为 1688/OZON/AMAZON/TEMU 且至少选择一个')
        item.platforms=plats as PlatformType[]
      }
      if(module==='plan') {
        if(!Number.isFinite(item.price) || Number(item.price)<0 || !Number.isInteger(item.durationDays) || Number(item.durationDays)<1) fail('价格须非负，有效天数须正整数')
        item.entitlements=validateEntitlements(item.entitlements || [],ErrorType)
      }
      if(module==='expert') {
        if(!String(item.systemPrompt||'').trim()) fail('系统提示词不能为空')
        if(!String(item.baseModel||'').trim()) fail('基础模型不能为空')
        // v5：base_model 必须是模型管理中注册的基础模型（存 code）
        if(!db.models.some(m=>m.code===item.baseModel)) fail('基础模型必须是模型管理中的有效模型（存模型编码）')
        if(!String(item.description||'').trim()) fail('能力摘要不能为空')
        if(!Array.isArray(item.skillIds) || item.skillIds.some(id=>!db.skills.some(s=>s.id===id))) fail('绑定的技能不存在')
        if(!Array.isArray(item.mcpServerIds) || item.mcpServerIds.some(id=>!db.servers.some(s=>s.id===id))) fail('绑定的MCP服务器不存在')
        if(!Array.isArray(item.suggestedQuestions) || item.suggestedQuestions.some(q=>typeof q!=='string' || !q.trim())) fail('建议问题须为非空字符串数组')
        if(!Array.isArray(item.tags) || item.tags.some(t=>typeof t!=='string' || !t.trim())) fail('标签须为非空字符串数组')
        // v6：编排扩展字段宽松校验（标题/介绍/开场白 HTML 字符串；核心能力/参考提示词字符串数组；问题建议配置对象）
        if(item.titleHtml!==undefined && typeof item.titleHtml!=='string') fail('专家标题须为字符串')
        if(item.introduction!==undefined && typeof item.introduction!=='string') fail('专家介绍须为字符串')
        if(item.greeting!==undefined && typeof item.greeting!=='string') fail('开场白须为字符串')
        if(item.coreAbilities!==undefined && (!Array.isArray(item.coreAbilities) || item.coreAbilities.some(a=>typeof a!=='string'))) fail('核心能力须为字符串数组')
        if(item.referencePrompts!==undefined && (!Array.isArray(item.referencePrompts) || item.referencePrompts.some(a=>typeof a!=='string'))) fail('参考提示词须为字符串数组')
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
        const vis=item.visibility
        if(!vis || (vis.type!=='PUBLIC' && vis.type!=='PLAN' && vis.type!=='PRIVATE')) { throw new ErrorType(422,'可见性类型无效（PUBLIC/PLAN/PRIVATE）') }
        if(vis.type==='PLAN' && (!Array.isArray(vis.planIds) || !vis.planIds.length || vis.planIds.some(id=>!db.plans.some(p=>p.id===id)))) { throw new ErrorType(422,'指定套餐可见性需选择有效套餐') }
        if(vis.type!=='PLAN') item.visibility={ type:vis.type, planIds:[] }
        if(item.isDefault && item.status!==1) fail('默认专家必须启用')
        if(old?.isDefault && !item.isDefault) fail('请通过另一专家的设为默认操作切换默认专家')
      }
      if(module==='skill') {
        if(!String(item.description||'').trim()) fail('描述（触发意图）不能为空')
        if(!String(item.content||'').trim()) fail('SKILL.md 内容不能为空')
        if(item.files===undefined) item.files=[]
        if(!Array.isArray(item.files) || item.files.some(f=>!f || typeof f.name!=='string' || !f.name.trim() || typeof f.content!=='string')) fail('附件文件须包含名称与内容')
        if(new Set((item.files||[]).map(f=>f.name)).size!==(item.files||[]).length) fail('附件文件名不能重复')
        const refs=db.experts.filter(e=>e.skillIds?.includes(item.id))
        if(old?.status===1 && item.status===0 && refs.length && !input.confirmReferences) fail(`技能被以下专家引用：${refs.map(r=>r.name).join('、')}；如确认停用请勾选引用确认`,409)
      }
      if(module==='mcp') {
        if(!['MCP','OpenAPI'].includes(item.connType || '')) fail('连接类型无效（MCP/OpenAPI）')
        const path=String(item.path||'').trim()
        if(path && !path.startsWith('/')) fail('端点路径须以 / 开头')
        if(item.connType==='MCP') {
          if(!['STREAMABLE_HTTP','SSE','STDIO'].includes(item.transport || '')) fail('MCP 传输类型无效')
          if(item.transport==='STDIO') { if(!item.command?.trim() || !Array.isArray(item.args) || item.args.some(a=>typeof a!=='string')) fail('STDIO 需要启动命令及字符串参数数组'); item.endpoint=''; item.path='' }
          else { try { const url=new URL(item.endpoint || ''); if(!['http:','https:'].includes(url.protocol) || url.username || url.password) fail('地址必须为HTTP(S)，不允许内嵌鉴权') } catch { fail('HTTP/SSE 地址无效') }; item.command='';item.args=[]; if(!path) item.path='/mcp' }
        } else {
          try { const url=new URL(item.endpoint || ''); if(!['http:','https:'].includes(url.protocol) || url.username || url.password) fail('地址必须为HTTP(S)，不允许内嵌鉴权') } catch { fail('OpenAPI 地址无效') }
          if(!path) fail('OpenAPI 需要填写 openapi.json 端点路径')
          item.command='';item.args=[];item.transport=item.transport||'STREAMABLE_HTTP'
        }
        const auth=item.authConfig || { type:'NONE' as const }
        if(!['NONE','BEARER','API_KEY','HEADER'].includes(auth.type)) fail('鉴权类型无效')
        if(auth.credential==='******' || !auth.credential && old?.authConfig?.type===auth.type) auth.credential=old?.authConfig?.credential
        if(auth.type!=='NONE' && !auth.credential?.trim()) fail('请填写鉴权凭据')
        if((auth.type==='API_KEY'||auth.type==='HEADER') && !/^[A-Za-z0-9-]+$/.test(auth.headerName || '')) fail('请求头名称无效')
        item.authConfig=auth.type==='NONE'?{ type:'NONE' }:{...auth,credential:'MOCK_SECRET_CONFIGURED'}
        if(!Array.isArray(item.toolFilter)) item.toolFilter=[]
        if(item.toolFilter.some(t=>typeof t!=='string' || !t.trim())) fail('工具过滤清单须为非空字符串数组')
      }
      const before=old?snapshot(old):null
      touch(item)
      // v5：导入（skipVersion 标记，非持久化字段）不产生版本记录；保存前校验同资源内版本名称唯一（重复 422）
      const vMeta = versionMeta(ctx,ctx.body)
      const skipVersion = Boolean((input as Record<string,unknown>).skipVersion)
      if(module==='expert' && item.isDefault) items.filter(e=>e.id!==item.id && e.isDefault).forEach(e=>{ const prev=snapshot(e);e.isDefault=false;touch(e);audit(ctx.adminId,'expert.default','expert',e.id,prev,e) })
      if(old) Object.assign(old,item); else items.push(item)
      if(module==='expert') {
        if(!skipVersion) {
          assertVersionNameUnique(db.expertVersions,item.id,vMeta.versionName)
          ;(db.promptHistory[item.id] ||= []).push({ version:item.version,systemPrompt:item.systemPrompt!,createdAt:item.updatedAt })
          ;(db.expertVersions[String(item.id)] ||= []).push({ version:item.version, ...vMeta, note:String(input.note || (old?'保存配置':'创建配置')), createdAt:item.updatedAt, snapshot:snapshot(item) })
        }
      }
      if(module==='skill') {
        if(!skipVersion) {
          assertVersionNameUnique(db.skillVersions,item.id,vMeta.versionName)
          ;(db.skillVersions[String(item.id)] ||= []).push({ version:item.version, ...vMeta, note:String(input.note || (old?'保存配置':'创建配置')), createdAt:item.updatedAt, snapshot:snapshot(item) })
        }
      }
      if(module==='mcp') {
        // v5：MCP 配置变更生成快照（含连接配置与工具绑定），支持历史/差异/恢复
        if(!skipVersion) {
          assertVersionNameUnique(db.mcpVersions,item.id,vMeta.versionName)
          ;(db.mcpVersions[String(item.id)] ||= []).push({ version:item.version, ...vMeta, note:String(input.note || (old?'保存配置':'创建配置')), createdAt:item.updatedAt, snapshot:snapshot(item) })
        }
      }
      // v5：审计 JSON 含 platforms（业务字段）与 versionName（本次发布版本名；skipVersion 无版本记录时省略）
      audit(ctx.adminId,`${module}.${old?'update':'create'}`,module,item.id,before, skipVersion ? item : { ...publicItem(item), versionName:vMeta.versionName })
      return publicItem(item)
    }
    saveFns[module as 'plan'|'expert'|'skill'|'mcp'] = save
    route('POST',`/${kind}`,save);route('PUT',`/${kind}/:id`,save)
    route('PUT',`/${kind}/:id/status`,ctx=>save({...ctx,body:{ status:(ctx.body as Record<string,unknown>).status, confirmReferences:(ctx.body as Record<string,unknown>).confirmReferences }}))
    route('DELETE',`/${kind}/:id`,ctx=>{
      perm(ctx,`${module}:edit`);const item=find(items,ctx.params.id)
      const confirm=(ctx.body as Record<string,unknown> | undefined)?.confirmReferences
      if(module==='plan') {
        if(db.users.some(u=>u.planId===item.id) || db.orders.some(o=>o.planId===item.id)) fail('套餐已被用户或订单引用，不能删除',409)
      } else if(module==='expert') {
        const by=entitledBy('EXPERT',[item.id]);if(by.length) entitledFail('专家',by)
        if(item.isDefault) fail('默认专家不能删除，请先切换其他专家为默认',409)
        if(db.chats.some(c=>c.expertId===item.id)) fail('专家存在历史会话，不能删除',409)
      } else if(module==='skill') {
        const by=entitledBy('SKILL',[item.id]);if(by.length) entitledFail('技能',by)
        const refs=db.experts.filter(e=>e.skillIds?.includes(item.id))
        if(refs.length && !confirm) fail(`技能被以下专家引用：${refs.map(r=>r.name).join('、')}；确认删除请勾选引用确认`,409)
        db.experts.forEach(e=>{ e.skillIds=(e.skillIds||[]).filter(id=>id!==item.id) })
      } else {
        const toolIds=db.tools.filter(t=>t.serverId===item.id).map(t=>t.id)
        const by=entitledBy('MCP_TOOL',toolIds);if(by.length) entitledFail('MCP 服务',by)
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
    return { ...rest, apiKeyMasked: maskKey(m.apiKey) }
  }
  const findModel = (id:string):LlmModelRow=>db.models.find(m=>m.id===Number(id)) || fail('模型不存在',404)
  route('GET','/models',ctx=>{
    perm(ctx,'model:view')
    const keyword=String(ctx.query.keyword || '');const status=ctx.query.status==='' || ctx.query.status===undefined ? undefined:Number(ctx.query.status)
    // v6 域名区分：domain（接入地址 host）服务端筛选；domain 列表全量返回供筛选项
    const domain=String(ctx.query.domain || '').trim()
    const hostOf=(m:LlmModelRow):string=>{ if(!m.endpoint) return ''; try { return new URL(m.endpoint).host } catch { return m.endpoint } }
    // v5 契约：分页 + keyword/status 筛选，返回 {total, list}；按域名分组排序（同域名模型相邻）
    const list=db.models.filter(m=>(!keyword || `${m.name} ${m.code}`.includes(keyword)) && (status===undefined || m.status===status) && (!domain || hostOf(m)===domain)).sort((a,b)=>hostOf(a).localeCompare(hostOf(b)) || a.id-b.id).map(publicModel)
    const page=Math.max(1,Number(ctx.query.page)||1);const pageSize=Math.min(100,Math.max(1,Number(ctx.query.pageSize)||20))
    const domains=[...new Set(db.models.map(hostOf).filter(Boolean))].sort()
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
    // api_key：填写则更新；留空/未传=不修改（新建即未配置）
    const apiKey = typeof input.apiKey==='string' && input.apiKey.trim() ? input.apiKey.trim() : old?.apiKey
    const item:LlmModelRow={ id:old?.id ?? nextMockId(), code, name, provider, endpoint, apiKey, defaultParams, remark:String(input.remark || '').trim(), status:input.status===0?0:1, createdAt:old?.createdAt || nowStr(), updatedAt:nowStr() }
    const before=old?publicModel(old):null
    if(old) { const legacy=old as unknown as Record<string,unknown>; delete legacy.maxContext; delete legacy.capabilities; Object.assign(old,item) } else db.models.push(item)
    audit(ctx.adminId,`model.${old?'update':'create'}`,'model',item.id,before,publicModel(item))
    return publicModel(item)
  }
  route('POST','/models',saveModel);route('PUT','/models/:id',saveModel)
  // 批量接入（渠道式）：「链接 + 密钥」探测出的模型清单勾选后一次落库；共享 endpoint/apiKey/provider，重复编码自动跳过
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
    for(const it of arr){
      const raw=String(it.code || '').trim()
      const code=raw.replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')
      if(!code || db.models.some(m=>m.code===code)) { skipped.push(raw || '(空)'); continue }
      const item:LlmModelRow={ id:nextMockId(), code, name:String(it.name || '').trim() || code, provider, endpoint, apiKey, defaultParams:{ temperature:0.7, max_tokens:4096 }, remark:String(b.remark || '').trim(), status, createdAt:nowStr(), updatedAt:nowStr() }
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

  route('PUT','/plans/:id/entitlements',ctx=>{ perm(ctx,'plan:edit');const p=find(db.plans,ctx.params.id);const entries=validateEntitlements(ctx.body,ErrorType);const before=snapshot(p);p.entitlements=entries;touch(p);audit(ctx.adminId,'plan.entitlements','plan',p.id,before,p);return publicItem(p) })
  route('PUT','/experts/:id/default',ctx=>{ perm(ctx,'expert:edit');const item=find(db.experts,ctx.params.id);if(item.status!==1) fail('停用专家不能设为默认');for(const e of db.experts){ if(Boolean(e.isDefault)!==(e.id===item.id)){const before=snapshot(e);e.isDefault=e.id===item.id;touch(e);audit(ctx.adminId,'expert.default','expert',e.id,before,e)}};return publicItem(item) })
  route('GET','/experts/:id/prompt-versions',ctx=>{perm(ctx,'expert:view');find(db.experts,ctx.params.id);return (db.promptHistory[ctx.params.id] || []).map(h=>({ ...h, systemPrompt:String(redact(h.systemPrompt)) }))})

  // -------------------------------------------------- 版本历史（专家全量 / 技能 SKILL.md）
  // v5：versionName 留空时默认「恢复自 <源版本名>」（源版本无名称则用 v{N}）
  const restoreNameOf = (input:Record<string,unknown>, hist:ConfigVersion):string=>{
    const custom=String((input as Record<string,unknown>).versionName || '').trim()
    return custom || `恢复自 ${hist.versionName || `v${hist.version}`}`
  }
  const RESTORE_FIELDS = ['code','name','status','platforms','description','avatarUrl','baseModel','systemPrompt','skillIds','mcpServerIds','suggestedQuestions','capabilities','tags','visibility','isDefault','intro','modelParams','mcpToolIds','titleHtml','introduction','greeting','coreAbilities','referencePrompts','nextQuestionConfig','content','files','paramSchema','execConfig'] as readonly (keyof ConfigItem)[]
  route('GET','/experts/:id/versions',ctx=>{perm(ctx,'expert:view');const item=find(db.experts,ctx.params.id);return (db.expertVersions[String(item.id)] || []).slice().sort((a,b)=>b.version-a.version).map(v=>({ ...v, snapshot:publicItem(v.snapshot) }))})
  route('POST','/experts/:id/restore',ctx=>{
    perm(ctx,'expert:edit');const item=find(db.experts,ctx.params.id)
    const input=(ctx.body || {}) as Record<string,unknown>
    const hist=(db.expertVersions[String(item.id)] || []).find(v=>v.version===Number(input.version))
    if(!hist) { throw new ErrorType(404,'版本不存在') }
    const before=snapshot(item);const snap=JSON.parse(JSON.stringify(hist.snapshot)) as ConfigItem
    for(const key of RESTORE_FIELDS) if(snap[key]!==undefined) Object.assign(item,{[key]:snap[key]})
    if(item.isDefault && item.status!==1) fail('该版本为默认专家但处于停用状态，恢复前请先恢复启用状态版本')
    touch(item)
    ;(db.promptHistory[item.id] ||= []).push({ version:item.version,systemPrompt:item.systemPrompt!,createdAt:item.updatedAt })
    const restoredName=restoreNameOf(input,hist)
    ;(db.expertVersions[String(item.id)] ||= []).push({ version:item.version, versionName:restoredName, operator:db.admins.find(a=>a.id===ctx.adminId)?.username || 'unknown', note:String(input.note || ''), createdAt:item.updatedAt, snapshot:snapshot(item) })
    audit(ctx.adminId,'expert.version.restore','expert',item.id,before,{ restoredFrom:hist.version,version:item.version,versionName:restoredName,platforms:item.platforms });return publicItem(item)
  })
  route('GET','/skills/:id/versions',ctx=>{perm(ctx,'skill:view');const item=find(db.skills,ctx.params.id);return (db.skillVersions[String(item.id)] || []).slice().sort((a,b)=>b.version-a.version).map(v=>({ ...v, snapshot:publicItem(v.snapshot) }))})
  route('POST','/skills/:id/restore',ctx=>{
    perm(ctx,'skill:edit');const item=find(db.skills,ctx.params.id)
    const input=(ctx.body || {}) as Record<string,unknown>
    const hist=(db.skillVersions[String(item.id)] || []).find(v=>v.version===Number(input.version))
    if(!hist) { throw new ErrorType(404,'版本不存在') }
    const before=snapshot(item);const snap=JSON.parse(JSON.stringify(hist.snapshot)) as ConfigItem
    for(const key of ['code','name','status','platforms','description','content','files','paramSchema','execConfig'] as Array<keyof ConfigItem>) if(snap[key]!==undefined) Object.assign(item,{[key]:snap[key]})
    touch(item)
    const restoredName=restoreNameOf(input,hist)
    ;(db.skillVersions[String(item.id)] ||= []).push({ version:item.version, versionName:restoredName, operator:db.admins.find(a=>a.id===ctx.adminId)?.username || 'unknown', note:String(input.note || ''), createdAt:item.updatedAt, snapshot:snapshot(item) })
    audit(ctx.adminId,'skill.version.restore','skill',item.id,before,{ restoredFrom:hist.version,version:item.version,versionName:restoredName,platforms:item.platforms });return publicItem(item)
  })

  // -------------------------------------------------- MCP 版本历史（v5 补齐：连接配置与工具绑定快照，恢复生成新版本）
  const MCP_RESTORE_FIELDS = ['code','name','status','platforms','connType','endpoint','path','transport','command','args','authConfig','toolFilter'] as readonly (keyof ConfigItem)[]
  route('GET','/mcp/servers/:id/versions',ctx=>{perm(ctx,'mcp:view');const item=find(db.servers,ctx.params.id);return (db.mcpVersions[String(item.id)] || []).slice().sort((a,b)=>b.version-a.version).map(v=>({ ...v, snapshot:publicItem(v.snapshot) }))})
  route('POST','/mcp/servers/:id/restore',ctx=>{
    perm(ctx,'mcp:edit');const item=find(db.servers,ctx.params.id)
    const input=(ctx.body || {}) as Record<string,unknown>
    const hist=(db.mcpVersions[String(item.id)] || []).find(v=>v.version===Number(input.version))
    if(!hist) { throw new ErrorType(404,'版本不存在') }
    const before=snapshot(item);const snap=JSON.parse(JSON.stringify(hist.snapshot)) as ConfigItem
    for(const key of MCP_RESTORE_FIELDS) if(snap[key]!==undefined) Object.assign(item,{[key]:snap[key]})
    touch(item)
    const restoredName=restoreNameOf(input,hist)
    ;(db.mcpVersions[String(item.id)] ||= []).push({ version:item.version, versionName:restoredName, operator:db.admins.find(a=>a.id===ctx.adminId)?.username || 'unknown', note:String(input.note || ''), createdAt:item.updatedAt, snapshot:snapshot(item) })
    audit(ctx.adminId,'mcp.version.restore','mcp',item.id,before,{ restoredFrom:hist.version,version:item.version,versionName:restoredName,platforms:item.platforms });return publicItem(item)
  })

  // -------------------------------------------------- 导出 / 导入 / 克隆（预设迁移，凭据脱敏）
  const exportPayload = (item:ConfigItem)=>{ const { id:_i,version:_v,appliedVersion:_a,refreshStatus:_r,refreshMessage:_m,updatedAt:_u,...rest }=item; return rest }
  /** v5：导出 JSON 附当前版本名称 versionName（含 platforms 业务字段），导入时随载荷进入版本历史 */
  const latestVersionNameOf = (store: Record<string, ConfigVersion[]> | undefined, id: number | string): string => (store?.[String(id)] || []).slice().sort((a,b)=>b.version-a.version)[0]?.versionName || ''
  route('GET','/experts/:id/export',ctx=>{perm(ctx,'expert:edit');const item=find(db.experts,ctx.params.id);audit(ctx.adminId,'expert.export','expert',item.id,null,{ code:item.code });return { filename:`expert-${item.code}.json`, content:JSON.stringify({ ...exportPayload(item), versionName:latestVersionNameOf(db.expertVersions,item.id) },null,2) }})
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
  route('PUT','/mcp/tools/:id/enabled',ctx=>{perm(ctx,'mcp:edit');const tool=db.tools.find(t=>t.id===Number(ctx.params.id)) || fail('工具不存在',404);const enabled=(ctx.body as Record<string,unknown>).enabled;if(typeof enabled!=='boolean') fail('enabled须为布尔值');const before={...tool};const server=db.servers.find(s=>s.id===tool.serverId)!;const input=(ctx.body || {}) as Record<string,unknown>;const vMeta=versionMeta(ctx,input);assertVersionNameUnique(db.mcpVersions,server.id,vMeta.versionName);tool.enabled=enabled as boolean;touch(server);(db.mcpVersions[String(server.id)] ||= []).push({version:server.version,...vMeta,note:String(input.note||'更新工具启用状态'),createdAt:server.updatedAt,snapshot:snapshot(server)});audit(ctx.adminId,'mcp.tool.enabled','mcp_tool',tool.id,before,tool);return tool})
  route('POST','/mcp/servers/:id/discover',ctx=>{
    perm(ctx,'mcp:edit');const item=find(db.servers,ctx.params.id)
    if(item.status!==1) fail('请先启用服务')
    // 工具发现按 conn_type 返回不同工具集；MCP 再按服务编码预置各平台工具名（Mock 固定数据，无网络调用）
    const OPENAPI_TOOLS=['list_operations','get_schema','invoke_operation','health_ping']
    const PLATFORM_TOOLS:Record<string,string[]>={ amazon:['amazon_bsr_ranking','amazon_sales_estimate','amazon_reviews_fetch'], ozon:['ozon_category_filter','ozon_product_search','ozon_price_history'], temu:['temu_product_search','temu_price_trend','temu_reviews'], echotik:['echotik_video_search','echotik_influencer_ranklist','echotik_live_list'], tiktok:['tiktok_shop_ranking','tiktok_video_search'], ali:['ali_product_search','ali_keyword_trend','ali_shop_rank','ali_billboard_list'], dld:['ali_product_search','ali_keyword_trend','ali_shop_rank','ali_billboard_list'] }
    let sampleNames:string[]
    if(item.connType==='OpenAPI') sampleNames=OPENAPI_TOOLS
    else { const key=Object.keys(PLATFORM_TOOLS).find(k=>String(item.code).toLowerCase().includes(k)); sampleNames=key?PLATFORM_TOOLS[key]:['product_search','product_detail','keyword_trend','seller_search','category_tree'] }
    const filter=(item.toolFilter||[]).filter(t=>t.trim())
    const names=filter.length?sampleNames.filter(n=>filter.includes(n)):sampleNames
    for(const name of names) if(!db.tools.some(t=>t.serverId===item.id && t.name===name)) db.tools.push({ id:nextMockId(), serverId:item.id, name, enabled:true })
    touch(item)
    audit(ctx.adminId,'mcp.discover','mcp',item.id,null,{ generated:names, connType:item.connType, toolFilter:filter.length?filter:'全部', source:'Mock 固定示例工具，按 connType 区分工具集并受 tool_filter 过滤，无网络调用' })
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
}
