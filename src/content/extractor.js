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

// Notion API 支持的代码语言白名单（2026-03-11）
var NOTION_CODE_LANGUAGES = {
  'abap':1,'abc':1,'agda':1,'arduino':1,'ascii art':1,'assembly':1,'bash':1,'basic':1,'bnf':1,
  'c':1,'c#':1,'c++':1,'clojure':1,'coffeescript':1,'coq':1,'css':1,'dart':1,'dhall':1,'diff':1,
  'docker':1,'ebnf':1,'elixir':1,'elm':1,'erlang':1,'f#':1,'flow':1,'fortran':1,'gherkin':1,
  'glsl':1,'go':1,'graphql':1,'groovy':1,'haskell':1,'hcl':1,'html':1,'idris':1,'java':1,
  'javascript':1,'json':1,'julia':1,'kotlin':1,'latex':1,'less':1,'lisp':1,'livescript':1,
  'llvm ir':1,'lua':1,'makefile':1,'markdown':1,'markup':1,'matlab':1,'mathematica':1,'mermaid':1,
  'nix':1,'notion formula':1,'objective-c':1,'ocaml':1,'pascal':1,'perl':1,'php':1,'plain text':1,
  'powershell':1,'prolog':1,'protobuf':1,'purescript':1,'python':1,'r':1,'racket':1,'reason':1,
  'ruby':1,'rust':1,'sass':1,'scala':1,'scheme':1,'scss':1,'shell':1,'smalltalk':1,'solidity':1,
  'sql':1,'swift':1,'toml':1,'typescript':1,'vb.net':1,'verilog':1,'vhdl':1,'visual basic':1,
  'webassembly':1,'xml':1,'yaml':1,'java/c/c++/c#':1
};

// 常见非标准语言名映射到 Notion 支持的值
var CODE_LANG_ALIASES = {
  'text': 'plain text',
  'plain': 'plain text',
  'plaintext': 'plain text',
  'txt': 'plain text',
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'rb': 'ruby',
  'sh': 'shell',
  'zsh': 'shell',
  'yml': 'yaml',
  'md': 'markdown',
  'csharp': 'c#',
  'cplusplus': 'c++',
  'fsharp': 'f#',
  'objc': 'objective-c',
  'obj-c': 'objective-c',
  'vb': 'visual basic',
  'vba': 'visual basic',
  'asm': 'assembly',
  'wasm': 'webassembly',
};

