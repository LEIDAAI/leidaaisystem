-- =====================================================================
-- 雷达AI 管理后台建表脚本（MySQL 8.0+）
-- 说明：
--   1) 管理域六表为全新新增；
--   2) 配置域五表若 AgentScope Java 已有同名表，请以现有表为准，
--      只需保证后台 API 与之对齐（本文件给出的是缺省结构）；
--   3) 运营域（user/order/plan/conversation/message）复用现有表，不在本脚本内。
-- =====================================================================

-- ---------------------------------------------------------------- 管理域
CREATE TABLE IF NOT EXISTS `admin_user` (
  `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `username`      VARCHAR(64)  NOT NULL COMMENT '登录名',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'BCrypt 哈希',
  `display_name`  VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '显示名',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  `last_login_at` DATETIME     NULL,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理员账号';

CREATE TABLE IF NOT EXISTS `admin_role` (
  `id`         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`       VARCHAR(64)  NOT NULL COMMENT '角色编码：SUPER_ADMIN/OPS/SUPPORT/VIEWER',
  `name`       VARCHAR(64)  NOT NULL,
  `remark`     VARCHAR(255) NOT NULL DEFAULT '',
  `status`     TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0禁用',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理端角色';

CREATE TABLE IF NOT EXISTS `admin_permission` (
  `id`     BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`   VARCHAR(64) NOT NULL COMMENT '权限点：user:ban / order:refund / expert:edit ...',
  `name`   VARCHAR(64) NOT NULL,
  `module` VARCHAR(32) NOT NULL COMMENT 'user/order/plan/expert/skill/mcp/admin/chat/dashboard',
  `type`   TINYINT     NOT NULL DEFAULT 2 COMMENT '1菜单 2操作',
  `sort`   INT         NOT NULL DEFAULT 0,
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限点字典';

CREATE TABLE IF NOT EXISTS `admin_user_role` (
  `admin_user_id` BIGINT UNSIGNED NOT NULL,
  `role_id`       BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`admin_user_id`, `role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号-角色';

CREATE TABLE IF NOT EXISTS `admin_role_permission` (
  `role_id`       BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限';

CREATE TABLE IF NOT EXISTS `admin_audit_log` (
  `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `admin_user_id` BIGINT UNSIGNED NOT NULL,
  `username`      VARCHAR(64)  NOT NULL COMMENT '冗余操作人，防账号删除后无法追溯',
  `action`        VARCHAR(64)  NOT NULL COMMENT '动作：user.ban / order.refund / expert.update ...',
  `object_type`   VARCHAR(32)  NOT NULL COMMENT '对象类型：user/order/plan/expert/skill/mcp_server/chat...',
  `object_id`     VARCHAR(64)  NOT NULL,
  `before_json`   JSON         NULL COMMENT '改前快照',
  `after_json`    JSON         NULL COMMENT '改后快照',
  `ip`            VARCHAR(64)  NOT NULL DEFAULT '',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_admin` (`admin_user_id`, `created_at`),
  KEY `idx_object` (`object_type`, `object_id`),
  KEY `idx_action` (`action`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='管理端操作审计';

-- ---------------------------------------------------------------- 配置域
-- 若 AgentScope Java 已有对应表，跳过建表并以其为准。
-- v0.4（附录 12）助手体系模型改造：以下为「新装重建」结构；
-- 已有 v3 表请勿重建，执行本节末尾的增量 ALTER 参考。
CREATE TABLE IF NOT EXISTS `expert` (
  `id`                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`                VARCHAR(64)  NOT NULL COMMENT '助手 ID（如 product-selection-assistant），创建后不可改，API/导入导出/前台标识',
  `name`                VARCHAR(128) NOT NULL COMMENT '选择器显示名',
  `description`         VARCHAR(1024) NOT NULL DEFAULT '' COMMENT '能力摘要（前台展示）',
  `avatar_url`          VARCHAR(512) NOT NULL DEFAULT '',
  `base_model`          VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '基础模型（v0.5 起存 model_config.code；旧显示名迁移时映射/自动注册）',
  `platforms`           JSON         NOT NULL COMMENT '平台维度数组（v0.5）：1688/OZON/AMAZON/TEMU，至少一个（多选）',
  `system_prompt`       TEXT         NOT NULL COMMENT '系统提示词（角色/技能路由/调用纪律/输出格式）',
  `skill_ids`           JSON         NOT NULL COMMENT '绑定技能 ID 数组（SKILL.md 内容型）',
  `mcp_server_ids`      JSON         NOT NULL COMMENT '绑定工具服务器连接 ID 数组（MCP/OpenAPI）',
  `suggested_questions` JSON         NOT NULL COMMENT '建议问题数组（前台打开助手时展示）',
  `capabilities`        JSON         NOT NULL COMMENT '能力开关对象：file_context/file_upload/vision/web_search/image_generation/code_interpreter/terminal/citations/status_updates/memory/builtin_tools/usage（v3 旧键 file 迁移映射为 file_context+file_upload）',
  `tags`                JSON         NOT NULL COMMENT '标签数组',
  `visibility`          VARCHAR(16)  NOT NULL DEFAULT 'PUBLIC' COMMENT 'PUBLIC 全员 / PLAN 指定套餐 / PRIVATE 私有（展示层；plan_entitlement 为计费限额层）',
  `plan_ids`            JSON         NOT NULL COMMENT 'visibility=PLAN 时可见的套餐 ID 数组',
  `status`              TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用（上架到前台选择器） 0停用（下架）',
  `is_default`          TINYINT      NOT NULL DEFAULT 0 COMMENT '是否默认专家（必须启用）',
  `version`             INT          NOT NULL DEFAULT 1 COMMENT '配置版本，每次修改 +1，运行时比对用',
  `intro`               VARCHAR(512) NOT NULL DEFAULT '' COMMENT '[v4 起废弃，兼容保留] 旧简介',
  `model_params`        JSON         NULL COMMENT '[v4 起废弃，兼容保留] 旧模型参数',
  `mcp_tool_ids`        JSON         NOT NULL COMMENT '[v4 起废弃，兼容保留] 旧 MCP 工具绑定，由 mcp_server_ids 替代',
  `created_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='专家（助手预设，对齐 OpenWebUI）配置';

CREATE TABLE IF NOT EXISTS `skill` (
  `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`         VARCHAR(64)  NOT NULL COMMENT '技能编码',
  `name`         VARCHAR(128) NOT NULL,
  `description`  VARCHAR(512) NOT NULL DEFAULT '' COMMENT '触发意图，供助手路由判断',
  `content`      MEDIUMTEXT   NOT NULL COMMENT 'SKILL.md Markdown 正文；建议按 触发条件/不适用范围/参数契约/执行步骤/结果校验/输出约定/异常边界 分节',
  `files`        JSON         NOT NULL COMMENT '附属文件数组 [{name,content}]（演示级）',
  `platforms`    JSON         NOT NULL COMMENT '平台维度数组（v0.5）：1688/OZON/AMAZON/TEMU，至少一个（多选）',
  `status`       TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用（被专家引用时停用/删除需确认）',
  `version`      INT          NOT NULL DEFAULT 1 COMMENT '每次保存生成快照（见 skill_version 表）',
  `param_schema` JSON         NULL COMMENT '[v4 起降级为可选高级字段] 旧入参 JSON Schema（留空不修改，兼容旧执行模型）',
  `exec_config`  JSON         NULL COMMENT '[v4 起降级为可选高级字段] 旧执行配置（留空不修改）',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技能定义（SKILL.md 内容型）';

CREATE TABLE IF NOT EXISTS `mcp_server` (
  `id`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`            VARCHAR(64)  NOT NULL COMMENT '连接编码：gateway/dld/amazon_data/gateway-amazon 等',
  `name`            VARCHAR(128) NOT NULL,
  `conn_type`       VARCHAR(16)  NOT NULL DEFAULT 'MCP' COMMENT 'MCP（协议发现工具）/ OpenAPI（按 openapi.json 解析操作生成工具）',
  `transport`       VARCHAR(20)  NOT NULL DEFAULT 'STREAMABLE_HTTP' COMMENT '仅 MCP 类型：STREAMABLE_HTTP / SSE / STDIO（旧 HTTP 值迁移为 STREAMABLE_HTTP）',
  `endpoint`        VARCHAR(512) NOT NULL DEFAULT '' COMMENT '服务地址（HTTP/SSE/OpenAPI）；STDIO 为空',
  `path`            VARCHAR(255) NOT NULL DEFAULT '' COMMENT '端点路径：/mcp 或 xxx/openapi.json（OpenAPI 必填）',
  `command`         VARCHAR(255) NOT NULL DEFAULT '' COMMENT '仅 STDIO：启动命令',
  `args`            JSON         NOT NULL COMMENT '仅 STDIO：启动参数字符串数组',
  `auth_type`       VARCHAR(16)  NOT NULL DEFAULT 'NONE' COMMENT 'NONE/BEARER/API_KEY/HEADER（冗余自 auth_config.type，便于检索）',
  `auth_config`     JSON         NULL COMMENT '鉴权信息（应用层加密存储，接口只回显掩码；API_KEY/HEADER 需 headerName）',
  `tool_filter`     JSON         NOT NULL COMMENT '工具名过滤清单（空=开放全部），工具发现落库 mcp_tool 时生效',
  `platforms`       JSON         NOT NULL COMMENT '平台维度数组（v0.5）：1688/OZON/AMAZON/TEMU，至少一个（多选）',
  `access_scope`    VARCHAR(16)  NOT NULL DEFAULT 'INHERIT' COMMENT '前台可见范围：INHERIT=随绑定专家 visibility 决定（当前实现）；预留 PUBLIC/PLAN/PRIVATE 独立控制',
  `health_status`   VARCHAR(16)  NOT NULL DEFAULT 'UNKNOWN' COMMENT 'UNKNOWN/HEALTHY/UNAVAILABLE',
  `last_health_at`  DATETIME     NULL,
  `health_detail`   VARCHAR(512) NOT NULL DEFAULT '' COMMENT '最近一次检查详情/错误',
  `status`          TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `version`         INT          NOT NULL DEFAULT 1,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MCP/OpenAPI 工具服务器连接';

-- v0.4 新增：专家/技能版本快照（每次保存生成，支持查看差异与恢复生成新版本）
-- v0.5：快照表统一增加版本名称（版本确认框生成，默认 yyyyMMddHHmmss）与操作人列
CREATE TABLE IF NOT EXISTS `expert_version` (
  `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `expert_id`    BIGINT UNSIGNED NOT NULL,
  `version`      INT          NOT NULL COMMENT '对应的 expert.version',
  `version_name` VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '版本名称（v0.5；版本确认框默认 yyyyMMddHHmmss，可改）',
  `operator`     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人（冗余用户名）',
  `note`         VARCHAR(255) NOT NULL DEFAULT '' COMMENT '变更说明',
  `snapshot`     JSON         NOT NULL COMMENT '全量配置快照（凭据/提示词读取时按策略脱敏）',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_expert_version` (`expert_id`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='专家（助手预设）版本快照';

CREATE TABLE IF NOT EXISTS `skill_version` (
  `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `skill_id`     BIGINT UNSIGNED NOT NULL,
  `version`      INT          NOT NULL COMMENT '对应的 skill.version',
  `version_name` VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '版本名称（v0.5；版本确认框默认 yyyyMMddHHmmss，可改）',
  `operator`     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人（冗余用户名）',
  `note`         VARCHAR(255) NOT NULL DEFAULT '' COMMENT '变更说明',
  `snapshot`     JSON         NOT NULL COMMENT 'SKILL.md 全量快照',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_skill_version` (`skill_id`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='技能版本快照';

-- v0.5 新增：MCP 连接配置版本快照（补齐：含连接配置与工具绑定，支持历史/差异/恢复）
CREATE TABLE IF NOT EXISTS `mcp_version` (
  `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `server_id`    BIGINT UNSIGNED NOT NULL,
  `version`      INT          NOT NULL COMMENT '对应的 mcp_server.version',
  `version_name` VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '版本名称（版本确认框默认 yyyyMMddHHmmss，可改）',
  `operator`     VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作人（冗余用户名）',
  `note`         VARCHAR(255) NOT NULL DEFAULT '' COMMENT '变更说明',
  `snapshot`     JSON         NOT NULL COMMENT '连接配置全量快照（connType/endpoint/path/transport/authConfig 加密存储/toolFilter）',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_server_version` (`server_id`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MCP 连接配置版本快照（v0.5）';

-- v0.5 新增：基础模型注册表（专家 base_model 由此选择，存 code）
CREATE TABLE IF NOT EXISTS `model_config` (
  `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `code`           VARCHAR(64)  NOT NULL COMMENT '模型编码（如 glm-5.3），唯一，创建后不可改；专家 base_model 引用',
  `name`           VARCHAR(128) NOT NULL COMMENT '显示名（如 GLM-5.3）',
  `provider`       VARCHAR(32)  NOT NULL COMMENT '供应商字典：智谱/OpenAI兼容/Anthropic兼容/自定义（可扩展）',
  `endpoint`       VARCHAR(512) NOT NULL DEFAULT '' COMMENT '接入地址 base URL（如 https://open.bigmodel.cn/api/paas/v4，仅示意）',
  `api_key`        VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'API Key（应用层加密存储；接口只回显掩码 ****abcd，永不回显明文；更新留空=不修改）',
  `default_params` JSON         NULL COMMENT '默认生成参数 JSON（temperature、max_tokens 等）',
  `remark`         VARCHAR(255) NOT NULL DEFAULT '',
  `status`         TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用（停用后专家表单不可再选）',
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='基础 LLM 模型注册表（v0.5）';

-- ---------------------------------------------------------------- v3 → v4 增量 ALTER 参考（已有表勿重建时使用）
-- ALTER TABLE `expert`
--   ADD COLUMN `description` VARCHAR(1024) NOT NULL DEFAULT '' COMMENT '能力摘要' AFTER `name`,
--   ADD COLUMN `base_model` VARCHAR(64) NOT NULL DEFAULT '' AFTER `avatar_url`,
--   ADD COLUMN `mcp_server_ids` JSON NOT NULL AFTER `skill_ids`,
--   ADD COLUMN `suggested_questions` JSON NOT NULL AFTER `mcp_server_ids`,
--   ADD COLUMN `capabilities` JSON NOT NULL AFTER `suggested_questions`,
--   ADD COLUMN `tags` JSON NOT NULL AFTER `capabilities`,
--   ADD COLUMN `visibility` VARCHAR(16) NOT NULL DEFAULT 'PUBLIC' AFTER `tags`,
--   ADD COLUMN `plan_ids` JSON NOT NULL AFTER `visibility`;
-- UPDATE `expert` SET `capabilities`=JSON_OBJECT(), `suggested_questions`=JSON_ARRAY(),
--   `tags`=JSON_ARRAY(), `plan_ids`=JSON_ARRAY(), `description`=`intro`,
--   `base_model`=COALESCE(JSON_UNQUOTE(JSON_EXTRACT(`model_params`,'$.model')),'GLM-5.3'),
--   `mcp_server_ids`='[]' WHERE `capabilities` IS NULL OR JSON_LENGTH(`capabilities`)=0;
-- ALTER TABLE `skill`
--   ADD COLUMN `content` MEDIUMTEXT NOT NULL AFTER `description`,
--   ADD COLUMN `files` JSON NOT NULL AFTER `content`;
-- UPDATE `skill` SET `files`='[]', `content`=CONCAT('# ', `name`, '\n\n## 触发条件\n', `description`) WHERE `content`='';
-- ALTER TABLE `mcp_server`
--   ADD COLUMN `conn_type` VARCHAR(16) NOT NULL DEFAULT 'MCP' AFTER `name`,
--   ADD COLUMN `path` VARCHAR(255) NOT NULL DEFAULT '' AFTER `endpoint`,
--   ADD COLUMN `command` VARCHAR(255) NOT NULL DEFAULT '' AFTER `path`,
--   ADD COLUMN `args` JSON NOT NULL AFTER `command`,
--   ADD COLUMN `auth_type` VARCHAR(16) NOT NULL DEFAULT 'NONE' AFTER `args`,
--   ADD COLUMN `tool_filter` JSON NOT NULL AFTER `auth_config`,
--   ADD COLUMN `access_scope` VARCHAR(16) NOT NULL DEFAULT 'INHERIT' COMMENT '前台可见范围，当前随绑定专家 visibility' AFTER `tool_filter`,
--   MODIFY COLUMN `health_status` VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN';
-- UPDATE `mcp_server` SET `args`='[]', `tool_filter`='[]', `transport`='STREAMABLE_HTTP' WHERE `transport`='HTTP';
-- UPDATE `mcp_server` s JOIN (SELECT id, JSON_UNQUOTE(JSON_EXTRACT(auth_config,'$.type')) t FROM mcp_server) x ON s.id=x.id
--   SET s.auth_type=COALESCE(x.t,'NONE');

-- ---------------------------------------------------------------- v4 → v5 增量 ALTER 参考（模型管理 / 平台维度 / 版本名称；已有表勿重建时使用）
-- ALTER TABLE `expert`
--   ADD COLUMN `platforms` JSON NOT NULL AFTER `base_model` COMMENT '平台维度数组：1688/OZON/AMAZON/TEMU，至少一个';
-- UPDATE `expert` SET `platforms`=JSON_ARRAY('1688')
--   WHERE JSON_LENGTH(`platforms`)=0;  -- 默认回填 1688；可按 code 关键词细分：
-- UPDATE `expert` SET `platforms`=JSON_ARRAY('OZON')   WHERE `code` LIKE '%ozon%';
-- UPDATE `expert` SET `platforms`=JSON_ARRAY('AMAZON') WHERE `code` LIKE '%amazon%' OR `name` LIKE '%亚马逊%';
-- UPDATE `expert` SET `platforms`=JSON_ARRAY('TEMU')   WHERE `code` LIKE '%temu%';
-- ALTER TABLE `skill`
--   ADD COLUMN `platforms` JSON NOT NULL AFTER `files` COMMENT '平台维度数组：1688/OZON/AMAZON/TEMU，至少一个';
-- UPDATE `skill` SET `platforms`=JSON_ARRAY('1688') WHERE JSON_LENGTH(`platforms`)=0;  -- 同上按关键词细分
-- ALTER TABLE `mcp_server`
--   ADD COLUMN `platforms` JSON NOT NULL AFTER `tool_filter` COMMENT '平台维度数组：1688/OZON/AMAZON/TEMU，至少一个';
-- UPDATE `mcp_server` SET `platforms`=JSON_ARRAY('1688') WHERE JSON_LENGTH(`platforms`)=0;  -- 同上按关键词细分
-- -- 版本快照表补版本名称与操作人（存量条目按其 created_at 时间戳 yyyyMMddHHmmss 回填）
-- ALTER TABLE `expert_version`
--   ADD COLUMN `version_name` VARCHAR(64) NOT NULL DEFAULT '' AFTER `version`,
--   ADD COLUMN `operator` VARCHAR(64) NOT NULL DEFAULT '' AFTER `version_name`;
-- UPDATE `expert_version` SET `version_name`=DATE_FORMAT(`created_at`,'%Y%m%d%H%i%s') WHERE `version_name`='';
-- ALTER TABLE `skill_version`
--   ADD COLUMN `version_name` VARCHAR(64) NOT NULL DEFAULT '' AFTER `version`,
--   ADD COLUMN `operator` VARCHAR(64) NOT NULL DEFAULT '' AFTER `version_name`;
-- UPDATE `skill_version` SET `version_name`=DATE_FORMAT(`created_at`,'%Y%m%d%H%i%s') WHERE `version_name`='';
-- -- 旧 base_model 显示名/未注册值：以 model_config 为准（映射 code 或注册为「自定义」模型，应用层幂等执行，SQL 仅示意）
-- INSERT IGNORE INTO `model_config` (`code`, `name`, `provider`)
-- SELECT DISTINCT `base_model`, `base_model`, '自定义' FROM `expert`
--   WHERE `base_model` <> '' AND `base_model` NOT IN (SELECT `code` FROM `model_config`);

CREATE TABLE IF NOT EXISTS `mcp_tool` (
  `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `server_id`    BIGINT UNSIGNED NOT NULL,
  `tool_name`    VARCHAR(128) NOT NULL,
  `description`  VARCHAR(512) NOT NULL DEFAULT '',
  `input_schema` JSON         NULL,
  `enabled`      TINYINT      NOT NULL DEFAULT 1 COMMENT '0/1 独立启停',
  UNIQUE KEY `uk_server_tool` (`server_id`, `tool_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MCP 工具清单（工具发现落库）';

CREATE TABLE IF NOT EXISTS `plan_entitlement` (
  `id`            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `plan_id`       BIGINT UNSIGNED NOT NULL COMMENT '关联现有套餐表 plan.id',
  `resource_type` VARCHAR(16)  NOT NULL COMMENT 'EXPERT / SKILL / MCP_TOOL',
  `resource_id`   BIGINT UNSIGNED NOT NULL,
  `quota_type`    VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '限额类型：CHAT_COUNT/SKILL_CALL，空=不限',
  `quota_limit`   INT          NOT NULL DEFAULT 0 COMMENT '限额值，quota_type 为空时忽略',
  UNIQUE KEY `uk_plan_resource` (`plan_id`, `resource_type`, `resource_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套餐权益绑定';

-- ---------------------------------------------------------------- 初始数据
-- 权限点字典（P0 部分 + P1/P2 预留，前端菜单显隐即以此为准）
INSERT IGNORE INTO `admin_permission` (`code`, `name`, `module`, `type`, `sort`) VALUES
  ('dashboard:view',  '仪表盘查看',   'dashboard', 1, 0),
  ('admin:manage',    '管理员管理',   'admin',     1, 10),
  ('admin:edit',      '管理员编辑',   'admin',     2, 11),
  ('role:manage',     '角色管理',     'admin',     2, 12),
  ('user:view',       '用户查看',     'user',      1, 20),
  ('user:ban',        '用户封禁',     'user',      2, 21),
  ('user:entitlement','用户权益调整', 'user',      2, 22),
  ('order:view',      '订单查看',     'order',     1, 30),
  ('order:refund',    '订单退款',     'order',     2, 31),
  ('order:export',    '订单导出',     'order',     2, 32),
  ('plan:manage',     '套餐管理',     'plan',      1, 40),
  ('expert:edit',     '专家编辑',     'expert',    2, 50),
  ('skill:edit',      '技能编辑',     'skill',     2, 60),
  ('mcp:edit',        'MCP编辑',      'mcp',       2, 70),
  ('chat:view',       '对话查看',     'chat',      1, 80),
  ('chat:delete',     '对话删除',     'chat',      2, 81),
  ('chat:export',     '对话导出',     'chat',      2, 82),
  ('audit:view',      '审计查看',     'admin',     1, 90),
  ('order:remark',    '订单备注',     'order',     2, 33),
  ('plan:view',       '套餐查看',     'plan',      1, 41),
  ('plan:edit',       '套餐编辑',     'plan',      2, 42),
  ('expert:view',     '专家查看',     'expert',    1, 49),
  ('skill:view',      '技能查看',     'skill',     1, 59),
  ('mcp:view',        'MCP查看',      'mcp',      1, 69),
  ('chat:restore',    '对话恢复',     'chat',      2, 83),
  ('skill:clone',     '技能克隆',     'skill',     2, 61),
  ('skill:export',    '技能导出',     'skill',     2, 62),
  ('model:view',      '模型查看',     'model',     1, 71),
  ('model:edit',      '模型编辑',     'model',     2, 72);
  -- 专家导出/导入按约定复用 expert:edit，不设独立 expert:export 权限点（v4）
  -- 模型管理 model:view/model:edit 为 v5 新增权限点：超管全量、运营增量授予，support/viewer 不授予

-- 默认角色
INSERT IGNORE INTO `admin_role` (`code`, `name`, `remark`) VALUES
  ('SUPER_ADMIN', '超级管理员', '全部权限'),
  ('OPS',         '运营',       '套餐/用户/订单'),
  ('SUPPORT',     '客服',       '用户/订单查看 + 对话查看'),
  ('VIEWER',      '只读',       '仅查看');

-- 增量授予新增权限；使用编码关联，兼容已有生产权限ID，不修改配置域现有表。
INSERT IGNORE INTO `admin_role_permission` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `admin_role` r CROSS JOIN `admin_permission` p
WHERE r.code = 'SUPER_ADMIN';
INSERT IGNORE INTO `admin_role_permission` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `admin_role` r CROSS JOIN `admin_permission` p
WHERE r.code = 'OPS' AND p.code IN ('plan:view', 'plan:edit', 'skill:clone', 'skill:export', 'model:view', 'model:edit');
INSERT IGNORE INTO `admin_role_permission` (`role_id`, `permission_id`)
SELECT r.id, p.id FROM `admin_role` r CROSS JOIN `admin_permission` p
WHERE r.code = 'SUPPORT' AND p.code = 'chat:view';
-- VIEWER 不授予敏感对话权限或配置编辑。已有个性化角色授权不自动清除。
-- quotaPeriod、刷新状态及提示词版本为API逻辑字段；由Java适配现有存储，禁止直接重建生产配置表。

-- 初始超管账号：用户名 admin，密码由部署时生成（BCrypt），首次登录后必须修改
-- INSERT INTO `admin_user` (`username`, `password_hash`, `display_name`)
-- VALUES ('admin', '<部署时生成 BCrypt>', '系统管理员');
-- INSERT INTO `admin_user_role` (`admin_user_id`, `role_id`)
-- SELECT u.id, r.id FROM `admin_user` u, `admin_role` r
-- WHERE u.username = 'admin' AND r.code = 'SUPER_ADMIN';
