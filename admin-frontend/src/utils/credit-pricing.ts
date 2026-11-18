/**
 * v41 接口计价规则（严格对齐《店雷达AI · 积分消耗与定价方案 v1》）。
 *
 * 三层口径：
 *   采购层  渠道套餐月采购价 ÷ 月额度 = 单位成本（元/次有效调用）
 *   成本层  单位成本 → 成本价（后台可见）
 *   用户层  成本价 × 加价倍数 ÷ 每分价（¥0.0049）→ 向上取整 = 扣分（用户只看这个数）
 *
 * 加价倍数：1688 为 5×（主动让利，毛利 80%），其余渠道 10×（毛利 90%）。
 * 计费粒度差异（方案原文强调，不可统一）：
 *   - 亚马逊：逐工具扣量差异极大（1/2/5/10/60/150/450 额度/次），必须逐工具配置
 *   - 云启（OZON/TEMU）：按次扣，1 次 = 1 单位，不分工具（字典/字段/额度查询不计次）
 *   - 1688：按次扣，不分工具
 */

/** 每积分标准价（¥98 ÷ 20,000 分，标准版月付） */
export const CREDIT_UNIT_PRICE = 0.0049

/** 渠道定义：采购价、额度、单位成本、加价倍数、每次扣分 */
export interface ChannelRule {
  key: string
  label: string
  /** 采用套餐 */
  plan: string
  /** 月采购价（元） */
  monthlyCost: number
  /** 月额度（次 / 点 / credits） */
  quota: number
  /** 单位成本（元/次有效调用） */
  unitCost: number
  /** 加价倍数（10 标准 / 5 为 1688 特例） */
  markup: number
  /** 每次有效调用扣分（向上取整后的最终值） */
  creditsPerCall: number
  /** 毛利（按每分 ¥0.0049 反算） */
  margin: number
  /** 计费粒度说明 */
  granularity: string
  /** 该渠道下的工具（工具名 → 中文名；亚马逊的额度消耗差异另行标注） */
  tools: Array<{ name: string; label: string; /** 亚马逊专用：每次消耗额度数（决定扣分） */ quotaPerCall?: number }>
}

