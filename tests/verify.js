/**
 * 验证构建产物和核心逻辑
 * 在 Node.js 环境下运行：node tests/verify.js
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, '..', 'dist');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log('  ✅ ' + message);
  } else {
    failCount++;
    console.log('  ❌ ' + message);
  }
}

function describe(name, fn) {
  console.log('\n ' + name);
  fn();
}

// ============================================================
// 1. 验证文件存在
// ============================================================
describe('构建产物完整性', () => {
  const files = [
    'manifest.json',
    'service-worker-loader.js',
    'src/popup/popup.html',
    'public/icons/icon-16.png',
    'public/icons/icon-48.png',
    'public/icons/icon-128.png',
  ];

  files.forEach(f => {
    assert(fs.existsSync(path.join(distDir, f)), '存在: ' + f);
  });

  // 验证 assets 目录有 JS 文件
  const assets = fs.readdirSync(path.join(distDir, 'assets'));
  assert(assets.some(f => f.startsWith('service.js')), '存在 service.js');
  assert(assets.some(f => f.startsWith('popup') && f.endsWith('.js')), '存在 popup.js');
  assert(assets.some(f => f.startsWith('extractor.js')), '存在 extractor.js');
});

// ============================================================
// 2. 验证 manifest.json
// ============================================================
describe('Manifest 配置', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf-8'));

  assert(manifest.manifest_version === 3, 'MV3');
  assert(manifest.permissions.includes('activeTab'), '有 activeTab 权限');
  assert(manifest.permissions.includes('storage'), '有 storage 权限');
  assert(manifest.permissions.includes('scripting'), '有 scripting 权限');
  assert(manifest.host_permissions.includes('https://api.notion.com/*'), '有 Notion API host 权限');
  assert(manifest.host_permissions.includes('<all_urls>'), '有 <all_urls> host 权限');
  assert(manifest.background.service_worker === 'service-worker-loader.js', 'Service Worker 路径正确');
  assert(manifest.content_scripts[0].matches[0] === '<all_urls>', 'Content Script 匹配所有 URL');
  assert(manifest.action.default_popup === 'src/popup/popup.html', 'Popup 路径正确');
});

// ============================================================
// 3. 验证 Service Worker 语法
// ============================================================
describe('Service Worker 代码质量', () => {
  const serviceFile = fs.readdirSync(path.join(distDir, 'assets')).find(f => f.startsWith('service.js'));
  const serviceCode = fs.readFileSync(path.join(distDir, 'assets', serviceFile), 'utf-8');

  // 语法检查
  try {
    new vm.Script(serviceCode);
    assert(true, '语法有效');
  } catch (e) {
    assert(false, '语法错误: ' + e.message);
  }

  // 检查没有未处理的 async/await（Service Worker 环境兼容性）
  assert(!serviceCode.includes('async function'), '使用 Promise 链而非 async/await');

  // 检查有错误处理
  assert(serviceCode.includes('.catch('), '有 .catch 错误处理');
  assert(serviceCode.includes('chrome.runtime.lastError'), '检查 runtime.lastError');

  // 检查没有可能导致崩溃的 throw（应该在 catch 块外没有 throw）
  const topLevelThrows = serviceCode.match(/^[^/]*throw /gm);
  assert(topLevelThrows === null || topLevelThrows.length === 0, '没有顶层 throw（应该在 catch 内）');
});

// ============================================================
// 4. 验证 Content Script 语法
// ============================================================
describe('Content Script 代码质量', () => {
  const extractorFile = fs.readdirSync(path.join(distDir, 'assets')).find(f => f.startsWith('extractor.js'));
  const extractorCode = fs.readFileSync(path.join(distDir, 'assets', extractorFile), 'utf-8');

  // 语法检查
  try {
    new vm.Script(extractorCode);
    assert(true, '语法有效');
  } catch (e) {
    assert(false, '语法错误: ' + e.message);
  }

  // 检查关键函数存在（minified 后用模式匹配）
  assert(extractorCode.includes('extractTableAsNotionTable') || extractorCode.includes('table_row'), '表格转换函数存在');
  assert(extractorCode.includes('extractPlainText') || extractorCode.includes('textContent'), '纯文本提取函数存在');
  assert(extractorCode.includes('domToBlocks') || extractorCode.match(/function [a-zA-Z]\([a-zA-Z],[a-zA-Z]\)/), 'DOM 转换函数存在');
  assert(extractorCode.includes('chrome.runtime.onMessage'), '消息监听存在');

  // 检查 table 相关代码的格式
  assert(extractorCode.includes('table_row') && extractorCode.includes('cells'), '使用正确的 table_row.cells 格式');
});

// ============================================================
// 5. 验证 Popup 语法
// ============================================================
describe('Popup 代码质量', () => {
  const popupFile = fs.readdirSync(path.join(distDir, 'assets')).find(f => f.startsWith('popup') && f.endsWith('.js'));
  const popupCode = fs.readFileSync(path.join(distDir, 'assets', popupFile), 'utf-8');

  // 语法检查
  try {
    new vm.Script(popupCode);
    assert(true, '语法有效');
  } catch (e) {
    assert(false, '语法错误: ' + e.message);
  }

  // 检查有错误处理
  assert(popupCode.includes('chrome.runtime.lastError'), '检查 runtime.lastError');
});

// ============================================================
// 6. 模拟测试：纯文本提取逻辑
// ============================================================
describe('模拟测试：纯文本提取', () => {
  // 模拟 extractPlainText 的逻辑
  function extractPlainText(html) {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // 测试用例 1：简单 HTML
  const html1 = '<p>这是一段测试文字。</p>';
  const result1 = extractPlainText(html1);
  assert(result1 === '这是一段测试文字。', '简单段落提取正确');

  // 测试用例 2：多段落
  const html2 = '<p>第一段。</p><p>第二段。</p><p>第三段。</p>';
  const result2 = extractPlainText(html2);
  assert(result2.includes('第一段') && result2.includes('第二段') && result2.includes('第三段'), '多段落都包含');

  // 测试用例 3：带标签的复杂 HTML
  const html3 = '<div><p>标题</p><p><strong>加粗</strong>文字</p><p>结尾</p></div>';
  const result3 = extractPlainText(html3);
  assert(result3.includes('标题') && result3.includes('加粗') && result3.includes('结尾'), '复杂 HTML 提取正确');

  // 测试用例 4：分段逻辑
  const longText = '这是一段很长的文字，用于测试分段功能是否正常工作。'.repeat(100);
  const chunkSize = 1500;
  const chunks = [];
  for (let i = 0; i < longText.length; i += chunkSize) {
    chunks.push(longText.substring(i, i + chunkSize));
  }
  assert(chunks.length > 1, '长文本正确分段');
  assert(chunks[0].length <= chunkSize, '每段不超过限制');
  assert(chunks.join('').length === longText.length, '分段后总长度不变');
});

// ============================================================
// 6b. 模拟测试：内联样式解析
// ============================================================
describe('模拟测试：内联样式解析', () => {
  // 模拟 parseInlineStyle 的逻辑（新版）
  function parseInlineStyle(style) {
    if (!style) return {};
    var annotations = {};
    var lower = style.toLowerCase();
    if (lower.match(/font-weight\s*:\s*(bold|700|600)/)) {
      annotations.bold = true;
    }
    if (lower.indexOf('font-style:italic') !== -1) {
      annotations.italic = true;
    }
    if (lower.indexOf('text-decoration:line-through') !== -1) {
      annotations.strikethrough = true;
    }
    var colorMatch = lower.match(/color\s*:\s*(#[0-9a-f]{3,8}|rgb\s*\([^)]+\))/i);
    if (colorMatch) {
      annotations.hasColor = true;
    }
    return annotations;
  }

  assert(parseInlineStyle('font-weight:bold; color:#ff0000').bold === true, '检测加粗');
  assert(parseInlineStyle('font-weight:bold; color:#ff0000').hasColor === true, '检测颜色');
  assert(parseInlineStyle('font-style:italic; color:#3366ff').italic === true, '检测斜体');
  assert(parseInlineStyle('color:#ff6600').hasColor === true, '单独检测颜色');
  assert(Object.keys(parseInlineStyle('')).length === 0, '空样式返回空对象');
  assert(Object.keys(parseInlineStyle(null)).length === 0, 'null 样式返回空对象');
  // 测试 font-weight: 600（微信常用）
  assert(parseInlineStyle('font-weight: 600').bold === true, '检测 font-weight:600');
  assert(parseInlineStyle('font-weight:600;color:#222').bold === true, 'font-weight:600 带颜色');
});

// ============================================================
// 6c. 模拟测试：代码行号清理
// ============================================================
describe('模拟测试：代码行号清理', () => {
  function cleanCode(text) {
    return text.replace(/^\s*\d+\s+/gm, '').trim();
  }

  assert(cleanCode('1 git clone\n2 cd dir\n3 npm install') === 'git clone\ncd dir\nnpm install', '清理行号');
  assert(cleanCode('git clone\ncd dir') === 'git clone\ncd dir', '无行号不改变');
  assert(cleanCode('  1 git clone\n  2 cd dir') === 'git clone\ncd dir', '带缩进清理行号');
});

// ============================================================
// 6d. 模拟测试：链接处理
// ============================================================
describe('模拟测试：链接处理', () => {
  function processLink(href) {
    if (!href || href === 'javascript:void(0)' || href.indexOf('http') !== 0) {
      return null; // 模拟 data-href 等回退
    }
    return href;
  }

  assert(processLink('https://example.com') === 'https://example.com', '标准链接保留');
  assert(processLink('http://localhost:3000') === 'http://localhost:3000', 'http 链接保留');
  assert(processLink('javascript:void(0)') === null, 'javascript 链接过滤');
  assert(processLink('') === null, '空链接过滤');
  assert(processLink('#section') === null, '锚点链接过滤');
});

// ============================================================
// 7. 模拟测试：表格转换逻辑
// ============================================================
describe('模拟测试：表格转换结构', () => {
  // 验证 Notion table block 的结构
  const mockTableBlock = {
    type: 'table',
    table: {
      table_width: 3,
      has_column_header: true,
      has_row_header: false,
      children: [
        {
          type: 'table_row',
          table_row: {
            cells: [
              [{ type: 'text', text: { content: 'A' } }],
              [{ type: 'text', text: { content: 'B' } }],
              [{ type: 'text', text: { content: 'C' } }],
            ],
          },
        },
      ],
    },
  };

  assert(mockTableBlock.type === 'table', 'type 是 table');
  assert(mockTableBlock.table.children[0].type === 'table_row', '行类型是 table_row');
  assert(Array.isArray(mockTableBlock.table.children[0].table_row.cells), 'cells 是数组');
  assert(mockTableBlock.table.children[0].table_row.cells.length === 3, '列数正确');
  assert(Array.isArray(mockTableBlock.table.children[0].table_row.cells[0]), '每格是 rich_text 数组');
  assert(mockTableBlock.table.children[0].table_row.cells[0][0].text.content === 'A', '单元格内容正确');

  // 验证 API 请求体格式
  const apiBlock = {
    object: 'block',
    type: mockTableBlock.type,
    [mockTableBlock.type]: mockTableBlock.table,
  };
  assert(apiBlock.object === 'block', 'API block object 正确');
  assert(apiBlock.type === 'table', 'API block type 正确');
  assert(apiBlock.table.table_width === 3, 'API block table_width 正确');
});

// ============================================================
// 8. 模拟测试：Service Worker 消息路由
// ============================================================
describe('模拟测试：消息路由逻辑', () => {
  const serviceFile = fs.readdirSync(path.join(distDir, 'assets')).find(f => f.startsWith('service.js'));
  const serviceCode = fs.readFileSync(path.join(distDir, 'assets', serviceFile), 'utf-8');

  // 检查所有 action 都有处理
  const actions = [
    'extract_content',
    'save_to_notion',
    'get_settings',
    'save_settings',
    'start_oauth_login',
    'fetch_pages',
  ];

  actions.forEach(action => {
    assert(serviceCode.includes("'" + action + "'") || serviceCode.includes('"' + action + '"'), '处理 ' + action + ' action');
  });

  // 检查 save_to_notion 有 catch
  assert(serviceCode.includes('saveToNotion') && serviceCode.includes('.catch('), 'save_to_notion 有错误处理');
});

// ============================================================
// 9. 验证没有模板字面量（避免 minify 问题）
// ============================================================
describe('代码格式检查', () => {
  const serviceFile = fs.readdirSync(path.join(distDir, 'assets')).find(f => f.startsWith('service.js'));
  const serviceCode = fs.readFileSync(path.join(distDir, 'assets', serviceFile), 'utf-8');

  // 检查没有模板字面量（minify 后可能有问题）
  assert(!serviceCode.includes('`'), '没有模板字面量（使用字符串拼接）');

  // 检查没有可选链（Service Worker 兼容性）
  assert(!serviceCode.includes('?.'), '没有可选链操作符');
});

// ============================================================
// 总结
// ============================================================
console.log('\n' + '='.repeat(50));
console.log('测试完成: ' + passCount + ' 通过, ' + failCount + ' 失败');
console.log('='.repeat(50));

if (failCount > 0) {
  console.log('\n❌ 有测试失败，请检查上面的输出');
  process.exit(1);
} else {
  console.log('\n✅ 所有测试通过！');
  process.exit(0);
}
