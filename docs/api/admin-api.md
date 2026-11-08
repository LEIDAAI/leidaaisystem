# 雷达AI 管理后台 Admin API 契约

版本：v0.8 / Mock schema 19（2026-11-08 源码同步；保留 P0/P1/P2、R9–R11 与模型探测契约；本轮 33 缺陷、8 交互、2 组规则详见功能清单第 9 节；无真实 Java/交易服务联调）

已拍板规则：标准/高级/旗舰三档同功能、单账号；升级按实付折算且负补差取 0，月转年即时并按 365 天重置锚点，年转月/降级到期切换，未来期锁价排队；当期/未来期一律不退款，无自动续费、提前 7 天提醒；常规赠分仅注册 100，积分包仅有效会员可购、365 天有效且不随会员到期清零。**规则文本、Mock 迁移及订单记录不等同真实报价、支付、会员时间轴、积分账本或提醒调度。** 本文明确保留当前写接口未强制规则的缺口，完整规则见 `../功能清单.md` 第 8 节。
基础路径：`/admin/api`
鉴权：`Authorization: Bearer <token>`（除登录外全部需要；前台工作台契约 `/api/v1/workspace/**` 与本鉴权体系隔离，见第 12 节）

## 变更记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v0.8 | 2026-11-08 | 角色选项、封禁/解封、会员五态、modelId、上传响应 ID、默认专家 PUT、候选校验后提交/完整恢复、MCP 工具快照、特批权限/原因；明确自动保存与真实交易边界 |
| v0.1 | 2026-10-28 | P0：认证 / 管理员 / 角色 / 用户 / 订单 / 审计 |
| v0.2 | 2026-10-28 | P1 初版：套餐/专家/技能/MCP CRUD、权益绑定、变更刷新联动 |
| v0.3 | 2026-10-28 | 配置公共约定修订：细粒度 view/edit 权限、refresh 状态机、个体权益周期、对话管理 |
| v0.4 | 2026-10-28 | **附录 12 助手体系模型改造**：专家=助手预设（code/baseModel/建议问题/能力开关/tags/visibility/全量版本历史/导入导出）；技能=SKILL.md 内容型（content/files/版本快照 diff/恢复/克隆/导入导出/绑定助手数，paramSchema/execConfig 降级为可选高级字段）；MCP=MCP/OpenAPI 双类型连接（connType/path/transport/auth 掩码/toolFilter）；新增 C 端工作台只读 API（experts 列表+`{code}`详情、skills、mcps）；专家导出/导入复用 `expert:edit`，技能克隆/导出为 v4 新增权限点 |
| v0.5 | 2026-10-28 | **模型管理 / 平台维度 / 版本名称**：新增 `/models` 基础模型注册表（api_key 掩码、default_params、连通测试、删除引用 409、MODEL 变更事件，权限 `model:view`/`model:edit`）；专家/技能/MCP 全量增加 `platforms` 平台多选数组（1688/OZON/AMAZON/TEMU，至少一个）；保存/恢复走版本确认框（`versionName` 默认 yyyyMMddHHmmss + 可选 `note`），版本历史展示版本名称/操作人；MCP 补齐快照历史（`GET/POST /mcp/servers/{id}/versions|restore`）；workspace 响应带 `platforms` 并支持 `?platform=` 查询过滤（任一命中）；localStorage schema v4→v5 幂等迁移 |
| v0.6 | 2026-10-29 | **专家草稿对话预览**：新增 `POST /experts/preview-chat`（编辑抽屉右侧实时调试，左侧草稿未保存即生效：system_prompt/base_model/model_params.temperature/skill_ids/mcp_server_ids/capabilities/suggested_questions）；响应含 `trace`（matchedSkills/toolCalls/model/latencyMs）；Mock 为演示引擎（确定性仿真 400–900ms 延迟，标注「模拟回复」）；演示专用 `POST /models/{id}/reveal-key`（仅超管）支撑预览面板「真实调用」浏览器直连（OpenAI 兼容，生产走 Java 后端代理，Key 不下发浏览器） |
| v0.7 | 2026-10-29 | **模型端点自动发现（本次）**：新增 `POST /models/probe`（填接入地址 + API Key 一键拉取端点全部模型列表，新建模型表单「自动发现」使用，选中即回填 code/显示名/供应商）；开发环境经 Vite 本地代理 `/__llm-proxy` 转发绕过浏览器 CORS（Key 仅随请求头透传不落盘），生产由 Java 后端代理实现同契约；演示种子 glm-5.3 切换至内网演示网关 `http://192.168.1.10:8080/v1`（幂等迁移：仅原始 mock 凭据未动过时覆盖），预览「真实调用」直连失败自动经开发代理兜底重试 |

## 订单改价与可选首购价格配置（2026-11-07，后台 Mock）

- `PUT /orders/{id}/price`，权限 `order:price`（默认超管、运营；其他角色可由角色管理独立授权）。请求 `{amount:number, expectedAmount:number, reason:string}`；amount 为新应付价，0～订单商品金额，最多两位小数且须改变；reason trim 后必填、最多 200 字；expectedAmount 必须等于当前应付价，否则返回 409 防止覆盖他人修改。仅线上待支付、未记录任何支付流水且未付的订单允许；已支付、关闭、手工、赠送拒绝 409。成功后商品金额不变，`discountAmount = goodsAmount - amount`，审计保存原价、新价与原因；列表/详情/导出读取同一订单字段。当前仅 Mock，真实渠道预下单/二维码必须作废并重建后才能开放改价；0 元订单的免支付履约需交易服务另行定义。
- 常规套餐 `POST/PUT /plans` 可选 `firstPurchasePrice?: number | null`（仅未配置月/年周期时使用基础首购价），以及 `billingCycles[].firstPurchasePrice?: number`（月付与年付分别配置）。留空不设置，显式 0 元有效，非负、最多两位小数；周期售价留空时该周期及首购价均不保存。赠送套餐无首购价。字段进入套餐版本快照和恢复；现有手工单仍默认正常价。当前仅存配置，不判定首购资格、不生成线上交易报价、不回改已有订单。

## R10 积分包统一入口与滑块配置预览（2026-11-05）

本修订为后台前端与 localStorage mock 契约，独立前台尚未消费，无真实支付或积分到账联调。新建类型顺序为常规套餐 / 积分包套餐 / 赠送套餐；积分包复用 CreditPackage 与 `/credit-packages`，不向 `/plans` 写 NORMAL 或重复记录。会员套餐历史版本、时长模式保留，类型创建后不可改；`/plans` 仅接受 NORMAL/GIFT，旧缺类型兼容 NORMAL，传 CREDIT_PACKAGE 返回422。手工订单只接受启用 NORMAL，不接入积分包。

| 方法 | 管理端路径 | 权限 | 数据/说明 |
|---|---|---|---|
| GET | /credit-packages | plan:view | 按sort、id升序；管理端含停用和内部备注 |
| POST / PUT | /credit-packages、/credit-packages/{id} | plan:edit | 新建/编辑固定包，独立于plans；无版本或刷新链路 |
| DELETE | /credit-packages/{id} | plan:edit | 删除固定包，不删会员套餐 |
| GET / PUT | /billing-settings | plan:view / plan:edit | 同源读取/保存计费设置；滑块快捷弹窗仅合并修改creditSlider，保留其他设置 |

固定包字段：`id,name,credits,bonusCredits,price,originalPrice?,badge?,sort,status,remark?,createdAt,updatedAt`。名称必填、积分正整数、售价非负、划线价可空且填值须大于售价、排序非负整数、状态0/1、备注最多200字。现行规则为购买不另赠积分：表单提交 `bonusCredits=0`，schema 19 迁移现存包赠分归零并留存旧配置；**当前 Mock 写接口只校验 bonusCredits 为非负整数，仍接受非零值，规则强制尚缺。** 审计 before 在覆盖前深复制，与 after 独立。商品不改变会员等级/期限；仅有效会员可购、积分365天有效且会员到期不清零为已拍板规则，购买、到账、独立批次到期服务仍未接。

