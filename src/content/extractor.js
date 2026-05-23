// Content Script — 页面内容提取 + DOM 遍历转换为 Notion Blocks
// 纯原生实现，不依赖外部库

// Node 常量数字值（避免沙箱环境中 Node 未定义）
var TEXT_NODE = 3;
var ELEMENT_NODE = 1;

// ============================================================
// Notion Block 工厂
// ============================================================
function paragraphBlock(richText) {
  return { type: 'paragraph', paragraph: { rich_text: richText } };
}

function headingBlock(level, richText) {
  return { type: 'heading_' + level, ['heading_' + level]: { rich_text: richText } };
}

function quoteBlock(richText) {
  return { type: 'quote', quote: { rich_text: richText } };
}

function bulletedListItemBlock(richText) {
  return { type: 'bulleted_list_item', bulleted_list_item: { rich_text: richText } };
}

function numberedListItemBlock(richText) {
  return { type: 'numbered_list_item', numbered_list_item: { rich_text: richText } };
}

function codeBlock(text, lang) {
  return {
    type: 'code',
    code: {
      rich_text: [{ type: 'text', text: { content: text } }],
      language: lang || 'plain text',
    },
  };
}

function dividerBlock() {
  return { type: 'divider', divider: {} };
}

function imageBlock(url, caption) {
  return {
    type: 'image',
    image: {
      type: 'external',
      external: { url: url },
      caption: caption ? [{ type: 'text', text: { content: caption } }] : [],
    },
  };
}

