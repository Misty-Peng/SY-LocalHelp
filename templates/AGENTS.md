<!--
  AGENTS.md 模板（前后端通用）
  用法：复制到目标项目根目录重命名为 AGENTS.md，按 <尖括号占位符> 逐项替换。
  目标读者：在本仓库工作的 AI Agent 与新加入的人类开发者。
  基本原则：比 README 更聚焦「如何干活」，避免营销语言，结论先行、命令可直接复制。
-->

# AGENTS.md — `<项目名>`

> 本文件是 AI Agent 与开发者在本仓库协作的**操作手册**。README 面向使用者，AGENTS.md 面向**在仓库内写代码的人/Agent**。
> 如与 README 冲突，以 **AGENTS.md 为准**。

## 1. 项目速览

- **定位**：`<一句话说明这是什么系统，解决什么问题>`
- **主要用户**：`<内部员工 / C 端用户 / 第三方接入方>`
- **当前阶段**：`<MVP / 生产中 / 维护期>`
- **代码语言**：前端 `<TypeScript>` / 后端 `<Go / Java / Node / Python>`
- **核心外部依赖**：`<MySQL / Redis / Kafka / OSS / 三方 API>`

## 2. 技术栈

### 前端
- **框架**：`<React 18 / Vue 3 / Next.js 14>`
- **构建**：`<Vite / Webpack / Turbopack>`
- **状态管理**：`<Zustand / Pinia / Redux Toolkit>`
- **UI 库**：`<shadcn/ui / Ant Design / Element Plus>`
- **样式**：`<Tailwind / CSS Modules>`
- **网络层**：`<axios / fetch 封装，位于 src/api/>`
- **测试**：`<Vitest + Testing Library / Playwright>`

### 后端
- **框架**：`<Gin / Spring Boot / NestJS / FastAPI>`
- **ORM / DB**：`<GORM / MyBatis / Prisma>`
- **缓存**：`<Redis>`
- **消息队列**：`<Kafka / RabbitMQ>`
- **鉴权**：`<JWT (RS256) + Refresh Token / Session>`
- **API 风格**：`<REST / OpenAPI 3.0 / gRPC>`
- **测试**：`<go test / JUnit / pytest>`

### 基础设施
- **容器化**：`<Docker + docker-compose>`
- **部署**：`<K8s / Serverless / 裸机>`
- **CI/CD**：`<GitHub Actions / GitLab CI>`
- **监控**：`<Prometheus + Grafana / Sentry>`

## 3. 目录结构

```text
<repo-root>/
├─ apps/
│  ├─ web/                # 前端应用
│  │  ├─ src/
│  │  │  ├─ pages/        # 路由级页面
│  │  │  ├─ components/   # 通用组件
│  │  │  ├─ features/     # 业务模块（推荐按领域切）
│  │  │  ├─ api/          # 接口封装
│  │  │  ├─ hooks/
│  │  │  ├─ stores/
│  │  │  └─ utils/
│  │  └─ package.json
│  └─ server/             # 后端应用
│     ├─ internal/
│     │  ├─ handler/      # HTTP 入口（Controller）
│     │  ├─ service/      # 领域服务（纯业务）
│     │  ├─ repository/   # 数据访问层
│     │  ├─ model/        # DTO / Entity
│     │  └─ middleware/
│     ├─ pkg/             # 可被多个 app 复用的通用包
│     └─ cmd/             # main 入口
├─ packages/              # 跨应用共享（types / sdk / ui-kit）
├─ scripts/               # 运维 / 一次性脚本
├─ docs/
├─ .env.example
└─ AGENTS.md              # ← 本文件
```

> 新文件归属不清时，先看 `apps/<x>/src` 下是否已有同类型目录；没有再参考本表就近放置。

## 4. 环境与启动

### 4.1 前置依赖

- Node.js `<版本>`（建议用 `<nvm / fnm>` 管理）
- `<Go 1.22 / JDK 21 / Python 3.12>`
- Docker Desktop
- 可选：`<pnpm / bun / uv>`

### 4.2 首次启动

