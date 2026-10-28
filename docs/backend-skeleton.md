# 后端 admin 模块骨架（合入现有 Spring Boot 工程）

对应契约：[admin-api.md](../api/admin-api.md)；建表：[schema.sql](../sql/schema.sql)

## 1. 包结构（独立包路径，与 C 端 API 隔离）

```
com.leidaai.admin
├── config/
│   ├── AdminSecurityConfig.java      # 独立 SecurityFilterChain，仅拦截 /admin/api/**
│   └── AdminWebConfig.java           # 拦截器注册
├── security/
│   ├── AdminJwtService.java          # 签发/校验短时效 JWT
│   ├── AdminAuthInterceptor.java     # 登录态 + 权限点校验（读 @RequirePermission）
│   └── RequirePermission.java        # 注解，如 @RequirePermission("user:ban")
├── common/
│   ├── ApiResponse.java              # {code, msg, data}
│   ├── ApiException.java             # code+msg 业务异常
│   ├── PageResult.java               # {total, list}
│   └── AdminExceptionAdvice.java     # 全局异常 → ApiResponse 映射
├── audit/
│   ├── Audit.java                    # 注解 @Audit(action="user.ban", objectType="user", idParam="id")
│   ├── AuditAspect.java              # AOP：改前查快照 → 执行 → 改后快照 → 写 admin_audit_log
│   └── AuditLogMapper.java
├── auth/    AuthController.java / AuthService.java / dto/
├── adminuser/  AdminUserController.java / AdminUserService.java / mapper/
├── role/       RoleController.java / PermissionController.java / ...
├── user/       AdminUserController? 命名区分：C端用户放 manageuser/ ManageUserController
├── order/      OrderController.java（退款走现有支付服务）
├── plan/       PlanController.java（P1）
├── expert/     ExpertController.java（P1）
├── skill/      SkillController.java（P1）
├── mcp/        McpController.java（P1）
├── chat/       ChatController.java（P2）
└── refresh/
    ├── ConfigChangedEvent.java       # {type: EXPERT/SKILL/MCP_SERVER/MCP_TOOL, id, version}
    ├── ConfigChangePublisher.java    # 发布：Spring 事件 或 Redis pub/sub（配置开关）
    └── (AgentScope 运行时侧) ConfigReloadListener.java
```

## 2. 关键代码骨架

### 2.1 安全配置（与 C 端隔离）

```java
@Configuration
@EnableWebSecurity
public class AdminSecurityConfig {
    @Bean
    @Order(1) // 优先于 C 端过滤链
    public SecurityFilterChain adminChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/admin/api/**")
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        // 登录/鉴权由 AdminAuthInterceptor 处理，这里只做隔离
        return http.build();
    }
}
```

### 2.2 权限校验拦截器

```java
@Component
public class AdminAuthInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse resp, Object handler) {
        if (!(handler instanceof HandlerMethod hm)) return true;
        RequirePermission rp = hm.getMethodAnnotation(RequirePermission.class);
        String token = extractBearer(req);
        AdminContext ctx = adminJwtService.parse(token);   // 失效抛 401
        AdminContextHolder.set(ctx);                        // 供审计切面取操作人
        if (rp != null && !ctx.hasPermission(rp.value())) throw new ApiException(403, "无权限");
        return true;
    }
}
```

### 2.3 审计切面

```java
@Around("@annotation(audit)")
public Object around(ProceedingJoinPoint pjp, Audit audit) throws Throwable {
    Object before = auditLogMapper.snapshot(audit.objectType(), audit.objectId(pjp)); // 改前
    Object result = pjp.proceed();
    auditLogMapper.record(AdminContextHolder.get(), audit,
            before, result, RequestUtils.clientIp()); // 改后快照落库
    return result;
}
```

> 对话查看（GET）不走 @Audit 注解，在 ChatController 内显式记"查看留痕"。

### 2.4 配置变更发布（P1 联动核心）

```java
@Component
public class ConfigChangePublisher {
    private final ApplicationEventPublisher publisher; // 单实例
    private final StringRedisTemplate redis;           // 多实例开关 admin.refresh.mode=redis
    private final boolean useRedis;

    public void publish(String type, long id, int version) {
        if (useRedis) redis.convertAndSend("admin:config:changed", type + ":" + id + ":" + version);
        else publisher.publishEvent(new ConfigChangedEvent(type, id, version));
    }
}
```

AgentScope Java 运行时侧监听：

```java
// 单实例：@EventListener(ConfigChangedEvent.class)
// Redis：MessageListenerAdapter 订阅 admin:config:changed
public void onConfigChanged(ConfigChangedEvent e) {
    reloadService.reload(e.type(), e.id(), e.version()); // 局部重载；version 小于当前则跳过；失败进入重试队列
}
```

### 2.5 退款事务边界

```java
@Transactional
public void refund(long orderId, RefundReq req) {
    Order order = orderMapper.lockById(orderId);          // SELECT ... FOR UPDATE
    if (order.getStatus() != PAID) throw new ApiException(422, "当前状态不可退款");
    try { payChannel.refund(order, req); }                 // 渠道失败异常原样透出
    catch (ChannelException ce) { throw new ApiException(422, ce.getMessage()); }
    orderMapper.markRefunded(orderId, req.getAmount(), req.getReason());
}
```

## 3. 登录安全要点

- BCrypt(强度 10+) 存哈希；登录失败计数（Redis key `admin:fail:{username}`，5 次/15 分钟 → 423）
- JWT 有效期 2h，仅含 adminUserId；登出用 Redis 黑名单（key=tokenId，TTL=剩余有效期）
- 密码重置后强制下线该账号全部 token（换签发密钥版本字段）

## 4. 联调建议

1. 先执行 `docs/sql/schema.sql`（确认配置域表是否与 AgentScope Java 现有表冲突）
2. 生成初始超管：BCrypt 生成密码 → 插入 admin_user + 绑定 SUPER_ADMIN
3. 后端起在 8080，前端 `.env.development` 指向 `http://localhost:8080/admin/api`（已配置代理）
4. 契约中每个接口按文档顺序实现，前端 mock 开关切到真实 API 即完成联调
