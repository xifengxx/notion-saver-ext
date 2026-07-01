# NotionSnap 隐私政策

> 最后更新：2026-06-02

## 总则

NotionSnap（下称"本扩展"）尊重并保护用户隐私。本扩展不收集、不存储、不传输任何用户个人数据至第三方服务器。

## 数据流向

网页内容提取和保存的数据流为：**用户浏览器 → Notion API（api.notion.com）**，不经过任何中间服务器。唯一的例外是 OAuth 授权流程中的 Token 交换（见下方"OAuth 授权"章节）。

## 本地存储的数据

以下信息存储在 Chrome 本地存储（`chrome.storage.local`）中，仅用户浏览器可访问：

| 数据项 | 用途 | 是否上传 |
|--------|------|---------|
| Notion OAuth Access Token | 调用 Notion API 的认证凭证 | 否（仅发送至 api.notion.com） |
| Notion OAuth Refresh Token | Token 过期后自动续期 | 否（仅发送至 OAuth 代理后端） |
| 工作区信息（workspace name/icon/id） | 多账号切换时展示 | 否 |
| 主题偏好（Raycast / Vercel） | 记住用户的主题选择 | 否 |
| 保存预设列表 | 快速切换保存目标 | 否 |
| 最近保存页面列表 | 自动选中常用目标 | 否 |
| 保存历史记录 | 查看和管理已保存的页面 | 否 |
| 页面列表缓存 | 加快下拉框打开速度 | 否 |

## OAuth 授权

本扩展使用 OAuth 2.0 标准协议连接 Notion 账号，流程如下：

1. 用户在弹窗中点击"连接到 Notion"
2. 跳转至 Notion 官方授权页面（api.notion.com）
3. 用户授权后，Notion 返回授权码
4. 授权码通过 OAuth 代理后端（`notion-saver-ext-production.up.railway.app`）换取 Access Token
5. OAuth 代理后端仅转发 Token 交换请求，不存储任何用户数据
6. Token 存储在用户浏览器本地

OAuth 代理后端的唯一功能是将 Notion OAuth 的授权码交换为 Token。Token 在服务器端使用 AES-256-GCM 加密存储（加密密钥通过环境变量注入，不写入代码），不存储日志、不记录请求内容、不分析数据。后端实施了速率限制（全局 30 次/分钟，Token 端点 10 次/分钟）以防暴力枚举。

## 网络请求

本扩展发起的网络请求及其目的地：

| 请求 | 目的地 | 传输内容 |
|------|--------|---------|
| Token 交换 / 刷新 | `notion-saver-ext-production.up.railway.app` | OAuth 授权码 / Refresh Token |
| 创建页面 / 追加 blocks | `api.notion.com` | 页面标题、正文内容、图片 URL、元数据 |
| 上传图片（Phase 2） | Notion S3（通过 Notion File Upload API） | 图片文件二进制数据 |
| 获取页面列表 / 数据库 schema | `api.notion.com` | 认证 Token（Header 中） |
| 连接测试 | `api.notion.com/v1/users/me` | 认证 Token（Header 中） |

## 不收集的数据

本扩展**不**收集以下任何数据：

- 浏览历史或浏览行为
- 用户身份信息（姓名、邮箱、地址等）
- 任何形式的设备指纹
- 不嵌入任何第三方分析、统计、广告 SDK
- 不使用 Cookie 或任何浏览器追踪技术
- 不采集崩溃报告（Crashlytics 等）

## 权限说明

本扩展申请以下 Chrome 权限，每项均有明确用途：

| 权限 | 用途 |
|------|------|
| `activeTab` | 获取当前标签页的 URL 和网页内容，仅在用户主动点击扩展图标或使用快捷键时触发 |
| `storage` | 在本地存储用户设置、Token、预设、缓存等数据 |
| `scripting` | 向网页注入内容提取脚本（content script），解析 DOM 获取正文 |
| `notifications` | Token 刷新失败等关键事件推送系统通知 |
| `contextMenus` | 注册右键菜单"保存到 Notion"选项 |

所有权限均为按需触发，本扩展不会在后台静默访问任何网页。

## 第三方服务

本扩展依赖以下第三方服务：

- **Notion API**（api.notion.com）— 用于创建页面、追加内容、上传图片。受 [Notion 隐私政策](https://www.notion.so/Privacy-Policy) 约束。
- **Railway**（notion-saver-ext-production.up.railway.app）— 托管 OAuth 代理后端，仅用于 Token 交换。受 [Railway 隐私政策](https://railway.app/legal/privacy) 约束。

## 数据安全

- 所有网络请求使用 HTTPS 加密传输
- Notion API 通信使用 Bearer Token 认证
- Token 存储于 Chrome 安全本地存储中，不与任何第三方共享

## 数据删除

用户可通过以下方式完全清除扩展数据：

- **解绑工作区**：弹窗 → 设置 → 点击工作区旁的 × 按钮。此操作会删除该工作区的 Token、预设、缓存和历史记录
- **卸载扩展**：Chrome 会自动清除扩展的所有本地存储数据
- **撤销 Notion 授权**：在 Notion → Settings → Connections 中撤销 NotionSnap 的访问权限

## 未成年人

本扩展不针对 13 岁以下儿童设计，不会有意收集儿童的个人信息。

## 隐私政策变更

如有重大隐私政策更新，将在 [GitHub Releases](https://github.com/xifengxx/notion-saver-ext/releases) 页面发布通知。

## 联系方式

如有隐私相关问题，请通过以下方式联系：

- GitHub Issues：https://github.com/xifengxx/notion-saver-ext/issues
- 仓库地址：https://github.com/xifengxx/notion-saver-ext

## English Summary

NotionSnap does not collect, store, or transmit any personal data to third-party servers. All webpage content goes directly from your browser to the Notion API. OAuth tokens are stored locally in Chrome storage. The OAuth proxy backend only facilitates token exchange and stores no data. No analytics, no tracking, no cookies. 100% open source.
