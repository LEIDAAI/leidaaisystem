import { exportCsv, get, post, put } from './request'
import type { OrderDetail, OrderExportResult, OrderItem, OrderQuery, PageData } from './types'
import { downloadBlobFile, downloadTextFile } from '../utils/download'

export function listOrders(params: OrderQuery): Promise<PageData<OrderItem>> {
  return get<PageData<OrderItem>>('/orders', params)
}

export function getOrderDetail(id: number): Promise<OrderDetail> {
  return get<OrderDetail>(`/orders/${id}`)
}

export function refundOrder(id: number, reason: string, amount: number): Promise<null> {
  return post<null>(`/orders/${id}/refund`, { reason, amount })
}

export function updateOrderRemark(id: number, remark: string): Promise<null> {
  return put<null>(`/orders/${id}/remark`, { remark })
}

/** v11 创建手工订单：手机号 + 常规套餐 + AI 积分 + 支付金额（线下录入） */
export function createManualOrder(payload: { phone: string; planId: number; credits: number; amount: number }): Promise<null> {
  return post<null>('/orders/manual', payload)
}

/** v11 创建赠送订单：手机号 + 赠送套餐 + 赠送时长（0=长期有效）+ 赠送 AI 积分 + 备注 */
export function createGiftOrder(payload: { phone: string; planId: number; durationMonths: number; credits: number; remark?: string }): Promise<null> {
  return post<null>('/orders/gift', payload)
}

export async function exportOrders(params: OrderQuery): Promise<void> {
  const result = await exportCsv<OrderExportResult>('/orders/export', params)
  if (result instanceof Blob) {
    downloadBlobFile(`orders-${Date.now()}.csv`, result)
  } else {
    downloadTextFile(result.filename, result.content)
  }
}