function normalizeCodeLanguage(lang) {
  if (!lang) return 'plain text';
  var lower = lang.toLowerCase().trim();
  // 直接命中白名单
  if (NOTION_CODE_LANGUAGES[lower]) return lower;
  // 检查别名映射
  if (CODE_LANG_ALIASES[lower]) return CODE_LANG_ALIASES[lower];
  // 尝试常用变体
  if (NOTION_CODE_LANGUAGES[lower.replace(/script$/,'')]) return lower.replace(/script$/,'');
  // 都不匹配，回退 plain text
  return 'plain text';
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

function videoBlock(url) {
  return {
    type: 'video',
    video: {
      type: 'external',
      external: { url: url },
    },
  };
}

function embedBlock(url) {
  return {
    type: 'embed',
    embed: { url: url },
  };
}

function bookmarkBlock(url, title) {
  return {
    type: 'bookmark',
    bookmark: {
      url: url,
      caption: title ? [{ type: 'text', text: { content: title } }] : [],
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

  // 递归处理，保留嵌套链接并附加格式标注
  if (tag === 'strong' || tag === 'b') {
    var strongTexts = [];
    var sc = node.childNodes;
    for (var si = 0; si < sc.length; si++) {
      var parts = richTextFromNode(sc[si]);
      for (var sj = 0; sj < parts.length; sj++) {
        parts[sj].annotations = parts[sj].annotations || {};
        parts[sj].annotations.bold = true;
        strongTexts.push(parts[sj]);
      }
    }
    return strongTexts;
  }
  if (tag === 'em' || tag === 'i') {
    var emTexts = [];
    var ec = node.childNodes;
    for (var ei = 0; ei < ec.length; ei++) {
      var parts = richTextFromNode(ec[ei]);
      for (var ej = 0; ej < parts.length; ej++) {
        parts[ej].annotations = parts[ej].annotations || {};
        parts[ej].annotations.italic = true;
        emTexts.push(parts[ej]);
      }
    }
    return emTexts;
  }
  if (tag === 'del' || tag === 's' || tag === 'strike') {
    var delTexts = [];
    var dc = node.childNodes;
    for (var di = 0; di < dc.length; di++) {
      var parts = richTextFromNode(dc[di]);
      for (var dj = 0; dj < parts.length; dj++) {
        parts[dj].annotations = parts[dj].annotations || {};
        parts[dj].annotations.strikethrough = true;
        delTexts.push(parts[dj]);
      }
    }
    return delTexts;
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
    var level = Math.min(parseInt(tag[1]), 3); // Notion only supports h1-h3
    var headingImgs = el.querySelectorAll('img');
    for (var hi = 0; hi < headingImgs.length; hi++) {
      var hiSrc = headingImgs[hi].getAttribute('src') || headingImgs[hi].getAttribute('data-src') || headingImgs[hi].getAttribute('data-original') || '';
      if (hiSrc) blocks.push(imageBlock(hiSrc, ''));
    }
    var cloneH = el.cloneNode(true);
    var cloneHImgs = cloneH.querySelectorAll('img');
    for (var hj = 0; hj < cloneHImgs.length; hj++) cloneHImgs[hj].remove();
    var rt = richTextFromNode(cloneH);
    if (rt.length > 0) blocks.push(headingBlock(level, rt));
  }
  // 段落
  else if (tag === 'p') {
    processParagraph(el, blocks);
  }
  // 引用
  else if (tag === 'blockquote') {
    var bqImgs = el.querySelectorAll('img');
    for (var bi = 0; bi < bqImgs.length; bi++) {
      var bqSrc = bqImgs[bi].getAttribute('src') || bqImgs[bi].getAttribute('data-src') || bqImgs[bi].getAttribute('data-original') || '';
      if (bqSrc) blocks.push(imageBlock(resolveRelativeUrl(bqSrc), ''));
    }
    var bqClone = el.cloneNode(true);
    var bqCloneImgs = bqClone.querySelectorAll('img');
    for (var bj = 0; bj < bqCloneImgs.length; bj++) bqCloneImgs[bj].remove();
    var rtQ = richTextFromNode(bqClone);
    if (rtQ.length > 0) blocks.push(quoteBlock(rtQ));
  }
  // 无序列表
  else if (tag === 'ul') {
    var liChildren = el.children;
    for (var i = 0; i < liChildren.length; i++) {
      if (liChildren[i].tagName.toLowerCase() === 'li') {
        processListItem(liChildren[i], blocks, 'bulleted');
      }
    }
  }
  // 有序列表
  else if (tag === 'ol') {
    var liChildren2 = el.children;
    for (var i = 0; i < liChildren2.length; i++) {
      if (liChildren2[i].tagName.toLowerCase() === 'li') {
        processListItem(liChildren2[i], blocks, 'numbered');
      }
    }
  }
  // 代码块
  else if (tag === 'pre') {
    // 检测是否有 <code> 子元素
    var hasCodeChild = el.querySelector('code') !== null;
    // GitHub 等代码高亮：<pre> 直接包含 <span> + 文本节点，没有 <code> 包裹
    // 此时直接用 textContent 获取完整代码文本
    if (!hasCodeChild) {
      var rawText = el.textContent || '';
      if (rawText.trim().length > 0) {
        var lang2 = '';
        var langClass = el.className || '';
        var langMatch2 = langClass.match(/language-(\S+)/);
        if (langMatch2) lang2 = normalizeCodeLanguage(langMatch2[1]);
        blocks.push(codeBlock(rawText.trim(), lang2));
      }
    } else {
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
      lang = normalizeCodeLanguage(dataLang);
    } else {
      var codeEl2 = el.querySelector('code');
      if (codeEl2 && codeEl2.className) {
        var langMatch = codeEl2.className.match(/language-(\S+)/);
        if (langMatch) lang = normalizeCodeLanguage(langMatch[1]);
      }
    }

    if (codeText && codeText.trim().length > 0) {
      blocks.push(codeBlock(codeText.trim(), lang));
    }
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
    var src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('data-lazy-src') || '';
    var alt = el.getAttribute('alt') || el.getAttribute('data-caption') || '';
    if (src) blocks.push(imageBlock(resolveRelativeUrl(src), alt));
  }
  // 视频
  else if (tag === 'video') {
    var vSrc = el.getAttribute('src') || '';
    if (!vSrc || vSrc.indexOf('blob:') === 0) {
      var srcChildren = el.querySelectorAll('source');
      for (var vi = 0; vi < srcChildren.length; vi++) {
        var su = srcChildren[vi].getAttribute('src') || '';
        if (su && su.indexOf('blob:') !== 0) { vSrc = su; break; }
      }
    }
    if (vSrc && vSrc.indexOf('blob:') !== 0) {
      blocks.push(videoBlock(resolveRelativeUrl(vSrc)));
    }
    // blob URL 或无 src → 提取 poster 作为图片兜底
    if (!vSrc || vSrc.indexOf('blob:') === 0) {
      var poster = el.getAttribute('poster') || '';
      if (poster) {
        blocks.push(imageBlock(resolveRelativeUrl(poster), ''));
      }
    }
  }
  // 表格 → Notion table block
  else if (tag === 'table') {
    var tableBlock = extractTableAsNotionTable(el);
    if (tableBlock) blocks.push(tableBlock);
  }
  // 容器：递归深入处理子元素（含自定义元素/Web Components，标签名含 -）
  else if (['div', 'section', 'article', 'main', 'figure', 'figcaption', 'picture', 'header', 'footer', 'aside', 'nav', 'a'].indexOf(tag) !== -1 || tag.indexOf('-') !== -1) {
    domToBlocks(el, blocks);
  }
  // 纯文本容器（span、label 等内联元素包裹的文字）
  else if (['span', 'label', 'font'].indexOf(tag) !== -1) {
    var hasBlockChild = false;
    var children2 = el.children;
    for (var ci = 0; ci < children2.length; ci++) {
      var ct = children2[ci].tagName.toLowerCase();
      if (/^h[1-6]$/.test(ct) || ct === 'p' || ct === 'blockquote' || ct === 'ul' || ct === 'ol' || ct === 'pre' || ct === 'code' || ct === 'div' || ct === 'section' || ct === 'article' || ct === 'table' || ct === 'img' || ct === 'figure' || ct === 'picture' || ct.indexOf('-') !== -1) {
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
  // 未识别的元素：不丢弃，递归处理子节点（避免 <details>/<summary> 等元素内容丢失）
  else {
    domToBlocks(el, blocks);
  }
}

function processListItem(li, blocks, listType) {
  var liImgs = li.querySelectorAll('img');
  for (var i = 0; i < liImgs.length; i++) {
    var imgSrc = liImgs[i].getAttribute('src') || liImgs[i].getAttribute('data-src') || liImgs[i].getAttribute('data-original') || '';
    if (imgSrc) blocks.push(imageBlock(resolveRelativeUrl(imgSrc), ''));
  }
  var liClone = li.cloneNode(true);
  var cloneImgs = liClone.querySelectorAll('img');
  for (var j = 0; j < cloneImgs.length; j++) cloneImgs[j].remove();
  var rt = richTextFromNode(liClone);
  if (rt.length > 0) {
    blocks.push(listType === 'numbered' ? numberedListItemBlock(rt) : bulletedListItemBlock(rt));
  }
}

function processParagraph(el, blocks) {
  var imgs = el.querySelectorAll('img');
  var hasText = el.textContent.trim().length > 0;

  if (!hasText && imgs.length > 0) {
    for (var i = 0; i < imgs.length; i++) {
      var imgSrc = imgs[i].getAttribute('src') || imgs[i].getAttribute('data-src') || imgs[i].getAttribute('data-original') || '';
      var imgAlt = imgs[i].getAttribute('alt') || '';
      if (imgSrc) blocks.push(imageBlock(resolveRelativeUrl(imgSrc), imgAlt));
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
          pushParagraphChunks(blocks, rt);
        }
      }
    } else {
      var rt = richTextFromNode(el);
      if (rt.length > 0) {
        pushParagraphChunks(blocks, rt);
      }
    }
  }
}

// Notion API: paragraph.rich_text 最多 100 个元素，超过则分段
function pushParagraphChunks(blocks, rt) {
  if (rt.length <= 100) {
    blocks.push(paragraphBlock(rt));
    return;
  }
  for (var i = 0; i < rt.length; i += 100) {
    var chunk = rt.slice(i, Math.min(i + 100, rt.length));
    blocks.push(paragraphBlock(chunk));
  }
}

function extractTableAsNotionTable(table) {
  var trs = table.querySelectorAll('tr');
  if (trs.length === 0) return null;

  // 收集每一行的 rich text 数组（保留链接、加粗等格式）
  var rows = [];
  var hasHeader = false;
  for (var i = 0; i < trs.length; i++) {
    var tds = trs[i].querySelectorAll('td, th');
    if (tds.length === 0) continue;
    // 首行有 th 才认为有列头
    if (i === 0 && trs[i].querySelectorAll('th').length > 0) hasHeader = true;
    var cells = [];
    for (var j = 0; j < tds.length; j++) {
      var rt = richTextFromNode(tds[j]);
      if (rt.length === 0) {
        rt = [{ type: 'text', text: { content: '' } }];
      }
      cells.push(rt);
    }
    if (cells.length) rows.push(cells);
  }
  if (rows.length === 0) return null;

  var colCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length > colCount) colCount = rows[i].length;
  }
  if (colCount === 0) return null;

  var tableBlock = {
    type: 'table',
    table: {
      table_width: colCount,
      has_column_header: hasHeader,
      has_row_header: false
    }
  };

  var tableRows = [];
  for (var i = 0; i < rows.length; i++) {
    var cells = [];
    for (var j = 0; j < colCount; j++) {
      cells.push((rows[i] && rows[i][j]) ? rows[i][j] : [{ type: 'text', text: { content: '' } }]);
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
    console.log('[NotionSnap] Parser returned empty body for HTML length:', html.length);
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
function finalizeExtractedData(data) {
  console.log('[NotionSnap] Extract result:', data.error || 'OK', 'type:', data.type, 'title:', data.title, 'contentHTML length:', data.contentHTML ? data.contentHTML.length : 0);
  if (data.contentHTML && !data.error) {
    var blocks = [];
    domToBlocksFromHTML(data.contentHTML, blocks);

    if (blocks.length === 0 && data.contentHTML) {
      var plainText = extractPlainText(data.contentHTML);
      if (plainText && plainText.trim().length > 0) {
        console.log('[NotionSnap] DOM traversal returned 0 blocks, falling back to plain text');
        var chunkSize = 1500;
        for (var pi = 0; pi < plainText.length; pi += chunkSize) {
          blocks.push(paragraphBlock([{ type: 'text', text: { content: plainText.substring(pi, pi + chunkSize).trim() } }]));
        }
      }
    }

    // 防御性过滤 + 图片去重
    var blockTypes = {};
    for (var bi0 = 0; bi0 < blocks.length; bi0++) {
      var bt = blocks[bi0].type || 'unknown';
      blockTypes[bt] = (blockTypes[bt] || 0) + 1;
    }
    console.log('[NotionSnap] Block type summary:', JSON.stringify(blockTypes), 'total:', blocks.length);

    var seenUrls = {};
    var dedupedBlocks = [];
    var dedupedCount = 0;
    var invalidCount = 0;
    for (var bi = 0; bi < blocks.length; bi++) {
      var b = blocks[bi];
      // 跳过没有有效 type 的 block（Substack 自定义域名等异常 HTML 可能产生）
      if (!b || !b.type || typeof b.type !== 'string') {
        invalidCount++;
        console.log('[NotionSnap] Drop invalid block at index', bi, JSON.stringify(b).substring(0, 100));
        continue;
      }
      if (b.type === 'image' && b.image && b.image.external && b.image.external.url) {
        var imgUrl = b.image.external.url;
        if (seenUrls[imgUrl]) {
          dedupedCount++;
          continue;
        }
        if (!/^https?:\/\//i.test(imgUrl)) {
          invalidCount++;
          console.log('[NotionSnap] Drop image with invalid URL:', imgUrl.substring(0, 200));
          continue;
        }
        seenUrls[imgUrl] = true;
      }
      if (b.type === 'video' && b.video && b.video.external && b.video.external.url) {
        var vidUrl = b.video.external.url;
        if (!/^https?:\/\//i.test(vidUrl)) {
          invalidCount++;
          console.log('[NotionSnap] Drop video with invalid URL:', vidUrl.substring(0, 200));
          continue;
        }
      }
      dedupedBlocks.push(b);
    }
    if (invalidCount > 0) console.log('[NotionSnap] Dropped', invalidCount, 'invalid block(s)');
    if (dedupedCount > 0) console.log('[NotionSnap] Removed', dedupedCount, 'duplicate image(s)');
    blocks = dedupedBlocks;

    // 代码块拆分：Notion API 限制 code.rich_text[0].text.content.length ≤ 2000
    var splitBlocks = [];
    for (var ci = 0; ci < blocks.length; ci++) {
      var cb = blocks[ci];
      if (cb.type === 'code' && cb.code && cb.code.rich_text && cb.code.rich_text[0]) {
        var codeText = cb.code.rich_text[0].text.content || '';
        if (codeText.length > 2000) {
          var lang = cb.code.language || 'plain text';
          var pos = 0;
          while (pos < codeText.length) {
            // 在 2000 字符处尽量按换行切开
            var end = Math.min(pos + 2000, codeText.length);
            if (end < codeText.length) {
              var lastNewline = codeText.lastIndexOf('\n', end);
              if (lastNewline > pos && lastNewline > end - 200) {
                end = lastNewline;
              }
            }
            var chunk = codeText.substring(pos, end).trim();
            if (chunk) splitBlocks.push(codeBlock(chunk, lang));
            pos = end;
          }
          continue;
        }
      }
      splitBlocks.push(cb);
    }
    blocks = splitBlocks;

    // 视频嵌入：将文章内嵌视频 URL 作为 block 插入正文前
    if (data.videoEmbeds && data.videoEmbeds.length > 0) {
      console.log('[NotionSnap] Finalize: processing', data.videoEmbeds.length, 'video embeds:', data.videoEmbeds);
      var veBlocks = [dividerBlock()];
      for (var vei = 0; vei < data.videoEmbeds.length; vei++) {
        var ve = data.videoEmbeds[vei];
        var veUrl = ve.url;
        var veSource = ve.source || '';
        // YouTube/Bilibili/TikTok → embed block（Notion 前端可渲染嵌入式播放器）
        if (veUrl.indexOf('youtube.com') !== -1 || veUrl.indexOf('youtu.be') !== -1 || veUrl.indexOf('bilibili.com') !== -1 || veUrl.indexOf('tiktok.com') !== -1) {
          veBlocks.push(embedBlock(veUrl));
        } else {
          // 其他平台（微信视频号/小红书/Douyin/Twitter 等）→ 段落 + 可点击链接
          var label = '视频链接';
          if (veSource === 'wechat_video') label = '微信视频号';
          veBlocks.push(paragraphBlock([
            { type: 'text', text: { content: '[' + label + '] ', link: { url: veUrl } } }
          ]));
        }
      }
      veBlocks.push(dividerBlock());
      blocks = veBlocks.concat(blocks);
    }

    data.blocks = blocks;
    console.log('[NotionSnap] Extracted', blocks.length, 'blocks');
    if (blocks.length === 0) {
      console.log('[NotionSnap] HTML sample (first 500 chars):', data.contentHTML.substring(0, 500));
    }

    var bodyText = extractPlainText(data.contentHTML || '');
    var keywordText = (data.title || '') + ' ' + (bodyText || '');
    data.keywords = extractKeywords(keywordText, 5);
  }
  data._videoDebug = diagnoseVideoElements(document);
  data._videoEmbedsCount = data.videoEmbeds ? data.videoEmbeds.length : 0;
  return data;
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'extract') {
    // 知乎问答页：先展开所有折叠内容（React 异步渲染），再提取
    if (isZhihuQuestion()) {
      expandAllZhihuContent();
      setTimeout(function() {
        try {
          var data = extractContent();
          sendResponse(finalizeExtractedData(data));
        } catch (err) {
          console.error('[NotionSnap] Extract error:', err);
          sendResponse({ error: err.message, title: document.title });
        }
      }, 1000);
      return true;
    }

    try {
      var data = extractContent();
      sendResponse(finalizeExtractedData(data));
    } catch (err) {
      console.error('[NotionSnap] Extract error:', err);
      sendResponse({ error: err.message, title: document.title });
    }
  }
});

// ============================================================
// 中文关键词提取（N-gram 频率分析，零外部依赖）
// ============================================================
var CN_STOP_WORDS = {
  '的': true, '了': true, '在': true, '是': true, '我': true, '有': true, '和': true, '就': true,
  '不': true, '人': true, '都': true, '一': true, '上': true, '也': true, '很': true, '到': true,
  '说': true, '要': true, '去': true, '你': true, '会': true, '着': true, '看': true, '好': true,
  '自己': true, '这': true, '他': true, '她': true, '它': true, '们': true, '那': true, '些': true,
  '什么': true, '怎么': true, '如何': true, '可以': true, '这个': true, '那个': true, '还是': true,
  '只是': true, '但是': true, '因为': true, '所以': true, '如果': true, '虽然': true, '然后': true,
  '已经': true, '之后': true, '以后': true, '一样': true, '这样': true, '那样': true, '真的': true,
  '觉得': true, '知道': true, '应该': true, '可能': true, '不会': true, '不能': true, '不要': true,
  '一个': true, '一种': true, '很多': true, '一些': true, '每个': true, '所有': true, '不同': true,
  '通过': true, '非常': true, '比较': true, '大家': true, '现在': true, '以及': true, '其实': true,
  '对于': true, '关于': true, '进行': true, '需要': true, '出来': true, '起来': true, '就是': true,
  '不是': true, '还有': true, '之间': true, '没有': true, '时候': true, '我们': true, '他们': true,
  '你们': true, '她们': true, '能够': true, '什么': true, '怎么': true, '怎样': true
};

function extractKeywords(text, maxCount) {
  if (!text || text.trim().length < 10) return [];
  maxCount = maxCount || 5;

  // 清洗文本，只保留中文、英文、数字
  var cleaned = text.replace(/[^一-龥a-zA-Z0-9]/g, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (cleaned.length < 6) return [];

  // 提取 2-4 字 N-gram，统计频率
  var ngrams = {};
  for (var n = 4; n >= 2; n--) {
    for (var i = 0; i <= cleaned.length - n; i++) {
      var gram = cleaned.substring(i, i + n);
      if (gram.indexOf(' ') !== -1) continue;
      if (/^\d+$/.test(gram)) continue;
      if (gram.length <= 3 && /^[a-zA-Z]+$/.test(gram)) continue;
      ngrams[gram] = (ngrams[gram] || 0) + 1;
    }
  }

  // 过滤停用词和低频词
  var candidates = [];
  for (var gram in ngrams) {
    if (ngrams[gram] < 2) continue;
    if (CN_STOP_WORDS[gram]) continue;
    // 过滤包含停用词边界的片段（如 "的时候"、"了一"）
    var hasStopSubstr = false;
    if (gram.length <= 3) {
      for (var k = 0; k < gram.length; k++) {
        if (CN_STOP_WORDS[gram[k]]) { hasStopSubstr = true; break; }
      }
    }
    if (hasStopSubstr) continue;
    candidates.push({ word: gram, count: ngrams[gram] });
  }

  // 按频率降序
  candidates.sort(function(a, b) { return b.count - a.count; });

  // 去子串：长词包含短词时保留长词
  var filtered = [];
  for (var i = 0; i < candidates.length; i++) {
    var isSub = false;
    for (var j = 0; j < filtered.length; j++) {
      if (filtered[j].word.indexOf(candidates[i].word) !== -1) { isSub = true; break; }
    }
    if (!isSub) {
      filtered.push(candidates[i]);
      if (filtered.length >= maxCount * 3) break;
    }
  }

  return filtered.slice(0, maxCount).map(function(item) { return item.word; });
}

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

  // 知乎问答页面：提取问题 + 回答
  if (isZhihuQuestion()) {
    return parseZhihuQuestion(document);
  }

  // Twitter/X 推文页面
  if (isTwitterPage()) {
    return parseTwitterPage(document);
  }

  // GitHub 页面（README / Issue）
  if (isGitHubPage()) {
    return parseGitHubPage(document);
  }

  // 视频平台页面（YouTube / Bilibili / TikTok / Douyin）
  if (isVideoPlatformPage()) {
    return parseVideoPlatformPage(document);
  }

  // 通用网页
  return extractGenericContent(document);
}

function isWechatArticle() {
  return window.location.hostname === 'mp.weixin.qq.com'
    || document.querySelector('#js_content') !== null;
}

function isZhihuQuestion() {
  return /zhihu\.com\/question\//.test(window.location.href);
}

function isTwitterPage() {
  var h = window.location.hostname || '';
  return /^(x\.com|twitter\.com)$/.test(h);
}

function isGitHubPage() {
  return (window.location.hostname || '') === 'github.com';
}

// ============================================================
// 视频平台检测 & URL 解析
// ============================================================

// 视频平台域名匹配表
var VIDEO_PLATFORMS = {
  'youtube.com': {
    name: 'YouTube',
    // iframe embed → canonical page URL
    canonical: function(url) {
      var id = '';
      // youtube.com/embed/VIDEO_ID
      var m = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (m) id = m[1];
      if (id) return 'https://www.youtube.com/watch?v=' + id;
      return url;
    },
  },
  'youtu.be': {
    name: 'YouTube',
    canonical: function(url) {
      var m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (m) return 'https://www.youtube.com/watch?v=' + m[1];
      return url;
    },
  },
  'bilibili.com': {
    name: 'Bilibili',
    canonical: function(url) {
      // player.bilibili.com/player.html?bvid=xxx → video page
      var mBV = url.match(/bvid=([a-zA-Z0-9]+)/);
      if (mBV) return 'https://www.bilibili.com/video/' + mBV[1];
      var mAV = url.match(/aid=([0-9]+)/);
      if (mAV) return 'https://www.bilibili.com/video/av' + mAV[1];
      return url;
    },
  },
  'tiktok.com': {
    name: 'TikTok',
    canonical: function(url) {
      // tiktok.com/embed/v2/ID → canonical, but we don't have username
      var m = url.match(/\/embed\/v2\/([0-9]+)/);
      if (m) return 'https://www.tiktok.com/@unknown/video/' + m[1];
      return url;
    },
  },
  'douyin.com': {
    name: 'Douyin',
    canonical: function(url) {
      return url;
    },
  },
};

function getVideoPlatform(hostname) {
  for (var domain in VIDEO_PLATFORMS) {
    if (VIDEO_PLATFORMS.hasOwnProperty(domain) && hostname.indexOf(domain) !== -1) {
      return { domain: domain, info: VIDEO_PLATFORMS[domain] };
    }
  }
  return null;
}

function isVideoURL(href) {
  if (!href || typeof href !== 'string') return false;
  try {
    var u = new URL(href, window.location.origin);
    return getVideoPlatform(u.hostname) !== null;
  } catch (e) {
    return false;
  }
}

function canonicalVideoURL(href) {
  if (!href) return '';
  try {
    var u = new URL(href, window.location.origin);
    var plat = getVideoPlatform(u.hostname);
    if (plat) return plat.info.canonical(u.href);
  } catch (e) { /* ignore */ }
  return href;
}

function isVideoPlatformPage() {
  var h = window.location.hostname || '';
  return getVideoPlatform(h) !== null;
}

function parseVideoPlatformPage(doc) {
  var pageUrl = window.location.href;
  var canonicalUrl = canonicalVideoURL(pageUrl);
  var plat = getVideoPlatform(window.location.hostname);
  var platformName = plat ? plat.info.name : 'Video';

  // 提取元数据 — 优先 document.title（SPA 导航时 meta 标签可能过期）
  var title = (doc.title || '').trim();
  // 去掉平台后缀
  if (title.indexOf(' - YouTube') !== -1) {
    title = title.replace(/\s*-\s*YouTube\s*$/, '');
  } else if (title.indexOf(' - Bilibili') !== -1) {
    title = title.replace(/\s*-\s*Bilibili\s*$/, '');
  } else if (title.indexOf('_哔哩哔哩_bilibili') !== -1) {
    title = title.replace(/\s*_哔哩哔哩_bilibili\s*$/, '');
  }
  if (!title) {
    var ogTitle = doc.querySelector('meta[property="og:title"]');
    if (ogTitle) title = (ogTitle.content || '').trim();
  }

  var author = '';
  // YouTube
  var authorLink = doc.querySelector('link[itemprop="name"]') || doc.querySelector('meta[name="author"]');
  if (authorLink) author = (authorLink.content || authorLink.textContent || '').trim();
  // Bilibili: og:description 中可能包含 UP 主信息
  if (!author) {
    var ogDesc = doc.querySelector('meta[property="og:description"]');
    if (ogDesc && platformName === 'Bilibili') {
      var desc = (ogDesc.content || '');
      var upMatch = desc.match(/UP主[：:]\s*([^,，;；\n]+)/);
      if (upMatch) author = upMatch[1].trim();
    }
  }

  var description = '';
  var metaDesc = doc.querySelector('meta[property="og:description"]') || doc.querySelector('meta[name="description"]');
  if (metaDesc) description = (metaDesc.content || '').trim().substring(0, 300);

  var coverImage = '';
  // YouTube: 直接从页面 URL 提取 video ID 构造缩略图（绕过 SPA meta 过期问题）
  if (platformName === 'YouTube') {
    var ytId = '';
    var ytMatch = pageUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (ytMatch) ytId = ytMatch[1];
    if (!ytId) { var shortMatch = pageUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/); if (shortMatch) ytId = shortMatch[1]; }
    if (!ytId) { var embedMatch = pageUrl.match(/\/embed\/([a-zA-Z0-9_-]{11})/); if (embedMatch) ytId = embedMatch[1]; }
    if (ytId) coverImage = 'https://img.youtube.com/vi/' + ytId + '/maxresdefault.jpg';
  }
  if (!coverImage) {
    var linkImg = doc.querySelector('link[rel="image_src"]');
    if (linkImg) coverImage = (linkImg.getAttribute('href') || '').trim();
  }
  if (!coverImage) {
    var ogImg = doc.querySelector('meta[property="og:image"]');
    if (ogImg) coverImage = (ogImg.content || '').trim();
  }

  // 构建 blocks
  var blocks = [];

  // Douyin 禁止 iframe 嵌入 → 使用 bookmark 兜底
  if (window.location.hostname.indexOf('douyin.com') !== -1) {
    blocks.push(bookmarkBlock(canonicalUrl, title));
  } else {
    blocks.push(embedBlock(canonicalUrl));
  }

  // 标题
  if (title) {
    blocks.push(headingBlock(2, [{ type: 'text', text: { content: title } }]));
  }

  // 作者 + 平台
  var metaLine = '';
  if (author) metaLine += author;
  if (platformName) metaLine += (metaLine ? ' · ' : '') + platformName;
  if (metaLine) {
    blocks.push(paragraphBlock([{ type: 'text', text: { content: metaLine } }]));
  }

  // 简介
  if (description) {
    blocks.push(paragraphBlock([{ type: 'text', text: { content: description } }]));
  }

  // 封面图
  if (coverImage) {
    blocks.push(imageBlock(resolveRelativeUrl(coverImage), ''));
  }

  // 分隔线
  blocks.push(dividerBlock());

  return {
    type: 'video_page',
    title: title,
    author: author,
    url: canonicalUrl,
    platform: platformName,
    coverImage: coverImage,
    description: description,
    blocks: blocks,
  };
}

// 扫描容器中的视频 iframe 和链接，返回 embed URL 列表
// 从小红书页面提取视频 note 的 media URL
// CSP 阻止内联脚本注入，直接从页面 HTML 搜索 XHS CDN 视频 URL 模式
function extractXhsVideoUrl() {
  try {
    var html = document.documentElement.innerHTML || '';

    // 方法1：搜索所有 .xhscdn.com CDN URL（覆盖 sns-video-v2 / sns-video-qc / sns-video-hw 等变体）
    var cdnMatch = html.match(/https?:\/\/[^.\s"'<>]*\.xhscdn\.com\/[^"\s<>]+/i);
    if (cdnMatch) {
      var url = cdnMatch[0].replace(/&amp;/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (url && url.indexOf('.xhscdn.com/') !== -1 && url.length > 40) {
        console.log('[NotionSnap] extractXhsVideoUrl: found CDN URL in HTML source:', url.substring(0, 80));
        return url;
      }
    }
    // 方法2：搜索 masterUrl / videoUrl / playUrl 等 JSON key（服务端渲染的 __INITIAL_STATE__ 或内联 script）
    var keyPatterns = [
      /"masterUrl"\s*:\s*"(https?:\/\/[^"]+)"/i,
      /"videoUrl"\s*:\s*"(https?:\/\/[^"]+)"/i,
      /"playUrl"\s*:\s*"(https?:\/\/[^"]+)"/i,
      /"streamUrl"\s*:\s*"(https?:\/\/[^"]+)"/i,
      /"h264"\s*:\s*\[\s*\{[^}]*"masterUrl"\s*:\s*"(https?:\/\/[^"]+)"/i,
    ];
    for (var kp = 0; kp < keyPatterns.length; kp++) {
      var kpMatch = html.match(keyPatterns[kp]);
      if (kpMatch) {
        var kpUrl = kpMatch[1].replace(/&amp;/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
        if (kpUrl && kpUrl.length > 40) {
          console.log('[NotionSnap] extractXhsVideoUrl: found via key pattern', kp, ':', kpUrl.substring(0, 80));
          return kpUrl;
        }
      }
    }
    // 方法3：从内联 <script> 中提取
    var scripts = document.querySelectorAll('script:not([src])');
    for (var si = 0; si < scripts.length; si++) {
      var text = scripts[si].textContent || '';
      var sMatch = text.match(/https?:\/\/[^.\s"'<>]*\.xhscdn\.com\/[^"\s<>]+/i);
      if (sMatch) {
        var sUrl = sMatch[0].replace(/&amp;/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
        if (sUrl && sUrl.length > 40) {
          console.log('[NotionSnap] extractXhsVideoUrl: found CDN URL in script tag:', sUrl.substring(0, 80));
          return sUrl;
        }
      }
    }
    // 方法4：尝试通过 window 访问（隔离环境可能不可用）
    try {
      var initState = window.__INITIAL_STATE__;
      if (initState && initState.note && initState.note.noteDetailMap) {
        var noteMap = initState.note.noteDetailMap;
        var noteKeys = Object.keys(noteMap);
        for (var nk = 0; nk < noteKeys.length; nk++) {
          var noteData = noteMap[noteKeys[nk]] && noteMap[noteKeys[nk]].note;
          if (!noteData || noteData.type !== 'video') continue;
          var videoData = noteData.video;
          if (!videoData || !videoData.media || !videoData.media.stream) continue;
          var stream = videoData.media.stream;
          var candidates = stream.h264 || stream.h265 || stream.h266 || [];
          for (var ci = 0; ci < candidates.length; ci++) {
            var vUrl = candidates[ci].masterUrl || candidates[ci].url || '';
            if (vUrl) { console.log('[NotionSnap] extractXhsVideoUrl: found via window access'); return vUrl; }
          }
        }
      }
    } catch(e) {}
    console.log('[NotionSnap] extractXhsVideoUrl: no video URL found — note type may not be video, or URL not in HTML source');
  } catch(e) { console.log('[NotionSnap] extractXhsVideoUrl: ERROR', e.message); }
  return null;
}