```bash
# 1. 克隆
git clone <repo-url> && cd <repo-name>

# 2. 环境变量
cp .env.example .env            # 按注释填值；切勿提交真实 secret

# 3. 起依赖（DB / Redis / MQ）
docker compose up -d

# 4. 安装依赖
pnpm install                    # 或 yarn / npm ci
cd apps/server && <go mod tidy | mvn install | uv sync>

# 5. 迁移数据库
pnpm db:migrate                 # 或 <框架迁移命令>

# 6. 启动
pnpm dev                        # 前端
pnpm server:dev                 # 后端
```

### 4.3 常用命令

| 场景 | 命令 |
| --- | --- |
| 启动前端 | `pnpm --filter web dev` |
| 启动后端 | `pnpm --filter server dev` 或 `<go run ./cmd/server>` |
| 运行测试 | `pnpm test` / `<go test ./...>` |
| 覆盖率 | `pnpm test:coverage` |
| Lint | `pnpm lint` |
| 格式化 | `pnpm format` |
| 类型检查 | `pnpm typecheck` |
| 构建 | `pnpm build` |
| 生成 API 类型 | `pnpm codegen` |

## 5. 代码规范

### 5.1 通用

- **语言**：代码、注释、commit 信息统一使用 `<中文 / 英文>`
- **命名**：目录与文件 `kebab-case`，类/类型 `PascalCase`，变量/函数 `camelCase`，常量 `UPPER_SNAKE_CASE`
- **单文件不超过** `<300 行>`，函数不超过 `<60 行>`，圈复杂度 `<10>`
- **禁止**：`console.log` / `fmt.Println` 进入提交；使用统一 logger
- **禁止**：在业务代码里写死密钥、token、手机号、测试账号
- **错误处理**：不吞异常；统一经 `<errors 包 / ErrorHandler>` 返回

### 5.2 前端

- 组件：**函数式 + Hooks**，避免 class 组件
- 目录：一个组件一个文件夹，含 `index.tsx` + `*.test.tsx` + 可选 `*.module.css`
- 接口：统一通过 `src/api/<domain>.ts` 调用，不要在组件里 `fetch`
- 状态：优先 **局部 state**；跨页共享才进 store；服务端状态用 `<React Query / SWR>`
- 样式：优先 Tailwind；需要复杂样式时使用 CSS Modules，**禁止** 全局选择器
- 可访问性：交互元素必须有 `aria-*` / 语义化标签

### 5.3 后端

- 分层严格：`handler → service → repository`；**禁止跨层调用**
- DTO 与 Entity 分离；不把 ORM 实体直接返回给前端
- 事务：在 service 层显式开启，不在 repository 里隐式包裹
- 并发：I/O 密集场景使用 `<goroutine / async>`，注意 context 传递与超时
- 日志：`<trace_id>` 必带；error 级日志必须包含堆栈与关键入参（脱敏）
- 数据库：所有变更走**迁移文件**（`migrations/<timestamp>_<name>.sql`），严禁手动改线上

### 5.4 API 约定

- REST 风格：`/api/v1/<resource>`，动词通过 HTTP method 表达
- 成功统一：`{ code: 0, data: <T>, message: "" }`
- 失败统一：`{ code: <非 0>, data: null, message: "<用户可读>" }`
- 分页：`?page=1&pageSize=20`，响应含 `total`
- 时间：统一 `<ISO 8601 UTC / Unix 毫秒>`
- 所有新接口必须：**OpenAPI 描述 + 后端单测 + 前端 codegen**

## 6. 测试

- **新代码必须带测试**；修 bug 先补**能复现的用例**再改实现
- 覆盖率目标：核心 service 层 `>= 80%`；handler / component `>= 60%`
- 测试分层：
  - 单元：纯函数 / service（不连真实 DB/网络）
  - 集成：handler + repository + testcontainers
  - E2E：`<Playwright / Cypress>`，仅覆盖关键路径
- **禁止**：删除或跳过已有测试（`.skip` / `t.Skip`）而不说明原因

## 7. Git 工作流

