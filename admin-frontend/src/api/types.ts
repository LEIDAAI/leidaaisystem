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
/** v50 用户到期状态：直接复用会员五态，列表/筛选/详情同一口径 */
export type UserExpiryStatus = 'ACTIVE' | 'EXPIRED' | 'LIFETIME' | 'NONE' | 'UNKNOWN'
export interface UserQuery {
  keyword?: string
  /** v50 到期状态筛选（原 status 正常/封禁已随封禁功能一并移除） */
  expiryStatus?: UserExpiryStatus | ''
  start?: string
  end?: string
  page?: number
  pageSize?: number
}
export interface UserProfile { id: number; phone: string; email: string; registeredAt: string; lastLoginAt: string | null }
export interface UserItem extends UserProfile { planName: string; chatCount: number; wechatNickname: string; region: string; expireAt: string | null }
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
/** v49 到期状态筛选枚举：未到期 / 已到期 / 长期有效 / 未生效（待支付、已关闭）；UNKNOWN 仅用于展示兜底 */
export type OrderExpiryStatus = 'ACTIVE' | 'EXPIRED' | 'LIFETIME' | 'INACTIVE' | 'UNKNOWN'
export interface OrderQuery {
  orderNo?: string
  userId?: number | string
  /** v49 关键字：手机号 / 微信昵称 / 用户ID 模糊匹配 */
  keyword?: string
  status?: string
  /** v49 订单来源 ONLINE / MANUAL / GIFT */
  source?: string
  /** v49 购买动作 FIRST_PURCHASE / RENEW / UPGRADE / SWITCH / PACK */
  orderCategory?: string
  /** v49 到期状态 */
  expiryStatus?: OrderExpiryStatus | ''
  /** v49 套餐 id */
  planId?: number | ''
  payChannel?: string
  start?: string
  end?: string
  page?: number
  pageSize?: number
}
export type DurationMode = 'LIFETIME' | 'CUSTOM_DAYS' | 'MEMBERSHIP'
export interface MembershipInfo {
  source: 'MOCK'
  status: 'ACTIVE' | 'EXPIRED' | 'NONE' | 'LIFETIME' | 'UNKNOWN'
  expiresAt: string | null
  isLifetime: boolean
}
export interface OrderItem {
  id: number; orderNo: string; userId: number; wechatNickname: string; planId: number; planName: string
  /** v52 用户注册时间（取自用户表，用户缺失时缺省），订单列表展示用 */
  registeredAt?: string
  /** 订单来源：ONLINE 线上订单 / MANUAL 手工订单 / GIFT 赠送订单 */
  source: string
  /** v21 购买动作类型（可缺省）：首购/续费/升级/切换/增购 */
  orderCategory?: 'FIRST_PURCHASE' | 'RENEW' | 'UPGRADE' | 'SWITCH' | 'PACK'
  /** v21 改价原因快照（订单详情直接可见，审计另有完整记录） */
  priceChangeReason?: string
  /** v21 待支付报价有效期（场景 24） */
  quoteExpireAt?: string | null
  /** v21 报价已过期标记（仅待支付单返回） */
  quoteExpired?: boolean
  /** 实付金额 */
  amount: number
  goodsAmount: number; discountAmount: number
  remainingCredits: number; durationMonths: number | null; last7DaysUsage: number
  durationMode?: DurationMode
  membership?: MembershipInfo
  payChannel: string; status: string; remark: string
  phone?: string
  expiresAt?: string | null
  durationDays?: number
  paidAt: string | null; createdAt: string
}
export interface PayTransaction { id: number; txnNo: string; type: string; payChannel: string; amount: number; status: string; createdAt: string }
export interface OrderDetail extends OrderItem { transactions: PayTransaction[] }
export interface FeedbackQuery { keyword?: string; status?: string; start?: string; end?: string; page?: number; pageSize?: number }
export interface FeedbackChatRef { chatId: number; summary: string }
export interface FeedbackItem {
  id: number; fbNo: string; userId: number; wechatNickname: string; userStatus: number
  content: string; images: string[]; chatRefs: FeedbackChatRef[]
  status: string; rewardPoints: number; handleRemark: string; handledBy: string; handledAt: string | null; createdAt: string
}
export type FeedbackDetail = FeedbackItem
export interface FeedbackHandlePayload { status: 'ADOPTED' | 'REJECTED'; rewardPoints?: number; handleRemark?: string }
