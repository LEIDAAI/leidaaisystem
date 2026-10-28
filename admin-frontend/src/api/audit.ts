import { get } from './request'
import type { AuditLogItem, AuditQuery, PageData } from './types'

export function listAuditLogs(params: AuditQuery): Promise<PageData<AuditLogItem>> {
  return get<PageData<AuditLogItem>>('/audit-logs', params)
}