function collectVideoEmbeds(container) {
  if (!container) return [];
  var results = [];
  var seen = {};

  // 1. 扫描 <iframe> 标签
  var iframes = container.querySelectorAll('iframe');
  var step1Count = 0;
  for (var fi = 0; fi < iframes.length; fi++) {
    var src = iframes[fi].getAttribute('src') || iframes[fi].getAttribute('data-src') || '';
    if (!src) continue;
    try {
      var canonical = canonicalVideoURL(src);
      if (canonical && canonical !== src && !seen[canonical]) {
        seen[canonical] = true;
        results.push({ url: canonical, source: 'iframe', originalUrl: src });
        step1Count++;
      }
    } catch (e) { /* ignore */ }
  }

  // 2. 扫描 <a> 标签中的视频平台链接（作为补充，不替代 iframe 检测）
  var links = container.querySelectorAll('a[href]');
  var step2Count = 0;
  for (var li = 0; li < links.length; li++) {
    var href = links[li].getAttribute('href') || '';
    if (!href || seen[href]) continue;
    try {
      var resolved = new URL(href, window.location.origin).href;
      if (isVideoURL(resolved)) {
        var canonical = canonicalVideoURL(resolved);
        if (canonical && !seen[canonical]) {
          seen[canonical] = true;
          results.push({ url: canonical, source: 'link', originalUrl: href });
          step2Count++;
        }
      }
    } catch (e) { /* ignore */ }
  }

  // 3. 微信公众号视频号检测：<mp-common-videosnap> 自定义元素
  var videoSnaps = container.querySelectorAll('mp-common-videosnap');
  var step3Count = 0;
  for (var vs = 0; vs < videoSnaps.length; vs++) {
    var snapEl = videoSnaps[vs];
    var snapUrl = '';
    try { snapUrl = snapEl.url || ''; } catch(e) {}
    if (!snapUrl) snapUrl = snapEl.getAttribute('url') || snapEl.getAttribute('data-url') || '';
    if (!snapUrl) {
      var snapRoot = snapEl.shadowRoot;
      var snapSearchRoot = snapRoot || snapEl;
      var snapIframes = snapSearchRoot.querySelectorAll('iframe');
      for (var si = 0; si < snapIframes.length; si++) {
        var siSrc = snapIframes[si].getAttribute('src') || '';
        if (siSrc) { snapUrl = siSrc; break; }
      }
      if (!snapUrl) {
        var snapLinks = snapSearchRoot.querySelectorAll('a[href]');
        for (var sl = 0; sl < snapLinks.length; sl++) {
          var slHref = snapLinks[sl].getAttribute('href') || '';
          if (slHref && isVideoURL(slHref)) {
            snapUrl = slHref;
            break;
          }
        }
      }
    }
    if (snapUrl && !seen[snapUrl]) {
      seen[snapUrl] = true;
      results.push({ url: snapUrl, source: 'wechat_video', originalUrl: snapUrl });
      step3Count++;
    }
  }

  // 4. xgplayer / 小红书等自定义视频播放器检测
  var xgPlayers = container.querySelectorAll('.xgplayer, [class*="xgplayer"], .video-player-media, .player-container');
  var step4Count = 0;
  for (var xp = 0; xp < xgPlayers.length; xp++) {
    var xgEl = xgPlayers[xp];
    var xgUrl = '';
    try { xgUrl = xgEl.url || xgEl.src || xgEl.videoUrl || ''; } catch(e) {}
    if (!xgUrl) xgUrl = xgEl.getAttribute('data-url') || xgEl.getAttribute('data-src') || xgEl.getAttribute('url') || '';
    if (xgUrl && !seen[xgUrl] && isVideoURL(xgUrl)) {
      seen[xgUrl] = true;
      results.push({ url: canonicalVideoURL(xgUrl), source: 'xgplayer', originalUrl: xgUrl });
      step4Count++;
      continue;
    }
    var xgSearchRoot = xgEl.shadowRoot || xgEl;
    var xgVideos = xgSearchRoot.querySelectorAll('video');
    for (var xv = 0; xv < xgVideos.length; xv++) {
      var xvSrc = xgVideos[xv].getAttribute('src') || '';
      try { if (!xvSrc) xvSrc = xgVideos[xv].currentSrc || ''; } catch(e) {}
      if (xvSrc && xvSrc.indexOf('blob:') !== 0 && !seen[xvSrc]) {
        seen[xvSrc] = true;
        results.push({ url: xvSrc, source: 'xgplayer_video', originalUrl: xvSrc });
        step4Count++;
      }
    }
    var xgSources = xgSearchRoot.querySelectorAll('source[src]');
    for (var xs = 0; xs < xgSources.length; xs++) {
      var xgSrc = xgSources[xs].getAttribute('src') || '';
      if (xgSrc && xgSrc.indexOf('blob:') !== 0 && !seen[xgSrc]) {
        seen[xgSrc] = true;
        results.push({ url: xgSrc, source: 'xgplayer_source', originalUrl: xgSrc });
        step4Count++;
      }
    }
    var xgIframes = xgSearchRoot.querySelectorAll('iframe[src]');
    for (var xi = 0; xi < xgIframes.length; xi++) {
      var xgIframeSrc = xgIframes[xi].getAttribute('src') || '';
      if (xgIframeSrc && !seen[xgIframeSrc]) {
        var xgCanonical = canonicalVideoURL(xgIframeSrc);
        if (xgCanonical) {
          seen[xgCanonical] = true;
          results.push({ url: xgCanonical, source: 'xgplayer_iframe', originalUrl: xgIframeSrc });
          step4Count++;
        }
      }
    }
  }

  // 5. 扫描普通 <video> 元素（不在 xgplayer 容器内的，如微信公众号视频播放器）
  var allVideos = container.querySelectorAll('video');
  var step5Count = 0;
  for (var avi = 0; avi < allVideos.length; avi++) {
    var avEl = allVideos[avi];
    var avSrc = avEl.getAttribute('src') || '';
    if (!avSrc) {
      try { avSrc = avEl.currentSrc || ''; } catch(e) {}
    }
    if (avSrc && avSrc.indexOf('blob:') !== 0 && !seen[avSrc]) {
      seen[avSrc] = true;
      results.push({ url: avSrc, source: 'video_element', originalUrl: avSrc });
      step5Count++;
    }
    // 检查 <source> 子元素
    if (!avSrc || avSrc.indexOf('blob:') === 0) {
      var avSources = avEl.querySelectorAll('source[src]');
      for (var avs = 0; avs < avSources.length; avs++) {
        var avsSrc = avSources[avs].getAttribute('src') || '';
        if (avsSrc && avsSrc.indexOf('blob:') !== 0 && !seen[avsSrc]) {
          seen[avsSrc] = true;
          results.push({ url: avsSrc, source: 'video_source', originalUrl: avsSrc });
          step5Count++;
        }
      }
    }
  }

  console.log('[NotionSnap] collectVideoEmbeds: step1(iframe)=', step1Count, 'step2(link)=', step2Count, 'step3(wechat)=', step3Count, 'step4(xgplayer)=', step4Count, 'step5(video)=', step5Count, 'total=', results.length);
  return results;
}

