# CDN 防盗链图片上传 — 三种绕过方案

## 问题背景

Phase 2 图片上传需要从源站获取图片二进制数据。部分 CDN（如 `cdnfile.sspai.com`）对 JS 程序化访问做了双层封堵：

1. `Sec-Fetch-Mode` 检查 → `fetch()` 请求返回 403（因为 fetch 发送 `Sec-Fetch-Mode: cors`，而 `<img>` 标签发送 `no-cors`）
2. 不支持 CORS → `crossOrigin='anonymous'` 的 Image 加载失败（无 `Access-Control-Allow-Origin` 头）

这两项都是 CDN 服务端策略，浏览器端 JS 无法绕过。

`<img>` 标签在页面上能正常显示是因为浏览器原生渲染管线走 `no-cors` + GPU 直通，不经过 JS 层。没有任何 JS API 能从这个通道读取像素数据（canvas 会被跨域图片污染）。

## 方案 1：chrome.downloads + 文件读取

### 逻辑

```
Phase 2 SW                     浏览器                          Notion
─────────                      ──────                          ──────
chrome.downloads.download() → 浏览器原生下载（绕过CDN检测）    →
chrome.downloads.onChanged ←  下载完成，文件落盘
读文件内容                →  从磁盘读取二进制                   →
上传到 Notion              ──────────────────────────────→     ✓
```

### 关键问题

SW 无法直接读取本地文件。需要引入 Offscreen document（Manifest V3 `chrome.offscreen` API）作为文件读取中介，但 Chrome 对 `file://` URL 的访问有严格安全限制。可能走到最后发现"能下载但读不到文件"。

### 工作量

1-2 天，风险高。需要验证 `chrome.offscreen` + `file://` URL 在目标 Chrome 版本的实际行为。

---

## 方案 2：代理服务器

### 逻辑

```
Phase 2 SW                    代理服务器                      CDN
─────────                     ──────────                      ───
POST /fetch {url, referer} → （无浏览器安全头限制）          →
                              ← 200 OK + 图片数据            ←
← 图片二进制
上传到 Notion                                                 →
```

### 为什么能绕过

- Notion 的 `external_url` 导入失败是在 Notion 服务器端访问 CDN 时被拦（可能涉及跨境网络问题）
- 代理部署在国内/可控位置，发普通 HTTPS 请求不经历浏览器的 Sec-Fetch 和 CORS 策略
- 可在代理端设置正确的 Referer/U-A/Cookie 完全模拟正常请求

### 推荐实现

**Cloudflare Worker**（`workers.dev` 或自定义域名）：
- 每天 10 万次免费请求，个人使用绰绰有余
- 部署一次永久运行，不需要维护服务器
- 代码量约 30 行

**其他选项**：阿里云函数、Vercel Edge Functions、Deno Deploy 等均可用

### 伪代码

```javascript
// Cloudflare Worker
async function handleRequest(request) {
  const { url, referer, headers } = await request.json();
  const resp = await fetch(url, {
    headers: {
      'Referer': referer || new URL(url).origin,
      'User-Agent': headers?.['user-agent'] || 'Mozilla/5.0 ...',
    },
  });
  return new Response(await resp.arrayBuffer(), {
    headers: { 'Content-Type': resp.headers.get('content-type') || 'image/png' },
  });
}
```

### 工作量

- 开发：半天（Worker 代码 + SW 侧集成）
- 部署：Cloudflare 账号 + Worker 发布
- 持续成本：免费额度内￥0

### 收益

不仅解决少数派，所有有防盗链的 CDN 都能通过代理上传。

---

## 方案 3：接受现状（当前选择）

保留 external URL 占位符，不上传图片。文字内容完整，图片在 Notion 中显示为占位符。

**适用场景**：图片对该页面重要性不高，或用户能接受在 Notion 中看不到图。

**触发条件**：当下方案 1/2 都未实施时，Phase 2 的 `downloadImageViaTab(→CORS canvas)` 是目前能做到的最好回退。支持 CORS 的 CDN 能成功，不支持的保持 external URL。

---

## 决策记录

| 日期 | 决策 |
|------|------|
| 2026-05-26 | 选择方案 3。方案 1、2 存档于此文档，后续遇到更多 CDN 防盗链页面时重新评估。 |
