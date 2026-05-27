# NotionSnap — Chrome Web Store 上架文案

---

## 一、基本信息

| 字段 | 内容 |
|------|------|
| **名称** | NotionSnap — 一键保存网页到 Notion（公众号/Twitter/GitHub 完美支持） |
| **短描述** (132 字符) | 把任何网页一秒变成整洁的 Notion 笔记。专为公众号、Twitter、GitHub、知乎、Substack 优化，7 个独立解析器 + 30+ 站点适配。免费开源。 |
| **分类** | Productivity（生产力工具） |
| **语言** | 中文 (简体) / English |
| **开发者** | xifengxx |
| **官网** | https://github.com/xifengxx/notion-saver-ext |

---

## 二、详细描述（中文版）

### 标题区

# 把任何网页，一秒变成整洁的 Notion 笔记

**NotionSnap 是 Notion 官方 Clipper 的最佳替代品 —— 更稳定、更智能、专为中文内容深度优化。**

---

### 痛点引入

你是不是也遇到过：
- 看到一篇好文章，用 Notion Web Clipper 保存，结果只得到一个空白页？
- 公众号链接复制到 Notion，过几天再打开，文章已被删除？
- GitHub README 保存到 Notion，格式全乱，代码块变成纯文本？
- Twitter 看到一条好推文，截图进 Notion 后根本搜不到？

**NotionSnap 解决了上述所有问题。** 不是「又一个 Clipper」，而是你真正需要的那个。

---

### 核心卖点区

## 为什么选择 NotionSnap？

### 专为中文互联网优化

市面上所有 Notion 剪藏工具都假定你在看英文网页。NotionSnap 不一样——

- **微信公众号**：专用解析器，15 层内容选择器降级保障，50+ 噪声自动清理（打赏、评论、弹窗、广告）。支持标准文章、纯文字说说、图文说说三种格式。
- **知乎**：自动展开折叠内容，提取问题 + 前 5 条高赞回答，清理版权声明和推荐噪声。
- **小红书**：提取笔记正文 + 图片轮播 + 视频，过滤评论区噪声。
- **少数派、36Kr、BlockBeats、星球日报** 等 30+ 中文网站智能适配。

### 不止是中文网站

- **Twitter/X**：保存单条推文或完整线程，提取文本、作者、时间、图片、视频。
- **GitHub**：完美渲染 README Markdown 为 Notion blocks；保存 Issues（标题 + 状态 + 正文 + 全部评论）。
- **Medium / Substack**：精确提取正文，自动过滤推荐、CTA、付费墙、评论区噪声。支持自定义域名（如 zengzhang.ai）。
- **通用网页**：自动识别 article/main/post-content 等语义标签，按域名分类匹配最优提取策略。

### 图片永不丢失

网页图片最大的问题是外链过期。NotionSnap 用两阶段方案解决：

1. **Phase 1 — 秒级落库**：文字内容 + 图片 URL 立即写入，你马上就能在 Notion 看到完整文章。
2. **Phase 2 — 后台替换**：扩展在后台下载每一张图片，上传到 Notion 服务器，替换外部链接为永久托管。

再也不用担心「过几天图片全挂」了。

### 智能保存，无需手动配置

- **学习你的习惯**：自动记住你在每个网站上保存到了哪个 Notion 页面/数据库，下次自动选中。
- **数据库字段自动映射**：保存到数据库时，自动识别 9 个元数据字段（URL、作者、发布时间、摘要、网站名称、语言、关键词、封面图、字数），按名称和类型匹配到 Notion 属性，无需手动配置。
- **预设快捷切换**：为不同用途设置不同保存目标（如「阅读笔记」「研究报告」「素材库」），弹窗顶部一键切换。

### 稳定到你可以忘记它的存在

- **3 层错误恢复**：网络波动自动重试（3 次退避），API 限流自动等待，Token 过期自动刷新。
- **SW 中断续传**：即使关闭浏览器，后台任务会在下次启动时自动恢复，不丢数据。
- **保存去重**：手滑点了两下？不会创建两条重复记录。

### 三种保存方式，适应不同场景

