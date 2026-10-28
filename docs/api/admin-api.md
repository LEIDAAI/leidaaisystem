# 雷达AI 管理后台 Admin API 契约

版本：v0.4（P0 + P1/P2 前端及 Mock 契约；附录 12 助手体系模型改造；无真实 Java 联调）
基础路径：`/admin/api`
鉴权：`Authorization: Bearer <token>`（除登录外全部需要；前台工作台契约 `/api/v1/workspace/**` 与本鉴权体系隔离，见第 12 节）

## 变更记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v0.1 | 2026-10-28 | P0：认证 / 管理员 / 角色 / 用户 / 订单 / 审计 |
| v0.2 | 2026-10-28 | P1 初版：套餐/专家/技能/MCP CRUD、权益绑定、变更刷新联动 |
| v0.3 | 2026-10-28 | 配置公共约定修订：细粒度 view/edit 权限、refresh 状态机、个体权益周期、对话管理 |
| v0.4 | 2026-10-28 | **附录 12 助手体系模型改造（本次）**：专家=助手预设（code/baseModel/建议问题/能力开关/tags/visibility/全量版本历史/导入导出）；技能=SKILL.md 内容型（content/files/版本快照 diff/恢复/克隆/导入导出/绑定助手数，paramSchema/execConfig 降级为可选高级字段）；MCP=MCP/OpenAPI 双类型连接（connType/path/transport/auth 掩码/toolFilter）；新增 C 端工作台只读 API（experts 列表+`{code}`详情、skills、mcps）；专家导出/导入复用 `expert:edit`，技能克隆/导出为 v4 新增权限点 |

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
- 所有写操作（POST/PUT/DELETE）由后端 AOP 落 `admin_audit_log`，前端无需单独上报

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

## 3. 角色 /roles

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /roles | admin:manage | 全量列表（不分页）：`{id, code, name, remark, status, permissionIds[], createdAt}` |
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
| PUT | /users/{id}/status | user:ban | `{banned: true\|false, reason}` 封禁/解封 |
| PUT | /users/{id}/entitlements | user:entitlement | 个体权益覆盖：`[{resourceType, resourceId, quotaType, quotaLimit}]` |

### GET /users 列表项
`{id, nickname, phone, email, status, planName, chatCount, registeredAt, lastLoginAt}`

### GET /users/{id} 详情
```json
{
  "profile": { "id": 1, "nickname": "...", "phone": "...", "email": "...", "status": 1, "registeredAt": "...", "lastLoginAt": "..." },
  "plan": { "planId": 1, "planName": "专业版", "expireAt": "..." },
  "entitlements": [{ "resourceType": "EXPERT", "resourceId": 3, "resourceName": "1688分销选品", "quotaType": "CHAT_COUNT", "quotaLimit": 100, "used": 32 }],
  "orders": { "totalCount": 5, "totalAmount": 897.00, "list": [ /* 最近10条，同订单列表项 */ ] },
  "chatStats": { "conversationCount": 12, "messageCount": 356, "lastChatAt": "..." },
  "loginLogs": [{ "ip": "...", "userAgent": "...", "loginAt": "..." }]
}
```

## 6. 订单管理 /orders

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /orders | order:view | 参数 `orderNo`、`userId`、`status`(PENDING/PAID/REFUNDED/CLOSED)、`payChannel`(WECHAT/ALIPAY)、`start`/`end`、分页 |
| GET | /orders/{id} | order:view | 详情，含支付流水列表 |
| POST | /orders/{id}/refund | order:refund | `{reason, amount}` 全额退则 amount 传订单金额；渠道失败返回 `code=422, msg=渠道错误信息` |
| PUT | /orders/{id}/remark | order:remark | `{remark}` 备注（留痕） |
| GET | /orders/export | order:export | 同列表参数，返回 CSV 流（`Content-Disposition: attachment`） |

### 订单项
`{id, orderNo, userId, userNickname, planId, planName, amount, payChannel, status, remark, paidAt, refundedAt, createdAt}`

---

