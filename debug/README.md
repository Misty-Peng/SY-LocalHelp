# debug/

本目录存放**一次性或探索性的调试脚本**，用于分析业务系统行为、抓接口、验证假设等。

## 与 `tools/` 的区别

| 目录 | 定位 | 是否稳定 |
| --- | --- | --- |
| `tools/` | 被长期依赖、可 `require` 的成熟脚本 | 是 |
| `debug/` | 临时/排查用的脚本，结论可能直接丢弃，也可能沉淀到 `tools/` 或 `skills/` | 否 |

## 约定

1. 脚本通常依赖 `tools/`（例如 `require('../tools/debug_browser')`）
2. 命名建议能体现意图：`inspect_*.js`、`clear_*_and_watch.js`、`probe_*.js` 等
3. 有价值的结论请沉淀到 `skills/<name>/SKILL.md`，而非留在本目录
4. 脚本输出（截图 / 抓到的接口样例）如需保留，放到 `debug/<name>-artifacts/` 子目录，且避免提交敏感信息（token、身份证、手机号等）

## 当前脚本

| 文件 | 用途 |
| --- | --- |
| `inspect_token.js` | 遍历所有已打开页面的 `localStorage` / `sessionStorage` / Cookie，自动识别看起来像 token 的值，并解码 JWT |
| `clear_token_and_watch.js` | 清除 `LEMON_EARTH_GALAXY_TOKEN` 并 reload，监听鉴权相关网络请求，观察是否触发刷新逻辑 |

## 运行

所有脚本均从项目根目录运行：

```bash
node debug/inspect_token.js
node debug/clear_token_and_watch.js
```

运行前请确认调试浏览器已启动（见 `skills/launch-debug-browser/SKILL.md`）。