// ============================================================
// HTML 实体解码
// ============================================================
function decodeHtml(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#38;/g, '&')
    .replace(/&[\w#]+;/g, '');
}

// ============================================================
// 富文本提取（内联格式 → Notion rich_text）
// ============================================================

// 解析 inline style 字符串，提取 Notion 支持的格式
function parseInlineStyle(style) {
  if (!style) return {};
  var annotations = {};
  var lower = style.toLowerCase();
  // 加粗检测：精确匹配 font-weight 值
  if (lower.match(/font-weight\s*:\s*(bold|700|600)/)) {
    annotations.bold = true;
  }
  if (lower.indexOf('font-style:italic') !== -1) {
    annotations.italic = true;
  }
  if (lower.indexOf('text-decoration:line-through') !== -1) {
    annotations.strikethrough = true;
  }
  // 提取颜色
  var colorMatch = lower.match(/color\s*:\s*(#[0-9a-f]{3,8}|rgb\s*\([^)]+\))/i);
  if (colorMatch) {
    var color = colorMatch[1].replace(/\s+/g, '');
    if (color.indexOf('#') === 0) {
      // 标准化为 6 位
      if (color.length === 4) {
        color = '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      } else {
        color = color.substring(0, 7);
      }
      annotations.color = mapColorToNotion(color);
    }
  }
  return annotations;
}

// 将 HEX 颜色映射到 Notion 支持的颜色
function mapColorToNotion(hex) {
  var colorMap = {
    '#ff0000': 'red', '#ff4d4d': 'red', '#e60000': 'red',
    '#ff6600': 'orange', '#ff9933': 'orange',
    '#ffcc00': 'yellow', '#ffdd00': 'yellow',
    '#33cc33': 'green', '#00b300': 'green',
    '#0066ff': 'blue', '#0066cc': 'blue', '#3366ff': 'blue',
    '#9933ff': 'purple', '#6633ff': 'purple',
    '#999999': 'gray', '#808080': 'gray', '#666666': 'gray',
    '#cccccc': 'gray_background', '#f0f0f0': 'gray_background',
    '#ffe6e6': 'red_background', '#fff3e0': 'orange_background',
    '#ffffcc': 'yellow_background', '#e6ffe6': 'green_background',
    '#e6f0ff': 'blue_background', '#f0e6ff': 'purple_background',
  };
  return colorMap[hex.toLowerCase()] || 'default_color';
}

function richTextFromNode(node) {
  if (!node) return [];
  if (node.nodeType === TEXT_NODE) {
    var text = node.textContent;
    if (!text || !text.trim()) return [];
    return [{ type: 'text', text: { content: decodeHtml(text) } }];
  }

  if (node.nodeType !== ELEMENT_NODE) return [];

  var tag = node.tagName.toLowerCase();

  // 处理 span 和 font 的 inline style
  if (tag === 'span' || tag === 'font') {
    var style = node.getAttribute('style') || '';
    var annotations = parseInlineStyle(style);
    // 检查是否包含 <a> 标签（链接容器）
    var hasLinkChild = node.querySelector('a') !== null;

    if (hasLinkChild) {
      // 包含链接的容器：递归处理子节点
      var linkTexts = [];
      var children5 = node.childNodes;
      for (var ci5 = 0; ci5 < children5.length; ci5++) {
        var ct5 = richTextFromNode(children5[ci5]);
        for (var j5 = 0; j5 < ct5.length; j5++) {
          linkTexts.push(ct5[j5]);
        }
      }
      return linkTexts;
    }

    // 检查是否有格式化标注
    if (annotations.bold || annotations.italic || annotations.strikethrough || (annotations.color && annotations.color !== 'default_color')) {
      // 有格式标注的 span：直接提取文本并附加格式
      var text2 = decodeHtml(node.textContent);
      if (text2 && text2.trim()) {
        var result2 = [{ type: 'text', text: { content: text2 } }];
        if (annotations.bold) result2[0].annotations = { bold: true };
        if (annotations.italic) { result2[0].annotations = result2[0].annotations || {}; result2[0].annotations.italic = true; }
        if (annotations.strikethrough) { result2[0].annotations = result2[0].annotations || {}; result2[0].annotations.strikethrough = true; }
        if (annotations.color && annotations.color !== 'default_color') { result2[0].annotations = result2[0].annotations || {}; result2[0].annotations.color = annotations.color; }
        return result2;
      }
    }

    // 普通 span：递归处理子节点
    var childTexts = [];
    var children = node.childNodes;
    for (var i = 0; i < children.length; i++) {
      var ct = richTextFromNode(children[i]);
      for (var j = 0; j < ct.length; j++) {
        childTexts.push(ct[j]);
      }
    }
    return childTexts;
  }

  if (tag === 'strong' || tag === 'b') {
    return [{ type: 'text', text: { content: decodeHtml(node.textContent) }, annotations: { bold: true } }];
  }
  if (tag === 'em' || tag === 'i') {
    return [{ type: 'text', text: { content: decodeHtml(node.textContent) }, annotations: { italic: true } }];
  }
  if (tag === 'del' || tag === 's' || tag === 'strike') {
    return [{ type: 'text', text: { content: decodeHtml(node.textContent) }, annotations: { strikethrough: true } }];
  }
  if (tag === 'code') {
    return [{ type: 'text', text: { content: node.textContent }, annotations: { code: true } }];
  }
  if (tag === 'a') {
    var href = node.getAttribute('href') || '';
    var content = decodeHtml(node.textContent);
    if (!content) return [];
    // 处理 WeChat 链接：有些链接 href 为空，实际 URL 在 data-href 或 data-linkdata
    if (!href || href === 'javascript:void(0)' || href.indexOf('http') !== 0) {
      href = node.getAttribute('data-href') || node.getAttribute('data-linkdata') || '';
    }
    // 验证并清理 URL（去掉 fragment，Notion 不接受非 http 链接）
    if (href && href.indexOf('http') === 0) {
      var cleanHref = href.split('#')[0];
      return [{ type: 'text', text: { content: content, link: { url: cleanHref } } }];
    }
    return [{ type: 'text', text: { content: content } }];
  }
  if (tag === 'br') return [];

  // 递归处理子节点（未知内联元素等）
  var texts = [];
  var children = node.childNodes;
  for (var i = 0; i < children.length; i++) {
    var childTexts = richTextFromNode(children[i]);
    for (var j = 0; j < childTexts.length; j++) {
      texts.push(childTexts[j]);
    }
  }
  return texts;
}

// ============================================================
// DOM 遍历转换（保持原始顺序）
// ============================================================
function domToBlocks(element, blocks) {
  if (!element) return;
  var children = element.childNodes;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.nodeType === TEXT_NODE) {
      var text = child.textContent.trim();
      if (text) blocks.push(paragraphBlock([{ type: 'text', text: { content: decodeHtml(text) } }]));
      continue;
    }

    if (child.nodeType !== ELEMENT_NODE) continue;

    var tag = child.tagName.toLowerCase();
    processElement(child, tag, blocks);
  }
}

function processElement(el, tag, blocks) {
  // 标题
  if (/^h[1-6]$/.test(tag)) {
    var level = parseInt(tag[1]);
    var rt = richTextFromNode(el);
    if (rt.length > 0) blocks.push(headingBlock(level, rt));
  }
  // 段落
  else if (tag === 'p') {
    processParagraph(el, blocks);
  }
  // 引用
  else if (tag === 'blockquote') {
    var rtQ = richTextFromNode(el);
    if (rtQ.length > 0) blocks.push(quoteBlock(rtQ));
  }
  // 无序列表
  else if (tag === 'ul') {
    var liChildren = el.children;
    for (var i = 0; i < liChildren.length; i++) {
      if (liChildren[i].tagName.toLowerCase() === 'li') {
        var rt = richTextFromNode(liChildren[i]);
        if (rt.length > 0) blocks.push(bulletedListItemBlock(rt));
      }
    }
  }
  // 有序列表
  else if (tag === 'ol') {
    var liChildren2 = el.children;
    for (var i = 0; i < liChildren2.length; i++) {
      if (liChildren2[i].tagName.toLowerCase() === 'li') {
        var rt = richTextFromNode(liChildren2[i]);
        if (rt.length > 0) blocks.push(numberedListItemBlock(rt));
      }
    }
  }
  // 代码块
  else if (tag === 'pre') {
    // WeChat 代码块结构：每个 <code> 标签包含一行代码，多个 <code> 在一个 <pre> 内
    // 策略：不直接用 textContent（会丢失换行），而是遍历子元素重建带换行的文本
    var lines = [];
    function extractCodeLines(node) {
      if (node.nodeType === TEXT_NODE) {
        var t = node.textContent;
        if (t && t.trim()) lines.push(t.replace(/^\s*\d+\s+/, ''));
        return;
      }
      if (node.nodeType !== ELEMENT_NODE) return;
      var childTag = node.tagName.toLowerCase();
      if (childTag === 'br') {
        // 推空字符串，join 后变为单个换行
        lines.push('');
        return;
      }
      // <li> 或 <code> 视为换行点
      if (childTag === 'li' || childTag === 'code') {
        var lineText = node.textContent || '';
        lineText = lineText.replace(/^\s*\d+\s+/, '');
        if (lineText.trim()) {
          lines.push(lineText);
        }
        return;
      }
      // 递归处理子节点
      var children = node.childNodes;
      for (var i = 0; i < children.length; i++) {
        extractCodeLines(children[i]);
      }
    }
    extractCodeLines(el);

    var codeText = lines.join('\n');
    // 清理连续空行
    codeText = codeText.replace(/\n\s*\n\s*\n/g, '\n\n');

    // 尝试提取语言信息
    var lang = '';
    var dataLang = el.getAttribute('data-lang');
    if (dataLang) {
      lang = dataLang;
    } else {
      var codeEl2 = el.querySelector('code');
      if (codeEl2 && codeEl2.className) {
        var langMatch = codeEl2.className.match(/language-(\w+)/);
        if (langMatch) lang = langMatch[1];
      }
    }

    if (codeText && codeText.trim().length > 0) {
      blocks.push(codeBlock(codeText.trim(), lang));
    }
  }
  // 纯代码块（WeChat 有时直接用 code 标签，不在 pre 里）
  else if (tag === 'code') {
    // 检查是否在 pre 内（如果在，已由上面处理，跳过）
    var ancestor = el.parentElement;
    var isInPre = false;
    while (ancestor) {
      if (ancestor.tagName.toLowerCase() === 'pre') {
        isInPre = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    if (!isInPre) {
      var codeText3 = el.textContent || '';
      codeText3 = codeText3.replace(/^\s*\d+\s+/gm, '');
      if (codeText3 && codeText3.trim().length > 0) {
        blocks.push(codeBlock(codeText3.trim(), ''));
      }
    }
  }
  // 分隔线
  else if (tag === 'hr') {
    blocks.push(dividerBlock());
  }
  // 图片
  else if (tag === 'img') {
    var src = el.getAttribute('src') || el.getAttribute('data-src') || '';
    var alt = el.getAttribute('alt') || el.getAttribute('data-caption') || '';
    if (src) blocks.push(imageBlock(src, alt));
  }
  // 表格 → Notion table block
  else if (tag === 'table') {
    var tableBlock = extractTableAsNotionTable(el);
    if (tableBlock) blocks.push(tableBlock);
  }
  // 容器：递归深入处理子元素
  else if (['div', 'section', 'article', 'main', 'figure', 'figcaption', 'header', 'footer', 'aside', 'nav'].indexOf(tag) !== -1) {
    domToBlocks(el, blocks);
  }
  // 纯文本容器（span、label 等内联元素包裹的文字）
  else if (['span', 'label', 'font'].indexOf(tag) !== -1) {
    var hasBlockChild = false;
    var children2 = el.children;
    for (var ci = 0; ci < children2.length; ci++) {
      var ct = children2[ci].tagName.toLowerCase();
      if (/^h[1-6]$/.test(ct) || ct === 'p' || ct === 'blockquote' || ct === 'ul' || ct === 'ol' || ct === 'pre' || ct === 'code' || ct === 'div' || ct === 'section' || ct === 'article' || ct === 'table') {
        hasBlockChild = true;
        break;
      }
    }
    if (hasBlockChild) {
      domToBlocks(el, blocks);
    } else {
      var rtSpan = richTextFromNode(el);
      if (rtSpan.length > 0) blocks.push(paragraphBlock(rtSpan));
    }
  }
  // 其他忽略
}

function processParagraph(el, blocks) {
  var imgs = el.querySelectorAll('img');
  var hasText = el.textContent.trim().length > 0;

  if (!hasText && imgs.length > 0) {
    for (var i = 0; i < imgs.length; i++) {
      var imgSrc = imgs[i].getAttribute('src') || imgs[i].getAttribute('data-src') || '';
      var imgAlt = imgs[i].getAttribute('alt') || '';
      if (imgSrc) blocks.push(imageBlock(imgSrc, imgAlt));
    }
  } else {
    // 处理 <br> 分段：公众号说说类文章用 <br> 分段，需要拆成多个 Notion 段落
    var brs = el.querySelectorAll('br');
    if (brs.length > 0) {
      // 收集所有子节点，按 <br> 分组
      var segments = [];
      var currentNodes = [];
      var children = el.childNodes;
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child.nodeType === ELEMENT_NODE && child.tagName.toLowerCase() === 'br') {
          if (currentNodes.length > 0) {
            segments.push(currentNodes);
            currentNodes = [];
          }
        } else {
          currentNodes.push(child);
        }
      }
      if (currentNodes.length > 0) {
        segments.push(currentNodes);
      }
      // 每个段创建一个 Notion 段落块
      for (var s = 0; s < segments.length; s++) {
        var rt = [];
        for (var n = 0; n < segments[s].length; n++) {
          var parts = richTextFromNode(segments[s][n]);
          for (var p = 0; p < parts.length; p++) {
            rt.push(parts[p]);
          }
        }
        if (rt.length > 0) {
          blocks.push(paragraphBlock(rt));
        }
      }
    } else {
      var rt = richTextFromNode(el);
      if (rt.length > 0) {
        blocks.push(paragraphBlock(rt));
      }
    }
  }
}

function extractTableAsNotionTable(table) {
  var trs = table.querySelectorAll('tr');
  if (trs.length === 0) return null;

  var rows = [];
  for (var i = 0; i < trs.length; i++) {
    var cells = [];
    var tds = trs[i].querySelectorAll('td, th');
    for (var j = 0; j < tds.length; j++) {
      var text = tds[j].textContent.trim().replace(/\n/g, ' ');
      cells.push({
        type: 'text',
        text: { content: text }
      });
    }
    if (cells.length) rows.push(cells);
  }
  if (rows.length === 0) return null;

  var colCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length > colCount) colCount = rows[i].length;
  }
  if (colCount === 0) return null;

  // Notion table block: cells 是 2D 数组，每格一个 rich_text 数组
  var tableBlock = {
    type: 'table',
    table: {
      table_width: colCount,
      has_column_header: true,
      has_row_header: false
    }
  };

  var tableRows = [];
  for (var i = 0; i < rows.length; i++) {
    var cells = [];
    for (var j = 0; j < colCount; j++) {
      var cellText = (rows[i] && rows[i][j])
        ? rows[i][j].text.content
        : '';
      cells.push([{
        type: 'text',
        text: { content: cellText }
      }]);
    }
    tableRows.push({
      type: 'table_row',
      table_row: { cells: cells }
    });
  }
  tableBlock.table.children = tableRows;

  return tableBlock;
}