// 诊断：扫描页面所有视频相关元素，返回字符串摘要（注入到提取结果，在 SW 日志可见）
function diagnoseVideoElements(doc) {
  var d = doc || document;
  var info = [];
  info.push('videos=' + d.querySelectorAll('video').length);
  info.push('iframes=' + d.querySelectorAll('iframe').length);
  info.push('mp-videosnap=' + d.querySelectorAll('mp-common-videosnap').length);
  info.push('xgplayer=' + d.querySelectorAll('.xgplayer, [class*="xgplayer"]').length);
  info.push('video-player=' + d.querySelectorAll('.video-player-media, .player-container').length);
  info.push('tweet-video=' + d.querySelectorAll('[data-testid="videoComponent"], [data-testid="videoPlayer"]').length);
  // 检查 iframe 是否有视频平台 URL
  var iframes = d.querySelectorAll('iframe[src]');
  var vidIframes = [];
  for (var di = 0; di < iframes.length; di++) {
    var difSrc = iframes[di].getAttribute('src') || '';
    if (difSrc && isVideoURL(difSrc)) vidIframes.push(difSrc.substring(0, 80));
  }
  if (vidIframes.length > 0) info.push('vid-iframes=' + vidIframes.join('|'));
  return info.join('; ');
}

// 知乎问答页：仅展开问题描述和回答中的折叠内容，不触发页面其他按钮
function expandAllZhihuContent() {
  var clickedCount = 0;

  // 1. 问题描述展开按钮：.QuestionRichText-more（知乎标准 class）
  var qMoreBtns = document.querySelectorAll('.QuestionRichText-more');
  for (var qi = 0; qi < qMoreBtns.length; qi++) {
    try { qMoreBtns[qi].click(); clickedCount++; } catch (e) {}
  }

  // 2. 回答展开按钮：.ContentItem-expandButton（知乎标准 class）
  var aExpandBtns = document.querySelectorAll('.ContentItem-expandButton');
  for (var ai = 0; ai < aExpandBtns.length; ai++) {
    try { aExpandBtns[ai].click(); clickedCount++; } catch (e) {}
  }

  // 3. 移除所有内容区域内的折叠状态（.is-collapsed）
  var collapsedEls = document.querySelectorAll('.RichContent.is-collapsed, .QuestionRichText--collapsed');
  for (var ci = 0; ci < collapsedEls.length; ci++) {
    collapsedEls[ci].classList.remove('is-collapsed');
  }

  // 4. 只在回答/问题描述区域内解除 max-height 限制
  var contentZones = document.querySelectorAll('.RichContent, .RichContent-inner, .QuestionRichText');
  for (var zi = 0; zi < contentZones.length; zi++) {
    var zone = contentZones[zi];
    zone.style.maxHeight = 'none';
    zone.style.overflow = 'visible';
    var restricted = zone.querySelectorAll('[style*="max-height"]');
    for (var ri = 0; ri < restricted.length; ri++) {
      var el = restricted[ri];
      if (el.style.maxHeight && el.style.maxHeight !== 'none') {
        el.style.maxHeight = 'none';
        el.style.overflow = 'visible';
      }
    }
  }

  console.log('[NotionSnap] ExpandAllZhihuContent: ' + clickedCount + ' buttons clicked');
}

