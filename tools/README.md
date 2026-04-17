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
| `debug_browser.js` | 检测/启动远程调试浏览器并连接 CDP |
| `connect_debug.js` | 连接已存在的调试浏览器并打印当前状态 |
| `session_monitor.js` | 登录流程、登录态检查、10 分钟 keepalive 刷新 |

## 使用示例

### 启动并保持会话

```bash
node tools/session_monitor.js
```

### 仅复用调试浏览器

```bash
node tools/connect_debug.js
```