`BillingSettings` 保留 `registerBonus`、`upgradePolicy`；UI 固定 `registerBonus=100`、`upgradePolicy=PRORATED`，但当前写接口仍接受其他非负整数赠分及 `FULL_PRICE|PRORATED`，尚未在服务层强制已拍板规则；这些枚举均不执行真实升级报价。`creditSlider` 为 `{enabled,min,max,step,defaultValue,unitPrice}`。启用时 min/max/step 均为正安全整数且 max>min，`(max-min)%step=0`；defaultValue 为范围内安全整数且 `(defaultValue-min)%step=0`；unitPrice 为正有限数。旧配置或旧调用缺defaultValue时回填min。停用参数允许非负数。无效提交422且不覆盖已有配置。后台预览从defaultValue起，可左右拖到上下限，提高max即可预览超过旧上限；总价 `Math.round(credits*unitPrice*100)/100` 元（展示两位小数）。现行统一单价，不引入前台门槛阶梯折扣，不绑定截图商品价。

### GET /api/v1/workspace/credit-packages（公开只读 mock，待前台接入）

独立于 `/admin/api`，匿名 GET，响应仍包装 `{code,msg,data}`。data 包含 `packages`（仅status=1、sort/id升序）和 `creditSlider`。商品仅白名单 `id,name,credits,bonusCredits,price,originalPrice,badge,sort`，可选字段未配置时省略；内部备注、创建/修改审计字段、注册赠送、升级策略不下发。滑块启用时输出全部滑块字段，停用仅 `{enabled:false}`。没有公共写接口（未注册方法返回404）。

```json
{"packages":[{"id":1,"name":"示例固定包","credits":1000,"bonusCredits":0,"price":20,"sort":1}],"creditSlider":{"enabled":true,"min":1000,"max":200000,"step":1000,"defaultValue":3000,"unitPrice":0.015}}
```

示例仅说明字段映射；固定包采用独立售价，自定义采用积分乘单价。独立前台未修改，原有门槛阶梯价未联调。后台预览和目录均不创建订单，不构成会员或支付到账闭环。关联 PN-A04-18/19、PN-A06-05/06、TC-97～104；完整说明见 `docs/feature-spec.html`。

## 通用约定

- 响应包装：

```json
{ "code": 0, "msg": "ok", "data": {} }
```

- `code=0` 成功；`401` 未登录/Token 失效；`403` 无权限；`422` 参数校验失败；`500` 服务异常；业务错误 msg 直接透出给前端展示
- 分页参数：`page`（从 1 开始）、`pageSize`（默认 20，最大 100）；分页返回：

```json
{ "total": 123, "list": [] }
```

- 时间格式：`yyyy-MM-dd HH:mm:ss`（ISO 8601 亦可，前端按 dayjs 解析）
- 当前审计由 Mock handler 写入 localStorage；真实后端 `admin_audit_log`/AOP 属接入契约，不能据此称已联调。最新日志按 createdAt/id 降序保留前 500 条，配置历史按资源保留最近 20 条。
- 前端请求捕获 token + 会话版本；跨标签页切换使旧身份及在途响应失效，旧 `/auth/me` 或旧 401 不覆盖/清除新会话。身份恢复网络失败保留 token 并允许重试，成功后才判定 403；角色/管理员变更后刷新权限，受保护导航和窗口回焦再次校验。
- 对话列表、分析、报告和 JSON/XLSX 日期统一北京时间（UTC+08:00）；报告三个入口共用净化静态文档、禁脚本 CSP 与无权限 sandbox。

---

## 1. 认证 Auth

### POST /auth/login
```json
// 请求
{ "username": "admin", "password": "******" }
// 响应 data
{
  "token": "jwt...",
  "expiresIn": 7200,
  "admin": { "id": 1, "username": "admin", "displayName": "系统管理员" },
  "roles": ["SUPER_ADMIN"],
  "permissions": ["dashboard:view", "admin:manage", "..."]  // 权限点数组，前端菜单/按钮显隐依据
}
```
- 密码连续错误 5 次锁定 15 分钟：返回 `code=423, msg="账号已锁定，请15分钟后重试"`

### POST /auth/logout
无需参数，服务端将 token 加入黑名单。

### GET /auth/me
返回同 login 的 `admin/roles/permissions`，用于页面刷新时恢复会话。

---

## 2. 管理员账号 /admins

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /admins | admin:manage | 参数 `keyword`(用户名/显示名模糊)、`status`、分页 |
| POST | /admins | admin:edit | `{username, password, displayName, roleIds[]}` |
| PUT | /admins/{id} | admin:edit | `{displayName, roleIds[]}`（不含密码） |
| PUT | /admins/{id}/status | admin:edit | `{status: 0\|1}`，不能禁用自己 |
| PUT | /admins/{id}/password | admin:edit | `{password}` 重置密码 |
| DELETE | /admins/{id} | admin:edit | 不能删除自己 |

管理员列表项：`{id, username, displayName, status, roles:[{id,name}], lastLoginAt, createdAt}`

### GET /admin-role-options

权限：`admin:manage` 或 `admin:edit` 任一；响应 data 为 `[{id,code,name,status}]`（按 id 升序，不分页）。非超管仅返回启用且全部权限均在当前授权范围内的角色，不返回 SUPER_ADMIN；超管可读取停用角色供展示。创建/编辑管理员仍要求分配的角色存在、启用且不越权，无效角色 422、越权 403，不能用角色选项接口替代角色管理授权。表单字典失败可重试，未加载成功不可保存；保存响应绑定目标 ID、表单版本和会话，不关闭后打开的新草稿。

## 3. 角色 /roles

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /roles | role:manage | 全量列表（不分页）：`{id, code, name, remark, status, permissionIds[], createdAt}` |
| POST | /roles | role:manage | `{code, name, remark, permissionIds[]}` |
| PUT | /roles/{id} | role:manage | 同上 |
| PUT | /roles/{id}/status | role:manage | `{status}`，内置角色（SUPER_ADMIN）不可禁用 |
| DELETE | /roles/{id} | role:manage | 有账号绑定的角色拒绝删除 `code=409` |

### GET /permissions
全量权限点字典（不分页，按 module 分组返回）：`{module, permissions:[{id, code, name, type, sort}]}`

## 4. 审计日志 /audit-logs（接口 P0 提供，页面 P2）

| 方法 | 路径 | 权限点 |
|---|---|---|
| GET | /audit-logs | audit:view |

参数：`adminUserId`、`action`、`objectType`、`objectId`、`start`、`end`、分页。
返回项含 `beforeJson/afterJson` 原始对象，前端做 diff 展示。

---

## 5. 用户管理（C 端）/users

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /users | user:view | 参数 `keyword`(手机号/邮箱/昵称/ID)、`status`(1正常 0封禁)、`start`/`end`(注册时间)、分页 |
| GET | /users/{id} | user:view | 用户详情 |
| PUT | /users/{id}/status | user:ban | `{banned:boolean, reason:string}`；true封禁、false解封；原因trim后必填且≤200字；重复状态409 |
| PUT | /users/{id}/entitlements | user:entitlement | 个体权益覆盖：`[{resourceType, resourceId, quotaType, quotaLimit}]` |

状态处理为 Mock：banned 非 boolean、reason 为空或超长返回422；用户不存在404；重复状态或非0/1账户状态409。封禁记录 `{startedAt,endedAt:null}` 冻结区间；解封关闭区间，若会员期限在封禁开始时仍有效，则按已记录冻结时长顺延期限；已过期/未知期限不凭空补会员。历史封禁无起点仅从迁移时刻建基线，不推算未知历史。返回 data=null，审计 `user.ban/user.unban`，含原因、状态和期限；冻结中拒绝权益调整和新订单。**接口已有解封，当前 UsersView 仍缺解封按钮；真实账号登录阻断、注销及积分/未来期资产冻结恢复未形成服务闭环。**