## 7. P1/P2 配置公共约定（v0.3 覆盖以下旧表中的权限/字段）

- 套餐读写权限分别为 `plan:view` / `plan:edit`；专家 `expert:view` / `expert:edit`；技能 `skill:view` / `skill:edit`；MCP `mcp:view` / `mcp:edit`。旧 `plan:manage` 保留为历史权限，不授予新增接口访问。所有 mock handler 均再次校验权限。
- 配置公共返回字段：`id,code,name,status,version,updatedAt,refreshStatus(PENDING/APPLIED/FAILED),appliedVersion,refreshMessage`。保存成功版本加一，进入 PENDING；`POST /{plans|experts|skills|mcp/servers}/{id}/refresh` 刷新当前版本，失败后同接口重试。Mock 请求可带 `{simulateFailure:true}` 模拟失败；真实请求不带此字段。APPLIED 仅在返回版本一致时生效，Mock 不代表 AgentScope 已接入。
- 四类配置均支持 GET 列表（数组）、GET /{id}、POST 新建、PUT /{id}、PUT /{id}/status `{status}`、DELETE /{id}。DELETE 被套餐权益、个体权益、专家绑定、默认专家、历史订单/会话引用时返回409。
- POST/PUT 返回保存后配置；仅允许业务字段，客户端不能修改 version / appliedVersion。
- 套餐写入 `code,name,price`（非负元，两位小数）、`durationDays`（正整数）、`status,entitlements`；列表附 `salesCount`（已支付订单数）。
- 权益数组每项为 `{resourceType:EXPERT|SKILL|MCP_TOOL,resourceId,quotaType:CHAT_COUNT|SKILL_CALL,quotaLimit,quotaPeriod:DAY|MONTH|LIFETIME}`。专家使用 CHAT_COUNT，其余 SKILL_CALL；限额为非负整数，0 禁用；DAY / MONTH 按 Asia/Shanghai 自然日 / 自然月重置，LIFETIME 终身累计。资源不能重复，必须存在。个体覆盖优先于套餐，删除覆盖恢复继承。旧 Mock 权益增量迁移为 MONTH，不清空P0数据。当前仅管理配置，不执行真实配额扣减。
- `GET /entitlement-resources` 返回上述权益资源模板数组，权限为 user:entitlement 或 plan:view / plan:edit 任一。个体权益 PUT 同结构全量覆盖，服务层验证周期和资源，保留已有 used。
- 专家字段（v0.4 助手预设模型，附录 12.1）：`code`（助手 ID，创建后不可改，导入导出与前台 API 标识）、`name`、`description`（能力摘要）、`baseModel`（如 GLM-5.3，只选不训练，下拉含可输入）、`avatarUrl`、`systemPrompt`、`skillIds[]`（绑定技能）、`mcpServerIds[]`（绑定 MCP/OpenAPI 连接，替代旧 mcpToolIds 的服务层绑定）、`suggestedQuestions[]`（建议问题，非空字符串）、`capabilities`（能力开关对象，仅允许 file_context/file_upload/vision/web_search/image_generation/code_interpreter/terminal/citations/status_updates/memory/builtin_tools/usage，布尔值；v3 旧键 `file` 迁移时映射为 file_context+file_upload）、`tags[]`、`visibility:{type:PUBLIC|PLAN|PRIVATE, planIds[]}`（PLAN 必须携带有效非空套餐；PUBLIC/PRIVATE 服务层清空 planIds）、`isDefault`（默认专家必须启用；`PUT /experts/{id}/default` 原子切换）。旧字段 `intro/modelParams/mcpToolIds` 保留兼容展示，写入不再要求。`GET /experts/{id}/prompt-versions` 与 `POST /experts/{id}/restore-prompt` 为旧提示词版本接口（保留兼容）；新版本历史用 `GET /experts/{id}/versions` + `POST /experts/{id}/restore`（全量快照恢复，恢复生成新版本）。
- 技能字段（v0.4 SKILL.md 内容模型，附录 12.2）：`description`（触发意图，必填）、`content`（SKILL.md Markdown 正文，必填；建议按 触发条件/不适用范围/参数契约/执行步骤/结果校验/输出约定/异常边界 分节）、`files:[{name,content}]`（附属文件，名称不重复）；旧 `paramSchema/execConfig` 降级为**可选高级字段**（留空不修改，填写须为 JSON 对象，兼容旧执行模型）。`GET /skills/{id}/versions` 返回每次保存的快照，`POST /skills/{id}/restore {version,note?}` 恢复生成新版本。被专家引用时停用/删除须传 `confirmReferences:true`（否则 `409` 并透出引用方清单）。`POST /skills/{id}/clone` 克隆为停用副本（code 加 `_copy` 后缀，需 skill:clone）。技能导出需 skill:export；**专家导出/导入按约定复用 `expert:edit`**，不设独立导出权限点（技能克隆/导出为 v4 新增权限点，超管全量、运营增量授予）。
- MCP 字段（v0.4 双类型连接模型，附录 12.3）：`connType:MCP|OpenAPI`、`endpoint`、`path`（如 `/mcp` 或 `xxx/openapi.json`；OpenAPI 必填）、`transport:STREAMABLE_HTTP|SSE|STDIO`（仅 MCP 类型，HTTP 旧值迁移为 STREAMABLE_HTTP）、`command/args[]`（仅 STDIO）、`authConfig:{type:NONE|BEARER|API_KEY|HEADER, headerName?, credential?}`（凭据掩码 `******` 回显，写入掩码或同类型留空保留凭据）、`toolFilter[]`（工具名过滤清单，工具发现落库时生效）。`POST /mcp/servers/{id}/test-connection` 连接测试（Mock 规则：启用 + HTTPS + 鉴权完整即 HEALTHY），返回 `{healthStatus,healthDetail,lastHealthAt}` 并落库健康字段。删除被专家绑定时 `409` 拒绝（硬拦截，不提供确认通道）。
- `GET /mcp/tools` 返回 `[{id,serverId,name,enabled}]`，需 mcp:view。工具启停需 mcp:edit，更新所属服务版本；发现工具返回数组，健康检查返回服务配置。Mock 工具发现按 `connType` 返回不同工具集（OpenAPI=schema 操作集；MCP 按服务编码预置各平台工具名：1688/店雷达 ali_*、亚马逊 amazon_*、Ozon ozon_*、Temu temu_*、EchoTik echotik_* 等），受 `toolFilter` 过滤；健康检查不发网络请求。
- 对话列表返回 `{total,list:[{id,userId,expertId,expertName,summary,messageCount,createdAt,deletedAt,deleteReason}]}`；额外筛选 `deleted` 省略=未删除、true=已删除、all=全部。消息 `{role,content,createdAt}` 数组始终去除凭据及联系方式，GET 每次记 `chat.messages.view`。DELETE 请求体 `{reason}` 必填；`POST /chats/{id}/restore` 独立权限 chat:restore。导出 format=json|csv，需独立 chat:export，不隐式授予 chat:view；Mock `{filename,content}`，真实返回 JSON/CSV Blob（Content-Disposition）。导出留审计，CSV 防公式注入。
- 审计 beforeJson/afterJson 由服务层递归移除 token/password/secret/credential/authorization/authConfig、提示词与消息正文；联系方式及文本凭据脱敏。前端只展示脱敏diff，不接收原始凭据。已有Mock审计同样迁移清理。
- `GET /dashboard` 需要 dashboard:view，返回 `{source,userTotal,userToday,orderTotal,revenueTotal,chatTotal,expertTotal,skillTotal,serverTotal,trend:[{date,users,orders,chats}]}`；净支付只累计PAID订单，趋势为近7天本地现存记录。真实模式只请求真实API，失败不回退Mock。
- 超管拥有所有新权限；客服仅获得对话查看（不含删除、恢复、导出）；只读不具 chat:view 或配置编辑。P0已有用户/订单权限保留。localStorage沿用 leidaai-admin-demo-v1，schema版本4增量迁移（v3及以前自动补默认字段，不删除既有演示数据）。
- 保存请求可携带可选 `note`（变更说明，写入专家/技能版本历史与审计）；`POST /experts/import`、`POST /skills/import` 直接以导出 JSON 作为请求体（code 冲突返回 `409`）；`GET /experts/{id}/export`、`GET /skills/{id}/export` 返回 `{filename,content}`，导出内容剥离 id/version/刷新状态等运行时字段，凭据与提示词按审计策略脱敏。

