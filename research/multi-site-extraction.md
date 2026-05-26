# 多网站适配调研 — 7 类网站内容提取分析

## 当前架构

```
isWechatArticle() → parseWechatArticle()   (15层 selector + 40+ 噪声清理)
       ↓ no
extractGenericContent()   (9个通用 selector + 基础清理)
```

## 逐类分析

### 1. Twitter/X — L2 中难度
- DOM: article[data-testid="tweet"], div[data-testid="tweetText"]
- 元数据: meta 标签质量差，需从 tweet text 提取
- 特殊场景: 长线程（多条推文）、引用推文、图片 alt text
- 结论: 需要独立解析函数 parseTwitterArticle

### 2. 博客 (WordPress/Ghost/Medium/知乎/简书/Substack) — L1 低难度
- DOM: article / .post-content / .entry-content，大部分已覆盖
- 噪声: 侧边栏推荐、newsletter CTA、评论区
- 元数据: 博客平台规范，提取质量较好
- 结论: 扩 selector + 增强噪声清理即可

### 3. 新闻网站 — L1 低难度
- DOM: article / [role="main"] / main，大部分命中
- 噪声: "相关阅读"、"推荐"、"热门文章" widget、广告位
- Paywall: NYT/WSJ/Bloomberg 等付费墙只能提取摘要
- 结论: 核心在噪声清理

### 4. IT/科技资讯 (HN/TechCrunch/The Verge/36氪/少数派) — L1 低难度
- DOM: 与新闻站类似
- 代码块: pre > code 已覆盖
- 特殊: 嵌入式 tweet、GitHub gist
- 结论: 与新闻站同策略

### 5. YouTube — L3 高难度
- 内容形态: 视频为主，文字是描述+字幕，与前几类完全不同
- 描述: #description-inline-expander
- 字幕: ytInitialPlayerResponse.captions (JS 变量，DOM 无渲染)
- 结论: 需要完整独立的提取策略，建议单独一期

### 6. GitHub — L2 中难度
- README: article.markdown-body 或 .markdown-body
- Issue/PR: 正文+评论线程
- 代码块: pre > code 已覆盖
- 结论: README 简单，Issue 线程复杂，需独立函数 parseGitHubPage

### 7. 币圈媒体 (CoinDesk/The Block/ForesightNews/星球日报/PANews) — L1 低难度
- DOM: 本质是新闻站，部分有自己的 content class
- 噪声: 价格 widget、行情 ticker、newsletter CTA
- 结论: 加 domain 特定 selector 即可

## 分档推进

| 档位 | 类别 | 策略 |
|------|------|------|
| L1 低难度 | 博客、新闻、IT资讯、币圈媒体 | 扩 selector + 增强噪声清理 + JSON-LD 元数据 |
| L2 中难度 | Twitter、GitHub | 新增 site-specific 解析函数 |
| L3 高难度 | YouTube | 独立专项，视频→字幕→描述 |

## Phase A: L1 通用增强

改动文件: `src/content/extractor.js`

1. **扩展 selector 表**: 按域名分类，增加 30+ 针对性 selector
2. **增强噪声清理**: 扩展 removeSels，补充相关推荐/广告/newsletter/评论区
3. **JSON-LD 元数据提取**: 解析 `<script type="application/ld+json">`
4. **域名检测**: `classifyPage()` 函数，按 hostname 分类
