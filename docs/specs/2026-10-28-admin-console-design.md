# 雷达AI 管理后台设计文档

日期：2026-10-28
状态：已评审（架构方案 A 确认）

## 1. 背景与目标

雷达AI（全球电商选品 Agent）现有体系：

- C 端：静态官网 + 工作台（GitHub Pages，纯 HTML）
- 业务后端：Java 自建，已有用户表、订单/支付、对话存储
- Agent 运行时：基于 **AgentScope Java** 搭建的专家（Agent）、技能（Skill）、MCP 能力，配置存于数据库、运行时动态读取

目标：新建一套**后台管理系统**，统一管理用户、订单、套餐、专家、技能、MCP、权限和用户对话，为运营和客服提供支撑。

## 2. 需求范围

8 个功能模块：

1. 用户管理
2. 订单管理
3. 套餐管理（含 C 端权益绑定）
4. 专家管理
5. 技能管理
6. MCP 管理
7. 权限管理（后台 RBAC + C 端权益双体系）
8. 用户历史对话查看与管理

**非目标**（本期不做）：支付渠道接入改造、数据大屏 BI、工单系统。

## 3. 总体架构（方案 A：配置库为单一事实源）

```
┌─────────────────────────────────────────────────┐
│  管理端前端（admin.xxx.com 或 /admin 路径）        │
│  Vue 3 + Vite + Element Plus + Pinia + Vue Router │
└──────────────────┬──────────────────────────────┘
                   │ HTTPS / JWT
┌──────────────────▼──────────────────────────────┐
│  现有 Java 服务新增 admin 模块（独立包路径          │
│  com.leidaai.admin.*，与 C 端 API 隔离）           │
│  ├─ 登录鉴权 + RBAC 拦截器 + 操作审计切面          │
│  ├─ 8 大模块的 REST API（/admin/api/**）          │
│  └─ 配置变更 → 进程内事件 / Redis pub-sub          │
│         │            │                            │
│         ▼            ▼                            │
│   共享业务库    AgentScope Java 运行时（同 JVM     │
│  (MySQL)       或同服务体系，动态读配置）           │
└─────────────────────────────────────────────────┘
```

### 关键决策与理由

| 决策 | 内容 | 理由 |
|---|---|---|
| 架构方案 | 方案 A：配置库为单一事实源，Java Admin API 统一鉴权/审计，AgentScope Java 运行时动态读库 + 接收刷新事件 | 复用现有"配置在库、动态读"架构；前后端只对接一套 API；AgentScope Java 与业务后端同为 Java，刷新可进程内实现，无需跨服务管理接口 |
| 部署形态 | admin 前端独立构建产物；后端 API 走 `/admin/api/**` 前缀 + 独立鉴权体系，与 C 端 token 完全隔离 | 安全隔离，避免管理面暴露给 C 端 |
| 配置生效 | 后台写库（version 递增）→ 发布变更事件 → 运行时局部重载 | 单实例用 Spring 进程内事件；多实例用 Redis pub/sub 广播 |
| 审计 | 所有写操作经 AOP 切面自动记录 `admin_audit_log` | 合规与追责，对话删除等敏感操作必须留痕 |

### 被否决的备选方案

- **方案 B**（专家/技能/MCP 的 CRUD 全部由 Python/Agent 侧提供接口）：运行时框架不当管理平台用，需自建鉴权审计，前端对接两个后端，安全面扩大。
- **方案 C**（后台直连数据库绕过服务层）：最快但无校验无审计，易写脏配置，长期维护差。

## 4. 模块设计

| 模块 | 核心功能 | 关键操作 |
|---|---|---|
| 用户管理 | 用户列表（按手机号/邮箱/ID/昵称搜索，状态/注册时间筛选）、用户详情（套餐、订单、对话数、登录记录） | 封禁/解封、调整权益 |
| 订单管理 | 订单列表（按用户/状态/时间筛选）、订单详情含支付流水 | 退款、备注、导出对账 |
| 套餐管理 | 套餐 CRUD、定价、上下架 | 权益绑定：勾选可用专家/技能/MCP + 用量限额（对话次数、技能调用次数） |
| 专家管理 | 专家 CRUD：名称/头像/简介/提示词/模型参数 | 启停、绑定技能与 MCP、提示词版本管理 |
| 技能管理 | 技能 CRUD：名称/描述/参数 schema/执行配置 | 启停、调用统计 |
| MCP 管理 | Server 注册：名称/传输方式（SSE/HTTP/stdio）/地址/鉴权信息 | 工具发现、健康检查、启停 |
| 权限管理 | 管理员账号、角色、权限点、审计日志查询 | 角色绑定权限、账号绑定角色 |
| 对话管理 | 会话列表（按用户/专家/时间筛选 + 关键词搜索）、消息详情 | 软删除（带审计）、导出；`chat:view` 为独立敏感权限点 |

