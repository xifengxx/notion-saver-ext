# 文章内嵌视频 & 视频平台页面 — 保存方案调研

> 日期：2026-05-27 | 版本：v0.7.0 预研（更新）

---

## 一、Notion API 视频相关 Block 类型

### 三种 block，三种用途

| Block 类型 | API type | JSON 结构 | 适用场景 |
|-----------|----------|----------|---------|
| **Video** | `"video"` | `{ video: { type: "external", external: { url: "mp4_url" } } }` | 直接视频文件 URL（.mp4/.webm 等） |
| **Embed** | `"embed"` | `{ embed: { url: "https://..." } }` | 平台视频页面 URL，Notion 前端渲染嵌入式播放器 |
| **Bookmark** | `"bookmark"` | `{ bookmark: { url: "https://...", caption: [...] } }` | 兜底方案，显示卡片缩略图 |

### Embed block API 实测

- **YouTube** ✅ 确认可用 — 通过 API 创建 embed block + YouTube URL，Notion 前端正常渲染播放器（n8n 社区验证）
- **Vimeo** ✅ 确认可用 — 官方文档明确支持
- **Bilibili/TikTok** ⚠️ 未实测 — 理论上可行，Notion 前端 Iframely 支持这些域名
- API 不调用 Iframely 验证服务 — 但 Notion 前端加载页面时会识别已知平台 URL 并渲染
- 官方文档警告："embed blocks created using the API may not look exactly like their counterparts created in the Notion app"

---

## 二、各视频平台分析

### YouTube

| 项目 | 内容 |
|------|------|
| **页面 URL 格式** | `https://www.youtube.com/watch?v=VIDEO_ID`、`youtu.be/VIDEO_ID`、`/shorts/VIDEO_ID` |
| **嵌入 iframe** | `<iframe src="https://www.youtube.com/embed/VIDEO_ID">` |
| **oEmbed API** | `GET https://www.youtube.com/oembed?url=URL&format=json`（免费，无需 API Key） |
| **oEmbed 返回** | `title`、`author_name`、`author_url`、`html`（iframe）、`thumbnail_url`、`provider_name` |
| **Notion 保存** | embed block + 视频页面 URL → 自动渲染播放器 |
| **限制** | 视频作者可关闭嵌入；YouTube API Services 2025.08 新规要求 Referer 头 |

### Bilibili（哔哩哔哩）

| 项目 | 内容 |
|------|------|
| **页面 URL 格式** | `https://www.bilibili.com/video/BVxxx` 或 `avxxx` |
| **嵌入 iframe** | `<iframe src="https://player.bilibili.com/player.html?bvid=BVxxx">` |
| **视频信息 API** | `GET https://api.bilibili.com/x/web-interface/view?bvid=BVxxx` |
| **API 返回** | `data.title`、`data.pic`（封面）、`data.desc`、`data.aid`、`data.cid`、`data.owner.name` |
| **嵌入参数** | `aid/bvid/cid/seasonId/episodeId` + `autoplay/muted/t/danmaku/as_wide/high_quality/poster` |
| **Notion 保存** | embed block + `https://www.bilibili.com/video/BVxxx` |
| **限制** | UP 主可关闭"允许嵌入"（iframe 返回 403/空白）；大会员/版权内容禁止嵌入 |

### TikTok

| 项目 | 内容 |
|------|------|
| **页面 URL 格式** | `https://www.tiktok.com/@USERNAME/video/VIDEO_ID` |
| **oEmbed API** | `GET https://www.tiktok.com/oembed?url=URL` |
| **oEmbed 返回** | `title`、`author_name`、`author_url`、`html`（blockquote + embed.js）、`thumbnail_url`、`provider_name` |
| **Notion 保存** | embed block + 视频页面 URL |

### 抖音（Douyin）

| 项目 | 内容 |
|------|------|
| **页面 URL 格式** | `https://www.douyin.com/video/VIDEO_ID` |
| **oEmbed API** | 无公开标准 oEmbed |
| **Notion 保存** | embed block + 视频页面 URL（效果待验证） |

### 微信视频号

| 项目 | 内容 |
|------|------|
| **嵌入方式** | 公众号文章中使用 `<mp-common-videosnap>` 自定义元素，内部可能嵌入 iframe |
| **提取难度** | 高 — 微信封闭生态，无公开 API |
| **Notion 保存** | 只能提取分享链接 → bookmark block（embed 大概率不解析微信域名） |
| **结论** | **不做深度解析**。只能提取视频号分享链接作为 bookmark 或纯文本链接 |

---

## 三、文章内嵌视频提取策略

### 场景 1：`<video>` 标签（直接 mp4 文件）

```
<video src="https://cdn.example.com/video.mp4">
  <source src="https://cdn.example.com/video.webm" type="video/webm">
</video>
```

