# 雷达AI 管理后台实施计划

日期：2026-10-28
依据：[2026-10-28-admin-console-design.md](./2026-10-28-admin-console-design.md)

## 交付物形态

| 交付物 | 位置 | 说明 |
|---|---|---|
| 管理端前端工程 | `admin-frontend/`（本仓库） | Vue 3 + Vite + Element Plus + Pinia，可独立构建部署 |
| 后端管理 API 契约 | `docs/api/admin-api.md` | `/admin/api/**` 全量接口定义（路径/参数/返回/权限点），供 Java 侧实现 |
| 建表 SQL | `docs/sql/schema.sql` | 管理域六表 + 配置域五表（若已有表则只输出对齐说明） |
| 后端 admin 模块骨架参考 | `docs/backend-skeleton.md` | Spring Boot 包结构、拦截器/切面/事件监听代码骨架，由你们合入现有工程 |

> 后端代码需合入你们现有 Java 工程，本仓库内以前端工程 + 契约/SQL/骨架文档形式交付。

## P0：管理端跑起来

### T1 前端工程骨架
- [ ] Vite + Vue 3 + TS 初始化，Element Plus / Pinia / Vue Router / Axios 封装
- [ ] 登录页（账号密码 → JWT 存储、失效跳转）
- [ ] 布局：左侧动态菜单（按权限点过滤）+ 顶栏（用户信息/退出）
- [ ] 通用组件：筛选栏、状态标签、分页表格封装、错误提示统一处理

### T2 RBAC（后端契约 + 前端页面）
- [ ] `schema.sql`：admin_user / admin_role / admin_permission / admin_user_role / admin_role_permission / admin_audit_log
- [ ] 契约：登录、登出、当前用户信息（含权限点列表）
- [ ] 契约 + 页面：管理员账号 CRUD、角色管理、角色-权限绑定、账号-角色绑定
- [ ] 权限点字典（user:ban、order:refund、expert:edit、skill:edit、mcp:edit、plan:edit、admin:manage、chat:view、chat:delete、chat:export…）

### T3 用户管理
- [ ] 契约 + 页面：用户列表（搜索/筛选/分页）、用户详情（基本信息、套餐权益、订单、对话统计、登录记录）
- [ ] 操作：封禁/解封（记审计）

### T4 订单管理
- [ ] 契约 + 页面：订单列表（按用户/状态/时间筛选）、订单详情（支付流水）
- [ ] 操作：退款（透出渠道错误、可重试）、备注、CSV 导出

**P0 验收**：管理员可登录；不同角色菜单/按钮按权限点显隐；用户与订单可查可操作且全程留痕。

## P1：配置中心

### T5 套餐管理 + 权益绑定
- [ ] `plan_entitlement` 建表（若需新增）
- [ ] 契约 + 页面：套餐 CRUD、上下架、定价；权益绑定抽屉（勾选专家/技能/MCP + 用量限额）

### T6 专家管理
- [ ] 契约 + 页面：专家列表/详情/编辑（提示词、模型参数）、启停、绑定技能/MCP、提示词版本
- [ ] 保存前校验（引用完整性）

### T7 技能管理
- [ ] 契约 + 页面：技能 CRUD、参数 schema JSON 表单（JSON Schema 校验）、启停、调用统计只读页

### T8 MCP 管理
- [ ] 契约 + 页面：Server 注册 CRUD、工具发现（触发 list_tools 落库 mcp_tool）、工具启停、健康检查状态展示

### T9 变更刷新联动（后端骨架重点）
- [ ] 配置写库 version 递增 + 事件发布（Spring 事件 / Redis pub-sub 双实现开关）
- [ ] AgentScope Java 运行时监听器骨架：按 type+id 局部重载、失败重试、version 比对
- [ ] 配置项"待生效/生效失败"状态展示

**P1 验收**：后台改专家/技能/MCP 配置后运行时自动重载生效；MCP 工具可发现、健康状态可见；脏配置被校验拦截。

## P2：运营增强

### T10 对话管理
- [ ] 契约 + 页面：会话列表（按用户/专家/时间 + 关键词）、消息详情（`chat:view` 敏感权限 + 查看留痕）
- [ ] 操作：软删除（`chat:delete`）、导出（`chat:export`）

### T11 审计日志页面
- [ ] 审计列表（按操作人/时间/动作/对象筛选）、改前改后值 diff 展示

### T12 仪表盘（可选）
- [ ] 用户/订单/对话量趋势、MCP 健康一览

## 里程碑顺序

T1 → T2 → T3 → T4（P0 收口）→ T5 → T6 → T7 → T8 → T9（P1 收口）→ T10 → T11 → T12

## 风险与依赖

| 风险/依赖 | 应对 |
|---|---|
| AgentScope Java 配置表结构未确认 | T5-T8 前先导出现有表结构对齐；契约按"已有表只加 API"处理 |
| 多实例部署与否影响刷新实现 | T9 双实现开关，部署形态确认后二选一启用 |
| 对话数据可能含敏感内容 | chat:view/导出独立权限 + 审计，列表默认脱敏 |
| 你们后端工程合入节奏 | 交付契约先行，前端用 mock 数据并行开发 |
