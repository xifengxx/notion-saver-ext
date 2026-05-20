# Notion Saver — OAuth Proxy

Notion OAuth 2.0 代理后端，用于 Chrome 扩展的 Notion 登录授权。

## 功能

- `/auth?session=<id>` — 启动 OAuth 流程（重定向到 Notion 授权页）
- `/callback` — 接收 Notion 回调，交换 code 为 access/refresh token
- `/token?session=<id>` — 扩展轮询获取 tokens
- `/refresh` — 刷新过期的 access token

## 部署（Railway）

1. 在 [Notion Developer Console](https://developers.notion.com) 创建 **Public Integration**
2. 获取 `Client ID` 和 `Client Secret`
3. 在 Railway 新建 Project，连接此仓库，设置 Root Directory 为 `backend/`
4. 添加环境变量：
   - `NOTION_CLIENT_ID`
   - `NOTION_CLIENT_SECRET`
   - `NOTION_REDIRECT_URI`（部署后的 Railway URL + `/callback`）

## 技术

- Node.js + Express
- 单文件约 120 行
- Token 存储为 JSON 文件（重启后需重新登录，个人使用足够）
