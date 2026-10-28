import { get, post, del, exportCsv } from './request'
export interface ChatItem { id:number;userId:number;expertId:number;expertName:string;summary:string;messageCount:number;createdAt:string;deletedAt:string|null;deleteReason:string }
export interface Message { role:string;content:string;createdAt:string }
export interface AuditItem { id:number;adminUserId:number;username:string;action:string;objectType:string;objectId:string;beforeJson:Record<string,unknown>|null;afterJson:Record<string,unknown>|null;createdAt:string }
export interface Dashboard { source:string;userTotal:number;userToday:number;orderTotal:number;revenueTotal:number;chatTotal:number;expertTotal:number;skillTotal:number;serverTotal:number;trend:Array<{date:string;users:number;orders:number;chats:number}> }
export const listChats=(query:object)=>get<{total:number;list:ChatItem[]}>('/chats',query)
export const chatMessages=(id:number)=>get<Message[]>(`/chats/${id}/messages`)
export const deleteChat=(id:number,reason:string)=>del(`/chats/${id}`,{reason})
export const restoreChat=(id:number)=>post(`/chats/${id}/restore`)
export const exportChat=(id:number,format:string)=>exportCsv<{filename:string;content:string}>(`/chats/${id}/export`,{format})
export const listAudit=(query:object)=>get<{total:number;list:AuditItem[]}>('/audit-logs',query)
export const dashboard=()=>get<Dashboard>('/dashboard')
