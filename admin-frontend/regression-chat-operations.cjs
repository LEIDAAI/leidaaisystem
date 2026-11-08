const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const vue = require('vue')
const { parse } = require('@vue/compiler-sfc')
const root = __dirname
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b }); return {promise,resolve,reject} }
const lifecycle = { onMounted() {}, onBeforeUnmount() {} }
let checks = 0
function check(name, fn) { fn(); checks++; console.log('通过：'+name) }
function load(relative, mocks={}, suffix='', globals={}) {
  const filename = path.join(root, relative)
  let source = fs.readFileSync(filename, 'utf8')
  if (filename.endsWith('.vue')) source = parse(source).descriptor.scriptSetup.content
  source = source.replace(/import\.meta\.env\.VITE_DEMO_GATEWAY_KEY/g, 'undefined') + '\n' + suffix
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const module = { exports:{} }
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>name in mocks?mocks[name]:require(name),console,setTimeout,clearTimeout,structuredClone,Blob,URL,Number,Date,...globals},{filename})
  return module.exports
}
const time = load('src/utils/chat-time.ts')
const escapeReportText = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const ext = load('src/api/mock/extension-data.ts',{'../config':{PLATFORMS:['1688','OZON','AMAZON','TEMU','TIKTOK','SHOPEE']},'../../utils/chat-time':time,'../../utils/static-chat-report':{escapeReportText}})
const sensitive = '13800138000 demo@example.com token=demo-secret password="two words" {"api_key":"demo-key"} Bearer demo-token sk-demo-key'
const c = {id:1,userId:1,expertId:1,title:sensitive,createdAt:'2026-11-07T20:30:00Z',deletedAt:null,deleteReason:'',messages:[{role:'user',content:sensitive+' <img src=x onerror=demo()> <script>demo()</script>',createdAt:'2026-11-07T20:30:00Z'},{role:'user',content:'第二问 '+sensitive,createdAt:'2026-11-08T01:00:00Z'}]}
check('北京时间跨日、偏移及无时区输入一致',()=>{assert.equal(time.beijingTime(c.createdAt),'2026-11-08 04:30:00');assert.equal(time.beijingTime('2026-11-08 04:30:00'),'2026-11-08 04:30:00');assert.equal(time.beijingTime('2026-11-08T04:30:00+08:00'),'2026-11-08 04:30:00')})
for (const [name,analysis] of [['会话',ext.buildChatAnalysis(c,sensitive+' <svg onload=demo()>')],['单问',ext.buildAskAnalysis(c,1,sensitive)]]) {
  check(name+'分析、报告统一脱敏并转义不可信文本',()=>{const text=JSON.stringify(analysis);for(const secret of ['13800138000','demo@example.com','demo-secret','two words','demo-key','demo-token','sk-demo-key'])assert.ok(!text.includes(secret),secret);assert.ok(!analysis.reportHtml.includes('<script>'));assert.ok(!analysis.reportHtml.includes('<svg'));assert.ok(analysis.reportHtml.includes('script-src \'none\''));assert.ok(analysis.reportHtml.includes('北京时间 UTC+08:00'))})
}
check('新种子三档同功能、无席位且积分包无购买赠分',()=>{const seed=ext.seedExtensions();assert.equal(seed.plans.map(p=>p.name).join(','),'标准版,高级版,旗舰版');assert.equal(JSON.stringify(seed.plans[0].features),JSON.stringify(seed.plans[2].features));assert.ok(!JSON.stringify(seed.plans).includes('席位'));assert.ok(seed.creditPackages.every(p=>p.bonusCredits===0&&p.remark.includes('365 天')))})
function chatUI(api) {
  return load('src/views/ChatsView.vue',{'vue':{...vue,...lifecycle},'element-plus':{ElMessage:{success(){},warning(){},error(){}},ElMessageBox:{}},'@/stores/auth':{useAuthStore:()=>({hasPerm:()=>true})},'@/composables/useTableMax':{useTableMaxHeight:()=>({max:0,bind(){}})},'@/api/operations':api,'@/api/request':{get:async()=>[]},'@/utils/download':{downloadBlobFile(){}},'@/utils/static-chat-report':{staticChatReport:x=>x},'@/utils/chat-time':time},'module.exports={view,query,userRows,total,loading,load,openUser,userChats,userLoading,openChat,curChat,messages,analysis,detailLoading,loadedChatId,backToList,onExpandChat,askCache,askLoading,askErrors}')
}
async function main() {
  const list=[],users=[],msgs=[],analyses=[]
  const ui=chatUI({listChatUsers:q=>{const d=deferred();list.push({d,q});return d.promise},listChats:q=>{const d=deferred();users.push({d,q});return d.promise},chatMessages:id=>{const d=deferred();msgs.push({d,id});return d.promise},chatAnalysis:id=>{const d=deferred();analyses.push({d,id});return d.promise}})
  const a=ui.load();ui.query.keyword='新查询';const b=ui.load();list[1].d.resolve({list:[{userId:2}],total:1});await b;list[0].d.resolve({list:[{userId:1}],total:1});await a
  check('聚合列表逆序只接收最新筛选',()=>assert.equal(ui.userRows.value[0].userId,2))
  const ua=ui.openUser({userId:1}),ub=ui.openUser({userId:2});users[0].d.resolve({list:[{id:1}],total:1});await ua
  check('旧用户响应不能提前结束新请求 loading',()=>assert.equal(ui.userLoading.value,true))
  users[1].d.resolve({list:[{id:2}],total:1});await ub
  check('二级用户会话不串对象',()=>assert.equal(ui.userChats.value[0].id,2))
  const ca=ui.openChat({id:1}),cb=ui.openChat({id:2});msgs[0].d.resolve([{content:'旧'}]);analyses[0].d.resolve({reportHtml:'旧报告'});await ca
  check('旧详情响应不能结束当前 loading 或写入旧消息',()=>{assert.equal(ui.detailLoading.value,true);assert.equal(ui.messages.value.length,0)})
  msgs[1].d.resolve([{content:'新'}]);analyses[1].d.resolve({reportHtml:'新报告'});await cb
  check('详情消息、分析及导出绑定同一会话',()=>{assert.equal(ui.curChat.value.id,2);assert.equal(ui.loadedChatId.value,2);assert.equal(ui.analysis.value.reportHtml,'新报告');assert.equal(ui.messages.value[0].content,'新')})
  const cc=ui.openChat({id:3});ui.backToList();msgs[2].d.resolve([{content:'关闭后的旧消息'}]);analyses[2].d.resolve({reportHtml:'旧报告'});await cc;list[2].d.resolve({list:[],total:0});await Promise.resolve()
  check('离开详情后在途响应失效',()=>{assert.equal(ui.analysis.value,undefined);assert.equal(ui.loadedChatId.value,undefined)})
  const uc=ui.openUser({userId:3});users[2].d.resolve({list:[{id:3}],total:1});await uc
  const expanded=ui.onExpandChat({id:3},[]);await expanded
  const row={id:3};const expansion=ui.onExpandChat(row,[row]);const ud=ui.openUser({userId:4});msgs[3].d.resolve([{role:'user',content:'旧展开'}]);await expansion;users[3].d.resolve({list:[],total:0});await ud
  check('切换用户后旧展开消息不写缓存',()=>assert.equal(ui.askCache.value[3],undefined))
  const feedbackCalls=[],props=vue.reactive({modelValue:true,feedbackId:1})
  const detail=load('src/views/feedback/FeedbackDetailDrawer.vue',{'vue':{...vue,...lifecycle},'@/components/StatusTag.vue':{},'@/api/feedback':{getFeedbackDetail:id=>{const d=deferred();feedbackCalls.push({id,d});return d.promise}},'@/utils/format':{orDash:x=>x},'@/utils/chat-time':time,'@/utils/feedback':{}},'module.exports={detail,loading,failed,loadDetail}',{defineProps:()=>props,defineEmits:()=>()=>{}})
  props.feedbackId=2;feedbackCalls[0].d.resolve({id:1});await Promise.resolve();await vue.nextTick()
  check('反馈直接切 ID 时旧响应不写入且 loading 保持',()=>{assert.equal(detail.detail.value,null);assert.equal(detail.loading.value,true)})
  feedbackCalls[1].d.resolve({id:2});await Promise.resolve();await vue.nextTick()
  check('反馈当前目标正确',()=>assert.equal(detail.detail.value.id,2))
  props.modelValue=false;props.modelValue=true;props.feedbackId=3;feedbackCalls[2].d.reject(new Error('旧失败'));await Promise.resolve();await vue.nextTick()
  check('关闭再打开后旧失败不能污染状态',()=>{assert.equal(detail.failed.value,false);assert.equal(detail.loading.value,true)})
  feedbackCalls[3].d.resolve({id:3});await Promise.resolve();await vue.nextTick()
  const confirm=deferred(),submitted=[]
  const feedbackUI=load('src/views/feedback/FeedbackView.vue',{'vue':{...vue,...lifecycle},'element-plus':{ElMessage:{success(){},warning(){}}},'@/components/ProTable.vue':{},'@/components/StatusTag.vue':{},'@/api/feedback':{handleFeedback:async(id,payload)=>submitted.push({id,payload})},'@/utils/chat-time':time,'@/utils/feedback':{confirmAction:()=>confirm.promise},'@/stores/auth':{useAuthStore:()=>({hasPerm:()=>true})},'./FeedbackDetailDrawer.vue':{}},'module.exports={openHandle,handleTarget,handleForm,submitHandle,handleSubmitting}')
  feedbackUI.openHandle({id:1,fbNo:'FB1',status:'PENDING'});feedbackUI.handleForm.handleRemark='提供可复现证据';feedbackUI.handleForm.rewardPoints=200
  const handling=feedbackUI.submitHandle();feedbackUI.openHandle({id:2,fbNo:'FB2',status:'PENDING'});feedbackUI.handleForm.rewardPoints=999;confirm.resolve(true);await handling
  check('反馈确认期间目标和载荷固定，审计原因明确运营特批',()=>{assert.equal(submitted[0].id,1);assert.equal(submitted[0].payload.rewardPoints,200);assert.ok(submitted[0].payload.handleRemark.includes('运营特批积分，非购买赠分'));assert.equal(feedbackUI.handleSubmitting.value,false)})
  const feedbackRouteSource=fs.readFileSync(path.join(root,'src/api/mock/handlers.ts'),'utf8').split("route('PUT', '/feedbacks/:id/status',")[1].split("route('DELETE', '/feedbacks/:id',")[0]
  let feedbackHandler;const feedbackAudits=[];const feedbackRecord={id:1,fbNo:'FB1',status:'PENDING',rewardPoints:0,handleRemark:''};const feedbackStore={feedbacks:[feedbackRecord],admins:[{id:1,username:'ops'}]}
  class FeedbackError extends Error {constructor(code,message){super(message);this.code=code}}
  vm.runInNewContext(ts.transpileModule("route('PUT', '/feedbacks/:id/status',"+feedbackRouteSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{route:(m,u,fn)=>{feedbackHandler=fn},assertPerm:ctx=>{if(ctx.adminId!==1)throw new FeedbackError(403,'无权限')},db:feedbackStore,findOr404:rows=>rows[0],MockApiError:FeedbackError,nowStr:()=> '2026-11-08 12:00:00',recordAudit:(...args)=>feedbackAudits.push(args),toFeedbackItem:f=>f})
  check('现有反馈接口拒绝无权限及缺少特批原因且失败不写入',()=>{assert.throws(()=>feedbackHandler({adminId:2,params:{id:'1'},body:submitted[0].payload}),e=>e.code===403);assert.throws(()=>feedbackHandler({adminId:1,params:{id:'1'},body:{status:'ADOPTED',rewardPoints:200,handleRemark:''}}),e=>e.code===422);assert.equal(feedbackRecord.status,'PENDING');assert.equal(feedbackAudits.length,0)})
  feedbackHandler({adminId:1,params:{id:'1'},body:submitted[0].payload})
  check('反馈运营特批保留处理人、原因和奖励审计并拒绝重复处理',()=>{assert.equal(feedbackAudits[0][1],'feedback.handle');assert.equal(feedbackAudits[0][5].rewardPoints,200);assert.ok(feedbackAudits[0][5].handleRemark.includes('非购买赠分'));assert.equal(feedbackAudits[0][5].handledBy,'ops');assert.throws(()=>feedbackHandler({adminId:1,params:{id:'1'},body:submitted[0].payload}),e=>e.code===409)})
  const dashCalls=[]
  const dash=load('src/views/DashboardView.vue',{'vue':{...vue,...lifecycle},'@/api/operations':{dashboard:()=>{const d=deferred();dashCalls.push(d);return d.promise}},'@/utils/constants':{USE_MOCK:true},'@/utils/chat-time':time,'@element-plus/icons-vue':{}},'module.exports={load,data,loading,failed,hoverIdx}')
  const da=dash.load(),db=dash.load();dashCalls[0].resolve({userTotal:1});await da
  check('概览旧刷新不提前结束新请求 loading',()=>assert.equal(dash.loading.value,true))
  dashCalls[1].resolve({userTotal:2});await db
  const dc=dash.load();dashCalls[2].reject(new Error('刷新失败'));await dc
  check('概览仅展示最新统计，失败保留上次数据并标记',()=>{assert.equal(dash.data.value.userTotal,2);assert.equal(dash.failed.value,true);assert.equal(dash.loading.value,false)})
  // 隔离内存路由验证：不读取、写入用户本地存储。
  const routes=[],audits=[],mockDB={users:[{id:1,registeredAt:c.createdAt,status:1,planName:'标准版'}],orders:[],chats:[structuredClone(c)],experts:[{id:1,name:sensitive}],skills:[],servers:[]}
  const handler=load('src/api/mock/operations-handlers.ts',{'../../utils/chat-time':time,'../../utils/excel':{createExcelBlob:async(name,cols,rows)=>({name,cols,rows})},'./db':{db:mockDB,nowStr:()=>'',permissionCodesOf:id=>id===1?['chat:view','chat:export','dashboard:view']:[]},'./extension-data':ext})
  class ApiError extends Error {constructor(code,message){super(message);this.code=code}}
  handler.registerOperationsHandlers({route:(method,url,fn)=>routes.push({method,url,fn}),error:ApiError,audit:(...args)=>audits.push(args)})
  const invoke=(url,query={},adminId=1)=>routes.find(r=>r.url===url).fn({adminId,params:{id:'1'},query})
  check('按北京时间日期过滤包含跨 UTC 日会话',()=>assert.equal(invoke('/chats',{start:'2026-11-08',end:'2026-11-08'}).total,1))
  check('摘要先脱敏再截断且标题、专家名脱敏',()=>{const item=invoke('/chats').list[0];assert.ok(!JSON.stringify(item).includes('13800138000'));assert.ok(!JSON.stringify(item).includes('demo-secret'))})
  const json=await invoke('/chats/:id/export',{format:'json'}),xlsx=await invoke('/chats/:id/export',{format:'xlsx'})
  check('JSON 与 XLSX 导出脱敏、北京时间并记录审计',()=>{assert.ok(json.content.includes('UTC+08:00'));assert.ok(json.content.includes('2026-11-08 04:30:00'));assert.ok(!json.content.includes('demo-secret'));assert.ok(xlsx.cols[2].header.includes('北京时间'));assert.equal(audits.filter(a=>a[1]==='chat.export').length,2)})
  check('专家名称选项仅依赖会话查看权限',()=>{assert.equal(invoke('/chats/expert-options').length,1);assert.throws(()=>invoke('/chats/expert-options',{},2),e=>e.code===403)})
  check('概览七日趋势来自真实内存记录，不补伪随机数',()=>{const result=invoke('/dashboard');assert.equal(result.trend.reduce((s,x)=>s+x.orders,0),0);assert.equal(result.trend.reduce((s,x)=>s+x.users,0),1)})
  console.log(`共 ${checks} 项针对性检查通过`)
}
main().catch(error=>{console.error(error);process.exitCode=1})