- 分支：`main`（保护）/ `dev` / `feature/<issue-id>-<slug>` / `fix/<slug>` / `hotfix/<slug>`
- **禁止** 直接推 `main`；全部走 PR + `<1 / 2>` 人 review
- Commit：遵循 **Conventional Commits**
  - `feat: 新增订单导出`
  - `fix(server): 修复库存并发扣减`
  - `refactor: `、`test: `、`docs: `、`chore: `、`perf: `
- PR 标题同格式；描述含：**动机 / 方案 / 影响面 / 测试**
- 合并策略：`Squash and merge`

## 8. 安全 & 数据

- **敏感信息**：一律走环境变量或密钥管理；`.env` 不入库
- **PII / 金额 / 鉴权 token**：日志脱敏；前端不落地到 `localStorage` 除非明确评估
- **SQL 注入**：一律参数化，禁止字符串拼接 SQL
- **XSS / CSRF**：前端避免 `dangerouslySetInnerHTML`；后端设置 `SameSite=Lax` + `HttpOnly`
- **越权**：每个接口必须显式校验资源归属（`<用户/租户/公司>`）
- **外发请求**：统一经 `<HTTP 客户端封装>`，带超时、重试、熔断

## 9. 性能与可观测

- 前端：Lighthouse `LCP < 2.5s`、`INP < 200ms`；路由级代码分割
- 后端：关键接口 p99 `< 500ms`；慢查询 `> 200ms` 记录并告警
- 埋点：统一接入 `<Sentry / OTel>`；前端错误与后端 `trace_id` 关联
- 监控面板：`<Grafana 地址>`；关键指标 QPS / 错误率 / 延迟

## 10. 常见任务（Agent 优先看这里）

| 我想做 | 去哪里做 | 注意事项 |
| --- | --- | --- |
| 加一个页面 | `apps/web/src/pages/<x>/` | 在 `router.ts` 注册 + 权限配置 |
| 加一个组件 | `apps/web/src/components/<X>/` | 必须有 `*.test.tsx` |
| 加一个接口 | `apps/server/internal/handler + service + repository` | 先补 OpenAPI，再 codegen 前端类型 |
| 加字段到 DB | `apps/server/migrations/<新文件>` | **不要** 直接改已提交的迁移 |
| 改配置 | `.env.example` 同步更新 | 并在 PR 说明里提醒运维 |
| 引新依赖 | `pnpm add ...` / `<go get / mvn add>` | 评估体积与安全；多人项目先讨论 |
| 写脚本 | `scripts/<kebab-name>.(ts\|sh)` | 添加 `--help`，脚本自带幂等性 |

## 11. Agent 专属守则

**Agent 必读：以下是硬约束，无例外。**

1. **不要** 跨越未列出的目录做大面积重构；如需，先在 PR 中拆分为小步
2. **不要** 动 `migrations/` 下已合并的文件；新增而非修改
3. **不要** 在没有测试的情况下修改 `service/` 与 `repository/`
4. **不要** 提交包含真实用户数据、token、密钥的文件；发现即告警
5. **不要** 删除 / `skip` 已有测试；若确需，在 PR 描述中解释并打 `TODO: restore`
6. **不要** 在生产分支直接跑数据修复脚本；走 `scripts/` + dry-run
7. **必须** 在每次变更后运行：`pnpm lint && pnpm typecheck && pnpm test`
8. **必须** 在改 API 时同步更新：OpenAPI / 前端 codegen / 调用方
9. **遇到歧义** 优先**提问**而非猜测；提问前列出自己看过的文件与假设
10. **输出代码** 使用仓库既有工具链，不自创格式化/构建方式

## 12. 扩展约定

新增能力时推荐三件套：

1. `apps/<x>/` 里实现
2. `docs/<capability>.md` 写设计决策（为什么这么做，不只是怎么做）
3. 如有可复用能力，抽到 `packages/` 并附 `README.md`

## 13. 获取帮助

- 业务问题：`<产品/负责人>`
- 架构/技术：`<Tech Lead>`
- 线上故障：`<oncall 群 / PagerDuty>`
- 文档：`docs/`，入口见 `docs/README.md`
- 外部依赖 API 文档：`<链接>`

---

> **更新约定**：任何影响协作流程、目录分层、硬约束的 PR 必须同步更新本文件；否则视为不完整。
