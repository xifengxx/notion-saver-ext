# Notion Saver

Chrome 扩展，一键保存任意网页到 Notion。核心场景是公众号文章的稳定完整抓取，替代 Notion Web Clipper（不稳定）和 Copy to Notion（付费）。

当前版本：**v0.3.6**

## 变更日志

### v0.3.6
- 修复：图片提取兼容性 — `<span leaf>`、`<a>`、`<li>`、`<blockquote>`、`<h1>-<h6>` 内图片不再丢失
- 优化：设置页面布局重构（flex 布局、移除无用保存按钮、分隔线、版本号）
- 优化：Workspace 视觉改进（彩色头像/图标、彩色边框、× 按钮对齐）
- 优化：空状态引导（无连接空间时显示 OAuth 授权按钮）
- 优化：Vercel 黑白主题下 workspace 边框改为中性色
- 清理：CSS 残留死代码（旧 `.workspace-info`、`.logout-btn` 重复定义）
- 修复：`loadSettings()` 遗留调用导致的边缘情况报错

### v0.3.5
- 重构：CSS 主题系统从选择器覆盖迁移到 CSS 变量驱动（维护性大幅提升）
- 新增：Token 刷新失败时 Chrome 系统通知 + popup 内提示
- 新增：Service Worker 保存中断恢复机制（storage 跟踪保存状态）
- 优化：popup.js 模块化拆分（lib.js + render.js + popup.js）
- 优化：storage key 常量化，消除重复 key 生成逻辑
- 优化：死代码清理、const → var 统一、addEventListener 命名
- 修复：Backend 健康检查 + 请求日志 + session 过期清理 + token-store 容错
- 修复：tests/verify.js 中不存在的 test_connection action 引用

### v0.3.0
- 新增：最近保存位置记忆，每个 workspace 独立记录最近使用的 5 个页面
- 新增：页面搜索支持拼音/标题模糊匹配，结果按字母排序
- 移除：图片 Base64 模式（Notion API 不支持 data: URL，推迟到后续通过 File Upload API 实现）

### v0.2.5
- 新增：多空间管理（OAuth 授权，支持绑定多个 Notion 账号）
- 新增：Raycast / Vercel 双主题
- 新增：可编辑标题、保存后"在 Notion 中打开"快捷入口
- 优化：公众号文章提取多层降级策略

### v0.2.0
- 从手动输入 Integration Token 改为 OAuth 2.0 登录
- 支持 token 自动刷新

### v0.1.0
- 初始版本：网页内容提取 + 保存到 Notion

## 功能

- 自动提取当前网页内容（标题、正文、图片、代码块、表格等）
- 公众号文章深度解析（15 个 selector 多层降级）
- 保存到指定 Notion 页面或数据库
- 多 Notion 空间管理（OAuth 授权，支持绑定多个 Notion 账号）
- 最近保存位置记忆，按 workspace 独立记录
- 2 种 UI 主题：Raycast（暗色金属）、Vercel（黑白精准）
- 可编辑标题、空间切换、搜索过滤页面/数据库
- 保存后快捷跳转"在 Notion 中打开"

## 安装

1. `npx vite build`
2. Chrome 地址栏打开 `chrome://extensions`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 目录

## 使用

1. 点击扩展图标打开 popup
2. 首次使用点击"连接到 Notion"完成 OAuth 授权
3. 自动提取当前页面内容，可编辑标题
4. 选择目标 Notion 页面/数据库
5. 点击"保存到 Notion"

### 多空间

- 底部空间下拉框切换不同 Notion 账号
- 点击 `+` 授权新的 Notion 账号
- 设置面板（右上角 ⚙）管理已连接的空间，支持解绑

## 技术

- Manifest V3
- 纯原生 HTML/CSS/JS，零运行时依赖
- Notion OAuth 2.0 + REST API v1
- Vite + @crxjs/vite-plugin
- OAuth 代理后端（Express + Railway 部署）

## 开发

```bash
npm install
npx vite build
```

## License

MIT