## 5. 数据模型

### 管理域（全新）

```sql
admin_user            -- 管理员账号（用户名、密码哈希、状态、最后登录时间）
admin_role            -- 角色（超管/运营/客服/只读…）
admin_permission      -- 权限点（如 user:ban, order:refund, expert:edit, chat:view）
admin_user_role       -- 账号-角色关联
admin_role_permission -- 角色-权限关联
admin_audit_log       -- 操作审计（操作人/时间/动作/对象/改前改后值/IP）
```

### 配置域（对齐 AgentScope Java 现有表；若已有则仅新增后台管理 API，不改表结构）

```sql
expert            -- 专家配置（含绑定的 skill_ids / mcp_tool_ids、提示词、模型参数、version）
skill             -- 技能定义（含参数 schema JSON、执行配置、version）
mcp_server        -- MCP 服务注册（传输方式、地址、鉴权信息、健康状态）
mcp_tool          -- MCP 工具清单（server_id、工具名、启停状态）
plan_entitlement  -- 套餐权益绑定（plan_id + 资源类型 expert/skill/mcp + 资源 ID + 用量限额）
```

### 运营域（复用现有表，仅新增只读/管理 API）

`user`、`order`、`plan`、`conversation`、`message` —— 不改表结构。

## 6. AgentScope Java 联动

### 配置生效链路

```
后台保存配置 ──► 写库（version 递增）──► 发布变更事件 {type, id}
                                            │
             ┌──────────────────────────────┤
             │ 单实例                         │ 多实例
       Spring 进程内事件                Redis pub/sub 广播
             └──────────────► AgentScope Java 运行时监听
                                     │
                                按 type+id 局部重载（不整体重启）
```

- **MCP 工具发现**：新增/编辑 MCP Server 后，复用运行时内嵌 MCP 客户端走协议 `list_tools` 拉取工具清单落库 `mcp_tool`，后台可单独启停工具
- **MCP 健康检查**：定时任务 ping 各 Server，状态写表，列表页红绿灯展示
- **兜底一致性**：运行时重载失败可重试并比对配置 version，保证最终一致

### 保存前校验（防脏配置）

- 技能参数 schema 做 JSON Schema 校验
- 引用完整性校验：删除被专家引用的 MCP 工具/技能时拦截并提示
- 专家提示词与模型参数做必要字段与格式校验

## 7. 安全设计

- 管理端独立登录：BCrypt 密码哈希、连续失败锁定、短时效 JWT，可选 TOTP 两步验证
- `/admin/api/**` 全局拦截器按权限点鉴权；`chat:view`（查看用户对话）独立敏感权限点，每次查看留审计
- 对话导出需更高权限点 `chat:export`（建议仅超管）
- 运维层：admin 入口加 IP 白名单
- 所有写操作走事务 + 审计切面，失败自动回滚

## 8. 错误处理

| 场景 | 处理 |
|---|---|
| 退款失败 | 透出支付渠道错误信息，支持重试 |
| 配置刷新失败 | 自动重试 + version 比对，列表页展示"待生效/生效失败"状态 |
| 删除被引用资源 | 前置校验拦截，提示引用方 |
| 对话删除 | 软删除 + 审计，可恢复 |
| MCP 健康检查失败 | 红绿灯标记 + 连续失败告警记录 |

## 9. 前端页面形态

- 左侧菜单 8 个模块（+ 可选仪表盘）；列表页统一「筛选栏 + 表格 + 分页」，编辑用抽屉/弹窗，详情用独立页
- 权限点控制菜单与按钮显隐（如无 `chat:view` 的客服看不到对话菜单）
- 通用组件：搜索栏、状态标签、审计记录抽屉、JSON Schema 表单（技能参数配置）

## 10. 实施分期

