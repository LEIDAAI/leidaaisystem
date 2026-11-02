/**
 * 异步竞态守卫：为同类请求维护「最新序号」，乱序返回的旧响应据此丢弃，防止旧结果覆盖新结果。
 * 用法：
 *   const guard = createSeqGuard()
 *   const seq = guard.next()
 *   const data = await fetchList()
 *   if (!guard.isCurrent(seq)) return // 期间已发起新请求，丢弃本次过期结果
 */
export function createSeqGuard() {
  let seq = 0
  return {
    /** 开始一次新请求，返回本次序号 */
    next: (): number => ++seq,
    /** 该序号是否仍是最新一次请求 */
    isCurrent: (s: number): boolean => s === seq
  }
}
