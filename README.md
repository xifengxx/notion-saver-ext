# NotionSnap

Chrome 扩展，一键保存任意网页到 Notion。核心场景是公众号文章的稳定完整抓取，替代 Notion Web Clipper（不稳定）和 Copy to Notion（付费）。

当前版本：**v0.5.3**

## 变更日志

### v0.5.3
- 新增：两阶段保存 — Phase 1 秒级保存（文字 + external URL 图片），Phase 2 后台异步替换为 Notion 托管
- 新增：external_url 导入模式（优先 Notion 服务器直取，单次 API 调用）+ 二进制上传回退
- 新增：Phase 2 任务队列 — 多页面连续保存时串行处理，避免并发覆盖和任务丢失
- 新增：SW 终止恢复 — 图片替换进度持久化，Service Worker 重启后自动续传
- 新增：URL 三层匹配（精确 → 解码比较 → 按位置回退），解决 Notion 存储 URL 与原始 URL 不一致导致匹配失败
- 修复：SW 恢复时 deleteBlock 遇到已归档 block 报错（blockDeleted 标记 + "archived" 容错）
- 修复：fetchDatabaseSchema 保存到页面时误报 error（预期行为降级为 info）

### v0.5.2
- 新增：渐进式加载 — 4 路独立 fetch_pages_chunk 消息，逐条返回即刻渲染
- 新增：滚动分页 — 非搜索模式下拉框滚动到底加载更多（上限 30 条）
- 新增：搜索 300ms 防抖
- 新增：永久保存目标列表 — 用户保存过的页面不受 Notion API 100 条限制，始终可搜索
- 优化：搜索排名 — 本地 indexOf 优先 + workspace 页面排前，API 结果补充
- 修复：下拉框关闭后重新打开，残留的搜索关键词不清除

### v0.5.1
- 新增：自动字段匹配 — 保存到数据库时自动加载 schema，按属性名/类型匹配 9 个元数据字段（URL/作者/发布时间/摘要/网站名称/语言/关键词/封面图/字数），无需手动配置
- 新增：首页元数据"更多"可展开面板 — 标题下方展示可编辑的元数据字段，保存时修改直接生效
- 新增：页面列表缓存 — 打开弹窗秒出下拉数据，5 分钟后台静默刷新
- 优化：下拉框重构为两类结构 — 最近保存（5 个）+ 所有页面（10 个默认/可展开到 20）
- 优化：自动选中上次保存的页面/数据库为默认目标，即时显示不再等待 API
- 优化：元数据提取增强 — 9 字段覆盖中英文网页，关键词中文 N-gram 自动提取
- 移除：设置面板中的"自定义保存字段"手动配置区域（已被自动匹配替代）

### v0.5.0
- 新增：自定义保存字段 — 创建数据库 preset 时可勾选 URL/作者/发布时间/关键词映射到 Notion 数据库属性
- 新增：内容关键词提取 — 保存时自动从正文提取 3~5 个中文关键词，写入 Notion multi_select 属性
- 新增：字段映射编辑器 — 设置面板中可编辑已有 preset 的字段映射配置
- 新增：数据库 schema 24h 缓存 — 避免每次打开都调 Notion API
- 修复：parent type 跟踪 — 选择数据库时正确使用 `database_id` 创建页面

### v0.4.1
- 修复：图片上传 Notion API Gateway HTTP 400（POST + FormData + Authorization + Notion-Version）
- 修复：图片上传 URL 字段兼容（upload_url / url / signed_url）
- 修复：右键/快捷键保存 fallback 到最近保存页面（之前永远走 Notion 搜索）
- 优化：页面搜索下拉 — 搜索时即时显示本地缓存结果，API 返回后合并去重
- 优化：初始加载覆盖更广（3 种排序去重：desc + asc + 默认，page_size 100）
- 优化：搜索结果按层级排序（workspace > page_id/block_id > 其他 > database_id）
- 优化：默认下拉简洁化（最近保存 + 5 数据库 + 5 一级页面）
- 优化：搜索模式下数据库/页面带类型标签

### v0.4.0
- 新增：保存预设（pill 按钮一键切换目标页面，设置面板管理预设列表，最多 15 个，5 种彩色标签）
- 新增：保存历史记录面板（时钟图标进入，按日期分组，支持复制链接/打开 Notion/重试失败项）
- 新增：右键/快捷键保存也记录到历史
- 新增：File Upload 图片上传（下载图片二进制 → 上传到 Notion S3，彻底解决防盗链图片不显示问题）
- 新增：并行下载优化（全部图片同时下载，上传排队，大幅缩短等待时间）
- 优化：预设 UI 打磨（设置面板横排 pill 布局、悬停效果、快捷键修改按钮悬停效果）
- 优化：历史面板高度限制、保存失败状态提示自动清除
- 更新：扩展图标从 symbol.png 替换为 appicon