/** 按方案 v1 第 1/3 章的五个渠道（+模型）硬编码规则；改价只需改这里 */
export const CHANNEL_RULES: ChannelRule[] = [
  {
    key: 'amazon',
    label: '亚马逊 Sorftime',
    plan: '¥99 档',
    monthlyCost: 99,
    quota: 30000,
    unitCost: 0.0033,
    markup: 10,
    creditsPerCall: 7,
    margin: 1 - 0.0033 / (7 * CREDIT_UNIT_PRICE),
    granularity: '逐工具扣量（1/2/5/10/60/150/450 额度/次）',
    tools: [
      { name: 'amazon_product_search', label: '商品搜索', quotaPerCall: 1 },
      { name: 'amazon_product_detail', label: '商品详情', quotaPerCall: 1 },
      { name: 'amazon_category_report', label: '类目报告', quotaPerCall: 2 },
      { name: 'amazon_keyword_research', label: '关键词研究', quotaPerCall: 5 },
      { name: 'amazon_reviews', label: '评论抓取', quotaPerCall: 10 },
      { name: 'amazon_patent_keyword', label: '专利检索', quotaPerCall: 60 },
      { name: 'amazon_patent_image', label: '专利图搜', quotaPerCall: 450 }
    ]
  },
  {
    key: 'yunqi-ozon',
    label: '云启 OZON',
    plan: '¥398 档',
    monthlyCost: 398,
    quota: 30000,
    unitCost: 0.0133,
    markup: 10,
    creditsPerCall: 27,
    margin: 1 - 0.0133 / (27 * CREDIT_UNIT_PRICE),
    granularity: '按次扣（不分工具）；字典/字段/额度查询不计次',
    tools: [
      { name: 'yq_ozon_goods_search', label: 'Ozon 商品搜索' },
      { name: 'yq_ozon_goods_detail', label: 'Ozon 商品详情' },
      { name: 'yq_ozon_spu_search', label: 'Ozon SPU 搜索' },
      { name: 'yq_ozon_spu_detail', label: 'Ozon SPU 详情' },
      { name: 'yq_ozon_mall_search', label: 'Ozon 店铺搜索' },
      { name: 'yq_ozon_mall_detail', label: 'Ozon 店铺详情' },
      { name: 'yq_ozon_market_stat', label: 'Ozon 大盘统计' },
      { name: 'yq_ozon_brand_search', label: 'Ozon 品牌搜索' },
      { name: 'yq_dict_lookup', label: '字典查询', },
      { name: 'yq_fields_lookup', label: '字段查询' },
      { name: 'yq_quota_status', label: '配额查询' }
    ]
  },
  {
    key: 'yunqi-temu',
    label: '云启 TEMU',
    plan: '¥398 档（与 OZON 共额度池）',
    monthlyCost: 0, // 与 OZON 共用同一份采购，不重复计入固定成本
    quota: 0,
    unitCost: 0.0133,
    markup: 10,
    creditsPerCall: 27,
    margin: 1 - 0.0133 / (27 * CREDIT_UNIT_PRICE),
    granularity: '按次扣（不分工具）',
    tools: [
      { name: 'yq_goods_search', label: 'TEMU 商品搜索' },
      { name: 'yq_goods_detail', label: 'TEMU 商品详情' },
      { name: 'yq_goods_comment', label: 'TEMU 商品评论' },
      { name: 'yq_goods_img_search', label: 'TEMU 图搜' },
      { name: 'yq_goods_data', label: 'TEMU 商品数据' },
      { name: 'yq_mall_search', label: 'TEMU 店铺搜索' },
      { name: 'yq_mall_detail', label: 'TEMU 店铺详情' },
      { name: 'yq_brand_search', label: 'TEMU 品牌搜索' },
      { name: 'yq_market_semi', label: 'TEMU 大盘半托管' },
      { name: 'yq_market_fully', label: 'TEMU 大盘全托管' }
    ]
  },
  {
    key: 'dld-1688',
    label: '1688 店雷达',
    plan: '旗舰年付 ¥2,598',
    monthlyCost: 216.5,
    quota: 12000,
    unitCost: 0.018,
    markup: 5,
    creditsPerCall: 18,
    margin: 1 - 0.018 / (18 * CREDIT_UNIT_PRICE),
    granularity: '按次扣（1 次业务操作 = 1 点）',
    tools: [
      { name: 'product_search_list', label: '选品库' },
      { name: 'cross_border_product_search_list', label: '跨境选品库' },
      { name: 'product_trend_new_list', label: '趋势新品' },
      { name: 'product_billboard_list', label: '商品榜' },
      { name: 'product_info', label: '商品分析' },
      { name: 'monitor_shop_analysis', label: '店铺分析' },
      { name: 'get_category_info', label: '类目查询' },
      { name: 'image_search', label: '图搜' },
      { name: 'shop_rank_list', label: '店铺榜' },
      { name: 'ali_offer_realtime_detail', label: '属性与证书' },
      { name: 'ali_offer_sku_prices', label: 'SKU 价格' },
      { name: 'monitor_shop_add', label: '店铺监控' },
      { name: 'monitor_offer_add', label: '商品监控' },
      { name: 'get_ali_offerRates', label: '评论抓取' },
      { name: 'global_image_search', label: '全网图搜' }
    ]
  },
  {
    key: 'fastmoss',
    label: 'TK FastMoss',
    plan: 'Max 首年 ¥439',
    monthlyCost: 439,
    quota: 5000,
    unitCost: 0.0878,
    markup: 10,
    creditsPerCall: 179,
    margin: 1 - 0.0878 / (179 * CREDIT_UNIT_PRICE),
    granularity: '按 credits 扣',
    tools: [
      { name: 'echotik_video_search', label: 'TK 视频搜索' },
      { name: 'echotik_influencer_ranklist', label: '达人榜' },
      { name: 'echotik_live_list', label: '直播榜' }
    ]
  },
  {
    key: 'shopee',
    label: '虾皮 Shopee',
    plan: '基础 ¥999',
    monthlyCost: 999,
    quota: 10000,
    unitCost: 0.0999,
    markup: 10,
    creditsPerCall: 204,
    margin: 1 - 0.0999 / (204 * CREDIT_UNIT_PRICE),
    granularity: '按次扣',
    tools: [
      { name: 'shopee_product_search', label: '虾皮商品搜索' },
      { name: 'shopee_shop_search', label: '虾皮店铺搜索' }
    ]
  }
]

/** 模型 token 扣分规则（方案第 4 章）：输入 4 分/千 tokens、输出 16 分/千 tokens（成本 ¥2/¥8 每百万 ×10 折算） */
export const MODEL_RULE = {
  key: 'deepseek',
  label: 'DeepSeek',
  inputCostPerMillion: 2,
  outputCostPerMillion: 8,
  markup: 10,
  /** 扣分：千 tokens 单价（输入 4 分、输出 16 分） */
  inputCreditsPerKToken: 4,
  outputCreditsPerKToken: 16
}

/** 按工具名查渠道规则 */
export function channelOfTool(toolName: string): { channel: ChannelRule; tool: { name: string; label: string; quotaPerCall?: number } } | null {
  for (const channel of CHANNEL_RULES) {
    const tool = channel.tools.find((t) => t.name === toolName)
    if (tool) return { channel, tool }
  }
  return null
}

/** 工具的单次成本价（元）：亚马逊按额度差异折算（unitCost × 额度数），其余按单位成本 */
export function toolCostPrice(channel: ChannelRule, tool?: { quotaPerCall?: number }): number {
  const quota = tool?.quotaPerCall ?? 1
  return Number((channel.unitCost * quota).toFixed(6))
}

/** 工具的单次扣分（用户价）：亚马逊按额度差异折算，其余用渠道标准扣分 */
export function toolCredits(channel: ChannelRule, tool?: { quotaPerCall?: number }): number {
  const quota = tool?.quotaPerCall ?? 1
  const raw = (channel.unitCost * quota * channel.markup) / CREDIT_UNIT_PRICE
  return Math.ceil(raw)
}

/** 由成本价与扣分反算毛利率 */
export function marginOf(costPrice: number, credits: number): number | undefined {
  const userPrice = credits * CREDIT_UNIT_PRICE
  if (userPrice <= 0) return undefined
  return 1 - costPrice / userPrice
}