## 7. 套餐管理 /plans（P1）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /plans | plan:view | 全量：`{id, name, price, durationDays, status, salesCount, entitlements[]}` |
| POST | /plans | plan:edit | `{code,name,price,durationDays,status,entitlements}` |
| PUT | /plans/{id} | plan:edit | 基本信息（version +1） |
| PUT | /plans/{id}/status | plan:edit | 上下架；`{status}` |
| PUT | /plans/{id}/entitlements | plan:edit | 权益全量覆盖；quotaPeriod 必填 |
| DELETE | /plans/{id} | plan:edit | 已有用户或订单引用时 `409` |
| POST | /plans/{id}/refresh | plan:edit | 刷新/重试配置版本 |

## 8. 专家 /experts（P1；v0.4 助手预设）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /experts | expert:view | 列表（含 tags/visibility/boundSkillCount/boundMcpCount/isDefault/version）；参数 `keyword`、`status` |
| GET | /experts/{id} | expert:view | 详情（助手预设全量字段；MCP 凭据类字段掩码） |
| POST | /experts | expert:edit | 新建（code 创建后不可改） |
| PUT | /experts/{id} | expert:edit | 保存（写库 version+1 → 发刷新事件；可选 `note` 进版本历史） |
| PUT | /experts/{id}/status | expert:edit | 启停（启用=上架到前台选择器） |
| PUT | /experts/{id}/default | expert:edit | 设为默认专家（原默认取消） |
| GET | /experts/{id}/versions | expert:view | 全量快照版本历史 `[{version,note,createdAt,snapshot}]`（新版本倒序） |
| POST | /experts/{id}/restore | expert:edit | `{version}` 恢复快照并生成新版本；恢复默认专家的停用版本被拒绝 |
| GET | /experts/{id}/export | expert:edit | 导出预设 JSON `{filename,content}`（凭据脱敏；权限复用 expert:edit） |
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
| PUT | /skills/{id} | skill:edit | 保存（触发刷新事件；每次保存写快照，可选 `note`） |
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
| POST | /mcp/servers | mcp:edit | 注册（MCP：transport+endpoint+path 或 STDIO command/args；OpenAPI：endpoint+path 必填） |
| PUT | /mcp/servers/{id} | mcp:edit | 保存（触发刷新事件） |
| PUT | /mcp/servers/{id}/status | mcp:edit | 启停 |
| DELETE | /mcp/servers/{id} | mcp:edit | 被专家绑定时 `409` 拒绝 |
| POST | /mcp/servers/{id}/test-connection | mcp:edit | 连接测试（Mock：MCP 握手 / OpenAPI schema 解析成功演示），结果落库健康字段 |
| POST | /mcp/servers/{id}/discover | mcp:edit | 工具发现：生成 Mock 工具落库 mcp_tool，受 `toolFilter` 过滤；服务须启用 |
| POST | /mcp/servers/{id}/health-check | mcp:edit | 立即健康检查 |
| PUT | /mcp/tools/{id}/enabled | mcp:edit | `{enabled}` 工具启停，所属服务 version +1 |
| GET | /mcp/tools | mcp:view | 工具列表 |
| POST | /mcp/servers/{id}/refresh | mcp:edit | 刷新/重试配置版本 |

