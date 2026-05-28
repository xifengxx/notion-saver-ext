# 搜索功能优化 — 竞品调研

> 日期：2026-05-25 | 版本：v0.7.0 预研

## 竞品做法

### Notion 官方 Web Clipper（内部 API）

- 使用浏览器已有 `token_v2` cookie 直接调用 Notion 内部 API（非公开 `/v1/search`）
- 不走 OAuth，速度即时，与 Notion 原生搜索体验一致
- 可看到用户所有 workspace 和页面树，不受 Integration 权限限制
- UX：弹窗内搜索型下拉框 + "New links database" 快捷创建按钮

### 第三方 "Save to Notion" 类扩展（公共 API）

- 全部使用 `POST /v1/search`，分 database 和 page 两类分别请求
- 带 query 时 API 按 title 相关性返回，不带 query 拉全量
- API 仅匹配标题，不搜索正文
- 速率限制：3 请求/秒，超限返回 429 + `Retry-After`
- 每请求最多 100 条（`page_size: 100`）
- 搜索结果可能被截断（`request_status: "incomplete"`）

## NotionSnap 当前实现评估

已接近第三方扩展的最佳实践水平：

- 4 请求 × 100 条去重（database + page × 3 排序方向）
- chrome.storage.local 5 分钟缓存
- 层级排序（workspace > page_id/block_id > 其他 > database_id）
- 搜索/非搜索双模式渲染
- 非搜索态：最近保存 5 + 所有页面 10/可展开 20

## 与官方 Web Clipper 不可比的差距

公共 API 看不到完整 workspace 页面树，只能看 Connection 授权的那部分。这是 API 本身的限制。

## 可改进方向

- 搜索输入加 300ms debounce，避免每敲一个字符打一次 API
- popup 打开先渲染缓存，后台静默刷新，用户无感知
- workspace 树形导航不可行（Notion API 不返回父子关系，需递归查 child pages，成本高）

## 结论

小优化即可，不需要大改架构。
