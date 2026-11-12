# Changelog

本文件记录 dianleida-skill 的所有版本变更。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 原则，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/) 规范。

---

## [1.0.3] — 2026-09-04

### Added
- 新增运行时版本检测与自动拉取更新机制
- 新增 `version.json` — 线上版本清单文件，包含版本号、文件下载 URL 列表
- 新增 `references/更新策略.md` — 完整的运行时检测、拉取、回滚机制文档
- 新增 `CHANGELOG.md` — 版本变更记录文件
- `SKILL.md` 新增「版本检测与自动更新」章节，定义技能加载时的检测流程、更新提示、拉取步骤和回滚逻辑
- `manifest.yaml` 新增 `update_strategy` 块，包含 `version_check_url`、`check_on_load`、`check_timeout`、`auto_backup` 等配置

### Changed
- `manifest.yaml` 版本号确定为 1.0.3
- 优化未配置 MCP 时的处理策略：可主动询问用户是否提供店雷达 MCP 密钥，并尝试自动配置为 `dld-mcp`
- 自动配置失败时，改为根据当前 AI 工具提供前端手动配置流程

---

## [1.0.3] — 2026-08-24

### Added
- 初始版本发布
- 店雷达 1688 选品引导技能核心功能
- 支持 4 个 MCP 工具：`product_search_list`、`product_billboard_list`、`product_info`、`get_category_info`
- MCP 连接器智能识别（基于服务名称匹配，不校验工具名）
- 首次握手强制流程（识别 → 调用 → 错误分支处理）
- 意图识别引擎（商品意图 / 服务意图 / 混合意图）
- 默认参数自动推断映射表（15 种用户表达 → 参数推断）
- 默认 HTML 商品页面输出 + 聊天内嵌卡片可选模式
- 意图驱动链接选择策略（商品链接 / 店铺链接 / 混合）
- 完整的 `references/接口与参数参考.md` 深度参考文档