// ============================================================
// 知乎问答专用解析
// ============================================================
function parseZhihuQuestion(doc) {
  var questionTitle = doc.querySelector('.QuestionHeader-title');
  var container = doc.createElement('div');

  // 标题
  if (questionTitle) {
    var h1 = doc.createElement('h1');
    h1.textContent = questionTitle.textContent.trim();
    container.appendChild(h1);
  }

  // 问题描述：直接取 .RichText.ztext（跳过 span#content 包装层）
  var questionRichText = doc.querySelector('.QuestionRichText .RichText.ztext')
    || doc.querySelector('.QuestionHeader-detail .RichText.ztext')
    || doc.querySelector('.QuestionRichText');
  if (questionRichText && questionRichText.textContent.trim().length > 5) {
    var qClone = questionRichText.cloneNode(true);
    container.appendChild(qClone);
    var hr = doc.createElement('hr');
    container.appendChild(hr);
  }

  // 提取前 5 条有效回答
  // 优先用 .ContentItem.AnswerItem（覆盖"高分问答"独立容器 + "更多问答"列表）
  // 回退到 .List-item（旧版知乎或无 AnswerItem class 的页面）
  var answerItems = doc.querySelectorAll('.ContentItem.AnswerItem');
  if (!answerItems || answerItems.length === 0) {
    answerItems = doc.querySelectorAll('.List-item');
    console.log('[NotionSnap] ZhihuQuestion: using List-item fallback, found ' + (answerItems ? answerItems.length : 0));
  }

  var maxAnswers = 5;
  var collectedCount = 0;
  for (var a = 0; a < answerItems.length && collectedCount < maxAnswers; a++) {
    var item = answerItems[a];

    // 跳过推广/广告内容
    var adMarkers = item.querySelectorAll('.AdvertImg, [class*="advert"], [class*="sponsor"], [class*="commerce"]');
    if (adMarkers.length > 0) {
      console.log('[NotionSnap] Skip answer[' + a + ']: ad/promotion');
      continue;
    }

    // 直接取 .RichText.ztext（含实际块元素：p、figure、table、h2 等）
    // 跳过 .RichContent-inner > .css-376mun > span#content 包装层
    var richText = item.querySelector('.RichContent .RichText.ztext')
      || item.querySelector('.RichContent-inner .RichText.ztext')
      || item.querySelector('.RichText.ztext')
      || item.querySelector('.RichContent-inner');

    if (!richText) {
      console.log('[NotionSnap] Skip answer[' + a + ']: no RichText found');
      continue;
    }

    var fullText = richText.textContent || '';
    if (fullText.trim().length < 10) {
      console.log('[NotionSnap] Skip answer[' + a + ']: text too short (' + fullText.trim().length + ' chars)');
      continue;
    }

    // 展开后直接 clone 完整 DOM 树
    var answerClone = richText.cloneNode(true);

    // 清理知乎特有噪声元素（在 clone 内部操作）
    cleanZhihuAnswerNoise(answerClone);

    container.appendChild(answerClone);

    collectedCount++;

    if (collectedCount < maxAnswers && a < answerItems.length - 1) {
      var divider = doc.createElement('hr');
      container.appendChild(divider);
    }
  }
  console.log('[NotionSnap] ZhihuQuestion: collected ' + collectedCount + ' answers from ' + answerItems.length + ' candidates');

  // 知乎图片预处理：处理 SSR noscript fallback + React lazy 图片
  processZhihuImages(container, doc);

  // 通用图片预处理：lazy-load → src，相对路径 → 绝对路径
  processGenericImages(container);

  var blocks = [];
  domToBlocks(container, blocks);

  var meta = extractGenericMeta(doc);
  var bodyText = container.textContent || '';
  var wordCount = bodyText ? bodyText.length : 0;

  return {
    type: 'zhihu_question',
    title: questionTitle ? questionTitle.textContent.trim() : (doc.title || ''),
    author: meta.author,
    publishTime: meta.publishTime,
    coverImage: meta.coverImage,
    description: meta.description,
    siteName: '知乎',
    language: meta.language,
    wordCount: wordCount,
    blocks: blocks,
    contentHTML: container.innerHTML,
    url: window.location.href,
  };
}

// 知乎回答内容中的噪声清理
function cleanZhihuAnswerNoise(el) {
  // 移除链接卡片（通常不包含在正文提取中）
  var linkCards = el.querySelectorAll('.RichText-LinkCardContainer');
  for (var i = 0; i < linkCards.length; i++) linkCards[i].remove();

  // 移除内容末尾的"发布于 XXXX"著作权信息（知乎在 RichText 末尾插入）
  var copyrightDivs = el.querySelectorAll('.CopyrightRichText');
  for (var j = 0; j < copyrightDivs.length; j++) copyrightDivs[j].remove();

  // 移除内容末尾的编辑器/转载声明
  var btzDivs = el.querySelectorAll('[class*="RichText"] [class*="copyright"]');
  for (var k = 0; k < btzDivs.length; k++) btzDivs[k].remove();
}

// 知乎图片专用处理：noscript SSR fallback → 替换为真实 img
function processZhihuImages(container, doc) {
  // 1. 处理 <noscript> 中的 SSR 渲染图片 → 创建真实 img，删除 noscript
  var noscripts = container.querySelectorAll('noscript');
  for (var ns = 0; ns < noscripts.length; ns++) {
    var nsHTML = noscripts[ns].textContent || '';
    if (nsHTML.indexOf('<img') !== -1) {
      var tmpDiv = doc.createElement('div');
      tmpDiv.innerHTML = nsHTML;
      var nsImgs = tmpDiv.querySelectorAll('img');
      for (var ni = 0; ni < nsImgs.length; ni++) {
        var nsImg = nsImgs[ni];
        // 优先取 data-original（无印全尺寸），其次 src（带水印缩略图）
        var realSrc = nsImg.getAttribute('data-original') || nsImg.getAttribute('src') || '';
        if (realSrc && !/^data:image\/svg/i.test(realSrc)) {
          var newImg = doc.createElement('img');
          newImg.setAttribute('src', realSrc);
          noscripts[ns].parentNode.insertBefore(newImg, noscripts[ns]);
        }
      }
    }
    noscripts[ns].remove();
  }

  // 2. 删除 .RichText-ConditionalImagePortal（内含 lazy React img，noscript 已提供等效 img，避免重复）
  var portals = container.querySelectorAll('.RichText-ConditionalImagePortal');
  for (var pi = 0; pi < portals.length; pi++) {
    portals[pi].remove();
  }

  // 3. 处理剩余 React lazy 图片：跳过 SVG placeholder，确保 data-original/data-actualsrc 可被 processGenericImages 处理
  var lazyImgs = container.querySelectorAll('img.lazy, img[data-actualsrc]');
  for (var li = 0; li < lazyImgs.length; li++) {
    var img = lazyImgs[li];
    var curSrc = img.getAttribute('src') || '';
    if (curSrc.indexOf('data:image/svg') === 0 || curSrc.indexOf('data:image/svg+xml') === 0) {
      img.removeAttribute('src');
    }
  }
}

