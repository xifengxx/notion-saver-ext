# Chrome Web Store 上架文案

## 简短说明（≤132 字符）

一键保存网页到 Notion，支持公众号深度解析。右键/快捷键秒存，完美替代 Notion Web Clipper。

---

## 详细说明（中文）

### NotionSnap — 网页剪藏，一拍即存

免费、可靠、快速的 Notion 网页剪藏工具。支持公众号文章深度解析，多种保存方式任选。

**三种保存方式，怎么顺手怎么来**
- 点击扩展图标，查看内容预览后保存
- 右键菜单「保存到 Notion」，无需打开面板
- 快捷键 Ctrl+Shift+S，一键秒存

**公众号文章完美支持**
- 15 个 selector 多层降级，覆盖标准文章、图文说说、纯文字说说
- 自动清理赞赏、评论、弹窗等噪声元素
- 保留加粗、斜体、颜色、链接等富文本格式
- 表格、代码块、引用块完整转换

**保存进度实时可见**
- 分批上传 blocks 时显示实时进度（如"正在保存 150/300 blocks"）
- 网络不稳定时自动重试并显示重试次数
- 保存成功后一键跳转「在 Notion 中打开」

**多空间多账号**
- 支持绑定多个 Notion 账号，自由切换
- OAuth 2.0 官方授权，Token 自动刷新
- 每个空间独立记忆最近保存位置

**双主题**
- Raycast 暗色金属主题 + Vercel 黑白精准主题
- 可编辑标题、搜索过滤目标页面/数据库

**零运行时依赖，安全透明**
- 纯原生 HTML/CSS/JS，无任何第三方库
- 不收集用户数据，所有认证信息本地存储
- 开源（MIT），代码可审计

---

## Detailed Description (English)

### NotionSnap — Clip web pages to Notion, instantly

A free, reliable, and fast Notion web clipper. Deep WeChat article parsing, multiple save methods.

**Three ways to save**
- Click the extension icon for content preview and save
- Right-click "保存到 Notion" — no need to open the popup
- Keyboard shortcut Ctrl+Shift+S for instant saving

**Perfect WeChat article support**
- 15 selectors with multi-layer fallback for all article types
- Auto-clean noise elements (rewards, comments, popups)
- Preserves rich text: bold, italic, colors, links
- Full table, code block, and quote conversion

**Real-time save progress**
- Live block upload progress (e.g., "Saving 150/300 blocks")
- Auto-retry with visual feedback on network issues
- One-click "Open in Notion" after saving

**Multi-workspace**
- Bind multiple Notion accounts, switch freely
- OAuth 2.0 authorization with auto token refresh
- Per-workspace recent page memory

**Dual themes**
- Raycast dark metallic + Vercel monochrome
- Editable title, searchable page/database picker

**Zero runtime dependencies, transparent**
- Pure vanilla HTML/CSS/JS, no third-party libraries
- No data collection, all credentials stored locally
- Open source (MIT), auditable code

---

## 隐私政策

### 数据收集与使用

NotionSnap 不收集、不存储、不传输任何用户个人数据。

**本地存储的信息**
- Notion OAuth Token（存储于 Chrome 本地存储，仅用于调用 Notion API）
- 用户偏好设置（主题、当前空间、最近保存位置）
- 以上所有数据仅在用户本地浏览器中存储，不会上传到任何第三方服务器

**网络请求**
- Notion API（api.notion.com）：保存网页内容，传输数据包括页面标题、正文、图片 URL
- OAuth 代理后端（notion-saver-ext-production.up.railway.app）：仅用于 OAuth 授权流程中的 Token 交换和刷新

**不收集的数据**
- 不收集浏览历史
- 不收集用户身份信息
- 不使用 Cookie 或追踪技术
- 不嵌入任何第三方分析/统计 SDK

如有疑问，请通过 GitHub Issues 联系：https://github.com/xifengxx/notion-saver-ext

---

## 截图要求

Chrome Web Store 要求至少 1 张截图（建议 5 张），尺寸 1280×800 或 640×400。

**建议截图场景：**

1. **Popup 主界面** — 打开扩展，展示内容预览 + 页面选择 + 保存按钮
2. **公众号文章保存结果** — 展示公众号文章提取效果（标题、作者、富文本完整）
3. **右键菜单保存** — 在网页上右键，展示"保存到 Notion"菜单项
4. **保存成功 toast** — 页面右上角绿色 toast，显示"✓ N 个 blocks 已同步到 Notion"
5. **设置面板** — 展示多空间管理 + 快捷键配置

截图时建议使用 Raycast 主题（暗色背景更有质感）。

---

## 宣传图（可选）

- 小宣传图：440×280
- 大宣传图：920×680
- 横幅图：1400×560

用于 Chrome Web Store 搜索结果和首页展示。可做一张包含扩展 Logo + 名称 + 核心卖点的图。
