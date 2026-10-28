export interface ApiResponse<T = unknown> { code: number; msg: string; data: T }
export interface PageData<T> { total: number; list: T[] }
export interface ProTableHandle { search(params?: Record<string, unknown>): void; refresh(): void }
export interface AdminInfo { id: number; username: string; displayName: string }
export interface SessionInfo { admin: AdminInfo; roles: string[]; permissions: string[] }
export interface LoginResult extends SessionInfo { token: string; expiresIn: number }
export interface AdminItem extends AdminInfo { status: number; roles: { id: number; name: string }[]; lastLoginAt: string | null; createdAt: string }
export interface AdminQuery { keyword?: string; status?: number | ''; page?: number; pageSize?: number }
export interface AdminCreatePayload { username: string; password: string; displayName: string; roleIds: number[] }
export interface AdminUpdatePayload { displayName: string; roleIds: number[] }
export interface RolePayload { code: string; name: string; remark: string; permissionIds: number[] }
export interface RoleItem extends RolePayload { id: number; status: number; createdAt: string }
export interface Permission { id: number; code: string; name: string; type: number; sort: number }
export interface PermissionModule { module: string; permissions: Permission[] }
export interface UserQuery { keyword?: string; status?: number | ''; start?: string; end?: string; page?: number; pageSize?: number }
export interface UserProfile { id: number; nickname: string; phone: string; email: string; status: number; registeredAt: string; lastLoginAt: string | null }
export interface UserItem extends UserProfile { planName: string; chatCount: number }
export interface EntitlementPayload { resourceType: 'EXPERT' | 'SKILL' | 'MCP_TOOL'; resourceId: number; quotaType: 'CHAT_COUNT' | 'SKILL_CALL'; quotaLimit: number; quotaPeriod: 'DAY' | 'MONTH' | 'LIFETIME' }
export interface Entitlement extends EntitlementPayload { resourceName: string; used: number }
export interface UserDetail {
  profile: UserProfile
  plan: { planId: number; planName: string; expireAt: string | null }
  entitlements: Entitlement[]
  orders: { totalCount: number; totalAmount: number; list: OrderItem[] }
  chatStats: { conversationCount: number; messageCount: number; lastChatAt: string | null }
  loginLogs: { ip: string; userAgent: string; loginAt: string }[]
}
export interface OrderQuery { orderNo?: string; userId?: number | string; status?: string; payChannel?: string; start?: string; end?: string; page?: number; pageSize?: number }
export interface OrderItem {
  id: number; orderNo: string; userId: number; userNickname: string; planId: number; planName: string
  amount: number; payChannel: string; status: string; remark: string
  paidAt: string | null; refundedAt: string | null; createdAt: string
}
export interface PayTransaction { id: number; txnNo: string; type: string; payChannel: string; amount: number; status: string; createdAt: string }
export interface OrderDetail extends OrderItem { transactions: PayTransaction[] }
export interface OrderExportResult { filename: string; content: string }
export interface AuditQuery { adminUserId?: number; action?: string; objectType?: string; objectId?: string; start?: string; end?: string; page?: number; pageSize?: number }
export interface AuditLogItem { id: number; adminUserId: number; username: string; action: string; objectType: string; objectId: string; beforeJson: unknown; afterJson: unknown; ip: string; createdAt: string }
