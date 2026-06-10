# NotionSnap Twitter 卡片 — GPT Image 2 提示词

> 基于 `image-video-prompt-system` 模板生成
> 模板来源：poster.yaml / brand.yaml / product.yaml
> 目标尺寸：1200×675（16:9）

## ⚠️ 使用前必读：Logo 上传

**Logo 文件**：`pic/logo/icon.png`（项目根目录下的 `notion-saver-ext/pic/logo/icon.png`）

**操作方式**：
1. 将上述 logo 图片**作为附件上传**到 GPT 对话中
2. 同时粘贴下方提示词
3. 告诉 GPT：「请将附件中的 logo 原样放置在卡片中，不要修改 logo 的外观，其他内容自由发挥」

**Logo 说明**：这是一个 Chrome 扩展的应用图标，圆角方形，深色渐变底+彩色图形。在卡片中应保持原样，尺寸约为画布的 8-12%。

---

## 提示词 1：概念字体海报（推荐优先尝试）

**模板**：poster.yaml — 概念字体海报模板

```
Create ONE finished premium promotional card for a Chrome extension called "NotionSnap".

The main text "把任何网页，一秒变成整洁的 Notion 笔记" must be the dominant visual structure:
huge, readable, powerful, and spelled exactly in Chinese.

Silently interpret the phrase's meaning: capturing web chaos and transforming it into clean,
organized Notion pages. Turn that interpretation into one strong visual metaphor —
scattered fragments coalescing into order, raw input becoming structured output.

Typography is the hero. The Chinese characters should feel editorial and premium —
serif or semi-serif, with weight contrast between key words. The word "一秒" (one second)
should receive special typographic treatment as the emotional punch.

Add a smaller secondary line: "免费 · 开源 · 中文内容深度优化" in restrained size.

Use a warm, refined 4-6 color system:
- Warm cream or parchment base
- Rich warm brown or espresso for text
- One warm accent color (terracotta, amber, or warm coral) used sparingly
- Subtle warm gray for secondary elements

Composition: 16:9 horizontal, high-end editorial poster quality, dramatic scale,
strong hierarchy, few elements, intelligent whitespace, bold flat color areas.

Include the attached product logo image in one corner. The logo is a rounded-square
app icon with a dark gradient background and a colorful graphic inside.
Place it at about 8-12% of the canvas size, in the bottom-right or top-left corner.
**Keep the logo visually identical to the reference image — do not redesign or alter it.**
Other elements on the card can be freely designed.

Avoid: generic word art, glossy 3D, random icons, stock-photo realism,
cluttered collage, neon glow, AI purple-blue gradients, cold gray backgrounds.

Output: 16:9 horizontal card, suitable for Twitter/X promotion.
```

---

## 提示词 2：产品推广海报

**模板**：poster.yaml — 常规模板 + product.yaml

```
设计一张 Chrome 浏览器扩展 NotionSnap 的 Twitter 推广卡片（16:9 横向）。

主视觉：左侧为产品名称 "NotionSnap" 大字标题，右侧为一个简洁的视觉隐喻——
网页碎片（模糊的网页元素、文字片段）通过一条流动线汇聚成一个整洁的 Notion 页面块。
或者用极简的几何图形表达"从混乱到秩序"的转换过程。

标题文案："把任何网页，一秒变成整洁的 Notion 笔记"
副标题："免费 · 开源 · 中文内容深度优化"

版式：左文右图或对角分割，留白充足。
风格：高级编辑出版风，不是科技广告风。温暖、有质感、像一本好杂志的封面。
色彩：奶油/羊皮纸暖底 + 深咖啡色文字 + 陶土/珊瑚橙作为唯一强调色点缀。
字体气质：有衬线的标题，不要无衬线科技感字体。

右下角放置附件中的产品 logo。Logo 保持原样、不要修改其外观，尺寸约为画布的 8-12%。

约束：
- 不要纯黑背景，不要紫色渐变，不要霓虹发光
- 文字清晰可读
- 色调统一，暖色调
- 不要杂乱拼贴
- 图片比例 16:9

输出：适合 Twitter/X 传播的高分辨率推广卡片。
```

---

## 提示词 3：极简品牌卡片

**模板**：brand.yaml — 常规模板

```
为 Chrome 扩展 NotionSnap 设计一张品牌推广卡片（16:9）。

品牌关键词：高效、稳定、开源、中文友好、一键保存。
行业：生产力工具 / 浏览器扩展。

画面构成（极简）：
- 大面积暖色留白（奶油纸色或温暖米白）
- 中央或左对齐排列产品名 "NotionSnap"（大字，衬线体或精致无衬线体，"Notion" 用强调色）
- 下方一行标语 "把任何网页，一秒变成整洁的 Notion 笔记"
- 再下方小字 "免费 · 开源 · 中文内容深度优化"
- 底部或角落放置附件中的产品 logo。保持 logo 原样不变，仅调整尺寸适配画布（约 8-12%）

色彩系统：
- 底色：暖奶油 #faf6ec
- 主文字：暖深棕 #1c1815
- 强调色：陶土橙 #c96442（只用在 "Notion" 一词和小装饰元素）
- 辅助色：暖灰 #9e8c78

风格：高端品牌编辑风，温暖克制，像一本独立杂志的品牌广告页。
不要科技感，不要渐变霓虹，不要冰冷配色。

输出：16:9 品牌推广卡片。
```

---

## 使用说明

1. 复制提示词到 ChatGPT（GPT-4o with Image Generation / GPT Image 2）
2. 建议先试**提示词 1**（概念字体海报），效果通常最出彩
3. 如生成文字有误（中文渲染问题），改用提示词 2 或 3
4. 目标尺寸 1200×675（16:9），在提示词中已声明