// ============================================================
// Twitter/X 专用解析
// ============================================================
function parseTwitterPage(doc) {
  console.log('[NotionSnap] parseTwitterPage: starting');
  var primaryColumn = doc.querySelector('div[data-testid="primaryColumn"]');
  var searchArea = primaryColumn || doc;
  var tweets = searchArea.querySelectorAll('article[data-testid="tweet"]');
  console.log('[NotionSnap] parseTwitterPage: found', tweets.length, 'tweet articles');
  var container = doc.createElement('div');
  var videoTweetUrls = [];

  var title = '';
  var author = '';
  var publishTime = '';
  var tweetCount = 0;

  for (var t = 0; t < tweets.length; t++) {
    var tweet = tweets[t];

    // 提取推文文本
    var tweetTextEl = tweet.querySelector('[data-testid="tweetText"]');
    if (!tweetTextEl) continue;

    var textClone = tweetTextEl.cloneNode(true);

    // 移除第三方翻译注入的 overlay 元素
    var transOverlays = textClone.querySelectorAll('[data-immersive-translate], [data-translate], .js_translate');
    for (var ti = 0; ti < transOverlays.length; ti++) transOverlays[ti].remove();

    var textContent = (textClone.textContent || '').trim();
    if (textContent.length < 2) continue;

    tweetCount++;

    // 第一条推文提取元数据
    if (t === 0) {
      var userNameEl = tweet.querySelector('[data-testid="User-Name"]');
      if (userNameEl) {
        var nameSpans = userNameEl.querySelectorAll('span');
        for (var ns = 0; ns < nameSpans.length; ns++) {
          var spanText = (nameSpans[ns].textContent || '').trim();
          if (spanText && spanText.indexOf('@') !== 0) {
            author = spanText;
            break;
          }
        }
      }

      var timeEl = tweet.querySelector('time[datetime]');
      if (timeEl) publishTime = timeEl.getAttribute('datetime') || '';

      title = textContent.substring(0, 80);
      if (textContent.length > 80) title += '...';
    }

    // 推文文本 → 段落
    var p = doc.createElement('p');
    p.innerHTML = textClone.innerHTML;
    container.appendChild(p);

    // 推文图片
    var tweetPhotos = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
    for (var pi = 0; pi < tweetPhotos.length; pi++) {
      var src = tweetPhotos[pi].getAttribute('src') || '';
      if (src && !/^data:image\/svg/i.test(src)) {
        var img = doc.createElement('img');
        img.setAttribute('src', src);
        container.appendChild(img);
      }
    }

    // 推文视频 — 直接检测 <video> 元素（不依赖 data-testid）
    var videoEls = tweet.querySelectorAll('video');
    console.log('[NotionSnap] parseTwitterPage: tweet #', t, 'has', videoEls.length, 'video elements');
    var hasVideo = videoEls.length > 0;
    var vSrc = '';
    if (hasVideo) {
      for (var vi = 0; vi < videoEls.length; vi++) {
        vSrc = videoEls[vi].getAttribute('src') || '';
        if (!vSrc) {
          try { vSrc = videoEls[vi].currentSrc || ''; } catch(e) {}
        }
        console.log('[NotionSnap] parseTwitterPage: video #', vi, 'src:', (vSrc || '(none)').substring(0, 100));
        if (vSrc && vSrc.indexOf('blob:') !== 0) break;
      }
    }
    // 备用：使用旧 data-testid 选择器
    if (!hasVideo) {
      var legacyVideo = tweet.querySelector('[data-testid="videoComponent"], [data-testid="videoPlayer"]');
      if (legacyVideo) {
        hasVideo = true;
        var legacyVideos = legacyVideo.querySelectorAll('video');
        for (var lv = 0; lv < legacyVideos.length; lv++) {
          vSrc = legacyVideos[lv].getAttribute('src') || '';
          if (!vSrc) { try { vSrc = legacyVideos[lv].currentSrc || ''; } catch(e) {} }
          if (vSrc && vSrc.indexOf('blob:') !== 0) break;
        }
        console.log('[NotionSnap] parseTwitterPage: found video via legacy selector, src:', (vSrc || '(none)').substring(0, 100));
      }
    }
    if (vSrc && vSrc.indexOf('blob:') !== 0) {
      var vid = doc.createElement('video');
      vid.setAttribute('src', vSrc);
      container.appendChild(vid);
      console.log('[NotionSnap] parseTwitterPage: added video block with src');
    } else if (hasVideo) {
      // blob URL 或无法获取 → 收集推文链接，后续用 bookmark
      var tweetLink = tweet.querySelector('a[href*="/status/"]');
      console.log('[NotionSnap] parseTwitterPage: blob video, tweet link found:', !!tweetLink);
      if (tweetLink) {
        var tUrl = tweetLink.getAttribute('href') || '';
        if (tUrl && tUrl.indexOf('/') === 0) {
          tUrl = 'https://x.com' + tUrl;
        }
        console.log('[NotionSnap] parseTwitterPage: tweet URL:', tUrl);
        if (tUrl && videoTweetUrls.indexOf(tUrl) === -1) {
          videoTweetUrls.push(tUrl);
        }
      }
      var tva = doc.createElement('p');
      var tvaSpan = doc.createElement('span');
      tvaSpan.textContent = '[视频推文]';
      tvaSpan.setAttribute('style', 'color: #0066ff; font-weight: bold');
      tva.appendChild(tvaSpan);
      container.appendChild(tva);
    }

    // 推文间 divider
    if (t < tweets.length - 1) {
      var hr = doc.createElement('hr');
      container.appendChild(hr);
    }
  }

  // 没有找到推文 → 回退到 primaryColumn 全文提取
  if (tweetCount === 0) {
    var fbSource = primaryColumn || doc.body;
    var fbClone = fbSource.cloneNode(true);
    var noiseSels = [
      '[data-testid="sidebarColumn"]', '[data-testid="BottomBar"]',
      '[data-testid="GrokDrawer"]', '[data-testid^="AppTabBar_"]',
      '[data-testid="SideNav_NewTweet_Button"]', '[data-testid="SideNav_AccountSwitcher_Button"]',
      '[aria-label="Trending"]', '[aria-label="Relevant people"]',
      '[data-testid="premium-signup-tab"]', '[data-testid="UserCell"]',
    ];
    for (var nsi = 0; nsi < noiseSels.length; nsi++) {
      var noiseEls = fbClone.querySelectorAll(noiseSels[nsi]);
      for (var nj = 0; nj < noiseEls.length; nj++) noiseEls[nj].remove();
    }
    container = fbClone;
  }

  processGenericImages(container);

  var blocks = [];
  domToBlocks(container, blocks);

  var meta = extractGenericMeta(doc);
  var bodyText = container.textContent || '';

  return {
    type: 'twitter_thread',
    title: title || meta.title || doc.title || '',
    author: author || meta.author || '',
    publishTime: publishTime || meta.publishTime || '',
    coverImage: meta.coverImage,
    description: meta.description,
    siteName: 'Twitter/X',
    language: meta.language,
    wordCount: bodyText.length,
    blocks: blocks,
    contentHTML: container.innerHTML,
    url: window.location.href,
  };
}

// ============================================================
// GitHub 专用解析（README / Issue）
// ============================================================
function parseGitHubPage(doc) {
  var url = window.location.href;
  if (/\/issues\/\d+/.test(url)) {
    return parseGitHubIssue(doc);
  }
  return parseGitHubReadme(doc);
}

