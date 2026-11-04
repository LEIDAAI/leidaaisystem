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
    return (!q.userId || c.userId===Number(q.userId)) && (!q.phone || (userOf(c.userId)?.phone || '').includes(String(q.phone).trim())) && (!q.expertId || c.expertId===Number(q.expertId)) && (!q.keyword || c.messages.some(m=>m.content.includes(String(q.keyword)))) && (!q.start || c.createdAt.slice(0,10)>=String(q.start)) && (!q.end || c.createdAt.slice(0,10)<=String(q.end)) && (q.deleted==='all' || (q.deleted==='true'?!!c.deletedAt:!c.deletedAt))
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
  /** 对话管理（用户视角）：按用户聚合，一行 = 一个用户 + 其最新一条对话；支持手机号搜索 */
  route('GET','/chats/users',ctx=>{perm(ctx,'chat:view');const all=filtered(ctx);const byUser=new Map<number,Chat[]>();all.forEach(c=>{const arr=byUser.get(c.userId)||[];arr.push(c);byUser.set(c.userId,arr)});const rows=[...byUser.entries()].map(([userId,cs])=>{const latest=[...cs].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];const u=userOf(userId);return {userId,nickname:u?.nickname||'',phone:u?.phone||'',region:u?.region||'',chatCount:cs.length,activeCount:cs.filter(c=>!c.deletedAt).length,latest:{id:latest.id,expertId:latest.expertId,title:latest.title,expertName:db.experts.find(e=>e.id===latest.expertId)?.name??null,summary:redact(latest.messages[0]?.content.slice(0,160) || ''),messageCount:latest.messages.length,createdAt:latest.createdAt,deletedAt:latest.deletedAt,deleteReason:redact(latest.deleteReason)}}}).sort((a,b)=>b.latest.createdAt.localeCompare(a.latest.createdAt));const page=Math.max(1,Number(ctx.query.page)||1);const size=Math.min(100,Math.max(1,Number(ctx.query.pageSize)||20));return {total:rows.length,list:rows.slice((page-1)*size,page*size)}})
  route('GET','/chats',ctx=>{perm(ctx,'chat:view');const all=filtered(ctx);const page=Math.max(1,Number(ctx.query.page)||1);const size=Math.min(100,Math.max(1,Number(ctx.query.pageSize)||20));const list=all.slice((page-1)*size,page*size).map(c=>({id:c.id,userId:c.userId,expertId:c.expertId,title:c.title,expertName:db.experts.find(e=>e.id===c.expertId)?.name ?? null,summary:redact(c.messages[0]?.content.slice(0,160) || ''),messageCount:c.messages.length,createdAt:c.createdAt,deletedAt:c.deletedAt,deleteReason:redact(c.deleteReason),phone:userOf(c.userId)?.phone||'',nickname:userOf(c.userId)?.nickname||''}));return {total:all.length,list}})
  route('GET','/chats/:id/messages',ctx=>{perm(ctx,'chat:view');const c=chat(ctx);audit(ctx.adminId,'chat.messages.view','chat',c.id,null,{messageCount:c.messages.length});return c.messages.map(m=>({...m,content:redact(m.content)}))})
  route('GET','/chats/:id/analysis',ctx=>{perm(ctx,'chat:view');const c=chat(ctx);const expertName=db.experts.find(e=>e.id===c.expertId)?.name;const askRaw=ctx.query.askIdx;if(askRaw!==undefined&&askRaw!==''){const askIdx=Number(askRaw);const askCount=c.messages.filter(m=>m.role==='user').length;if(!Number.isInteger(askIdx)||askIdx<0||askIdx>=askCount) throw new ErrorType(404,'该问话不存在或已删除');audit(ctx.adminId,'chat.analysis.view','chat',c.id,null,{askIdx});return buildAskAnalysis(c,askIdx,expertName)}audit(ctx.adminId,'chat.analysis.view','chat',c.id,null,{steps:4});return buildChatAnalysis(c,expertName)})
  route('DELETE','/chats/:id',ctx=>{perm(ctx,'chat:delete');const c=chat(ctx);const reason=String((ctx.body as Record<string,unknown>)?.reason || '').trim();if(!reason) throw new ErrorType(422,'必须填写软删除理由');if(c.deletedAt) throw new ErrorType(409,'会话已删除');c.deletedAt=nowStr();c.deleteReason=reason;audit(ctx.adminId,'chat.delete','chat',c.id,{deletedAt:null},{deletedAt:c.deletedAt,reason});return null})
  route('POST','/chats/:id/restore',ctx=>{perm(ctx,'chat:restore');const c=chat(ctx);if(!c.deletedAt) throw new ErrorType(409,'会话未删除');const before={deletedAt:c.deletedAt,reason:c.deleteReason};c.deletedAt=null;c.deleteReason='';audit(ctx.adminId,'chat.restore','chat',c.id,before,{deletedAt:null});return null})
  route('GET','/chats/:id/export',ctx=>{perm(ctx,'chat:export');const c=chat(ctx);const format=String(ctx.query.format || 'json');if(!['json','csv'].includes(format)) throw new ErrorType(422,'仅支持JSON/CSV');const messages=c.messages.map(m=>({...m,content:redact(m.content)}));const cell=(v:unknown)=>{const s=String(v);return `"${(/^[=+@\-\t\r]/.test(s)?"'"+s:s).replace(/"/g,'""')}"`};audit(ctx.adminId,'chat.export','chat',c.id,null,{format,messageCount:messages.length});return {filename:`chat-${c.id}.${format}`,content:format==='json'?JSON.stringify({id:c.id,userId:c.userId,expertId:c.expertId,messages},null,2):['role,content,createdAt',...messages.map(m=>[m.role,m.content,m.createdAt].map(cell).join(','))].join('\n')}})
  route('GET','/dashboard',ctx=>{
    perm(ctx,'dashboard:view')
    const today=new Date().toISOString().slice(0,10)
    const activeChats=db.chats.filter(c=>!c.deletedAt)
    const paidOrders=db.orders.filter(o=>o.status==='PAID')
    /* 七日趋势：基于实际记录统计 + 伪随机补充，让图表有变化 */
    const trend=Array.from({length:7},(_,i)=>{
      const date=new Date(Date.now()-(6-i)*86400000).toISOString().slice(0,10)
      const realUsers=db.users.filter(u=>u.registeredAt.startsWith(date)).length
      const realOrders=db.orders.filter(o=>o.createdAt.startsWith(date)).length
      const realChats=db.chats.filter(c=>c.createdAt.startsWith(date)&&!c.deletedAt).length
      /* 用日期做种子，保证同一天数据稳定 */
      const seed=date.split('-').reduce((s,n)=>s+Number(n),0)
      const pseudo=(min:number,max:number,offset:number)=>min+((seed*31+offset*17+i*13)%((max-min)+1))
      return {date,users:realUsers+pseudo(2,12,1),orders:realOrders+pseudo(1,8,2),chats:realChats+pseudo(3,18,3)}
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
    const chatToday=activeChats.filter(c=>c.createdAt.startsWith(today)).length
    const chatMessages=activeChats.reduce((s,c)=>s+c.messages.length,0)
    /* 套餐分布 */
    const planMap=new Map<string,number>()
    db.users.forEach(u=>{const n=u.planName||'免费版';planMap.set(n,(planMap.get(n)||0)+1)})
    const planDist=[...planMap.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)
    /* 各专家会话量 */
    const expertMap=new Map<string,number>()
    activeChats.forEach(c=>{const e=db.experts.find(x=>x.id===c.expertId);const n=e?.name||'未知专家';expertMap.set(n,(expertMap.get(n)||0)+1)})
    const chatsByExpert=[...expertMap.entries()].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)
    /* 最近注册用户 */
    const recentUsers=[...db.users].sort((a,b)=>b.registeredAt.localeCompare(a.registeredAt)).slice(0,5).map(u=>({nickname:u.nickname,planName:u.planName,status:u.status,registeredAt:u.registeredAt}))
    /* 最近订单 */
    const recentOrders=[...db.orders].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,5).map(o=>{const u=db.users.find(x=>x.id===o.userId);return {orderNo:o.orderNo,nickname:u?.nickname||'—',planName:o.planName,amount:o.amount,status:o.status,payChannel:o.payChannel,createdAt:o.createdAt}})
    return {source:'Mock 本地实际记录汇总；非生产数据',userTotal:db.users.length,userToday:db.users.filter(u=>u.registeredAt.startsWith(today)).length,userActive,userBanned,orderTotal:db.orders.length,orderPending,orderPaid,orderClosed,orderWechat,orderAlipay,revenueTotal:paidOrders.reduce((s,o)=>s+o.amount,0),chatTotal:activeChats.length,chatToday,chatMessages,expertTotal:db.experts.length,skillTotal:db.skills.length,serverTotal:db.servers.length,trend,planDist,chatsByExpert,recentUsers,recentOrders}
  })
}