### GET /users 列表项
`{id, wechatNickname, phone, email, region, status, planName, chatCount, registeredAt, lastLoginAt, expireAt, membership, assetsFrozen}`。

`membership={source:'MOCK',status:'ACTIVE'|'EXPIRED'|'NONE'|'LIFETIME'|'UNKNOWN',expiresAt:string|null,isLifetime:boolean}`；列表在顶层、详情在 `plan.membership`；`expireAt` 为同源兼容字段。只有显式 LIFETIME 显示长期，NONE为无会员，UNKNOWN为期限未知，空日期不得推断终身；`assetsFrozen` 表示当前用户封禁。会员模式订单同用此来源。详情读取/权益保存由前端捕获目标ID与请求序号、复制提交载荷，旧回包失效，错误可重试。

### GET /users/{id} 详情
```json
{
  "profile": { "id": 1, "nickname": "...", "phone": "...", "email": "...", "status": 1, "registeredAt": "...", "lastLoginAt": "..." },
  "plan": { "planId": 1, "planName": "标准版", "expireAt": "...", "membership": { "source": "MOCK", "status": "ACTIVE", "expiresAt": "...", "isLifetime": false }, "assetsFrozen": false },
  "entitlements": [{ "resourceType": "EXPERT", "resourceId": 3, "resourceName": "1688分销选品", "quotaType": "CHAT_COUNT", "quotaLimit": 100, "used": 32 }],
  "orders": { "totalCount": 5, "totalAmount": 897.00, "list": [ /* 最近10条，同订单列表项 */ ] },
  "chatStats": { "conversationCount": 12, "messageCount": 356, "lastChatAt": "..." },
  "loginLogs": [{ "ip": "...", "userAgent": "...", "loginAt": "..." }]
}
```

## 6. 订单管理 /orders

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /orders | order:view | 参数 `orderNo`、`userId`、`status`(PENDING/PAID/CLOSED)、`payChannel`(WECHAT/ALIPAY/OFFLINE)、`start`/`end`、分页 |
| GET | /orders/{id} | order:view | 详情，含支付流水列表 |
| POST | /orders/manual | order:create | `{phone, planId, credits, amount}`；正常用户、启用常规套餐；R6 服务端先验证套餐存在、启用且为常规，再读取套餐 credits（含 0），不信任并忽略传入 credits（为兼容现有 payload 保留字段）；套餐积分非负有限；amount必须为原始有限number、非负且最多两位小数，null/空串/缺失/三位小数422，显式0有效；生成Mock PAID/OFFLINE订单及成功流水，不代表真实收款 |
| POST | /orders/gift | order:create + order:gift（同时） | `{phone,planId,durationMonths,credits,remark}`；启用GIFT，有限1–36整数月（默认ceil(durationDays/30)）、长期0、MEMBERSHIP传null并读会员源；credits非负安全整数；remark为必填特批原因trim后≤200字；金额全0、无支付流水；记录creditBatchType=OPS_EXCEPTION并审计原因/类型，未生成真实积分批次 |
| PUT | /orders/{id}/remark | order:remark | `{remark}` 备注（留痕） |
| GET | /orders/export | order:export | R8：同列表筛选，忽略分页导出全部命中项；Mock 在 `{code:0,msg,data}` 的 data 中返回真正 OOXML XLSX Blob，exportBlob 在 mock 模式解包、真实模式按 responseType=blob 接收；前端下载 `orders-时间戳.xlsx`，MIME 为 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`；真实后端待按同一二进制契约实现 |

### 订单项（R9，2026-11-05）

用户于 2026-11-05 确认「跟随会员有效期」：会员续费赠送继续有效，到期失效。仅本仓库后台实现，独立前台未改。

- 套餐 `durationMode: LIFETIME | CUSTOM_DAYS | MEMBERSHIP` 独立保存、白名单校验、进入版本快照及恢复字段；旧数据缺失模式按 `durationDays===0` 归一 LIFETIME，否则 CUSTOM_DAYS。LIFETIME 存 0 天，CUSTOM_DAYS 为正整数天，MEMBERSHIP 清空 durationDays，仅 GIFT 可用，NORMAL 传会员模式返回 422。恢复旧快照显式归一模式并清理当前值，禁止会员残留。
- 新订单显式记录 durationMode；会员模式 `durationMonths=null`（不能用 0），不存固定 expiresAt。赠送创建锁定「会员期内有效」，不显示 1–36 月，不允许客户端填写会员到期；服务端由套餐确定模式，忽略客户端 mode/到期字段。NONE/EXPIRED/UNKNOWN 用户拒绝 422，ACTIVE/LIFETIME 可创建。
- 当前唯一来源是 `readMockMembership`，只读取持久化 `MockUser.membershipExpireAt:string|null`、`membershipIsLifetime` 和明确付费计划，标准返回 `membership:{source:'MOCK',status:ACTIVE|EXPIRED|NONE|LIFETIME|UNKNOWN,expiresAt:string|null,isLifetime:boolean}`。用户列表/详情 expireAt 同源。v17 仅缺失期限字段时按旧注册+1年口径一次性补值：历史演示回填非真实权益；保留已有字段（含 null）与早期显式 mockMembership，不重置数据。读取时不再推算注册日期。免费版 null 是 NONE，付费版 null 是 UNKNOWN；终身需显式标记，不因 null 推断，无内置真实终身会员来源。真实会员服务、续费、退款及积分回收均未接入；mock 验证直接更新该单一记录。C端配置仅透传，会员模式消费未接入。
- MEMBERSHIP 订单每次列表/详情/导出经 toOrderItem 动态读取当前会员源并返回 expiresAt 与 membership；模拟源到期改变后再次查询即跟随，不把创建时会员有效期固定成订单历史。前端 format 仅消费标准返回值。ACTIVE 到期前未到期N天；EXPIRED 已到期N天；NONE 会员已失效/—；UNKNOWN —；长期会员显示「会员期内有效（长期会员）」，不作为赠送独立永久有效。XLSX 与列表/详情共用解析；历史到期补值跳过 MEMBERSHIP。
- 保留创建不回写用户权益边界；此链路仅已完成模拟源驱动的运行验证，真实会员联调仍待接入。以下固定时长规则仅适用于非 MEMBERSHIP 订单。
`{id, orderNo, userId, phone, wechatNickname, planId, planName, source, amount, goodsAmount, discountAmount, remainingCredits, durationMode?, durationMonths:number|null, durationDays?, expiresAt?, membership?, last7DaysUsage, payChannel, status, remark, paidAt, createdAt}`；详情另含 `transactions[]`。来源 `ONLINE/MANUAL/GIFT`。退款接口、退款权限及退款状态已移除；状态仅待支付/已支付/已关闭。

- `phone` 由 `userId` 关联当前用户手机号，保留原脱敏格式，查无显示 `—`；不保存订单手机号快照。
- `expiresAt` 为订单级明确到期时间（`yyyy-MM-dd HH:mm:ss`，dayjs 同现有时间约定解析），长期有效明确为 `null`；可选以兼容旧接口，缺失或非法值显示 `—`，不可据此推断长期有效。`durationDays` 为新手工订单创建时套餐精确天数快照，不随套餐变更。
- 时长展示优先精确 `durationDays`（如1天显示1天），仅旧无天数快照时回退月数；赠送自定义默认月数按 `ceil(durationDays/30)`，不向下取整。新手工订单：以 `paidAt + durationDays 天` 计算 `expiresAt`，不先转换月数；套餐 0 天为长期有效。新赠送订单：以 `paidAt + 用户实际选择的 durationMonths 日历月` 计算，月底按目标月份末日收敛；长期有效固定 0 月、`expiresAt=null`。
- PAID 且明确长期标记（0 月或 0 天）并且 `expiresAt=null`：到期状态/时间均为「长期有效」。PENDING/CLOSED：状态「未生效」、时间 `—`。PAID 有限到期：`now < expiresAt` 显示「未到期 ceil((expiresAt-now)/86400000)天」，否则「已到期 ceil((now-expiresAt)/86400000)天」；相等为已到期 0 天。
- 列表/详情/XLSX 共用 `formatOrderExpiry` 与 `formatOrderDuration`；页面单一时钟每分钟只刷新当前返回值的倒计时，并在卸载时清理。会员记录变动后须重新查询列表或重开详情取得最新期限；XLSX 每次请求动态读取会员源，一次导出固定同一个 now。长期订单月份必须传 0，null 不转换成 0。严格插列：微信昵称前为用户手机号、订单来源后为到期状态、下单时间后为到期时间。
- XLSX 单表「订单列表」表头及顺序：订单号、用户ID、用户手机号、微信昵称、套餐、订单来源、到期状态、剩余积分、套餐时长、近7日消耗、商品金额、优惠金额、实付金额、状态、支付时间、下单时间、到期时间、支付渠道、备注。订单号/手机号及用户输入以字符串单元格存储（保留前导零、中文、逗号、换行和公式样式原文，不生成公式）；用户ID、剩余积分、近7日消耗为整数（`0`），商品/优惠/实付金额为数值两位小数（`#,##0.00`）。支付/下单/有限到期时间使用完整 `yyyy-mm-dd hh:mm:ss` 文本（`@`），缺失/非法为 `—`，长期有效保持原语义，日期列宽 25，避免窄日期列出现 `####`。R8 通过 `src/utils/excel.ts` 按需加载 ExcelJS：绿色 `#00A83E` 表头、白字加粗微软雅黑、白/浅绿 `#E9F7EE` 斑马纹、`#BFE7CB` 细边框、26 表头行高，正文按内容调整行高；订单号宽 28、手机号 18、备注 40 并换行，冻结首行与全数据范围自动筛选；零行仍有完整表头；权限不足返回 403，不生成文件。
- Mock v17 非破坏性幂等补齐：仅对无自有 `expiresAt` 字段的历史订单回填，保留现存值（包括 null/非法值）；历史仅月数时用历史 `paidAt + durationMonths 日历月` 作演示回填，不读当前套餐覆盖历史；无有效支付时间或时长保持缺失。新种子同样含订单到期字段。
- 创建订单与审计已实现；订单到期展示不代表用户权益发放，手工/赠送仍不回写用户套餐、用户到期时间或积分权益（TC-39）。独立前台订单仍为原演示能力。

