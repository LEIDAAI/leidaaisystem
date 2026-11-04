import { del, get, put } from './request'
import type { FeedbackDetail, FeedbackHandlePayload, FeedbackItem, FeedbackQuery, PageData } from './types'

export function listFeedbacks(params: FeedbackQuery): Promise<PageData<FeedbackItem>> {
  return get<PageData<FeedbackItem>>('/feedbacks', params)
}

export function getFeedbackDetail(id: number): Promise<FeedbackDetail> {
  return get<FeedbackDetail>(`/feedbacks/${id}`)
}

export function handleFeedback(id: number, payload: FeedbackHandlePayload): Promise<FeedbackDetail> {
  return put<FeedbackDetail>(`/feedbacks/${id}/status`, payload)
}

export function deleteFeedback(id: number): Promise<null> {
  return del<null>(`/feedbacks/${id}`)
}