function parseGitHubReadme(doc) {
  var container = doc.createElement('div');

  // 标题：从 <title> 解析 owner/repo 格式
  var title = '';
  var titleText = doc.title || '';
  // GitHub title 格式: "owner/repo: description · GitHub" 或 "GitHub - owner/repo: desc"
  var repoMatch = titleText.match(/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/);
  if (repoMatch) title = repoMatch[1];

  // 正文：README markdown-body
  var readmeEl = doc.querySelector('article.markdown-body.entry-content')
    || doc.querySelector('.markdown-body')
    || doc.querySelector('[itemprop="text"]');

  var bodyClone = null;
  if (readmeEl) {
    bodyClone = readmeEl.cloneNode(true);
  } else {
    // 回退：整个 repo-content 容器，手动去噪
    var repoContent = doc.querySelector('#repo-content-pjax-container')
      || doc.querySelector('.repository-content')
      || doc.querySelector('[data-testid="readme-content"]');
    if (repoContent) {
      bodyClone = repoContent.cloneNode(true);
      // 移除 sidebar (About / Releases / Packages)
      var borderGrids = bodyClone.querySelectorAll('.BorderGrid, [class*="BorderGrid"]');
      for (var bi = 0; bi < borderGrids.length; bi++) borderGrids[bi].remove();
      // 移除文件列表
      var dirContents = bodyClone.querySelectorAll('[class*="DirectoryContent-module"], [class*="OverviewRepoFiles-module"]');
      for (var di = 0; di < dirContents.length; di++) dirContents[di].remove();
      // 移除 tab 导航
      var navTabs = bodyClone.querySelectorAll('.UnderlineNav, [class*="UnderlineNav"], .pagehead-actions');
      for (var ni = 0; ni < navTabs.length; ni++) navTabs[ni].remove();
      // 移除 footer
      var footers = bodyClone.querySelectorAll('.footer, [class*="Footer-module"]');
      for (var fi = 0; fi < footers.length; fi++) footers[fi].remove();
    }
  }

  if (bodyClone) {
    container.appendChild(bodyClone);
  }

  processGenericImages(container);

  // 移除 README 中的装饰性小图：shields.io badges 和 GitHub 头像
  var allImgs = container.querySelectorAll('img');
  for (var ai = 0; ai < allImgs.length; ai++) {
    var imgSrc = allImgs[ai].getAttribute('src') || '';
    var imgW = parseInt(allImgs[ai].getAttribute('width') || '0', 10);
    var imgH = parseInt(allImgs[ai].getAttribute('height') || '0', 10);
    var shouldRemove = false;
    if (/\/\/img\.shields\.io\//.test(imgSrc)) shouldRemove = true;
    else if (/\/\/avatars\.githubusercontent\.com\//.test(imgSrc)) shouldRemove = true;
    else if (/\/\/github\.com\/[^/]+\.png(\?|$)/.test(imgSrc)) shouldRemove = true;
    else if (imgW > 0 && imgH > 0 && imgW <= 30 && imgH <= 30) shouldRemove = true;
    if (shouldRemove) {
      var parent = allImgs[ai].parentNode;
      if (parent) parent.removeChild(allImgs[ai]);
    }
  }

  var blocks = [];
  domToBlocks(container, blocks);

  var meta = extractGenericMeta(doc);
  var bodyText = container.textContent || '';

  return {
    type: 'github_readme',
    title: title || meta.title || doc.title || '',
    author: meta.author,
    publishTime: meta.publishTime,
    coverImage: meta.coverImage,
    description: meta.description,
    siteName: 'GitHub',
    language: meta.language,
    wordCount: bodyText.length,
    blocks: blocks,
    contentHTML: container.innerHTML,
    url: window.location.href,
  };
}

function parseGitHubIssue(doc) {
  var container = doc.createElement('div');

  // 标题
  var titleEl = doc.querySelector('bdi[data-testid="issue-title"]')
    || doc.querySelector('.js-issue-title');
  var title = titleEl ? titleEl.textContent.trim() : (doc.title || '');

  // 状态
  var stateEl = doc.querySelector('[data-testid="header-state"]');
  var stateText = '';
  if (stateEl) {
    var stateStatus = stateEl.getAttribute('data-status') || '';
    if (stateStatus === 'issueOpened') stateText = 'Open';
    else if (stateStatus === 'issueClosed') stateText = 'Closed';
    else stateText = stateStatus;
  }

  var h1 = doc.createElement('h1');
  h1.textContent = title + (stateText ? ' [' + stateText + ']' : '');
  container.appendChild(h1);

  // 正文
  var issueBody = doc.querySelector('[data-testid="issue-body"] .markdown-body')
    || doc.querySelector('[data-testid="issue-body"]')
    || doc.querySelector('.comment-body');
  var issueAuthor = '';
  var issueTime = '';

  if (issueBody) {
    // Issue 作者
    var issueAuthorLink = doc.querySelector('[data-testid="issue-body-header-author"]')
      || doc.querySelector('a[data-hovercard-type="user"]');
    if (issueAuthorLink) issueAuthor = (issueAuthorLink.textContent || '').trim();

    // Issue 时间
    var issueRelativeTime = doc.querySelector('[data-testid="issue-body-header-link"] relative-time')
      || doc.querySelector('relative-time[datetime]');
    if (issueRelativeTime) issueTime = issueRelativeTime.getAttribute('datetime') || '';

    // 作者+时间标注
    var issueMetaText = '';
    if (issueAuthor) issueMetaText += '@' + issueAuthor;
    if (issueTime) issueMetaText += ' (' + issueTime + ')';
    if (issueMetaText) {
      var metaP = doc.createElement('p');
      var metaStrong = doc.createElement('strong');
      metaStrong.textContent = issueMetaText;
      metaP.appendChild(metaStrong);
      container.appendChild(metaP);
    }

    container.appendChild(issueBody.cloneNode(true));
  }

  // 评论线程
  var timeline = doc.querySelector('#issue-timeline')
    || doc.querySelector('[data-testid="issue-timeline-container"]');
  if (timeline) {
    var timelineItems = timeline.querySelectorAll('[class*="Timeline_Item"], .js-timeline-item');
    for (var i = 0; i < timelineItems.length; i++) {
      var item = timelineItems[i];
      var commentBody = item.querySelector('.markdown-body')
        || item.querySelector('.comment-body');
      if (!commentBody) continue; // 跳过系统事件（labels / cross-refs）

      // 评论作者
      var commentAuthor = '';
      var authorLink = item.querySelector('a[data-hovercard-type="user"]')
        || item.querySelector('.author');
      if (authorLink) commentAuthor = (authorLink.textContent || '').trim();

      // 评论时间
      var commentTime = '';
      var relTime = item.querySelector('relative-time[datetime]');
      if (relTime) commentTime = relTime.getAttribute('datetime') || '';

      // divider
      var hr = doc.createElement('hr');
      container.appendChild(hr);

      // 评论头部
      var cmtHeaderText = '';
      if (commentAuthor) cmtHeaderText += '@' + commentAuthor;
      if (commentTime) cmtHeaderText += ' (' + commentTime + ')';
      if (cmtHeaderText) {
        var cmtP = doc.createElement('p');
        var cmtStrong = doc.createElement('strong');
        cmtStrong.textContent = cmtHeaderText;
        cmtP.appendChild(cmtStrong);
        container.appendChild(cmtP);
      }

      container.appendChild(commentBody.cloneNode(true));
    }
  }

  processGenericImages(container);

  var blocks = [];
  domToBlocks(container, blocks);

  var meta = extractGenericMeta(doc);
  var bodyText = container.textContent || '';

  return {
    type: 'github_issue',
    title: title,
    author: issueAuthor || meta.author,
    publishTime: issueTime || meta.publishTime,
    coverImage: meta.coverImage,
    description: meta.description,
    siteName: 'GitHub',
    language: meta.language,
    wordCount: bodyText.length,
    blocks: blocks,
    contentHTML: container.innerHTML,
    url: window.location.href,
  };
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

  // 视频占位符：必须在 cleanWechatElements 之前执行，因为 .video_iframe 会被当作噪声删除
  var wechatVideoSelectors = ['video', 'mp-common-videosnap', '.mp-common-videosnap', '.video_iframe', '[class*="video-player"]'];
  for (var wvs = 0; wvs < wechatVideoSelectors.length; wvs++) {
    var wvEls = clone.querySelectorAll(wechatVideoSelectors[wvs]);
    for (var wve = 0; wve < wvEls.length; wve++) {
      var wvPlaceholder = doc.createElement('p');
      var wvSpan = doc.createElement('span');
      wvSpan.textContent = '[视频]';
      wvSpan.setAttribute('style', 'color: #0066ff; font-weight: bold');
      wvPlaceholder.appendChild(wvSpan);
      try { wvEls[wve].parentNode.replaceChild(wvPlaceholder, wvEls[wve]); } catch(e) {}
    }
  }

  cleanWechatElements(clone);
  processWechatImages(clone);
  var meta = extractWechatMeta(doc);

  // 计算字数
  var bodyText = extractPlainText(clone.innerHTML);
  var wordCount = bodyText ? bodyText.length : 0;

  return {
    type: 'wechat',
    title: meta.title,
    author: meta.author,
    publishTime: meta.publishTime,
    coverImage: meta.coverImage,
    description: meta.description,
    siteName: '微信公众号',
    language: 'zh-CN',
    wordCount: wordCount,
    contentHTML: clone.innerHTML,
    url: window.location.href,
  };
}

// ============================================================
// 通用网页解析（替代 Readability）
// ============================================================
// ============================================================
// 域名分类
// ============================================================
function classifyPage(hostname) {
  var h = hostname || location.hostname;

  if (/zhihu\.com$/.test(h)) return 'blog';
  if (/jianshu\.com$/.test(h)) return 'blog';
  if (/medium\.com$/.test(h)) return 'blog';
  if (/substack\.com$/.test(h)) return 'blog';
  // Substack 自定义域名：检测 DOM 特征（pencraft CSS 框架 + reader2-post-content）
  if (document.querySelector('.reader2-post-content .body.markup')) return 'blog';
  if (/hashnode\.dev$/.test(h)) return 'blog';
  if (/dev\.to$/.test(h)) return 'blog';
  if (/wordpress\.com$/.test(h)) return 'blog';

  if (/bbc\.(com|co\.uk)$/.test(h)) return 'news';
  if (/cnn\.com$/.test(h)) return 'news';
  if (/nytimes\.com$/.test(h)) return 'news';
  if (/wsj\.com$/.test(h)) return 'news';
  if (/reuters\.com$/.test(h)) return 'news';
  if (/bloomberg\.com$/.test(h)) return 'news';
  if (/theguardian\.com$/.test(h)) return 'news';

  if (/techcrunch\.com$/.test(h)) return 'tech';
  if (/theverge\.com$/.test(h)) return 'tech';
  if (/arstechnica\.com$/.test(h)) return 'tech';
  if (/36kr\.com$/.test(h)) return 'tech';
  if (/sspai\.com$/.test(h)) return 'sspai';
  if (/hackernews|ycombinator/.test(h)) return 'tech';
  if (/wired\.com$/.test(h)) return 'tech';
  if (/engadget\.com$/.test(h)) return 'tech';

  if (/coindesk\.com$/.test(h)) return 'crypto';
  if (/theblock\.co$/.test(h)) return 'crypto';
  if (/foresightnews\.pro$/.test(h)) return 'crypto';
  if (/panewslab\.com$/.test(h)) return 'crypto';
  if (/odaily\.news$/.test(h)) return 'crypto';
  if (/theblockbeats\.info$/.test(h)) return 'crypto';
  if (/cointelegraph\.com$/.test(h)) return 'crypto';
  if (/decrypt\.co$/.test(h)) return 'crypto';
  if (/blockworks\.co$/.test(h)) return 'crypto';

  if (/xiaohongshu\.com$/.test(h)) return 'xhs';

  return 'generic';
}

function getCategorySelectors(category) {
  var map = {
    blog: [
      '.body.markup',                      // Substack（优先匹配，避免被 article 误选）
      '.Post-RichText', '.RichContent-inner', '.Post-content',
      '.article', '.show-content', '._2rhmJa',
      '.post-body', '.body', '.markup',
      'article', '.postArticle-content', 'section[data-testid="body"]',
      '.gh-content', '.post-content',
      '.markdown-body',                    // GitHub README/Issue
      'div[data-testid="tweetText"]',      // Twitter 文本
    ],
    news: [
      '.story-body', '.story-body__inner',
      '.article__content', '.zn-body__paragraph',
      '.StoryBodyCompanionColumn',
      '.article-body', '.article__body',
    ],
    tech: [
      '.article-detail', '.kr_article',
      '.c-entry-content',
      '.entry-content', '.article-content',
      '.post-content',
    ],
    sspai: [
      '.article__main__content', '.wangEditor-txt',
      '.article-body', '.content-body',
    ],
    crypto: [
      '.ql-editor', '.article-body', '.article-container',
      '.article-content', '.post-content', '.post-body',
      '.rich-text', '.detail-content', '.entry-content',
      '.single-content', '.content-body', '.article-wrapper',
      '.article-main', '.post-main',
      '[class*="DetailContent_detail"]', '.news-content',
    ],
    xhs: [
      '.note-detail-mask',              // wraps both .note-container (media) + .note-scroller (text)
      '.note-content', '.note-text', '.note-desc',
      '.note-scroller .content', '.note-content-wrapper',
      '.detail-content', '.content', '.note-detail-content',
      '[class*="note-text"]', '[class*="NoteContent"]',
      '.note-container',                // image/video carousel + author section
    ],
  };
  return map[category] || [];
}

function getCategoryNoiseSelectors(category) {
  var common = [
    '.related-posts', '.related-articles', '.recommended-posts',
    '.read-more', '.more-articles', '.also-read', '.you-may-like',
    '.advertisement', '.ad-container', '.google-ad', '.ad-slot',
    '[class*="ad-unit"]', '[id*="google_ads"]',
    '.newsletter-signup', '.subscribe-form', '.email-capture',
    '.share-buttons', '.social-share', '.post-share',
    '.author-bio', '.author-box', '.about-author',
    '.paywall', '.metered-content', '.subscribe-wall',
    '.comments', '.comment-section', '#comments', '.discussion',
    '.comment-list', '.comment-body', '.comment-content', '.comment-area',
    '.article-comments', '.post-comments', '.comment-wrapper',
    '.comment-avatar', '.comment-item',
    '.sidebar', '.related-sidebar',
  ];
  var extra = {
    blog: [
      '.speechify-ignore',                        // Medium audio overlay
      '[data-testid="clapButton"]',               // Medium
      '[data-testid="commentButton"]',            // Medium
      '[data-testid="bookmarkButton"]',           // Medium
      '[data-component-name="SubscribeWidget"]',  // Substack CTA
      '[data-component-name="EmbeddedPublicationToDOMWithSubscribe"]', // Substack
      '.subscribe-widget',                       // Substack subscribe CTA
      '.subscription-widget-wrap',               // Substack
      '.paywall', '.metered-content',            // Substack paywall
    ],
    news: ['.inline-newsletter', '.registration-prompt', '.article-recirc', '.read-next'],
    tech: ['.inline-newsletter', '.job-board', '.end-article-cta'],
    sspai: [
      '.article-side', '.comp__ArticleSide', '.article-banner',
      '.comment-container', '.comment-list-wrapper', '.comments__feed', '.common__comment__dialog',
      '.article-actionBar', '.article-footer-cta', '.reward-box', '.support-author',
      '.mini-program', '.footer-article',
    ],
    crypto: [
      '.price-widget', '.ticker', '.market-data', '.coin-ticker', '.crypto-prices',
      '.newsletter-cta', '.sponsor-cta', '.article-toc', '.catalog',
      '.sidebar-nav', '.footer-nav',
      '.news-recommend', '.news-topic', '.news-btm', '.news-intro',
    ],
    xhs: [
      '.note-interact', '.interact-bar', '.like-bar', '.collect-bar',
      '.comment-container', '.comment-area', '.note-comments',
      '.related-notes', '.recommend-notes', '.note-related',
      '.author-follow', '.follow-btn', '.share-btn',
      '.bottom-bar', '.note-footer', '.footer-interact',
      '.note-content-emoji',             // inline emoji images → too large in Notion
      '.xhs-capsule-widget-container',   // 猜你想搜 CTA widget
      '.comments-el',                    // comment section
      '.interaction-divider',            // divider before comments
      '.note-detail-dropdown',           // menu dropdown
      '.author-wrapper',                 // author avatar + name (top of page, not content)
      '.note-detail-follow-btn',         // follow button
      '.bottom-container',               // date + menu at bottom
      '.swiper-slide-duplicate',         // Swiper loop clones (first/last slide duplicated)
      '.swiper-button-prev',             // Swiper nav arrows
      '.swiper-button-next',             // Swiper nav arrows
      '.swiper-pagination',              // Swiper dots
    ],
  };
  return common.concat(extra[category] || []);
}

// ============================================================
// JSON-LD 结构化数据提取
// ============================================================
function extractJsonLdMeta(doc) {
  var scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  var meta = {};
  for (var i = 0; i < scripts.length; i++) {
    try {
      var data = JSON.parse(scripts[i].textContent || '');
      if (data['@graph'] && Array.isArray(data['@graph'])) {
        for (var j = 0; j < data['@graph'].length; j++) {
          applyJsonLdItem(data['@graph'][j], meta);
        }
      } else {
        applyJsonLdItem(data, meta);
      }
    } catch (e) { /* skip invalid JSON */ }
  }
  return meta;
}

function applyJsonLdItem(item, meta) {
  var type = item['@type'];
  if (type === 'Article' || type === 'BlogPosting' || type === 'NewsArticle' || type === 'Report' || type === 'SocialMediaPosting') {
    if (!meta.author && item.author) {
      meta.author = typeof item.author === 'string' ? item.author : (item.author.name || '');
    }
    if (!meta.publishTime && item.datePublished) meta.publishTime = item.datePublished;
    if (!meta.description && item.description) meta.description = item.description;
    if (!meta.headline && item.headline) meta.headline = item.headline;
  }
  if (type === 'WebSite' || type === 'Organization') {
    if (!meta.siteName && item.name) meta.siteName = item.name;
  }
  if (type === 'Person' && !meta.author && item.name) {
    meta.author = item.name;
  }
}

function extractGenericContent(doc) {
  var hostname = location.hostname || '';
  var category = classifyPage(hostname);

  // 按分类优先级排列 selector：分类专用 → 通用
  var categorySelectors = getCategorySelectors(category);
  var genericSelectors = [
    'article', '[role="main"]', 'main',
    '.post-content', '.entry-content', '.article-content',
    '#content', '.content',
    'body',
  ];
  var selectors = categorySelectors.concat(genericSelectors);

  // 去重
  var seen = {};
  selectors = selectors.filter(function(s) {
    if (seen[s]) return false;
    seen[s] = true;
    return true;
  });

  var content = null;
  for (var i = 0; i < selectors.length; i++) {
    var candidate = doc.querySelector(selectors[i]);
    // body 兜底放宽阈值
    var minLen = selectors[i] === 'body' ? 200 : 50;
    if (candidate && candidate.textContent.trim().length > minLen) {
      content = candidate;
      break;
    }
  }

  if (!content) {
    return { error: '无法提取正文内容', title: doc.title };
  }

  // 如果选到 body，尝试缩窄到正文区域
  if (content === doc.body) {
    var narrowSels = ['main', 'article', '[role="main"]', '.article-body', '.article-content', '.post-body', '.entry-content', '.single-content'];
    for (var n = 0; n < narrowSels.length; n++) {
      var narrowEl = content.querySelector(narrowSels[n]);
      if (narrowEl && narrowEl.textContent.trim().length > 100) {
        content = narrowEl;
        break;
      }
    }
  }

  // Resolve blob: video URLs from live DOM / page state before cloning
  // (小红书 xgplayer uses blob: URLs, real URL is in __INITIAL_STATE__ or player config)
  var origVideos = content.querySelectorAll('video');
  var blobResolved = 0;
  for (var ovi = 0; ovi < origVideos.length; ovi++) {
    var oVid = origVideos[ovi];
    var oBlobSrc = oVid.getAttribute('src') || '';
    if (!oBlobSrc || oBlobSrc.indexOf('blob:') === 0) {
      var realUrl = '';
      // 1. Try currentSrc (may return blob for xgplayer)
      try { realUrl = oVid.currentSrc || ''; } catch(e) {}
      // 2. Try source children
      if (!realUrl || realUrl.indexOf('blob:') === 0) {
        var oSources = oVid.querySelectorAll('source');
        for (var osi = 0; osi < oSources.length; osi++) {
          realUrl = oSources[osi].getAttribute('src') || '';
          if (realUrl && realUrl.indexOf('blob:') !== 0) break;
        }
      }
      // 3. Try __INITIAL_STATE__ for xiaohongshu / other platforms
      if (!realUrl || realUrl.indexOf('blob:') === 0) {
        try {
          var initState = window.__INITIAL_STATE__;
          if (initState) {
            var stateStr = JSON.stringify(initState);
            // 3a. CDN video URLs with file extensions (mp4, m3u8, h264, etc.)
            var urlMatch = stateStr.match(/https?:\/\/[^\"\s<>]+\.(?:mp4|m3u8|h264|ts|mov|webm)[^\"\s<>]*/i);
            if (urlMatch) realUrl = urlMatch[0];
            // 3b. Key-based extraction: "videoUrl", "video_url", "playUrl", etc.
            if (!realUrl) {
              var keyMatch = stateStr.match(/"(?:videoUrl|video_url|playUrl|play_url|source_url|streamUrl|hls_url)"\s*:\s*"(https?:\/\/[^"]+)"/i);
              if (keyMatch) realUrl = keyMatch[1].replace(/\\\//g, '/');
            }
            // 3c. XHS/CDN stream URLs (signed URLs without file extensions)
            if (!realUrl) {
              var cdnMatch = stateStr.match(/https?:\/\/(?:sns-video|video)[^.\s\"<>]*\.xhscdn\.com\/[^\"\s<>]+/i);
              if (cdnMatch) realUrl = cdnMatch[0];
            }
          }
        } catch(e) {}
      }
      // 4. Fallback: search all script tags for video URLs
      if (!realUrl || realUrl.indexOf('blob:') === 0) {
        var scripts = document.querySelectorAll('script');
        for (var si = 0; si < scripts.length; si++) {
          var sc = scripts[si].textContent || '';
          var vm = sc.match(/https?:\/\/[^\"\s<>]+\.(?:mp4|m3u8|h264|ts|mov|webm)[^\"\s<>]*/i);
          if (vm) { realUrl = vm[0]; break; }
        }
      }
      if (realUrl && realUrl.indexOf('blob:') !== 0) {
        oVid.setAttribute('src', realUrl);
        blobResolved++;
      }
    }
  }
  if (origVideos.length > 0) console.log('[NotionSnap] extractGenericContent: blob resolution resolved', blobResolved, '/', origVideos.length, 'video(s)');

  // 收集文章内嵌视频（iframe/链接 → embed block URL），在 clone 和清理之前
  // XHS 例外：CDN 链接需 Referer/Cookie 认证，直接访问返回 JS 挑战页，跳过 URL 收集
  var videoEmbeds = [];
  if (category === 'xhs') {
    console.log('[NotionSnap] extractGenericContent: XHS category, skipping video URL collection (CDN auth required)');
  } else {
    console.log('[NotionSnap] extractGenericContent: content area video diagnostics — videos:', content.querySelectorAll('video').length, 'xgplayer:', content.querySelectorAll('.xgplayer, [class*="xgplayer"]').length, 'iframes:', content.querySelectorAll('iframe').length);
    console.log('[NotionSnap] extractGenericContent: scanning for video embeds in content area');
    videoEmbeds = collectVideoEmbeds(content);
    console.log('[NotionSnap] extractGenericContent: found', videoEmbeds.length, 'video embeds');
  }

  var clone = content.cloneNode(true);

  // 基础清理
  ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript'].forEach(function(s) {
    clone.querySelectorAll(s).forEach(function(el) { el.remove(); });
  });

  // 分类噪声清理
  var noiseSelectors = getCategoryNoiseSelectors(category);
  for (var k = 0; k < noiseSelectors.length; k++) {
    try {
      clone.querySelectorAll(noiseSelectors[k]).forEach(function(el) { el.remove(); });
    } catch (e) { /* invalid selector, skip */ }
  }

  // 图片预处理：lazy load → src，相对路径 → 绝对路径
  processGenericImages(clone);

  // XHS: 将 <video> / xgplayer 替换为 [视频] 占位符（CDN 链接不可靠，内嵌位置保留标记）
  if (category === 'xhs') {
    var xhsVideoSelectors = ['video', '.xgplayer', '[class*="xgplayer"]', '.player-container'];
    for (var xvs = 0; xvs < xhsVideoSelectors.length; xvs++) {
      var xvEls = clone.querySelectorAll(xhsVideoSelectors[xvs]);
      for (var xve = 0; xve < xvEls.length; xve++) {
        var xvPH = doc.createElement('p');
        var xvSpan = doc.createElement('span');
        xvSpan.textContent = '[视频]';
        xvSpan.setAttribute('style', 'color: #0066ff; font-weight: bold');
        xvPH.appendChild(xvSpan);
        try { xvEls[xve].parentNode.replaceChild(xvPH, xvEls[xve]); } catch(e) {}
      }
    }
  }

  // 综合元数据：JSON-LD → OG meta 标签 → HTML meta
  var ldMeta = extractJsonLdMeta(doc);
  var htmlMeta = extractGenericMeta(doc);

  // 合并：JSON-LD 优先，HTML meta 回退
  var meta = {
    author: ldMeta.author || htmlMeta.author,
    publishTime: ldMeta.publishTime || htmlMeta.publishTime,
    coverImage: htmlMeta.coverImage,
    description: ldMeta.description || htmlMeta.description,
    siteName: ldMeta.siteName || htmlMeta.siteName,
    language: htmlMeta.language,
    headline: ldMeta.headline || '',
  };

  var bodyText = extractPlainText(clone.innerHTML);
  var wordCount = bodyText ? bodyText.length : 0;

  return {
    type: 'generic',
    category: category,
    title: meta.headline || doc.title || '',
    author: meta.author,
    publishTime: meta.publishTime,
    coverImage: meta.coverImage,
    description: meta.description,
    siteName: meta.siteName,
    language: meta.language,
    wordCount: wordCount,
    contentHTML: clone.innerHTML,
    url: window.location.href,
    videoEmbeds: videoEmbeds.length > 0 ? videoEmbeds : undefined,
  };
}

// 从 meta 标签提取通用网页元数据
function extractGenericMeta(doc) {
  function metaContent(selector) {
    var el = doc.querySelector(selector);
    return el ? (el.content || '').trim() : '';
  }

  var desc = metaContent('meta[property="og:description"]') || metaContent('meta[name="description"]');
  if (desc.length > 50) {
    desc = desc.substring(0, 50).replace(/\s+\S*$/, '') + '...';
  }

  return {
    description: desc,
    siteName: metaContent('meta[property="og:site_name"]') || (location.hostname || ''),
    language: (doc.documentElement.lang || '').substring(0, 5) || 'unknown',
    author: metaContent('meta[name="author"]') || metaContent('meta[property="article:author"]'),
    publishTime: metaContent('meta[property="article:published_time"]'),
    coverImage: metaContent('meta[property="og:image"]'),
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

function resolveRelativeUrl(url) {
  if (!url || url.indexOf('data:') === 0) return '';
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, window.location.href).toString();
  } catch (e) {
    return '';
  }
}

// 通用图片预处理：将 lazy load 属性转为 src，转相对路径为绝对路径
function processGenericImages(container) {
  var imgs = container.querySelectorAll('img');
  for (var i = 0; i < imgs.length; i++) {
    var img = imgs[i];
    var realSrc = img.getAttribute('data-src')
      || img.getAttribute('data-original')
      || img.getAttribute('data-lazy-src')
      || img.getAttribute('data-url')
      || img.getAttribute('data-actualsrc')
      || img.getAttribute('src')
      || '';

    realSrc = cleanImageUrl(realSrc);
    var absoluteUrl = resolveRelativeUrl(realSrc);

    if (!absoluteUrl) {
      img.remove();
      continue;
    }

    img.setAttribute('src', absoluteUrl);
    img.removeAttribute('data-src');
    img.removeAttribute('data-original');
    img.removeAttribute('data-lazy-src');
    img.removeAttribute('data-url');
    img.removeAttribute('srcset');
    img.removeAttribute('data-srcset');
    img.removeAttribute('loading');
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

  var description = '';
  var descEl = doc.querySelector('meta[property="og:description"]') || doc.querySelector('meta[name="description"]');
  if (descEl) description = (descEl.content || '').trim();

  return { title: title, author: author, publishTime: publishTime, coverImage: coverImage, description: description };
}