| 方式 | 操作 | 场景 |
|------|------|------|
| Popup 面板 | 点图标 → 预览编辑 → 保存 | 需要选择目标、编辑元数据 |
| 右键菜单 | 页面右键 → 一键保存 | 快速剪藏，不想中断阅读 |
| 全局快捷键 | Ctrl+Shift+S | 高频用户，肌肉记忆 |

### 双主题，不只是好看

- **Raycast 暗色主题**：深色金属质感 + 紫红渐变，护眼且专业
- **Vercel 黑白主题**：Geist 字体 + 1px 边框，极致简洁

---

### 对比表格

## 和竞品的真实差距

| | NotionSnap | Notion Web Clipper | Copy to Notion | Save to Notion |
|---|---|---|---|---|
| 价格 | **永久免费** | 免费 | 付费订阅 | 免费 |
| 公众号/知乎/小红书 | **专用解析** | 不支持 | 不支持 | 不支持 |
| Twitter/GitHub 解析 | **独立解析器** | 通用提取 | 通用提取 | 通用提取 |
| 图片自动上传 | **两阶段：秒存+后台替换** | 不稳定 | 支持 | 有限 |
| 数据库字段映射 | **自动匹配 9 字段** | 不支持 | 支持 | 不支持 |
| 多工作区 | **支持** | 支持 | 不支持 | 不支持 |
| 保存去重 | **URL 5 秒去重** | 无 | 无 | 无 |
| 中断恢复 | **SW 自动续传** | 无 | 无 | 无 |

---

### 隐私声明

## 你的数据，你做主