---

## 7. P1/P2 配置公共约定（v0.8 源码核对）

- **候选校验后提交**：save 在独立候选对象中归一字段并完成数值/枚举、引用、默认专家关系和版本名唯一性校验，全部通过后才同步修改业务对象、默认关系、工具、历史和审计。重复版本名422不改变上述内容。这是 Mock 内存提交路径，不承诺真实数据库事务，也不承诺 localStorage 配额写入失败自动回滚。
- **自动保存例外**：专家/技能 `skipVersion:true` 仍更新配置版本及保存状态，但不新增发布历史。前端只确认 sentSnapshot；在途继续输入保持 dirty 并排队，发布/恢复等待协调在途保存，编辑会话防换对象串写。新建首次发布后才自动保存。
- **完整恢复**：白名单字段按快照覆盖，缺失可选字段清除/归一；专家包含 scenarioId、技能包含 visibility。旧套餐缺durationMode按天数归一，GIFT固定price/credits=0、grantMode=ONCE、creditExpiry=NEVER并清首购价/周期/有效天数。套餐code创建后不可改，更新/恢复改码422；无效引用拒绝。恢复生成新版本，沿统一保存约束。
- **MCP工具恢复**：新快照包含 `tools:[{id,serverId,name,enabled,source?,method?,path?,summary?}]`，保留稳定ID、定义与启用状态；工具启停/发现生成版本，恢复前校验工具及工具裁剪/权益引用。非当前旧历史缺tools返回409「该历史版本缺少工具快照，无法完整恢复」；仅当前版本缺tools可从现存工具准确补齐基线，不能推断更早未知状态。
- **定价与删除**：`billingCycles:[]`明确清空旧周期，省略保留；启用周期必须填正常价，0与空分开，首购显式0保留，基础首购null清除，划线价大于正常价。套餐删除除用户/订单外，还检查专家/技能/MCP/知识库的PLAN可见范围引用，命中409。
- **刷新边界**：refresh只更新Mock应用状态，workspace当前直接读取配置；不代表生产运行时加载、独立前台已消费或真实交易报价已更新。

