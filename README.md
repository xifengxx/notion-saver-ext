# Notion Saver

Chrome 扩展，一键保存任意网页到 Notion。核心场景是公众号文章的稳定完整抓取，替代 Notion Web Clipper（不稳定）和 Copy to Notion（付费）。

## 功能

- 自动提取当前网页内容（标题、正文、图片、代码块、表格等）
- 公众号文章深度解析（15 个 selector 多层降级）
- 保存到指定 Notion 页面或数据库
- 多 Notion 空间管理（每个空间对应一个 Integration Token）
- 2 种 UI 主题：Raycast（暗色金属）、Vercel（黑白精准）
- 可编辑标题、最近保存记录、下拉搜索页面

## 安装

1. `npx vite build`
2. Chrome 地址栏打开 `chrome://extensions`
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目的 `dist` 目录

## 使用

1. 点击扩展图标打开 popup
2. 自动提取当前页面内容
3. 选择目标 Notion 页面/数据库
4. 点击"保存到 Notion"

### 首次使用

- 点击扩展右上角 ⚙ 进入设置
- 添加 Notion Integration Token（`secret_xxxxx...`）
- 在 Notion 中创建 Integration 并授权目标页面/数据库

## 技术

- Manifest V3
- 纯原生 HTML/CSS/JS，零运行时依赖
- Notion REST API v1
- Vite + @crxjs/vite-plugin

## 开发

```bash
npm install
npx vite build
```

## License

MIT
