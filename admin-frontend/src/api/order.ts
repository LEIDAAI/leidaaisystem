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

export async function exportOrders(params: OrderQuery): Promise<void> {
  const result = await exportCsv<OrderExportResult>('/orders/export', params)
  if (result instanceof Blob) {
    downloadBlobFile(`orders-${Date.now()}.csv`, result)
  } else {
    downloadTextFile(result.filename, result.content)
  }
}