| 阶段 | 内容 |
|---|---|
| **P0 跑起来** | 前端骨架（登录/布局/动态菜单）、RBAC 六张表 + 接口、用户管理、订单管理 |
| **P1 配置中心** | 套餐管理 + 权益绑定、专家/技能/MCP 管理、变更刷新联动、MCP 工具发现与健康检查 |
| **P2 运营增强** | 对话管理（列表/详情/软删/导出）、审计日志页面、仪表盘统计 |

## 11. 技术选型清单

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + Vite + Element Plus + Pinia + Vue Router |
| 后端 | 现有 Java（Spring Boot）服务内新增 admin 模块 |
| Agent 运行时 | AgentScope Java（现有，不改架构，仅加事件监听与工具发现对接） |
| 数据库 | 现有 MySQL（新增管理域/配置域表） |
| 多实例刷新 | Redis pub/sub（单实例则 Spring 事件即可） |
| 鉴权 | JWT + RBAC（可选 TOTP） |

## 12. 附录：专家/技能/MCP 模型对齐 OpenWebUI 助手体系（2026-10-28 增补）

用户确认：**专家即 OpenWebUI 的"助手/模型预设"**，参照 1688选品助手（`product-selection-assistant`）的创建方式管理，最终上架到前台工作台（work.html 的专家库/技能/MCP 页）供用户使用。

### 12.1 专家 = 助手预设

| 字段 | 说明 |
|---|---|
| code | 助手 ID（如 `product-selection-assistant`），API/导入导出标识，编辑展示名不改 ID |
| name / description | 选择器显示名 + 能力摘要 |
| base_model | 基础模型（如 GLM-5.3），只选不训练 |
| system_prompt | 系统提示词（角色、技能路由、调用纪律、输出格式） |
| mcp_server_ids | 绑定工具服务器（MCP/OpenAPI 连接），只开放所需工具 |
| skill_ids | 绑定技能（SKILL.md），提示词负责路由 |
| suggested_questions | 建议问题（前台打开助手时展示的示例任务） |
| capabilities | 能力开关 JSON（file/vision/web_search/code_interpreter/citations/status_updates/memory/builtin_tools…） |
| tags / avatar | 标签、头像 |
| visibility | PUBLIC 全员 / PLAN 指定套餐 / PRIVATE 私有（plan_entitlement 为计费限额层，visibility 为展示层） |
| status / is_default / version | 启停（是否出现在前台选择器）、默认专家、配置版本 |

生命周期：创建 → 绑定工具/技能 → 配建议问题与能力 → 设可见性 → 启用上架 → 前台可用；编辑支持版本历史与恢复；支持导出/导入 JSON（预设迁移，凭据脱敏）。

### 12.2 技能 = SKILL.md 内容型技能

- 核心字段：code、name、description（触发意图，供助手路由）、**content（SKILL.md 正文）**、files（附属文件）、status
- 结构建议（写入正文规范）：触发条件 / 不适用范围 / 参数契约 / 执行步骤 / 结果校验 / 输出约定 / 异常边界
- 版本历史：每次保存生成快照，可查看差异、恢复、写变更说明
- 支持克隆、导入/导出；列表展示"绑定助手数"防误改共享技能
- 被专家引用时停用/删除需提示确认

### 12.3 MCP = 工具服务器连接（MCP / OpenAPI 双类型）

| 字段 | 说明 |
|---|---|
| conn_type | MCP（协议发现工具）或 OpenAPI（按 openapi.json 解析操作生成工具） |
| endpoint / path | 服务地址 + 端点路径（如 `/mcp` 或 `xxx/openapi.json`） |
| transport | MCP 传输方式：STREAMABLE_HTTP / SSE / STDIO |
| auth_type / auth_config | 无 / Bearer / API Key / 自定义请求头；凭据应用层加密、界面掩码、永不回显明文 |
| tool_filter | 工具名过滤清单，控制助手可见工具集合 |
| health / discover | 连接测试（握手或 schema 解析）与工具发现落库 mcp_tool |

### 12.4 前台可用链路

```
后台创建/编辑专家 ──► 启用 + 设可见性（上架）
                        │
                        ▼
              C 端工作台只读 API（/api/v1/workspace/**）
                        │
        work.html 专家库/技能/MCP 页按用户套餐过滤展示
```

- 后台"上架"即前台可见；禁用即从前台选择器消失（历史会话不受影响）
- C 端契约只读：按用户身份与套餐过滤 PUBLIC + 所购 PLAN 的专家/技能/MCP
- 预设导出 JSON 可直接导入 OpenWebUI/AgentScope Java，作为运行时接通的过渡手段