## 11. 对话管理 /chats（P2）

| 方法 | 路径 | 权限点 | 说明 |
|---|---|---|---|
| GET | /chats | chat:view | 参数 `userId`、`expertId`、`keyword`(消息内容全文)、`start`/`end`、分页；返回脱敏摘要 |
| GET | /chats/{id}/messages | chat:view | 完整消息流（每次调用记审计） |
| DELETE | /chats/{id} | chat:delete | 软删除，`{reason}` |
| GET | /chats/{id}/export | chat:export | 参数 `format=json|csv`，独立于 chat:view 授权 |
| POST | /chats/{id}/restore | chat:restore | 恢复软删除会话 |

## 12. 前台工作台只读 API（C 端，附录 12.4）

后台「上架」即前台可用：专家 `status=1` 且通过 visibility 过滤后，出现在 C 端工作台选择器。本组契约与 admin 契约**完全隔离**：

- 基础路径：`/api/v1/workspace`（不走 `/admin/api`、不使用管理端 JWT；真实接入时由 C 端网关按用户 token 鉴权，Mock 中按 `userPlanIds` 查询参数模拟用户套餐）
- 全部只读 GET，响应同样为 `{code,msg,data}` 包装；`code=0` 成功
- 过滤口径：
  - **专家**：`status=1`（上架）且 `visibility=PUBLIC`（全员可见）或 `visibility=PLAN` 且 `planIds` 与用户套餐有交集；`PRIVATE` 一律不返回
  - **技能**：`status=1` 且被至少一个"对当前用户可见的专家"绑定（技能自身无可见性字段，展示口径跟随专家）
  - **MCP**：`status=1` 且被至少一个"对当前用户可见的专家"绑定
