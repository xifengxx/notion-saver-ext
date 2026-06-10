# NotionSnap — Chrome Web Store 上架文案

> 版本：v1.1 | 2026-06-02 | 配套 NotionSnap v0.6.1

---

## 一、基本信息

| 字段 | 内容 |
|------|------|
| **名称（中文）** | NotionSnap — 一键保存网页到 Notion |
| **名称（英文）** | NotionSnap — Save Webpages to Notion |
| **短描述** (≤132字符) | 把任何网页一秒变成整洁的 Notion 笔记。公众号/Twitter/GitHub/知乎/Substack 专用解析，7 个独立解析器 + 30+ 站点适配。免费开源。 |
| **分类** | Productivity |
| **语言** | 中文 (简体) / English |
| **开发者邮箱** | [待填] |
| **官网** | https://github.com/xifengxx/notion-saver-ext |
| **隐私政策 URL** | https://github.com/xifengxx/notion-saver-ext/blob/master/PRIVACY.md |

---

## 二、短描述（132 字符限制）

**中文：**
一键保存网页到 Notion。公众号/Twitter/GitHub/知乎/Medium/Substack 专用解析，7 个独立解析器，30+ 站点适配，免费开源。

**English:**
One-click save any webpage to Notion. Dedicated parsers for Twitter, GitHub, WeChat, Medium & Substack. 7 custom parsers + 30+ site adapters. Free & open source.

---

## 三、详细描述（中文版）

# 把任何网页，一秒变成整洁的 Notion 笔记

**NotionSnap 是 Notion 官方 Clipper 的最佳免费替代品 —— 更稳定、更智能、专为中文内容深度优化。**

---

### 你是不是也遇到过？

- 用 Notion Web Clipper 保存文章，结果只得到一个空白页
- 公众号链接复制到 Notion，过几天打开已被删除
- GitHub README 粘到 Notion 里格式全乱，代码块变成纯文本
- Twitter 看到好内容只能截屏，事后根本搜不到

**NotionSnap 解决上述所有问题。** 不是「又一个 Clipper」，而是你真正需要的那一个。

---

### 7 个网站专用解析器，提取精度远超通用工具

市面上所有 Notion 剪藏工具都用一套通用逻辑处理所有网页。NotionSnap 不一样 —— 我们为每个网站单独编写了解析函数。

- 多层降级提取 + 噪声清理，覆盖多种文章格式和页面结构
- 富文本完整保留：加粗、斜体、代码块、表格、引用，语言自动检测
- 元数据自动抓取：标题、作者、发布时间、摘要、封面图
- 内容安全网：极端情况下正则兜底提取纯文本，不让你空手而归

### 30+ 站点智能适配

没有独立解析器的网站，按域名分类匹配最优提取策略——覆盖博客平台、新闻媒体、科技媒体、加密媒体等主流内容站点，自动识别页面结构、清理噪声元素。未适配网站有通用语义提取兜底。

### 11 种 Notion block 类型完整支持

段落 · H1/H2/H3 标题 · 引用 · 无序列表 · 有序列表 · 代码块（自动语言检测）· 分隔线 · 图片 · 视频（embed + video block）· 表格 · 富文本内联样式（加粗/斜体/删除线/链接/内联代码/11 种文字颜色）

---

### 图片永不丢失

网页图片最大的痛点是外链过期。NotionSnap 用两阶段方案彻底解决：

1. **Phase 1 — 秒级落库**（< 1 秒）文字内容 + 图片 URL 立即写入，打开 Notion 就能看到完整文章
2. **Phase 2 — 后台替换** 扩展在后台下载每张图片，上传到 Notion 服务器托管，外链变永久

---

### 智能保存，无需手动配置

- **学习你的习惯** — 自动记住每个网站上次保存到哪个页面/数据库，下次自动选中
- **数据库字段自动映射** — 保存到数据库时，按名称和类型自动匹配 9 个元数据字段（URL、作者、发布时间、摘要、网站名称、语言、关键词、封面图、字数）
- **保存预设** — 不同用途设不同目标（如「阅读笔记」「素材库」），弹窗顶部 5 色 pill 按钮一键切换
- **保存去重** — 同一个 URL 5 秒内重复点击只生效一次

---

### 三种保存方式，怎么顺手怎么来