// ============================================================
// 从 HTML 字符串解析并转换
// ============================================================
function domToBlocksFromHTML(html, blocks) {
  if (!html || !html.trim()) return;

  // 用 DOMParser 解析（content script 中可用）
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');

  // 检查解析结果
  if (!doc.body || !doc.body.childNodes.length) {
    console.log('[Notion Saver] Parser returned empty body for HTML length:', html.length);
    // 回退：手动处理简单 p 标签
    var pMatch = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatch) {
      for (var i = 0; i < pMatch.length; i++) {
        var inner = pMatch[i].replace(/<\/?p[^>]*>/gi, '');
        if (inner.trim()) {
          blocks.push(paragraphBlock([{ type: 'text', text: { content: decodeHtml(inner) } }]));
        }
      }
    }
    return;
  }

  domToBlocks(doc.body, blocks);
}

// ============================================================
// 消息处理
// ============================================================
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'extract') {
    try {
      var data = extractContent();
      console.log('[Notion Saver] Extract result:', data.error || 'OK', 'type:', data.type, 'title:', data.title, 'contentHTML length:', data.contentHTML ? data.contentHTML.length : 0);
      if (data.contentHTML && !data.error) {
        var blocks = [];
        domToBlocksFromHTML(data.contentHTML, blocks);

        // 安全网：blocks 为空但 HTML 有文本 → 回退提取纯文本
        if (blocks.length === 0 && data.contentHTML) {
          var plainText = extractPlainText(data.contentHTML);
          if (plainText && plainText.trim().length > 0) {
            console.log('[Notion Saver] DOM traversal returned 0 blocks, falling back to plain text');
            // 按 1500 字符分段，每段一个段落 block，避免超长
            var chunkSize = 1500;
            for (var pi = 0; pi < plainText.length; pi += chunkSize) {
              blocks.push(paragraphBlock([{ type: 'text', text: { content: plainText.substring(pi, pi + chunkSize).trim() } }]));
            }
          }
        }

        data.blocks = blocks;
        console.log('[Notion Saver] Extracted', blocks.length, 'blocks');
        if (blocks.length === 0) {
          console.log('[Notion Saver] HTML sample (first 500 chars):', data.contentHTML.substring(0, 500));
        }
      }
      sendResponse(data);
    } catch (err) {
      console.error('[Notion Saver] Extract error:', err);
      sendResponse({ error: err.message, title: document.title });
    }
  }
});

