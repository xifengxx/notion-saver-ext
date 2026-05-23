# Notion Saver 代码审计报告

> 日期：2026-05-23 | 版本：v0.3.0 | 审计范围：全部源代码

## 审计方法

对照 v0.1 复盘总结的 6 条工程流程教训 + 浏览器扩展产品工程标准，逐文件审查。

---

## 一、教训对照

### 教训 1：没有"设计规格"就写代码 — 仍然存在

**现状：CSS 1504 行，131 处主题选择器，但主题系统的"契约"不存在。**

38 个 CSS 变量在基础样式中使用（`var(--popup-bg, #ffffff)`），但**没有一个变量被任何主题定义**。主题的实际工作方式是硬编码选择器覆盖（`.popup.theme-raycast .page-list-item { ... }`），CSS 变量仅作为"带 fallback 的占位符"—— `var()` 永远回退到 fallback 值，变量系统本身是死代码。

后果：每次新增组件，两个主题都要完整地写一遍硬编码属性。CSS 变量体系投入了 123 处 `var()` 调用，但产出为零。

### 教训 2：没有"组件清单" — 仍然存在

**现状：popup.js 640 行单体文件，混合了 6 种职责。** 状态管理（`workspaces`/`allPages`/`currentTheme`）、UI 渲染（`renderPageList`/`renderSettingsWorkspaceList`）、事件处理（click/listener）、数据加载（`loadPageData`/`extractCurrentPage`）、持久化（`chrome.storage.local`）、工具函数（`escapeHtml`）全部耦合在一个 `DOMContentLoaded` 回调里。

提取器方向稍好——extractor.js 按功能分区（工厂函数/富文本/DOM转换/公众号/通用网页/清理），但 service.js 中 Token 管理、OAuth 轮询、Notion API、消息路由也混在一起。

### 教训 3：CSS 变量没有"契约" — **核心问题**

- 38 个变量全无主题定义
- Raycast（67 处）和 Vercel（64 处）数量不对称——差了 3 个选择器
- 根本原因：两种主题策略混用（基础样式用 CSS 变量 + fallback，主题样式用选择器覆盖），两套体系谁都不可靠

### 教训 4：Chrome popup 特殊性 — ✅ 已基本修复

- `confirm()`/`alert()` 已完全移除，改用 inline 确认
- 所有 `chrome.runtime.sendMessage` 回调均检查 `lastError`
- Popup 宽度 380px 符合规范
- **剩余问题**：`document.addEventListener('click', ...)` 关闭下拉框的监听器无显式清理

### 教训 5：缺乏全局视角 — 具体问题清单

| 问题 | 位置 | 严重度 |
|------|------|--------|
| `extractTableText()` 死代码，定义后从未调用 | extractor.js:451 | 低 |
| `test_connection` action 在测试中引用但 service.js 不存在 | tests/verify.js:306 | 中 |
| `loadSettings()` 函数体为空 | popup.js:345-347 | 低 |
| 两个主题选择器数不对称（67 vs 64） | popup.css | 中 |
| `save_settings` 只显示提示不实际持久化 | popup.js:125-127 | 低 |

### 教训 6：没有完整端到端测试 — 仍然存在

- tests/verify.js 只验证构建产物语法和代码模式，不测试任何实际功能
- 引用了不存在的 `test_connection` action（第 306 行），当前测试会失败

---

## 二、浏览器扩展产品专项审视

### Service Worker 生命周期

- 递归 `appendAllBlocks` 正确避免 SW 休眠 ✅
- **风险**：SW 在分批写入之间被终止时，save 静默失败，无恢复机制无通知
- `oauthPollTimers` 的 `setInterval` 在 SW 终止后不恢复（实际风险低，OAuth 期间 SW 通常活跃）

### Storage 一致性

- 多个 key 分散在 popup.js 和 service.js 中读写，无统一常量
- `recent_pages_${botId}` 的 key 生成逻辑在 popup.js 中重复 3 次

### Backend 韧性

- OAuth token 存储在 JSON 文件中，Railway 重启即丢失所有进行中会话
- 无过期 session 清理逻辑，`token-store.json` 会无限增长
- `backend/package.json` 无 start script