| 方式 | 操作 | 适用场景 |
|------|------|---------|
| **Popup 面板** | 点图标 → 预览编辑 → 保存 | 需要选择目标、编辑元数据 |
| **右键菜单** | 页面右键 → 一键保存 | 快速剪藏，不中断阅读 |
| **全局快捷键** | `Ctrl+Shift+S` | 高频用户，肌肉记忆 |

---

### 保存进度实时可见

分批保存时显示实时进度（如"正在保存 150/300 blocks"），网络不稳定自动重试并显示次数，成功后一键跳转「在 Notion 中打开」。

---

### 稳定到你可以忘记它的存在

- **3 层错误恢复** — 网络波动自动重试（3 次退避），API 限流自动等待，Token 过期自动刷新
- **SW 中断续传** — 浏览器关闭后，后台任务下次启动时自动恢复，不丢数据
- **保存进度透明** — popup 显示分块进度、badge 显示状态、toast 通知保存完成

---

### 双主题

- **Raycast 暗色主题** — 深色金属质感 + 紫红渐变，护眼且专业
- **Vercel 黑白主题** — Geist 字体 + 1px 边框，极致简洁

---

### 和多工作区无缝配合

支持绑定多个 Notion 工作区（OAuth 2.0 授权），独立管理页面列表、保存预设和历史记录，个人号和工作号分开不混淆。

---

### 和竞品的真实差距

| | NotionSnap | Notion Web Clipper | Copy to Notion | Save to Notion |
|---|---|---|---|---|
| **价格** | **永久免费** | 免费 | 付费订阅 | 免费 |
| **公众号/知乎/小红书** | **专用解析** | 不支持 | 不支持 | 不支持 |
| **Twitter/GitHub 解析** | **独立解析器** | 通用提取 | 通用提取 | 通用提取 |
| **图片自动上传** | **两阶段：秒存+后台替换** | 不稳定 | 支持 | 有限 |
| **数据库字段映射** | **自动匹配 9 字段** | 不支持 | 支持 | 不支持 |
| **多工作区** | **支持** | 支持 | 不支持 | 不支持 |
| **保存去重** | **URL 5 秒去重** | 无 | 无 | 无 |
| **中断恢复** | **SW 自动续传** | 无 | 无 | 无 |
| **主题** | **双主题** | 无 | 无 | 无 |

---

### 你的数据，你做主

