# NotionSnap — Chrome 扩展

## 项目概述

Chrome 浏览器扩展（Manifest V3），一键保存任意网页到 Notion。核心场景是公众号文章的稳定完整抓取，替代 Notion Web Clipper（不稳定）和 Copy to Notion（付费）。

## 版本信息

- **当前版本**：v0.6.1（2026-05-27）
- **Phase 状态**：Phase 0-6 全部完成。Phase 6 — Twitter/GitHub/Medium/Substack 独立解析 + 视频平台支持 + 视频占位符修复，详见 ROADMAP.md

## 技术栈

- Manifest V3（Chrome 扩展标准）
- 纯原生 HTML/CSS/JS，零运行时依赖
- Notion REST API（v1）
- 自定义 DOM 解析器（公众号专用 + 通用网页降级）
- 构建：Vite + @crxjs/vite-plugin
- 测试：Node.js 脚本（tests/verify.js，71 项验证）

## 项目结构

```
notion-saver-ext/
├── CLAUDE.md              # 项目配置
├── plan.md                # 详细开发规划
├── package.json           # 无运行时依赖
├── vite.config.js         # Vite + CRXJS 构建
├── design-comparison.html # 设计对比页（5 方案）
├── tests/
│   └── verify.js          # 自动化验证测试（71 项）
├── src/
│   ├── manifest.json      # MV3 清单
│   ├── popup/
│   │   ├── popup.html     # 面板 UI
│   │   ├── popup.js       # 面板逻辑
│   │   ── popup.css      # 面板样式
│   ├── background/
│   │   └── service.js     # Service Worker（Notion API 集成）
│   └── content/
│       └── extractor.js   # 内容提取引擎
└── public/
    └── icons/             # 扩展图标（16/48/128）
```

## 开发纪律

1. 公众号文章是最高优先级场景，优先保证提取准确性
2. 所有代码用 Promise 链，不用 async/await（Service Worker 兼容性）
3. 所有 chrome.runtime.sendMessage 回调必须检查 lastError
4. 不用模板字面量和可选链（minify 后可能出错）
5. 敏感信息（API Key）通过 popup 输入，不进代码、不进 commit
6. 改完必须跑 `npx vite build` 再交付

## 当前状态

- Phase 0 — 需求分析与规划 ✅
- Phase 1 — 项目骨架 ✅
- Phase 2 — 内容提取引擎 ✅
- Phase 3 — Notion API 集成 ✅
- Phase 4 — 扩展 UI ✅
- Phase 5 — 测试与发布 ✅
- Phase 6 — v0.5.x 搜索优化 ✅
- Phase 7 — Chrome Web Store 上架 / 图片上传优化 / 多网站适配（下一步）

## 已实现功能

### 内容提取（extractor.js）
- 7 个独立解析器：微信公众号（15 层降级 + 50+ 噪声清理）、Twitter/X 线程、GitHub README & Issues、知乎问答、小红书笔记、Medium、Substack（含自定义域名）
- 30+ 站点智能适配：按域名分类匹配最优选择器和噪声规则（博客/新闻/科技/加密/通用）
- HTML → Notion blocks：paragraph、heading_1-3、quote、bulleted_list_item、numbered_list_item、code（含语言检测）、divider、image（外部 URL）、table、embed（视频嵌入）、video（外部 mp4）
- 视频处理：YouTube/Bilibili/TikTok/Douyin 页面解析 + embed block，文章内嵌 iframe 提取，CDN 不可达时蓝色加粗占位符降级
- 富文本保持：加粗、斜体、删除线、内联代码、11 种文字颜色、链接（含 data-href 回退）
- 元数据提取：作者、发布时间、摘要、封面图、语言、字数（中英文 N-gram 关键词）
- block 类型安全：三层验证防御（内容脚本过滤 → SW 安全网 → SW 内容字段验证）
- 安全网：DOM 遍历返回 0 blocks 时，正则提取纯文本分块（1500 字符/块）

### Notion API 集成（service.js）
- 创建页面（自动检测默认页面 / 用户选择）
- 保存目标自动检测：page_id 失败时自动 fallback 到 database_id
- 分批写入 blocks（100 块/批，避免 API 限制）
- 递归追加（避免 Service Worker 休眠）
- Rate limit 429 自动重试（Retry-After 头）
- 网络错误 3 次重试（1s/2s/3s 退避）
- 连接测试（/v1/users/me）
- 页面列表获取（/v1/search，最多 50 页）
- 多空间管理（每个空间一个 Integration Token，支持添加/删除/切换）

### UI（popup）
- 自动提取当前页面内容
- 显示内容预览（类型标签、可编辑标题、作者、发布时间）
- 目标 Notion 页面下拉选择器（搜索、最近保存、分类显示数据库/页面）
- 保存进度/成功/失败状态反馈（成功 3s 自动消失）
- 设置面板（图片模式选择、多空间管理、inline 确认解绑）
- 2 种主题实时切换：Raycast（暗色 + 紫红渐变）、Vercel（黑白）
- 主题持久化到 chrome.storage.local

## 关键决策

1. **内容提取**：自定义 DOM 遍历（非 Mozilla Readability），可控性更强
2. **图片处理**：使用外部 URL（非 Base64），简单且不触发 Notion API 大小限制
3. **认证**：Internal Integration Token（非 OAuth），满足个人使用
4. **Service Worker**：Promise 链 + 递归调用（非 async/await），避免 minify 问题和休眠问题
5. **HTML 转换**：手动映射 HTML 标签到 Notion block 类型（非 Markdown 中转）
6. **构建**：Vite + CRXJS，保持 MV3 标准输出
7. **主题系统**：CSS class 切换（`.popup.theme-*`），零 JS 样式操作
8. **多空间架构**：每个空间独立 token，支持数据库和页面作为保存目标

## 已知问题 / 待办

1. **Chrome Web Store 上架**（P0）：✅ 已上架 [安装链接](https://chromewebstore.google.com/detail/notionsnap/eedapefdokhmncpgomaagjipfbafhhgi)
2. **图片上传成功率**（P1）：CDN 防盗链图片（微信、少数派等）Phase 2 替换到 Notion S3 会失败
3. **更多网站适配**（P1）：Mirror.xyz、Newsletter 平台、BBC/CNN 精调
4. **多浏览器适配**（P2）：Firefox MV3 + Edge
5. **自动化测试**：tests/verify.js 需更新覆盖 v0.6.x 新特性