### Content Script 健壮性

- 15 层 selector 降级 + 纯文本安全网设计合理 ✅
- `const` 声明与 CLAUDE.md 的保守策略不一致

---

## 三、优先级排序

> 初版遗漏了专项审视中的 5 个问题，以下为修正后的完整清单。

```
P0（影响功能正确性）
  1. CSS 主题架构重构：变量契约 + 消除硬编码覆盖 ✅ 已完成
  2. tests/verify.js 引用不存在的 test_connection action ✅ 已完成

P1（影响开发效率 / 用户体验）
  3. popup.js 模块化拆分 ✅ 已完成
  4. storage key 常量化，消除重复 ✅ 已完成
  5. Token 刷新失败通知（当前静默，用户看到「未登录」但不知原因） ✅ 已完成
  6. SW 分批写入中断恢复机制（至少失败时通知用户） ✅ 已完成

P2（技术债）
  7. 死代码清理（extractTableText / loadSettings / save_settings 假持久化） ✅ 已完成
  8. 主题选择器不对称修复（Raycast 67 vs Vercel 64，差 3 处） ✅ P0-1 已顺带解决
  9. addEventListener 清理 / const 策略统一 ✅ 已完成
  10. Backend session 清理 + package.json start script ✅ 已完成
```

### 覆盖检查清单

| 审计发现的问题 | 对应 P 项 | 状态 |
|------|------|------|
| CSS 变量契约缺失，主题系统两套体系混用 | P0-1 | ✅ 已完成 |
| tests/verify.js test_connection 不存在 | P0-2 | ✅ 已完成 |
| popup.js 640 行单体文件，6 种职责耦合 | P1-3 | ✅ 已完成 |
| storage key 无统一常量，key 生成重复 3 次 | P1-4 | ✅ 已完成 |
| Token 刷新失败静默，用户看到「未登录」不知原因 | P1-5 | ✅ 已完成 |
| SW 分批写入之间被终止 → save 静默失败 | P1-6 | ✅ 已完成 |
| extractTableText 死代码 | P2-7 | ✅ 已完成 |
| loadSettings 空函数 | P2-7 | ✅ 已完成 |
| save_settings 只弹提示不持久化 | P2-7 | ✅ 已完成 |
| 主题选择器不对称（67 vs 64） | P2-8 | ✅ P0-1 顺带解决 |
| addEventListener 无显式清理 | P2-9 | ✅ 已完成 |
| const 与 CLAUDE.md 保守策略不一致 | P2-9 | ✅ 已完成 |
| Backend session 无清理 | P2-10 | ✅ 已完成 |
| backend/package.json 无 start script | P2-10 | ✅ 已完成 |
| Railway 重启丢失 OAuth 会话 | P2-10 | ✅ 已完成 |

---

## 四、CSS 变量契约缺口明细

以下 38 个 CSS 变量在基础样式中使用（带 fallback），但没有任何主题定义它们：

```
popup-bg, text-color, meta-color, hover-bg, content-bg, content-border,
content-radius, accent-color, focus-color, input-border, input-radius,
input-bg, btn-bg, btn-text, btn-radius, btn-disabled-bg, btn-disabled-text,
dropdown-bg, dropdown-border, dropdown-shadow, list-bg, list-label-bg,
section-border, selected-bg, secondary-text, secondary-btn-bg, success-bg,
success-border, success-color, error-bg, error-border, error-color,
loading-bg, loading-border, active-bg, active-border, panel-bg, placeholder-color
```

主题系统实际通过 `.popup.theme-raycast { background: #1e1e2e }` 等硬编码覆盖来实现，与 CSS 变量体系完全割裂。

---

## 五、文件规模统计

| 文件 | 行数 | 职责 |
|------|------|------|
| popup.css | 1504 | UI 样式 + 双主题 |
| popup.js | 640 | UI 逻辑（单体） |
| service.js | 544 | API 集成 + OAuth |
| extractor.js | 944 | 内容提取 |
| verify.js | 345 | 构建验证 |

总计：3977 行
