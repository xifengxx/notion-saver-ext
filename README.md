# Notion Saver

Chrome 扩展，一键保存任意网页到 Notion。核心场景是公众号文章的稳定完整抓取，替代 Notion Web Clipper（不稳定）和 Copy to Notion（付费）。

当前版本：**v0.2.5**

## 功能

- 自动提取当前网页内容（标题、正文、图片、代码块、表格等）
- 公众号文章深度解析（15 个 selector 多层降级）
- 保存到指定 Notion 页面或数据库
- 多 Notion 空间管理（OAuth 授权，支持绑定多个 Notion 账号）
- 2 种 UI 主题：Raycast（暗色金属）、Vercel（黑白精准）
- 可编辑标题、空间切换、搜索过滤页面/数据库
- 保存后快捷跳转"在 Notion 中打开"

## 安装

1. `npx vite build`
2. Chrome 地址栏打开 `chrome://extensions`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 目录

## 使用

1. 点击扩展图标打开 popup
2. 首次使用点击"连接到 Notion"完成 OAuth 授权
3. 自动提取当前页面内容，可编辑标题
4. 选择目标 Notion 页面/数据库
5. 点击"保存到 Notion"

### 多空间

- 底部空间下拉框切换不同 Notion 账号
- 点击 `+` 授权新的 Notion 账号
- 设置面板（右上角 ⚙）管理已连接的空间，支持解绑

## 技术

- Manifest V3
- 纯原生 HTML/CSS/JS，零运行时依赖
- Notion OAuth 2.0 + REST API v1
- Vite + @crxjs/vite-plugin
- OAuth 代理后端（Express + Railway 部署）

## 开发

```bash
npm install
npx vite build
```

## License

MIT
