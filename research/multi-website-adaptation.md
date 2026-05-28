# 多网站适配 — 竞品调研

> 日期：2026-05-25 | 版本：v0.7.0 预研

## 行业标准提取链路

```
Raw HTML → Readability.js（提取正文）→ Turndown（转 Markdown）→ Notion API
```

几乎所有开源 Notion clipper（MarkSnip、SyncNos、clipper.js）都走这条路。

官方 Web Clipper 虽然没有开源确认，但行为描述（文本密度评分、语义标签检测、class 权重）和 Readability 算法一致。

## Readability.js 算法原理

1. **预处理** — 移除 `<script>`、`<style>`、`<noscript>`、隐藏元素
2. **评分叶子块** — 逗号数（+复杂度）、文本长度（+深度）、链接密度（高=惩罚）
3. **Class/ID 加权** — `article`/`content`/`post` +25，`sidebar`/`nav`/`comment` -25
4. **向上传播分数** — 最高分容器胜出
5. **清理** — 去除空容器，相对 URL 转绝对
6. **预检** — `isProbablyReaderable()` 快速判断是否值得解析

## 不同网站类型的挑战

| 网站类型 | 方案 | 说明 |
|---------|------|------|
| 博客/新闻 | Readability 效果好 | 标准 CMS 结构（WordPress、Medium、Ghost） |
| Twitter/X | 专用选择器 `[data-testid="tweetText"]` | 需 MutationObserver 防虚拟滚动，DOM 结构常变 |
| SPA 页面 | MutationObserver | `document.readyState === "complete"` 不可靠 |
| 社交媒体 | 自定义 parser | Readability 失效（缺少段落文本） |

## SPA 提取最佳实践

- **MutationObserver**（推荐 90% 场景）：监听目标容器，debounce ~500ms
- **chrome.debugger API**（高可靠）：CDP 监控网络请求，网络空闲 500ms 后提取。代价：触发"可读取所有网站数据"警告
- **轮询 setInterval**：浪费资源，不推荐

## NotionSnap 当前做法

- 自定义 DOM 遍历（非 Readability）
- 公众号 15 个 selector 降级 + 通用解析器
- 以公众号为最高优先级

## 建议方向

- 引入 Readability.js 作为通用解析主力（20KB，无依赖，纯 JS）
- 保留公众号专用 parser 作为高优先级路径（公众号是核心场景）
- Twitter/X 等特定网站后续按需加专用选择器
- 替代方案：Defuddle（Obsidian 出品，更宽容，提取 schema.org 元数据）

## 结论

引入 Readability.js 覆盖长尾网页，公众号专用 parser 保留。工作量 2-3 天。
