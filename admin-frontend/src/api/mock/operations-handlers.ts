import { beijingDate, beijingTime } from '../../utils/chat-time'
import { createExcelBlob } from '../../utils/excel'
import { db, nowStr, permissionCodesOf } from './db'
import { redact, buildChatAnalysis, buildAskAnalysis } from './extension-data'
import type { Chat } from './extension-data'
import type { Context, Services } from './config-handlers'

export function registerOperationsHandlers({route,error:ErrorType,audit}:Services) {
  const perm=(ctx:Context,p:string)=>{if(!permissionCodesOf(ctx.adminId).includes(p)) throw new ErrorType(403,'无权限执行该操作')}
  const chat=(ctx:Context)=>{const c=db.chats.find(c=>c.id===Number(ctx.params.id));if(!c) throw new ErrorType(404,'会话不存在');return c}
  const userOf=(id:number)=>db.users.find(u=>u.id===id)
  const filtered=(ctx:Context)=>db.chats.filter(c=>{
    const q=ctx.query
    return (!q.userId || c.userId===Number(q.userId)) && (!q.phone || (userOf(c.userId)?.phone || '').includes(String(q.phone).trim())) && (!q.expertId || c.expertId===Number(q.expertId)) && (!q.keyword || c.messages.some(m=>m.content.includes(String(q.keyword)))) && (!q.start || beijingDate(c.createdAt)>=String(q.start)) && (!q.end || beijingDate(c.createdAt)<=String(q.end)) && (q.deleted==='all' || (q.deleted==='true'?!!c.deletedAt:!c.deletedAt))
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  route('GET','/chats/expert-options',ctx=>{perm(ctx,'chat:view');return db.experts.map(e=>({id:e.id,name:redact(e.name)}))})
  /** 对话管理（用户视角）：按用户聚合，一行 = 一个用户 + 其最新一条对话；支持手机号搜索 */
  route('GET','/chats/users',ctx=>{perm(ctx,'chat:view');const all=filtered(ctx);const byUser=new Map<number,Chat[]>();all.forEach(c=>{const arr=byUser.get(c.userId)||[];arr.push(c);byUser.set(c.userId,arr)});const rows=[...byUser.entries()].map(([userId,cs])=>{const latest=[...cs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];const u=userOf(userId);return {userId,wechatNickname:u?.wechatNickname||'',phone:u?.phone||'',region:u?.region||'',chatCount:cs.length,activeCount:cs.filter(c=>!c.deletedAt).length,latest:{id:latest.id,expertId:latest.expertId,title:redact(latest.title),expertName:redact(db.experts.find(e=>e.id===latest.expertId)?.name||'')||null,summary:redact(latest.messages[0]?.content || '').slice(0,160),messageCount:latest.messages.length,createdAt:latest.createdAt,deletedAt:latest.deletedAt,deleteReason:redact(latest.deleteReason)}}}).sort((a,b)=>b.latest.createdAt.localeCompare(a.latest.createdAt));const page=Math.max(1,Number(ctx.query.page)||1);const size=Math.min(100,Math.max(1,Number(ctx.query.pageSize)||20));return {total:rows.length,list:rows.slice((page-1)*size,page*size)}})
  route('GET','/chats',ctx=>{perm(ctx,'chat:view');const all=filtered(ctx);const page=Math.max(1,Number(ctx.query.page)||1);const size=Math.min(100,Math.max(1,Number(ctx.query.pageSize)||20));const list=all.slice((page-1)*size,page*size).map(c=>({id:c.id,userId:c.userId,expertId:c.expertId,title:redact(c.title),expertName:redact(db.experts.find(e=>e.id===c.expertId)?.name||'')||null,summary:redact(c.messages[0]?.content || '').slice(0,160),messageCount:c.messages.length,createdAt:c.createdAt,deletedAt:c.deletedAt,deleteReason:redact(c.deleteReason),phone:userOf(c.userId)?.phone||'',wechatNickname:userOf(c.userId)?.wechatNickname||''}));return {total:all.length,list}})
  route('GET','/chats/:id/messages',ctx=>{perm(ctx,'chat:view');const c=chat(ctx);audit(ctx.adminId,'chat.messages.view','chat',c.id,null,{messageCount:c.messages.length});return c.messages.map(m=>({...m,content:redact(m.content)}))})
  route('GET','/chats/:id/analysis',ctx=>{perm(ctx,'chat:view');const c=chat(ctx);const expertName=db.experts.find(e=>e.id===c.expertId)?.name;const askRaw=ctx.query.askIdx;if(askRaw!==undefined&&askRaw!==''){const askIdx=Number(askRaw);const askCount=c.messages.filter(m=>m.role==='user').length;if(!Number.isInteger(askIdx)||askIdx<0||askIdx>=askCount) throw new ErrorType(404,'该问话不存在或已删除');audit(ctx.adminId,'chat.analysis.view','chat',c.id,null,{askIdx});return buildAskAnalysis(c,askIdx,expertName)}audit(ctx.adminId,'chat.analysis.view','chat',c.id,null,{steps:4});return buildChatAnalysis(c,expertName)})
  route('DELETE','/chats/:id',ctx=>{perm(ctx,'chat:delete');const c=chat(ctx);const reason=String((ctx.body as Record<string,unknown>)?.reason || '').trim();if(!reason) throw new ErrorType(422,'必须填写软删除理由');if(c.deletedAt) throw new ErrorType(409,'会话已删除');c.deletedAt=nowStr();c.deleteReason=reason;audit(ctx.adminId,'chat.delete','chat',c.id,{deletedAt:null},{deletedAt:c.deletedAt,reason});return null})
  route('POST','/chats/:id/restore',ctx=>{perm(ctx,'chat:restore');const c=chat(ctx);if(!c.deletedAt) throw new ErrorType(409,'会话未删除');const before={deletedAt:c.deletedAt,reason:c.deleteReason};c.deletedAt=null;c.deleteReason='';audit(ctx.adminId,'chat.restore','chat',c.id,before,{deletedAt:null});return null})
  route('GET','/chats/:id/export',async ctx=>{
    perm(ctx,'chat:export')
    const c=chat(ctx)
    const format=String(ctx.query.format || 'json')
    if(!['json','xlsx'].includes(format)) throw new ErrorType(422,'仅支持JSON/XLSX')
    const messages=c.messages.map(m=>({...m,content:redact(m.content),createdAt:beijingTime(m.createdAt)}))
    const result=format==='json'
      ? {filename:`chat-${c.id}.json`,content:JSON.stringify({id:c.id,userId:c.userId,expertId:c.expertId,title:redact(c.title),timeZone:'Asia/Shanghai (UTC+08:00)',createdAt:beijingTime(c.createdAt),messages},null,2)}
      : await createExcelBlob('对话消息',[
        {header:'角色',width:16,kind:'text'},
        {header:'消息内容',width:80,kind:'text'},
        {header:'创建时间（北京时间 UTC+08:00）',width:32,kind:'text'}
      ],messages.map(m=>[m.role,m.content,m.createdAt]))
    audit(ctx.adminId,'chat.export','chat',c.id,null,{format,messageCount:messages.length})
    return result
  })
  route('GET','/dashboard',ctx=>{
    perm(ctx,'dashboard:view')
    const today=beijingDate(new Date().toISOString())
    const activeChats=db.chats.filter(c=>!c.deletedAt)
    const paidOrders=db.orders.filter(o=>o.status==='PAID')
    const trend=Array.from({length:7},(_,i)=>{
      const date=beijingDate(new Date(Date.now()-(6-i)*86400000).toISOString())
      return {date,users:db.users.filter(u=>beijingDate(u.registeredAt)===date).length,orders:db.orders.filter(o=>beijingDate(o.createdAt)===date).length,chats:activeChats.filter(c=>beijingDate(c.createdAt)===date).length}
    })
    /* 用户状态：status=1 正常, status=0 封禁 */
    const userActive=db.users.filter(u=>u.status===1).length
    const userBanned=db.users.filter(u=>u.status===0).length
    /* 订单四态 */
    const orderPending=db.orders.filter(o=>o.status==='PENDING').length
    const orderPaid=paidOrders.length
    const orderClosed=db.orders.filter(o=>o.status==='CLOSED').length
    const orderWechat=db.orders.filter(o=>o.payChannel==='WECHAT').length
    const orderAlipay=db.orders.filter(o=>o.payChannel==='ALIPAY').length
    /* 今日会话 & 消息总数 */
    const chatToday=activeChats.filter(c=>beijingDate(c.createdAt)===today).length
    const chatMessages=activeChats.reduce((s,c)=>s+c.messages.length,0)
    /* 套餐分布 */
    const planMap=new Map<string,number>()
    db.users.forEach(u=>{const n=u.planName||'无会员';planMap.set(n,(planMap.get(n)||0)+1)})
    const planDist=[...planMap.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)
    /* 各专家会话量 */
    const expertMap=new Map<string,number>()
    activeChats.forEach(c=>{const e=db.experts.find(x=>x.id===c.expertId);const n=e?.name||'未知专家';expertMap.set(n,(expertMap.get(n)||0)+1)})
    const chatsByExpert=[...expertMap.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)
    /* 最近注册用户 */
    const recentUsers=[...db.users].sort((a,b)=>b.registeredAt.localeCompare(a.registeredAt)).slice(0,5).map(u=>({wechatNickname:u.wechatNickname,planName:u.planName,status:u.status,registeredAt:u.registeredAt}))
    /* 最近订单 */
    const recentOrders=[...db.orders].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5).map(o=>{const u=db.users.find(x=>x.id===o.userId);return {orderNo:o.orderNo,wechatNickname:u?.wechatNickname||'—',planName:o.planName,amount:o.amount,status:o.status,payChannel:o.payChannel,createdAt:o.createdAt}})
    return {source:'Mock 本地实际记录汇总；非生产数据',userTotal:db.users.length,userToday:db.users.filter(u=>beijingDate(u.registeredAt)===today).length,userActive,userBanned,orderTotal:db.orders.length,orderPending,orderPaid,orderClosed,orderWechat,orderAlipay,revenueTotal:paidOrders.reduce((s,o)=>s+o.amount,0),chatTotal:activeChats.length,chatToday,chatMessages,expertTotal:db.experts.length,skillTotal:db.skills.length,serverTotal:db.servers.length,trend,planDist,chatsByExpert,recentUsers,recentOrders}
  })
}