- 匿名（未传套餐）仅可见 PUBLIC；历史会话不受下架影响（契约不返回已下架专家的历史绑定）

### GET /api/v1/workspace/experts
参数：`userPlanIds`（逗号分隔的套餐 ID，可省略=匿名）。

```json
// data
[{
  "id": 1, "code": "product-selection-assistant", "name": "1688分销选品",
  "description": "面向 1688 分销场景的选品助手…", "avatarUrl": "",
  "baseModel": "GLM-5.3", "tags": ["选品", "1688", "分销"],
  "suggestedQuestions": ["帮我分析\"收纳盒\"关键词的竞争度", "…"],
  "capabilities": { "file_context": true, "file_upload": true, "web_search": true, "citations": true },
  "boundSkillCount": 7, "boundMcpCount": 1
}]
```

### GET /api/v1/workspace/experts/{code}
按助手 ID 返回已上架且对该视角可见的专家详情（列表字段 + `skillNames[]`/`mcpNames[]` 绑定名称）；系统提示词全文不下发；未上架/不可见/不存在返回 404。

### GET /api/v1/workspace/skills
参数同上。返回被可见专家绑定的启用技能：

```json
[{ "id": 11, "code": "dld-selection-search", "name": "1688选品搜索", "description": "按关键词/类目在 1688 搜索候选商品并返回结构化清单…", "boundExpertCount": 1 }]
```

### GET /api/v1/workspace/mcps
参数同上。返回被可见专家绑定的启用连接（不暴露鉴权信息）：

```json
[{ "id": 1, "code": "gateway", "name": "聚合网关（OpenAPI）", "connType": "OpenAPI", "endpoint": "https://gateway.example.com", "path": "/openapi.json", "enabledToolCount": 4 }]
```

- 管理端「前台预览」抽屉复用以上三个接口，以普通用户视角展示上架后前台卡片（名称/描述/标签/建议问题/绑定技能），并支持切换模拟用户持有套餐验证 PLAN 过滤与下架即消失
- 预设导出 JSON 可直接导入 OpenWebUI/AgentScope Java，作为运行时接通的过渡手段

---

## 错误码汇总

| code | 含义 | 前端行为 |
|---|---|---|
| 0 | 成功 | — |
| 401 | 未登录/Token 失效 | 清除本地会话，跳登录页 |
| 403 | 无权限 | 提示"无权限"，不跳转 |
| 409 | 冲突（如删除被引用资源） | 透出 msg |
| 422 | 参数/业务校验失败 | 表单内展示 msg |
| 423 | 登录锁定 | 登录页展示 msg |
| 500 | 服务异常 | 统一错误提示 |
