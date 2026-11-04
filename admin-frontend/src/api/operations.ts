import { get, post, del, exportCsv } from './request'
export interface ChatItem { id:number;userId:number;expertId:number;title:string;expertName:string|null;summary:string;messageCount:number;createdAt:string;deletedAt:string|null;deleteReason:string;phone?:string;nickname?:string }
export interface Message { role:string;content:string;createdAt:string }
/** 对话管理（用户视角）：一行 = 一个用户 + 其最新一条对话 */
export interface UserChatRow { userId:number;nickname:string;phone:string;region:string;chatCount:number;activeCount:number;latest:Pick<ChatItem,'id'|'expertId'|'title'|'expertName'|'summary'|'messageCount'|'createdAt'|'deletedAt'|'deleteReason'> }
/** 会话分析产物：分析过程步骤 + 候选对比表格 + HTML 报告 */
export interface ChatAnalysisStep { title:string;detail:string;tools:string[];durationSec:number;at:string }
export interface ChatAnalysisTable { title:string;columns:string[];rows:string[][] }
export interface ChatAnalysis { steps:ChatAnalysisStep[];table:ChatAnalysisTable;reportHtml:string }
export interface NameCount { name:string;count:number }
export interface Dashboard {
  source:string;userTotal:number;userToday:number;userActive:number;userBanned:number
  orderTotal:number;orderPending:number;orderPaid:number;orderClosed:number;orderWechat:number;orderAlipay:number
  revenueTotal:number;chatTotal:number;chatToday:number;chatMessages:number
  expertTotal:number;skillTotal:number;serverTotal:number
  trend:Array<{date:string;users:number;orders:number;chats:number}>
  planDist:NameCount[];chatsByExpert:NameCount[]
  recentUsers:Array<{nickname:string;planName:string;status:number;registeredAt:string}>
  recentOrders:Array<{orderNo:string;nickname:string;planName:string;amount:number;status:string;payChannel:string;createdAt:string}>
}
export const listChats=(query:object)=>get<{total:number;list:ChatItem[]}>('/chats',query)
export const listChatUsers=(query:object)=>get<{total:number;list:UserChatRow[]}>('/chats/users',query)
export const chatMessages=(id:number)=>get<Message[]>(`/chats/${id}/messages`)
/** askIdx 传参时返回该问话（第 askIdx 条用户消息）的分析，否则返回整个会话的分析 */
export const chatAnalysis=(id:number,askIdx?:number)=>get<ChatAnalysis>(`/chats/${id}/analysis`,askIdx===undefined?undefined:{askIdx})
export const deleteChat=(id:number,reason:string)=>del(`/chats/${id}`,{reason})
export const restoreChat=(id:number)=>post(`/chats/${id}/restore`)
export const exportChat=(id:number,format:string)=>exportCsv<{filename:string;content:string}>(`/chats/${id}/export`,{format})
export const dashboard=()=>get<Dashboard>('/dashboard')