// ============================================================
// 从 HTML 中提取纯文本（安全网）
// ============================================================
function extractPlainText(html) {
  try {
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    var text = tmp.textContent || tmp.innerText || '';
    // 清理多余空白
    return text.replace(/\s+/g, ' ').trim();
  } catch (e) {
    // 回退：正则提取
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

// ============================================================
// 主入口：提取内容
// ============================================================
function extractContent() {
  if (isWechatArticle()) {
    return parseWechatArticle(document);
  }

  // 通用网页：用原生方式提取正文
  return extractGenericContent(document);
}

function isWechatArticle() {
  return window.location.hostname === 'mp.weixin.qq.com'
    || document.querySelector('#js_content') !== null;
}

// ============================================================
// 公众号专用解析
// ============================================================
function parseWechatArticle(doc) {
  // 第一层：标准文章容器（#js_content 是纯正文，不含底部 UI）
  var contentSelectors = [
    '#js_content',
    '#js_article_content',
    '#js_text_desc',
    '#js_image_desc',
    '#js_image_content',
    '.share_notice',
    '.rich_media_content',
    '.rich_media_content_short',
    '.rich_media_article',
    '#img-content',
    '.rich_media_content_p',
    '.content_area',
    '#content',
    '#js_content_short',
    '.js_content',
  ];

  var content = null;
  for (var i = 0; i < contentSelectors.length; i++) {
    content = doc.querySelector(contentSelectors[i]);
    if (content && content.textContent.trim().length > 5) break;
    content = null;
  }

  // 兜底：如果找到的容器文字很少（短图文说说），尝试用 #js_article 获取更多内容
  if (content && content.textContent.trim().length < 800) {
    var jsArticle = doc.querySelector('#js_article');
    if (jsArticle && jsArticle.textContent.trim().length > content.textContent.trim().length) {
      // 检查 #js_article 是否有更多图片（图文说说类型的特征）
      var contentImgs = content.querySelectorAll('img').length;
      var articleImgs = jsArticle.querySelectorAll('img').length;
      if (articleImgs > contentImgs) {
        content = jsArticle;
      }
    }
  }

  // 如果上面都没找到，尝试 #js_article
  if (!content) {
    var jsArticle = doc.querySelector('#js_article');
    if (jsArticle && jsArticle.textContent.trim().length > 5) {
      content = jsArticle;
    }
  }

  // 第二层：如果标准容器没找到，尝试收集所有段落
  if (!content) {
    var allParagraphs = doc.querySelectorAll('p');
    if (allParagraphs.length > 0) {
      var totalText = '';
      for (var i = 0; i < allParagraphs.length; i++) {
        totalText += allParagraphs[i].textContent.trim() + '\n';
      }
      if (totalText.trim().length > 5) {
        content = doc.createElement('div');
        for (var i = 0; i < allParagraphs.length; i++) {
          content.appendChild(allParagraphs[i].cloneNode(true));
        }
      }
    }
  }

  // 第三层：如果段落也没找到，尝试 body 中的所有文本节点
  if (!content && doc.body) {
    var bodyText = doc.body.textContent || '';
    if (bodyText.trim().length > 5) {
      // 从 body 中提取主要内容区域（去掉 script、style 等）
      var bodyClone = doc.body.cloneNode(true);
      var removeTags = ['script', 'style', 'noscript', 'link', 'meta'];
      for (var i = 0; i < removeTags.length; i++) {
        var removeEls = bodyClone.querySelectorAll(removeTags[i]);
        for (var j = 0; j < removeEls.length; j++) {
          removeEls[j].remove();
        }
      }
      if (bodyClone.textContent.trim().length > 5) {
        content = bodyClone;
      }
    }
  }

  if (!content) {
    return { error: '未找到公众号正文内容', title: doc.title };
  }

  var clone = content.cloneNode(true);
  cleanWechatElements(clone);
  processWechatImages(clone);
  var meta = extractWechatMeta(doc);

  return {
    type: 'wechat',
    title: meta.title,
    author: meta.author,
    publishTime: meta.publishTime,
    coverImage: meta.coverImage,
    contentHTML: clone.innerHTML,
    url: window.location.href,
  };
}

// ============================================================
// 通用网页解析（替代 Readability）
// ============================================================
function extractGenericContent(doc) {
  // 尝试找正文容器
  var selectors = [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.entry-content',
    '.article-content',
    '#content',
    '.content',
    'body',
  ];

  var content = null;
  for (var i = 0; i < selectors.length; i++) {
    content = doc.querySelector(selectors[i]);
    if (content && content.textContent.trim().length > 100) break;
    content = null;
  }

  if (!content) {
    return { error: '无法提取正文内容', title: doc.title };
  }

  var clone = content.cloneNode(true);
  // 简单清理
  var removeSels = ['script', 'style', 'nav', 'header', 'footer', 'aside', '.sidebar', '.ad'];
  for (var i = 0; i < removeSels.length; i++) {
    clone.querySelectorAll(removeSels[i]).forEach(function(el) { el.remove(); });
  }

  return {
    type: 'generic',
    title: doc.title || '',
    author: '',
    contentHTML: clone.innerHTML,
    url: window.location.href,
  };
}

// ============================================================
// 清理公众号无用元素
// ============================================================
function cleanWechatElements(container) {
  var removeSelectors = [
    '.rich_media_tool',
    '.wx_expand_article',
    '.rich_media_area_primary_top',
    '.rich_media_area_primary_foot',
    '.rich_media_area_extra',
    '#js_pc_qr_code',
    '#js_qrcode',
    '.qr_code_pc',
    '#js_article_comment',
    '#content_bottom_area',
    '#js_preview',
    '.rich_media_tool_primary',
    '#js_video_detail_info',
    '.video_iframe',
    'mpvoice',
    'mp-miniprogram',
    'mp-weapp',
    '.wx_qrcode',
    '.ct_mp_wxacode',
    '.rich_media_area_primary_left',
    '.rich_media_area_primary_right',
    '#js_aigc_tips',
    '.original_primary_setting',
    '#js_like_article_title',
    '.mp_profile',
    '#js_profile_qrcode',
    '.reward_area',
    '.like_btn_wr',
    '.read_more_wr',
    '.app_msg_card',
    '.app_msg_album_container',
    '.mp_audio',
    '.js_ad_area',
    '[data-type="ad"]',
    '.rich_media_extra',
    '#qr_code',
    '.qr_code',
    '.rich_media_card_container',
    '.rich_media_media_card',
    // 说说类文章的 UI 噪声
    '.wx_bottom_modal_wrp',
    '.reward_dialog',
    '.discuss_more_dialog_wrp',
    '.rich_media_meta_list',
    '.rich_media_meta_list_combine',
    '[role="dialog"]',
    '.teleporter',
    '.bottom_bar_wrp',
    '.rich_media_area_extra',
  ];

  for (var i = 0; i < removeSelectors.length; i++) {
    try {
      var els = container.querySelectorAll(removeSelectors[i]);
      for (var j = 0; j < els.length; j++) {
        els[j].remove();
      }
    } catch (e) {
      // 忽略无效选择器
    }
  }

  var displayNone = container.querySelectorAll('[style*="display: none"], [style*="display:none"]');
  for (var i = 0; i < displayNone.length; i++) {
    if (displayNone[i].tagName !== 'IMG') displayNone[i].remove();
  }

  var hidden = container.querySelectorAll('[hidden], [aria-hidden="true"]');
  for (var i = 0; i < hidden.length; i++) {
    hidden[i].remove();
  }
}

// ============================================================
// 图片处理
// ============================================================
function processWechatImages(container) {
  var imgs = container.querySelectorAll('img');
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    var src = img.getAttribute('data-src')
      || img.getAttribute('data-original')
      || img.getAttribute('src')
      || '';

    if (!src) {
      img.remove();
      continue;
    }

    var cleanUrl = cleanImageUrl(src);
    img.setAttribute('src', cleanUrl);
    img.removeAttribute('data-src');
    img.removeAttribute('data-original');
    img.removeAttribute('data-type');
    img.removeAttribute('data-ratio');
    img.removeAttribute('data-w');
    img.removeAttribute('class');
    img.removeAttribute('data-srcset');
    img.removeAttribute('srcset');
    img.removeAttribute('data-fail');
    img.removeAttribute('lazyload');

    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
  }
}

function cleanImageUrl(url) {
  try {
    var u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch (e) {
    return url.split('#')[0];
  }
}

// ============================================================
// 元信息提取
// ============================================================
function extractWechatMeta(doc) {
  var title = '';
  var titleSelectors = ['#activity-name', '#js_title', '#js_text_title', '.rich_media_title', 'meta[property="og:title"]'];
  for (var i = 0; i < titleSelectors.length; i++) {
    var el = doc.querySelector(titleSelectors[i]);
    if (el) {
      title = (el.content || el.textContent).trim();
      if (title) break;
    }
  }
  if (!title) title = doc.title;

  var author = '';
  var authorSelectors = ['#js_name', '.rich_media_meta_nickname', 'meta[property="article:author"]', '#js_author', '.profile_nickname'];
  for (var i = 0; i < authorSelectors.length; i++) {
    var el = doc.querySelector(authorSelectors[i]);
    if (el) {
      author = (el.content || el.textContent).trim();
      if (author) break;
    }
  }

  var publishTime = '';
  var timeSelectors = ['#publish_time', '#js_publish_time', 'meta[property="article:published_time"]', '.rich_media_meta_text'];
  for (var i = 0; i < timeSelectors.length; i++) {
    var el = doc.querySelector(timeSelectors[i]);
    if (el) {
      publishTime = (el.content || el.textContent).trim();
      if (publishTime) break;
    }
  }

  var coverImage = '';
  var coverSelectors = ['meta[property="og:image"]', '#js_content img[data-src]'];
  for (var i = 0; i < coverSelectors.length; i++) {
    var el = doc.querySelector(coverSelectors[i]);
    if (el) {
      coverImage = (el.content || el.getAttribute('data-src') || el.src || '').trim();
      if (coverImage) break;
    }
  }

  return { title: title, author: author, publishTime: publishTime, coverImage: coverImage };
}