- **数据直达 Notion** — 网页内容直接从浏览器发送到 Notion API，不经过任何第三方服务器
- **OAuth 2.0 标准认证** — 不存储你的 Notion 密码
- **Token 本地存储** — 仅在 Chrome 本地存储中，仅用于调用 Notion API
- **100% 开源** — 所有代码在 [GitHub](https://github.com/xifengxx/notion-saver-ext) 公开，随时可审计
- **仅必要权限** — `activeTab`、`storage`、`scripting`、`notifications`、`contextMenus`

---

### 快速开始

1. 安装扩展，点击工具栏图标
2. 点击「连接到 Notion」完成 OAuth 授权
3. 打开任意网页，点图标 → 选目标 → 保存
4. 也可用右键菜单或快捷键 `Ctrl+Shift+S` 一键保存

---

## 四、Detailed Description（英文版）

# Save Any Webpage to Notion in One Click

**The Notion clipper you wish Notion had built. Free, open source, and actually works — especially for Chinese content.**

---

### Why NotionSnap?

#### It actually works on Chinese websites.

Every Notion clipper assumes you're reading English. NotionSnap was built different — it has specialized parsers for WeChat Official Accounts (15 layers of fallback), Zhihu (China's Quora), Xiaohongshu (China's Instagram), and 30+ Chinese tech and crypto media sites. Clean, noise-free extraction every time.

#### It also nails the global stuff.

Twitter/X threads. GitHub READMEs and Issues. Medium articles. Substack newsletters (custom domains included). YouTube, Bilibili, TikTok, Douyin video pages. Each with a dedicated high-fidelity parser that preserves formatting, images, code blocks, and metadata.

#### Your images won't disappear.

Two-phase image handling: text and image URLs land instantly in Notion. Behind the scenes, every image gets downloaded and uploaded to Notion's servers — permanently.

#### Zero manual configuration.

Auto-detects if your target is a page or database. Maps 9 metadata fields (URL, author, publish date, summary, site name, language, keywords, cover image, word count) to your database properties automatically. Remembers where you save each site.

#### It's built to survive real-world chaos.

Network errors get 3 automatic retries with exponential backoff. Rate limits auto-wait. Tokens auto-refresh. If the browser crashes mid-save, the Service Worker resumes where it left off. Double-click guard prevents duplicate pages.

#### Three ways to save.

1. **Popup** — preview, edit metadata, choose target, save
2. **Right-click** — save instantly to last-used target
3. **Shortcut** — `Ctrl+Shift+S` (MacCtrl+Shift+S on Mac), customizable

---

### Supported Sites

**Smart genre adapters (30+ categories):** Automatically detects site type and applies the optimal extraction strategy — covering blogging platforms, news media, tech outlets, and crypto publications. Multi-layer fallback with noise cleanup preserves formatting across diverse page structures.

**Universal fallback:** Any webpage with standard semantic HTML gets clean extraction. Pure text regex backup as last resort.

---

### Privacy First

- Content goes directly from your browser to Notion's API — zero third-party servers
- OAuth 2.0 authentication — we never see your password
- Tokens stored locally in Chrome storage only
- 100% open source — [audit the code yourself](https://github.com/xifengxx/notion-saver-ext)
- Minimal permissions: activeTab, storage, scripting, notifications, contextMenus

---

### System Requirements

- Google Chrome browser (or any Chromium-based browser)
- A Notion account (free tier works perfectly)
- 3 clicks to get started

---

## 五、截图（6 张，1280×800）

CWS 要求 1280×800 或 640×400。当前图片为 1536×1024（GPT Image-2 生成），提交前需裁切/缩放至 1280×800。

| 序号 | 文件名 | 场景 | 画面内容 | 核心卖点 |
|------|--------|------|---------|---------|
| 1 | `NotionSnap-multi.png` | 多网站保存 | Popup 面板展示已保存页面的多平台来源（Twitter/GitHub/微信/知乎等） | 「不只存公众号，全平台通吃」 |
| 2 | `NotionSnap-theme.png` | 双主题 | Raycast 暗色主题 和 Vercel 黑白主题并排对比 | 「好看且实用，两种风格任选」 |
| 3 | `NotionSnap-status.png` | 保存状态提示 | Popup 面板显示保存进度（分块计数、进度条、重试状态） | 「保存过程透明可见，不瞎等」 |
| 4 | `NotionSnap-save.png` | 三种保存方式 | Popup 面板 + 右键菜单 + 快捷键示意，三种入口同框 | 「怎么顺手怎么存」 |
| 5 | `NotionSnap-weixin.png` | 微信公众号 | 公众号文章提取效果：标题、作者、正文、图片完整保留 | 「公众号文章完美提取」 |
| 6 | `NotionSnap-github.png` | GitHub | GitHub README 保存效果：Markdown 渲染为 Notion blocks，代码块语言标注 | 「技术文档一键归档」 |

---

## 六、推广图

| 类型 | 尺寸 | 说明 |
|------|------|------|
| 小推广图 | 440×280 | 扩展图标 + 名称，渐变背景 |
| 大推广图 | 920×680 | 扩展图标 + 核心卖点文案 |
| 横幅图 | 1400×560 | Hero 图：Popup UI + 保存后 Notion 页面效果 |

---

## 七、搜索关键词

```
notion clipper, save to notion, notion web clipper, web clipper,
notion bookmark, 保存到Notion, 网页剪藏, notion笔记,
web page to notion, notion save
```

---

## 八、提交前检查清单

- [ ] Google 开发者账号注册（$5 一次性费用）
- [ ] 6 张截图裁切至 1280×800
- [ ] 小推广图制作（440×280）
- [ ] 隐私政策页面就绪（GitHub PRIVACY.md）
- [ ] 开发者邮箱确认
- [ ] OAuth 代理后端确认在线（notion-saver-ext-production.up.railway.app）
- [ ] `npx vite build` 通过
- [ ] 最终在 Chrome 加载 dist/ 手动验证 5 分钟

---

*文档版本：v1.1 | 2026-06-02 | 配套 NotionSnap v0.6.1*