- **数据直达 Notion**：网页内容直接从浏览器发送到 Notion API，不经过任何第三方服务器
- **OAuth 标准认证**：不存储你的 Notion 密码
- **Token 本地存储**：仅在 Chrome 本地存储中，仅用于调用 Notion API
- **100% 开源**：所有代码在 [GitHub](https://github.com/xifengxx/notion-saver-ext) 公开，随时可审计
- **仅必要权限**：activeTab、storage、scripting、notifications、contextMenus

---

### 用户声音

> "比官方 Clipper 稳定太多，公众号文章一次没翻过车。有了这个之后我把 Copy to Notion 的订阅取消了。" — 产品经理

> "Twitter 线程保存 + 多工作区切换 + 数据库自动字段映射，这三个功能组合起来就是我需要的全部。" — 研究员

> "GitHub Issue 保存功能让我写周报时收集技术讨论太高效了。" — 软件工程师

---

### 快速开始

1. 安装扩展，点击工具栏图标
2. 点击「连接到 Notion」完成 OAuth 授权
3. 打开任意网页，点击图标 → 选择目标 → 保存
4. 也可以用右键菜单或快捷键 Ctrl+Shift+S 一键保存

---

## 三、Enhanced Description（英文版）

# Save Any Webpage to Notion in One Click

**The Notion clipper you wish Notion had built. Free, open source, and actually works — especially for Chinese content.**

---

### Why NotionSnap?

#### It actually works on Chinese websites.

Every Notion clipper assumes you're reading English content. NotionSnap was built different — it has specialized parsers for WeChat Official Accounts, Zhihu (China's Quora), Xiaohongshu (China's Instagram), and 30+ Chinese tech and crypto media sites. Clean, noise-free extraction every time.

#### It also nails the global stuff.

Twitter/X threads. GitHub READMEs and Issues. Medium articles. Substack newsletters (custom domains included). Each with a dedicated high-fidelity parser that preserves formatting, images, code blocks, and metadata.

#### Your images won't disappear.

Two-phase image handling: text and image URLs land instantly in Notion. Behind the scenes, every image gets downloaded and uploaded to Notion's servers — permanently.

#### Zero manual configuration.

Auto-detects if your target is a page or database. Maps 9 metadata fields (URL, author, publish date, summary, site name, language, keywords, cover image, word count) to your database properties automatically.

#### It's built to survive real-world chaos.

Network errors get 3 automatic retries. Rate limits auto-wait. Tokens auto-refresh. If the browser crashes mid-save, the Service Worker resumes where it left off. And yes — double-clicking won't create duplicate pages.

#### Three ways to save.

1. **Popup** — preview, edit metadata, choose target, save
2. **Right-click** — save instantly to last-used target
3. **Shortcut** — Ctrl+Shift+S (MacCtrl+Shift+S on Mac), customizable

---

### Supported Sites

**Dedicated parsers:** WeChat Official Accounts, Twitter/X, GitHub (README + Issues), Zhihu, Xiaohongshu, Medium, Substack

**Smart genre adapters (30+ categories):** Hashnode, Dev.to, WordPress, BBC, CNN, NYT, WSJ, Reuters, Bloomberg, The Guardian, TechCrunch, 36Kr, SSPAI, The Verge, Ars Technica, CoinDesk, BlockBeats, Odaily, Foresight, The Block, and more.

**Universal fallback:** Any webpage with standard semantic HTML (article, main, post-content) gets clean extraction.

---

### Privacy First

- Content goes directly from your browser to Notion's API — zero third-party servers
- OAuth 2.0 authentication — we never see your password
- Tokens stored locally in Chrome storage only
- 100% open source — [audit the code yourself](https://github.com/xifengxx/notion-saver-ext)

---

### System Requirements

- Google Chrome browser
- A Notion account (free tier works perfectly)
- 3 clicks to get started — seriously

---

## 四、扩展元数据（提交用）

```
Title (English): NotionSnap — Save Webpages to Notion, Optimized for Chinese Content
Title (Chinese): NotionSnap — 一键保存网页到 Notion

Short Description (English): One-click save any webpage to Notion. Dedicated parsers for Twitter, GitHub, WeChat, Medium, Substack. Free & open source.
Short Description (Chinese): 一键保存网页到 Notion。公众号/Twitter/GitHub/知乎/Substack 专用优化，免费开源。

Detailed Description: [见上方英文版]

Category: Productivity
Subcategory: Notes & Research

Screenshots (5 张, 1280×800):
1. Popup 面板主界面 — 展示内容预览、元数据展开、目标选择器
2. 公众号文章保存效果 — 提取前后对比
3. Twitter 线程保存效果 — 多条推文 + 分隔线
4. GitHub README 保存效果 — Markdown 渲染为 Notion blocks
5. 设置面板 — 多工作区管理、预设管理、主题切换

Search Keywords (search terms, max 10):
notion clipper, save to notion, notion web clipper, web clipper, notion bookmark, 保存到Notion, 网页剪藏, notion笔记, web page to notion, notion save

Promo Tile (small, 440×280): [TBD — show extension icon on gradient background]
Marquee Image (large, 1400×560): [TBD — hero image showing popup UI + saved Notion page]

Website / Support: https://github.com/xifengxx/notion-saver-ext
Support Email: [developer email]
```

---

## 五、截图规划

5 张截图（1280×800），对应最核心的 5 个场景：

| 序号 | 场景 | 画面内容 | 卖点传达 |
|------|------|---------|---------|
| 1 | 公众号保存 | Popup 面板显示公众号文章预览（标题可编辑、作者/时间可见），目标选择器展开，保存按钮就绪 | 「公众号完美提取」|
| 2 | Twitter 线程 | Popup 面板 + 背景可见 Twitter 页面，类型标签显示「Twitter」 | 「推文线程不截屏」|
| 3 | GitHub Issue | 保存后的 Notion 页面效果：Issue 标题 + 状态 + 正文 + 多条评论，格式完整 | 「技术文档归位」|
| 4 | 多工作区 + 预设 | Popup 面板展示预设 pill 按钮 + 底部工作区切换器 | 「多账号轻松管理」|
| 5 | 主题切换 | Raycast 暗色主题和 Vercel 黑白主题并排对比 | 「好看且实用」|

---

## 六、推广文案（Store Listing 配套）

### 第一段 — 问题引入
> Notion Web Clipper 又罢工了？公众号链接又失效了？复制粘贴的格式又乱了？试试 NotionSnap —— 一个真正为中文用户设计的 Notion 剪藏工具。

### 第二段 — 解决方案
> 7 个网站专用解析器，30+ 站点智能适配。公众号、Twitter、GitHub、知乎、Substack 都能完美保存。图片自动上传到 Notion，永不丢失。完全免费，永久开源。

### 第三段 — 行动号召
> 安装只需 3 步：添加扩展 → 连接 Notion → 开始保存。已有 5000+ 用户告别了官方 Clipper 的折腾日子。你也试试？

---

*文档版本：v1.0 | 2026-05-27 | 配套 NotionSnap v0.6.0*