- 套餐读写权限分别为 `plan:view` / `plan:edit`；专家 `expert:view` / `expert:edit`；技能 `skill:view` / `skill:edit`；MCP `mcp:view` / `mcp:edit`。旧 `plan:manage` 保留为历史权限，不授予新增接口访问。所有 mock handler 均再次校验权限。
- 配置公共返回字段：`id,code,name,status,version,updatedAt,refreshStatus(PENDING/APPLIED/FAILED),appliedVersion,refreshMessage`。保存成功版本加一，进入 PENDING；`POST /{plans|experts|skills|mcp/servers}/{id}/refresh` 刷新当前版本，失败后同接口重试。Mock 请求可带 `{simulateFailure:true}` 模拟失败；真实请求不带此字段。APPLIED 仅在返回版本一致时生效，Mock 不代表 AgentScope 已接入。
- 四类配置均支持 GET 列表（数组）、GET /{id}、POST 新建、PUT /{id}、PUT /{id}/status `{status}`、DELETE /{id}。DELETE 被套餐权益、个体权益、专家绑定、默认专家、历史订单/会话引用时返回409。
- POST/PUT 返回保存后配置；仅允许业务字段，客户端不能修改 version / appliedVersion。
- 套餐写入 `code,name,price`（非负元，两位小数）、`durationMode`、`durationDays`、`status,entitlements`；R9 模式及兼容规则见订单项：MEMBERSHIP仅GIFT且清空天数，LIFETIME存0，CUSTOM_DAYS正整数；列表附 `salesCount`（已支付订单数）。
- 权益数组每项为 `{resourceType:EXPERT|SKILL|MCP_TOOL,resourceId,quotaType:CHAT_COUNT|SKILL_CALL,quotaLimit,quotaPeriod:DAY|MONTH|LIFETIME}`。专家使用 CHAT_COUNT，其余 SKILL_CALL；限额为非负整数，0 禁用；DAY / MONTH 按 Asia/Shanghai 自然日 / 自然月重置，LIFETIME 终身累计。资源不能重复，必须存在。个体覆盖优先于套餐，删除覆盖恢复继承。旧 Mock 权益增量迁移为 MONTH，不清空P0数据。当前仅管理配置，不执行真实配额扣减。
- `GET /entitlement-resources` 返回上述权益资源模板数组，权限为 user:entitlement 或 plan:view / plan:edit 任一。个体权益 PUT 同结构全量覆盖，服务层验证周期和资源，保留已有 used。
- 专家字段（v0.4 助手预设模型，附录 12.1）：`code`（助手 ID，创建后不可改，导入导出与前台 API 标识）、`name`、`description`（能力摘要）、`baseModel`（**v0.5 起存模型管理 `model_config.code`**，如表单只允许选择「启用」模型，选项显示 `名称（code）`；旧数据不在模型表的 base_model 迁移时自动注册为「自定义」模型）、`avatarUrl`、`systemPrompt`、`skillIds[]`（绑定技能）、`mcpServerIds[]`（绑定 MCP/OpenAPI 连接，替代旧 mcpToolIds 的服务层绑定）、`suggestedQuestions[]`（建议问题，非空字符串）、`capabilities`（能力开关对象，仅允许 file_context/file_upload/vision/web_search/image_generation/code_interpreter/terminal/citations/status_updates/memory/builtin_tools/usage，布尔值；v3 旧键 `file` 迁移时映射为 file_context+file_upload）、`tags[]`、`visibility:{type:PUBLIC|PLAN|PRIVATE, planIds[]}`（PLAN 必须携带有效非空套餐；PUBLIC/PRIVATE 服务层清空 planIds）、`isDefault`（默认专家必须启用；`PUT /experts/{id}/default` 原子切换）。旧字段 `intro/modelParams/mcpToolIds` 保留兼容展示，写入不再要求。`GET /experts/{id}/prompt-versions` 与 `POST /experts/{id}/restore-prompt` 为旧提示词版本接口（保留兼容）；新版本历史用 `GET /experts/{id}/versions` + `POST /experts/{id}/restore`（全量快照恢复，恢复生成新版本）。
- 技能字段（v0.4 SKILL.md 内容模型，附录 12.2）：`description`（触发意图，必填）、`content`（SKILL.md Markdown 正文，必填；建议按 触发条件/不适用范围/参数契约/执行步骤/结果校验/输出约定/异常边界 分节）、`files:[{name,content}]`（附属文件，名称不重复）；旧 `paramSchema/execConfig` 降级为**可选高级字段**（留空不修改，填写须为 JSON 对象，兼容旧执行模型）。`GET /skills/{id}/versions` 返回已保留的发布快照（skipVersion自动保存不新增历史），`POST /skills/{id}/restore {version,note?}` 恢复生成新版本。被专家引用时停用/删除须传 `confirmReferences:true`（否则 `409` 并透出引用方清单）。`POST /skills/{id}/clone` 克隆为停用副本（code 加 `_copy` 后缀，需 skill:clone）。技能导出需 skill:export；**专家导出要求 `expert:export`，导入要求 `expert:edit`**，导出为独立权限点（技能克隆/导出为 v4 新增权限点，超管全量、运营增量授予）。
- MCP 字段（v0.4 双类型连接模型，附录 12.3）：`connType:MCP|OpenAPI`、`endpoint`、`path`（MCP 默认 `/mcp`；API 可选 `/openapi.json` 仅作来源记录，不自动请求）、`transport:STREAMABLE_HTTP|SSE|STDIO`（仅 MCP 类型，HTTP 旧值迁移为 STREAMABLE_HTTP）、`command/args[]`（仅 STDIO）、`authConfig:{type:NONE|BEARER|API_KEY|HEADER, headerName?, credential?}`（凭据掩码 `******` 回显，写入掩码或同类型留空保留凭据）、`toolFilter[]`（工具名过滤清单，工具发现落库时生效）、`apiOperations[]`（API 接口导入的结构化方法/路径/名称/摘要，进入版本快照及历史恢复）。`POST /mcp/servers/{id}/test-connection` 连接测试（Mock 规则：启用 + HTTPS + 鉴权完整即 HEALTHY），返回 `{healthStatus,healthDetail,lastHealthAt}` 并落库健康字段。删除被专家绑定时 `409` 拒绝（硬拦截，不提供确认通道）。
- **平台维度（v0.5，专家/技能/MCP 通用）**：`platforms` 为多选 JSON 数组，枚举 `1688 | OZON | AMAZON | TEMU`（AMAZON 显示「亚马逊」），**至少一个**，表单必填，非法值/空数组 `422`。列表支持平台多选筛选（命中任一所选平台即显示）与平台标签列；无单值「通用」（覆盖全平台=多选全部）。兼容回填：载荷未携带 `platforms` 时按旧单值 `platform` 映射（旧 `ALL`→全平台），否则按 code 关键词推断（ozon→OZON、amazon/亚马逊→AMAZON、temu→TEMU，否则 `['1688']`）。
- **版本名称与确认框（v0.5）**：专家/技能/MCP 保存（发布）与版本恢复均走「版本确认框」——`versionName`（默认按当前时间 `yyyyMMddHHmmss` 自动生成，可修改，≤64 字符）+ 可选 `note`（变更说明）；确认后才写库、`version+1` 并生成快照。版本历史条目含 `{version, versionName, operator, note, createdAt, snapshot}`，前端列表展示版本名称/版本号/变更说明/操作人/时间。恢复时新版本名默认「恢复自 <源版本名>」（源版本无名称则 `v{N}`）。**MCP 快照历史（v0.5 补齐）**：`GET /mcp/servers/{id}/versions`（mcp:view）+ `POST /mcp/servers/{id}/restore {version, versionName?, note?}`（mcp:edit），快照含连接配置（connType/endpoint/path/transport/authConfig）、工具过滤（toolFilter）及完整tools列表（旧缺快照的拒绝条件见本节开头），支持历史/差异/恢复。存量 v4 快照迁移时按其时间戳回填 versionName（幂等）。
- `GET /mcp/tools` 返回 `[{id,serverId,name,enabled,source?,method?,path?,summary?}]`，需 mcp:view。工具启停需 mcp:edit，更新所属服务版本；发现工具返回数组，健康检查返回服务配置。OpenAPI 类型支持从本地 OpenAPI 3.x JSON 的 `paths` 解析操作，或手工录入接口方法、路径、名称，作为 `apiOperations:[{name,method,path,summary?}]` 保存（至少一项，名称和方法+路径不可重复），不存文件原文；发现工具按该数组同步，重复发现不重复创建，移除定义后旧工具停用。MCP 类型继续返回按服务编码预置的平台示例工具；`toolFilter` 限定同步范围。Mock 不调用远端 API/MCP，连接测试与健康检查也不发网络请求；真实模式需要服务端实现同一契约后才可使用。
- 对话列表返回 `{total,list:[{id,userId,expertId,expertName,summary,messageCount,createdAt,deletedAt,deleteReason}]}`；额外筛选 `deleted` 省略=未删除、true=已删除、all=全部。消息 `{role,content,createdAt}` 数组始终去除凭据及联系方式，GET 每次记 `chat.messages.view`。DELETE 请求体 `{reason}` 必填；`POST /chats/{id}/restore` 独立权限 chat:restore。导出 format=json|xlsx，需独立 chat:export，不隐式授予 chat:view；具体响应见第11节，其他格式422。消息/标题/摘要/分析/报告/导出统一脱敏，HTML文本再转义。
- 审计 beforeJson/afterJson 由服务层递归移除 token/password/secret/credential/authorization/authConfig、提示词与消息正文；联系方式及文本凭据脱敏。配置保存/恢复的 afterJson 额外携带 `platforms` 与本次 `versionName`。前端只展示脱敏diff，不接收原始凭据。已有Mock审计同样迁移清理。
- `GET /dashboard` 需要 dashboard:view，返回 `{source,userTotal,userToday,orderTotal,revenueTotal,chatTotal,expertTotal,skillTotal,serverTotal,trend:[{date,users,orders,chats}]}`；revenueTotal为PAID订单金额合计（并非净收入），趋势为近7天本地现存记录。真实模式只请求真实API，失败不回退Mock。
- 超管拥有所有新权限；客服仅获得对话查看（不含删除、恢复、导出）；只读不具 chat:view 或配置编辑。P0已有用户/订单权限保留。localStorage沿用 leidaai-admin-demo-v1，当前schema版本19增量迁移（历史v5补platforms/versionName/模型注册表；v19迁移三档同功能、注册100、包赠分0及规则标记，旧规则存legacyRuleSettings，保留历史订单/版本）。
- 保存请求可携带可选 `note`（变更说明，写入专家/技能版本历史与审计）；`POST /experts/import`、`POST /skills/import` 直接以导出 JSON 作为请求体（code 冲突返回 `409`）；`GET /experts/{id}/export`、`GET /skills/{id}/export` 返回 `{filename,content}`，导出内容剥离 id/version/刷新状态等运行时字段，**包含 `platforms` 与当前版本 `versionName`（导入时随载荷进入版本历史）**，凭据与提示词按审计策略脱敏。

