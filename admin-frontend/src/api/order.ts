import { exportBlob, get, post, put } from './request'
import type { OrderDetail, OrderItem, OrderQuery, PageData } from './types'
import { downloadBlobFile } from '../utils/download'
import { isValidMoney } from '../utils/format'

export function listOrders(params: OrderQuery): Promise<PageData<OrderItem>> {
  return get<PageData<OrderItem>>('/orders', params)
}

export function getOrderDetail(id: number): Promise<OrderDetail> {
  return get<OrderDetail>(`/orders/${id}`)
}

export function updateOrderRemark(id: number, remark: string): Promise<null> {
  return put<null>(`/orders/${id}/remark`, { remark })
}

/** 仅待支付线上订单可改应付价；提交原价用于防止并发覆盖 */
export function updateOrderPrice(id: number, amount: number, expectedAmount: number, reason: string): Promise<null> {
  return put<null>(`/orders/${id}/price`, { amount, expectedAmount, reason })
}

/** v11 创建手工订单：手机号 + 常规套餐 + AI 积分 + 支付金额（线下录入） */
export function createManualOrder(payload: { phone: string; planId: number; credits: number; amount: number }): Promise<null> {
  if (!isValidMoney(payload.amount)) return Promise.reject(new Error('请填写支付金额，支持明确 0 元且最多两位小数'))
  return post<null>('/orders/manual', payload)
}

/** 运营特批赠送：服务端须独立校验 order:gift 权限并审计必填原因；0 个月表示长期有效。 */
export function createGiftOrder(payload: { phone: string; planId: number; durationMonths: number | null; credits: number; remark?: string }): Promise<null> {
  const remark = payload.remark?.trim()
  if (!remark || remark.length > 200) return Promise.reject(new Error('特批赠送须填写原因，最多 200 字'))
  return post<null>('/orders/gift', { ...payload, remark })
}

export async function exportOrders(params: OrderQuery): Promise<void> {
  const result = await exportBlob('/orders/export', params)
  downloadBlobFile(`orders-${Date.now()}.xlsx`, result)
}
