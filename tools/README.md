# tools/

本目录存放**稳定、可复用、可 `require` 的脚本和模块**。

## 约定

1. 优先写成模块，再提供一个 CLI 入口
2. 以通用能力为主，不放一次性排查脚本
3. 依赖调试浏览器的模块应复用 `tools/debug_browser.js`
4. 输出避免泄露敏感信息（token、cookie、账号等）

## 当前工具

| 文件 | 用途 |
| --- | --- |
| `config.js` | 共享配置（业务 URL、token key、日志路径等） |
| `debug_browser.js` | 检测/启动远程调试浏览器并连接 CDP，含 `safeDisconnect` |
| `connect_debug.js` | 连接已存在的调试浏览器并打印当前状态 |
| `session_monitor.js` | 登录流程、登录态检查、10 分钟 keepalive 刷新 |
| `supplier.js` | 供应商查询、新增、改名（CLI + 模块） |

## 使用示例

### 启动并保持会话

```bash
node tools/session_monitor.js
```

### 仅复用调试浏览器

```bash
node tools/connect_debug.js
```

### 供应商操作

```bash
node tools/supplier.js query  "供应商名"
node tools/supplier.js add    "供应商名" "供应商类型" "归属区域"
node tools/supplier.js rename "旧名或代码" "新名称"
```