## 7. 套餐管理 /plans（P1）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /plans | plan:view | 全量：`{id, name, price, durationDays, status, salesCount, entitlements[]}` |
| POST | /plans | plan:edit | `{code,name,price,durationDays,status,entitlements}` |
| PUT | /plans/{id} | plan:edit | 基本信息（version +1） |
| PUT | /plans/{id}/status | plan:edit | 上下架；`{status}` |
| PUT | /plans/{id}/entitlements | plan:edit | 权益全量覆盖；quotaPeriod 必填 |
| DELETE | /plans/{id} | plan:edit | 用户、订单或专家/技能/MCP/知识库PLAN可见范围引用时409 |
| POST | /plans/{id}/refresh | plan:edit | 刷新/重试配置版本 |

## 8. 专家 /experts（P1；v0.4 助手预设）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /experts | expert:view | 列表（含 tags/visibility/boundSkillCount/boundMcpCount/isDefault/version）；参数 `keyword`、`status` |
| GET | /experts/{id} | expert:view | 详情（助手预设全量字段；MCP 凭据类字段掩码） |
| POST | /experts | expert:edit | 新建（code 创建后不可改） |
| PUT | /experts/{id} | expert:edit | 保存（写库 version+1 → 发刷新事件；可选 `note` 进版本历史） |
| PUT | /experts/{id}/status | expert:edit | 启停（启用=上架到前台选择器） |
| PUT | /experts/{id}/default | expert:edit | 统一复用专家save设置默认；目标必须启用，切换取消旧默认并写关联版本/审计；不可直接清除当前默认，恢复也执行同一约束；失败不改变默认关系 |
| GET | /experts/{id}/versions | expert:view | 全量快照版本历史 `[{version,note,createdAt,snapshot}]`（新版本倒序） |
| POST | /experts/{id}/restore | expert:edit | `{version}` 恢复快照并生成新版本；恢复默认专家的停用版本被拒绝 |
| GET | /experts/{id}/export | expert:export | 导出预设 JSON `{filename,content}`（凭据脱敏；独立导出授权） |
| POST | /experts/import | expert:edit | 导入预设 JSON（code 冲突 `409`） |
| GET | /experts/{id}/prompt-versions | expert:view | 旧提示词历史（保留兼容）`[{version,systemPrompt,createdAt}]` |
| POST | /experts/{id}/restore-prompt | expert:edit | 旧接口：仅恢复提示词并生成新版本 |
| POST | /experts/{id}/refresh | expert:edit | 刷新/重试；版本状态见公共约定 |

## 9. 技能 /skills（P1；v0.4 SKILL.md 内容型）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /skills | skill:view | 列表 + 参数 `keyword`、`status`；附 `boundExpertCount`（由 expert.skillIds 统计） |
| GET | /skills/{id} | skill:view | 详情（description/content/files；paramSchema/execConfig 为可选高级字段，兼容保留） |
| POST | /skills | skill:edit | 新建 |
| PUT | /skills/{id} | skill:edit | 保存（版本更新；发布写快照，skipVersion自动保存不新增历史；可选note） |
| PUT | /skills/{id}/status | skill:edit | 启停；被专家引用时须 `confirmReferences:true`，否则 `409` |
| DELETE | /skills/{id} | skill:edit | 同上；确认后自动解除专家绑定并删除 |
| GET | /skills/{id}/versions | skill:view | SKILL.md 快照历史 `[{version,note,createdAt,snapshot}]` |
| POST | /skills/{id}/restore | skill:edit | `{version,note?}` 恢复生成新版本 |
| POST | /skills/{id}/clone | skill:clone | 克隆为停用副本（`_copy` 后缀） |
| GET | /skills/{id}/export | skill:export | 导出 JSON |
| POST | /skills/import | skill:edit | 导入 JSON（code 冲突 `409`） |
| GET | /skills/{id}/stats | skill:view | 调用统计（近7/30天次数、成功率、数据来源） |
| POST | /skills/{id}/refresh | skill:edit | 刷新/重试配置版本 |

## 10. MCP /mcp（P1；v0.4 双类型连接）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /mcp/servers | mcp:view | 列表含 `connType/endpoint/path/toolFilter/healthStatus/lastHealthAt/healthDetail`，鉴权凭据掩码 `******` |
| GET | /mcp/servers/{id} | mcp:view | 详情；credential 仅掩码，编辑留空表示不修改 |
| POST | /mcp/servers | mcp:edit | 登记连接（MCP：transport+endpoint+path 或 STDIO command/args；API：endpoint+至少一个 apiOperations，path 可选），API定义由本地 OpenAPI 3.x JSON 导入或手工录入；不调用外部 API |
| PUT | /mcp/servers/{id} | mcp:edit | 保存（触发刷新事件） |
| PUT | /mcp/servers/{id}/status | mcp:edit | 启停 |
| DELETE | /mcp/servers/{id} | mcp:edit | 被专家绑定时 `409` 拒绝 |
| POST | /mcp/servers/{id}/test-connection | mcp:edit | 连接测试（Mock：仅按启用、HTTPS地址、鉴权完整模拟，不发生 MCP 握手或 OpenAPI schema 解析），结果落库健康字段 |
| POST | /mcp/servers/{id}/discover | mcp:edit | 工具发现：MCP 生成 Mock 示例工具；API 从保存的 apiOperations 同步定义（不请求用户 API）；均受 `toolFilter` 过滤，服务须启用 |
| POST | /mcp/servers/{id}/health-check | mcp:edit | 立即健康检查 |
| PUT | /mcp/tools/{id}/enabled | mcp:edit | `{enabled}` 工具启停，所属服务 version +1 |
| GET | /mcp/tools | mcp:view | 工具列表 |
| POST | /mcp/servers/{id}/refresh | mcp:edit | 刷新/重试配置版本 |

## 11. 对话管理 /chats（P2）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /chats/expert-options | chat:view | 专家名称/ID筛选选项，不依赖expert:view；前端可搜索并重置筛选 |
| GET | /chats | chat:view | 参数 `userId`、`expertId`、`keyword`(消息内容全文)、`start`/`end`、分页；返回脱敏摘要 |
| GET | /chats/{id}/messages | chat:view | 完整消息流（每次调用记审计） |
| DELETE | /chats/{id} | chat:delete | 软删除，`{reason}` |
| GET | /chats/{id}/export | chat:export | R8 参数 `format=json` 或 `format=xlsx`（默认 json），独立于 chat:view 授权；仅导出目标会话完整脱敏消息并审计，不扩大至跨会话全量；其他格式返回 422 |
| POST | /chats/{id}/restore | chat:restore | 恢复软删除会话 |

- JSON 保留原 `{filename,content}` Mock 描述，真实模式按 Blob 接收。XLSX Mock 在业务包装 data 中返回真正 OOXML Blob；`exportFile` 保留两种响应支持，真实后端待按相同二进制契约实现。下载文件名 `chat-{id}.xlsx`，MIME 与订单 XLSX 相同。
- XLSX 单表「对话消息」，列为角色、消息内容、创建时间，宽度 16/80/25；创建时间为完整秒级文本、缺失/非法为 `—`。与订单复用 R8 统一绿色表头/浅绿斑马纹/细边框/冻结/自动筛选及按内容调整行高；消息保持脱敏结果，以文本写入不生成公式；空消息也有完整表头。保留 chat:export、审计与原目标会话范围；缺权限 403、会话不存在 404。历史跨会话「全量 CSV」待实现；专家/技能 JSON、技能 ZIP 与报告 HTML 不属于表格改造。

## 12. 前台工作台只读 API（C 端，附录 12.4）

后台「上架」即前台可用：专家 `status=1` 且通过 visibility 过滤后，出现在 C 端工作台选择器。本组契约与 admin 契约**完全隔离**：