- **当前状态**：已有代码 `videoBlock()` + `domToBlocks()` 处理
- **改进**：处理 blob: URL 回退、添加封面提取（poster 属性）
- **Notion block**：video block（external URL）

### 场景 2：`<iframe>` 嵌入（平台视频）

```
<iframe src="https://www.youtube.com/embed/VIDEO_ID">
<iframe src="https://player.bilibili.com/player.html?bvid=BVxxx">
<iframe src="https://www.tiktok.com/embed/v2/VIDEO_ID">
```

- **当前状态**：未处理 — `domToBlocks()` 中 iframe 在排除标签列表中
- **改进**：从 iframe src 提取平台和视频 ID → 构造标准页面 URL → embed block
- **Notion block**：embed block

### 场景 3：`<a>` 链接指向视频平台

```
<a href="https://www.youtube.com/watch?v=VIDEO_ID">
<a href="https://www.bilibili.com/video/BVxxx/">
```

- **改进**：检测链接域名 → 追加 embed block（不作为替代，保留原文链接）
- **Notion block**：embed block

### 场景 4：微信公众号 `<mp-common-videosnap>`

- **当前状态**：未处理
- **改进**：提取属性或内部 iframe → 获取视频号分享 URL → bookmark block
- **Notion block**：bookmark block（最稳妥）或纯文本链接

---

## 四、视频平台页面处理（Layer 3）

当用户直接浏览 YouTube/Bilibili/TikTok 页面时，专门提取视频信息：

```
检测域名 → 走专用解析器：
  youtube.com / youtu.be  → parseVideoPlatformPage()
  bilibili.com             → parseVideoPlatformPage()
  tiktok.com               → parseVideoPlatformPage()
  douyin.com               → parseVideoPlatformPage()
```

**解析流程**：
1. 从页面 URL 提取视频 ID
2. 调用 oEmbed API（YouTube/TikTok）或信息 API（Bilibili）获取元数据
3. 构造 embed block（页面 URL）+ 段落（标题 + 作者 + 描述）
4. 添加 bookmark block 作为备选展示

---

## 五、实现方案

### 核心原则

**视频不下载不上传，只引用 URL。** 与图片不同，视频文件太大（几十 MB 到几百 MB），Notion API 单文件限制 20MB，且视频平台不暴露直接文件 URL。

### 三层策略

```
视频来源
│
├── Layer 1：<video> 标签 → mp4/webm URL
│   └── video block (external URL)  ← 已有代码
│
├── Layer 2：<iframe> 嵌入 → YouTube/Bilibili/TikTok
│   └── 提取 iframe src → 构造平台页面 URL → embed block  ← 新增
│
└── Layer 3：视频平台页面 → 直接浏览 YouTube/Bilibili 等
    └── 检测页面 URL → 专用解析器 → embed block + 元数据  ← 新增
```

### 修改文件

| 文件 | 改动 | 工作量 |
|------|------|--------|
| `src/content/extractor.js` | `domToBlocks()` 新增 iframe 视频检测和转换 | ~30 行 |
| `src/content/extractor.js` | 新增 `collectEmbeddedMedia()` → 扫描 iframe/a 标签中的视频 URL | ~40 行 |
| `src/content/extractor.js` | 新增 `isVideoPlatformPage()` + `parseVideoPlatformPage()` | ~80 行 |
| `src/content/extractor.js` | 增强 `domToBlocks()` 中 `<video>` 标签处理（poster 封面、blob 回退） | ~20 行 |

### Block 选择决策

```
视频 URL 类型判断：
│
├── 直接 mp4/webm 文件 URL？
│   └── YES → video block
│
├── YouTube / Bilibili / TikTok / Douyin 页面 URL？
│   └── YES → embed block（优先）
│       └── embed 失败？→ bookmark block
│
├── 微信视频号 / 不可嵌入的 URL？
│   └── bookmark block（卡片展示）
│
└── 无法识别的 URL？
    └── paragraph + 纯文本链接
```

### 不做

- 不上传视频文件到 Notion（违背用户要求 + 文件太大）
- 不下载 TikTok/抖音无水印视频（无关，我们要的是 URL 引用）
- 不深入微信视频号封闭生态
- 不处理付费墙后/认证墙后的视频

---

## 六、与旧版调研的差异

| 维度 | 旧版（2026-05-25） | 新版（2026-05-27） |
|------|-------------------|-------------------|
| Notion API | 仅列举 block 类型 | 实测 embed block + YouTube 可用性（n8n 社区确认） |
| YouTube | 粗略 | oEmbed API 端点 + 返回字段 + URL 格式全集 |
| Bilibili | 未调研 | 官方 API + 嵌入参数全集 + 嵌入限制说明 |
| TikTok | 未调研 | oEmbed API 端点和返回结构 |
| 微信视频号 | 不可行 | 具体 DOM 结构 + bookmark 兜底方案 |
| 实现方案 | 无 | 三层策略 + 文件/行数 + block 选择决策树 |