### v0.3.8
- 新增：popup 保存流程实时进度（"正在创建 Notion 页面..." → "正在保存 50/200 blocks (25%)..."）
- 新增：右键/快捷键保存时 badge 显示分块进度（1/3, 2/3...）和重试标记（R1, R2）
- 新增：网络重试可视化（popup 显示"网络不稳定，正在重试 (2/3)..."，badge 橙色 R 标记）

### v0.3.7
- 新增：右键菜单"保存到 Notion"（任意网页右键即可保存，无需打开 popup）
- 新增：全局快捷键 Ctrl+Shift+S / MacCtrl+Shift+S
- 新增：页面内 toast 反馈（保存成功/失败在页面右上角弹出，点击"在 Notion 中打开"跳转）
- 新增：插件图标 badge 状态提示（... → OK/!）
- 新增：设置面板快捷键显示（读取 Chrome 实际配置、一键跳转修改）
- 优化：设置面板 UI（超细滚动条、解绑虚线上分隔线、工作空间名标红、版本号右对齐）

### v0.3.6
- 修复：图片提取兼容性 — `<span leaf>`、`<a>`、`<li>`、`<blockquote>`、`<h1>-<h6>` 内图片不再丢失
- 优化：设置页面布局重构（flex 布局、移除无用保存按钮、分隔线、版本号）
- 优化：Workspace 视觉改进（彩色头像/图标、彩色边框、× 按钮对齐）
- 优化：空状态引导（无连接空间时显示 OAuth 授权按钮）
- 优化：Vercel 黑白主题下 workspace 边框改为中性色
- 清理：CSS 残留死代码（旧 `.workspace-info`、`.logout-btn` 重复定义）
- 修复：`loadSettings()` 遗留调用导致的边缘情况报错

### v0.3.5
- 重构：CSS 主题系统从选择器覆盖迁移到 CSS 变量驱动（维护性大幅提升）
- 新增：Token 刷新失败时 Chrome 系统通知 + popup 内提示
- 新增：Service Worker 保存中断恢复机制（storage 跟踪保存状态）
- 优化：popup.js 模块化拆分（lib.js + render.js + popup.js）
- 优化：storage key 常量化，消除重复 key 生成逻辑
- 优化：死代码清理、const → var 统一、addEventListener 命名
- 修复：Backend 健康检查 + 请求日志 + session 过期清理 + token-store 容错
- 修复：tests/verify.js 中不存在的 test_connection action 引用

### v0.3.0
- 新增：最近保存位置记忆，每个 workspace 独立记录最近使用的 5 个页面
- 新增：页面搜索支持拼音/标题模糊匹配，结果按字母排序
- 移除：图片 Base64 模式（Notion API 不支持 data: URL，推迟到后续通过 File Upload API 实现）

### v0.2.5
- 新增：多空间管理（OAuth 授权，支持绑定多个 Notion 账号）
- 新增：Raycast / Vercel 双主题
- 新增：可编辑标题、保存后"在 Notion 中打开"快捷入口
- 优化：公众号文章提取多层降级策略

### v0.2.0
- 从手动输入 Integration Token 改为 OAuth 2.0 登录
- 支持 token 自动刷新

### v0.1.0
- 初始版本：网页内容提取 + 保存到 Notion

## 功能

- 自动提取当前网页内容（标题、正文、图片、代码块、表格等）
- 公众号文章深度解析（15 个 selector 多层降级）
- 保存到指定 Notion 页面或数据库
- 右键菜单 + 全局快捷键，无需打开面板即可保存
- 保存进度实时反馈（popup 内显示分块进度，badge 显示 chunk 进度）
- 页面内 toast 通知（保存成功可点击跳转 Notion）
- 多 Notion 空间管理（OAuth 授权，支持绑定多个 Notion 账号）
- 最近保存位置记忆，按 workspace 独立记录
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

**方式一：Popup 面板**
1. 点击扩展图标打开 popup
2. 首次使用点击"连接到 Notion"完成 OAuth 授权
3. 自动提取当前页面内容，可编辑标题
4. 选择目标 Notion 页面/数据库
5. 点击"保存到 Notion"，实时查看保存进度

**方式二：右键菜单**
- 任意网页右键 → "保存到 Notion"

**方式三：快捷键**
- 默认 `Ctrl+Shift+S`（Mac: `MacCtrl+Shift+S`），可在 `chrome://extensions/shortcuts` 自定义

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