- 基础路径：`/api/v1/workspace`（不走 `/admin/api`、不使用管理端 JWT；真实接入时由 C 端网关按用户 token 鉴权，Mock 中按 `userPlanIds` 查询参数模拟用户套餐）
- 全部只读 GET，响应同样为 `{code,msg,data}` 包装；`code=0` 成功
- 过滤口径：
  - **专家**：`status=1`（上架）且 `visibility=PUBLIC`（全员可见）或 `visibility=PLAN` 且 `planIds` 与用户套餐有交集；`PRIVATE` 一律不返回
  - **技能**：按自身 `status=1`、`visibility=PUBLIC|PLAN|PRIVATE` 及 platform 过滤；PLAN需与模拟用户套餐相交，PRIVATE不返回，不再仅依赖专家可见性。专家详情skillNames复用此过滤；展示许可与专家内部绑定调用许可分开。
  - **MCP**：`status=1` 且被至少一个"对当前用户可见的专家"绑定
- 匿名（未传套餐）仅可见 PUBLIC；历史会话不受下架影响（契约不返回已下架专家的历史绑定）

### GET /api/v1/workspace/experts
参数：`userPlanIds`（逗号分隔的套餐 ID，可省略=匿名）；`platform`（可选，单值 `1688|OZON|AMAZON|TEMU`）：按资源 `platforms` 数组**命中任一即返回**该资源，未传=不过滤，非法值匹配不到资源返回空数组。三个列表端点（experts/skills/mcps）均支持该参数。

```json
// data
[{
  "id": 1, "code": "product-selection-assistant", "name": "1688分销选品",
  "description": "面向 1688 分销场景的选品助手…", "avatarUrl": "",
  "baseModel": "glm-5.3", "platforms": ["1688"], "tags": ["选品", "1688", "分销"],
  "suggestedQuestions": ["帮我分析\"收纳盒\"关键词的竞争度", "…"],
  "capabilities": { "file_context": true, "file_upload": true, "web_search": true, "citations": true },
  "boundSkillCount": 7, "boundMcpCount": 1
}]
```

### GET /api/v1/workspace/experts/{code}
按助手 ID 返回已上架且对该视角可见的专家详情（列表字段 + `skillNames[]`/`mcpNames[]` 绑定名称）；系统提示词全文不下发；未上架/不可见/不存在返回 404。

### GET /api/v1/workspace/skills
参数同上。按技能自身启用、可见性和平台返回（含 `platforms`），与是否被可见专家绑定无关：

```json
[{ "id": 11, "code": "dld-selection-search", "name": "1688选品搜索", "description": "按关键词/类目在 1688 搜索候选商品并返回结构化清单…", "platforms": ["1688"], "boundExpertCount": 1 }]
```

### GET /api/v1/workspace/mcps
参数同上。返回被可见专家绑定的启用连接（不暴露鉴权信息，含 `platforms`）：

```json
[{ "id": 1, "code": "gateway", "name": "聚合网关（OpenAPI）", "connType": "OpenAPI", "endpoint": "https://gateway.example.com", "path": "/openapi.json", "platforms": ["1688", "AMAZON", "TEMU"], "enabledToolCount": 4 }]
```

- 管理端「前台预览」抽屉复用以上三个接口，以普通用户视角展示上架后前台卡片（名称/描述/标签/建议问题/绑定技能），并支持切换模拟用户持有套餐验证 PLAN 过滤与下架即消失；**v0.5 起支持平台页签过滤（1688/Ozon/亚马逊/Temu，对齐 work.html 电商专家库）**，页签经 `?platform=` 查询参数生效（按响应 `platforms` 字段命中任一即显示）
- 预设导出 JSON 可直接导入 OpenWebUI/AgentScope Java，作为运行时接通的过渡手段

---

## 13. 模型管理 /models（v0.5 基础模型注册表）

基础 LLM 模型注册表（`model_config`），专家 `base_model` 由此选择（存 `code`）。权限点：`model:view` / `model:edit`（超管全量、运营增量授予；support/viewer 不授予）。种子示例：GLM-5.3（智谱）、GLM-4.7（智谱）、deepseek-v3（OpenAI兼容）、qwen-max（OpenAI兼容），端点仅示意。

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /models | model:view | 分页列表 `{total, list}`；参数 `keyword`（名称/编码模糊）、`status`、`page`/`pageSize`（默认 1/20，pageSize 上限 100） |
| GET | /models/{id} | model:view | 详情 |
| POST | /models | model:edit | 新建（code 创建后不可改，唯一；重复 `422`） |
| PUT | /models/{id} | model:edit | 保存（不产生版本快照；api_key 留空=不修改） |
| PUT | /models/{id}/status | model:edit | `{status}` 启停；停用后专家表单不可再选，已绑定专家不受影响 |
| POST | /models/{id}/test | model:edit | 连通测试（**Mock 演示模拟**，不发真实网络请求） |
| POST | /models/probe | model:view | **端点自动发现（v0.7）**：`{baseUrl, apiKey}` → 拉取 OpenAI 兼容端点全部模型；见下方「端点自动发现」 |
| DELETE | /models/{id} | model:edit | 被专家 base_model 引用时 `409` 硬拦截（不提供确认删除通道） |

### 模型字段

```json
{
  "id": 41, "code": "glm-5.3", "modelId": "glm-5.3", "name": "GLM-5.3",
  "provider": "智谱",                                  // 供应商字典：智谱/OpenAI兼容/Anthropic兼容/自定义（可扩展，前端 allow-create）
  "endpoint": "https://open.bigmodel.cn/api/paas/v4",  // 接入地址 base URL，仅示意；须 http(s):// 开头
  "apiKeyMasked": "****1a2b",                          // 掩码回显（****后4位）；明文 apiKey 任何响应永不回显
  "defaultParams": { "temperature": 0.7, "max_tokens": 4096 },  // 默认生成参数 JSON
  "remark": "1688选品助手默认基础模型", "status": 1,
  "createdAt": "2026-10-28T10:00:00.000Z", "updatedAt": "..."
}
```

- `modelId`：供应商原始标识，与内部稳定code分离，合法斜杠等字符原样保留；发现/批量接入按规范化endpoint+modelId去重，内部code冲突加后缀；旧缺modelId回退code，真实调试发送 `model.modelId || model.code`，不发送净化后的内部编码。
- `api_key`：常规列表/详情保存后不回显明文（演示超管reveal-key例外见第15节），列表/详情/编辑仅显示掩码（如 `****abcd`）；保存载荷携带明文 `apiKey` 时更新，留空/未传=不修改。审计 before/after 同样只含掩码。
- `default_params`：JSON 对象（temperature、max_tokens 等），传入须为对象否则 `422`；未传保留原值。
- **连通测试（Mock）**：按 网络可达（HTTPS 地址）/ 认证（已配置 API Key）/ 模型可用（已启用）**三项**演示判定，返回 `{result: SUCCESS|FAILED, detail, latencyMs, testedAt}`；detail 逐项给出 ✓/✗ 并明示「演示模拟，未发起真实网络请求」。
- **事件契约**：模型保存/更新/启停均发布配置变更事件 `type=MODEL`（载荷含 code/version/status），与 expert/skill/mcp 的 `EXPERT/SKILL/MCP` 变更事件同构；mock 不需真实运行时，契约由后端 AOP 保证。

### 端点自动发现（v0.7：POST /models/probe）

新建模型表单「自动发现」：填接入地址 + API Key 后一键拉取端点全部模型，下拉选中即回填模型编码/显示名（供应商未手动改过时自动置「OpenAI兼容」），替代手工填写模型编码。

请求：

```json
{ "baseUrl": "http://192.168.1.10:8080/v1", "apiKey": "sk-…" }
```

响应：

```json
{
  "models": [{ "id": "glm-5.3", "displayName": "GLM-5.3", "ownedBy": "zhipu" }],
  "resolvedUrl": "http://192.168.1.10:8080/v1/models",
  "via": "proxy"
}
```

- 服务端 `GET {baseUrl}/models`（地址未带 `/v1` 等版本段时回退 `{baseUrl}/v1/models`），解析 OpenAI 兼容 `{data:[{id, ...}]}`；`displayName` 取端点返回的 `display_name`（缺省 `name`，再缺省 `id`）。
- 鉴权：`Authorization: Bearer <apiKey>` 由服务端透传至端点，**Key 不落盘、不入审计**（与 api_key 掩码约定一致）。
- 路径回退顺序先 `{baseUrl}/models` 后 `{baseUrl}/v1/models`；全部失败 `422`，msg 汇总各尝试的错误（区分 CORS 拦截/鉴权失败/非 OpenAI 兼容响应），中文引导。
- 开发环境（Vite）：浏览器经本地代理 `/__llm-proxy/*`（请求头 `x-llm-base-url` 携带目标端点，路径为相对 baseUrl 的剩余部分）转发，绕过浏览器 CORS；生产环境由 Java 后端直接实现本契约（服务端内网调用无 CORS 问题）。

## 14. 平台维度与版本名称字段汇总（v0.5）

- 专家/技能/MCP 列表项与详情均含 `platforms: ['1688'|'OZON'|'AMAZON'|'TEMU', ...]`（至少一个）。平台过滤两个层面：管理端列表的多选筛选为前端对返回数据的过滤（命中任一所选平台即显示）；workspace 三列表支持 `?platform=` 单值查询过滤（任一命中，服务端执行）。
- 版本历史三类资源统一：`GET /{experts|skills|mcp/servers}/{id}/versions`、`POST /{experts|skills|mcp/servers}/{id}/restore`；条目 `{version, versionName, operator, note, createdAt, snapshot}`，恢复生成新版本（新版本名默认「恢复自 <源版本名>」）。

## 15. 专家草稿对话预览 /experts/preview-chat（v0.6：编辑抽屉右侧实时调试）

专家编辑（新建/编辑均可）抽屉右侧提供「对话预览」面板：左侧表单当前**草稿态**（未保存修改：`system_prompt`、`base_model`、`model_params.temperature`、`skill_ids`、`mcp_server_ids`、`capabilities`、`suggested_questions`）对右侧对话**即时生效**——改提示词马上出效果，用于发布前验证角色设定、技能路由与工具绑定。

### POST /experts/preview-chat（expert:view）

请求：

```json
{
  "draft": {
    "name": "1688分销选品", "baseModel": "glm-5.3",
    "systemPrompt": "你是1688分销选品助手，请基于可验证的数据回答…",
    "skillIds": [11, 12], "mcpServerIds": [1],
    "modelParams": { "temperature": 0.7 },
    "capabilities": { "web_search": true },
    "suggestedQuestions": ["帮我分析\"收纳盒\"关键词的竞争度"]
  },
  "sessionId": "preview-1730000000000",
  "message": "帮我分析\"收纳盒\"关键词的竞争度",
  "history": [{ "role": "user", "content": "…" }, { "role": "assistant", "content": "…" }]
}
```

响应：

```json
{
  "reply": "你好，我是1688分销选品助手（草稿配置已生效）。…已加载技能：1688选品搜索…",
  "trace": {
    "matchedSkills": [{ "id": 11, "code": "dld-selection-search", "name": "1688选品搜索" }],
    "toolCalls": [{ "server": "聚合网关（OpenAPI）", "tool": "ali_product_search", "args": { "keyword": "收纳盒", "page_size": 20 } }],
    "model": "glm-5.3",
    "latencyMs": 640
  }
}
```

行为约定（两侧实现需一致）：

- **拒绝生成**：草稿 `base_model` 为空或不在模型注册表时，不生成回复并提示「请先选择基础模型」；
- **技能路由**：`message` 与绑定技能 `name`/`description` 关键词匹配 → `trace.matchedSkills` 命中清单，回复说明「已加载技能：X」；未绑定任何技能时提示「当前专家未配置技能」；
- **工具调用**：命中技能时从绑定 MCP 连接的**已启用工具**中模拟 1–2 次 `toolCalls`（`server`=连接名称、`tool`=工具名、`args`=依据消息关键词生成的示例参数），前端以「工具调用轨迹」折叠展示（el-collapse）；
- **温度元话语**：`model_params.temperature > 1` 时回复附「高温度=更具发散性」提示性元话语；
- **建议问题**：`suggested_questions` 由前端在空会话时渲染为可点击快捷问题（点击即发送），服务端不处理；
- **Mock 演示引擎**：人为延迟 400–900ms（`trace.latencyMs` 同步返回、确定性），回复明确标注「模拟回复（演示引擎）」；回复为基于草稿内容的确定性合理仿真（从 system_prompt 提取角色线索/关键词改变语气与结构），**不假装真实 LLM**。
- **真实模式（生产）**：Java 后端按「模型管理」配置的供应商（OpenAI 兼容格式）代理转发，`temperature` 取草稿 `model_params`；`trace` 中 `matchedSkills`/`toolCalls` 由后端运行时填充（无则为空数组）。

### 真实调用（浏览器直连调试，演示环境，仅超管可见）

- 预览面板「真实调用」开关默认关闭，仅超级管理员角色可见；旁注「浏览器直连，Key 不出本机（演示环境）」。
- 开启后若所选模型（`model_config`）配置了 `endpoint`+`apiKey`，前端直接 `POST {endpoint}/chat/completions`（OpenAI 兼容）：`model=model.modelId || model.code`，`messages=[{role:'system',content:system_prompt(草稿)},...history,{role:'user',content:message}]`，`temperature` 取草稿 `model_params`，`Authorization: Bearer <apiKey>`。
- **开发环境代理兜底（v0.7）**：浏览器直连因 CORS/网络失败（非用户主动超时/中止）时，自动改经 Vite 本地代理 `/__llm-proxy/chat/completions`（请求头 `x-llm-base-url` 携带目标端点）重试一次；生产环境不兜底，仍引导走 Java 后端代理。
- 错误处理（中文引导）：CORS 拦截/网络不可达（建议改用后端代理模式）、`401/403` 鉴权失败（检查模型管理密钥）、20s 超时、非 OpenAI 兼容响应格式；未配置 Key 时仅给引导提示，**不发起外部请求**。
- mock 演示专用：`POST /models/{id}/reveal-key`（权限 `model:view` 且仅超管角色，审计 `model.key.reveal`）返回明文 apiKey 供直连；**生产环境绝不提供该端点**——真实调用一律走 Java 后端代理（Key 不下发浏览器）。mock db 中 apiKey 明文存储（仅本地演示），界面仍仅显示掩码。

## 16. 专家附件文件服务 /files（真实服务待联调）

客户端 `api/files.ts` 真实模式通过 `POST /files` 上传 FormData 文件；响应按通用业务包装解包后必须提供服务端有效 `id:string|number`，可选 `name,type,size,uploadedAt,url`。客户端将ID转字符串并保存为附件引用，缺有效ID即失败，不能生成本地随机ID伪装服务端文件。预览/下载使用 `GET /files/{encodeURIComponent(id)}` 获取Blob。Mock文件实体存IndexedDB，本地ID仅属于演示模式。知识库批量上传捕获选择时uploadTarget，逐文件绑定同一库；切库不串写，成功/失败逐项统计，仅当前库一致时刷新。

## 17. 反馈处理与运营奖励边界

反馈查看 `feedback:view`，采纳/驳回/删除 `feedback:manage`；采纳奖励非负安全整数，处理说明必填，有奖励时作为运营特批原因，保存处理结果与审计。前端详情按ID/请求版本隔离，提交期间禁关闭及重复操作。**当前仅记录rewardCredits，不创建真实账本或OPS_EXCEPTION批次；不等同订单赠送的order:create + order:gift授权，也不能称真实到账。**

## 错误码汇总

| code | 含义 | 前端行为 |
|---|---|---|
| 0 | 成功 | — |
| 401 | 未登录/Token 失效 | 仅当请求会话仍为当前会话时清除并跳登录；旧会话401不影响新登录 |
| 403 | 无权限 | 提示"无权限"，不跳转 |
| 409 | 冲突（如删除被引用资源） | 透出 msg |
| 422 | 参数/业务校验失败 | 表单内展示 msg |
| 423 | 登录锁定 | 登录页展示 msg |
| 500 | 服务异常 | 统一错误提示 |
