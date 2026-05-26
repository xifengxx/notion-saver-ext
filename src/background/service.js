// Background Service Worker — Notion API 集成 (OAuth 多空间版本)
// Blocks 由 content script 通过 DOM 遍历转换，保持原始顺序

var NOTION_API = 'https://api.notion.com';
var BACKEND_URL = 'https://notion-saver-ext-production.up.railway.app';
var RATE_LIMIT_DELAY = 400;
var BLOCK_LIMIT = 100;
var FILE_UPLOAD_RATE_LIMIT_DELAY = 400;
var MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB Notion 免费空间限制

var STORE = {
  WORKSPACES: 'notion_workspaces',
  CURRENT_BOT: 'notion_current_workspace_bot_id',
  TOKEN_FAILED: 'notion_token_refresh_failed',
  OAUTH_SESSION: 'oauth_session_id',
  SAVE_STATE: 'notion_save_state',
  RECENT_PAGES_PREFIX: 'recent_pages_',
  NOTIF_URL_PREFIX: 'notif_url_',
  SAVE_HISTORY_PREFIX: 'save_history_',
  SAVED_TARGETS_PREFIX: 'saved_targets_',
  IMAGE_TASK_PREFIX: 'notion_image_task_',
  IMAGE_TASK_QUEUE: 'notion_image_task_queue',
};

// SW 重启时恢复未完成的图片替换任务
loadAndResumePendingImageTasks();

// 安装/更新时创建右键菜单
chrome.runtime.onInstalled.addListener(function() {
  chrome.contextMenus.create({
    id: 'save-to-notion',
    title: '保存到 Notion',
    contexts: ['page'],
    documentUrlPatterns: ['http://*/*', 'https://*/*'],
  });
});

// ============================================================
// OAuth 登录轮询（在 background 运行，不受 popup 关闭影响）
// ============================================================
var oauthPollTimers = {};

function generateSessionId() {
  var d = Date.now();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = (d + Math.random() * 16) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function startOAuthLogin() {
  var sessionId = generateSessionId();
  chrome.storage.local.set({ [STORE.OAUTH_SESSION]: sessionId });

  chrome.tabs.create({ url: BACKEND_URL + '/auth?session=' + sessionId, active: true });

  oauthPollTimers[sessionId] = { attempts: 0, interval: null };
  oauthPollTimers[sessionId].interval = setInterval(function() {
    oauthPollTimers[sessionId].attempts++;
    if (oauthPollTimers[sessionId].attempts > 30) {
      clearInterval(oauthPollTimers[sessionId].interval);
      delete oauthPollTimers[sessionId];
      return;
    }

    fetch(BACKEND_URL + '/token?session=' + sessionId)
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.ready) {
          clearInterval(oauthPollTimers[sessionId].interval);
          delete oauthPollTimers[sessionId];

          // 获取已有的 workspace 列表
          chrome.storage.local.get([STORE.WORKSPACES, STORE.CURRENT_BOT], function(result) {
            var workspaces = result[STORE.WORKSPACES] || [];
            var currentBotId = result[STORE.CURRENT_BOT] || null;
            var botId = data.bot_id;

            // 检查是否已有该空间
            var existing = workspaces.filter(function(ws) { return ws.bot_id === botId; });
            if (existing.length > 0) {
              // 更新 token
              existing[0].access_token = data.access_token;
              existing[0].refresh_token = data.refresh_token;
              existing[0].expires_at = data.expires_at;
            } else {
              // 新空间
              workspaces.push({
                bot_id: botId,
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expires_at: data.expires_at,
                workspace_name: data.workspace_name,
                workspace_icon: data.workspace_icon,
              });
              currentBotId = botId;
            }

            chrome.storage.local.set({
              [STORE.WORKSPACES]: workspaces,
              [STORE.CURRENT_BOT]: currentBotId,
            });
          });
        }
      })
      .catch(function() { /* 继续轮询 */ });
  }, 2000);

  return sessionId;
}

// ============================================================
// 消息路由
// ============================================================
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'extract_content') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs || !tabs[0] || !tabs[0].id) {
        sendResponse({ error: '无法获取当前页面', title: '' });
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: 'extract' }, function(response) {
        if (chrome.runtime.lastError) {
          sendResponse({ error: '无法连接到页面，请刷新页面后重试', title: '' });
          return;
        }
        sendResponse(response);
      });
    });
    return true;
  }

  if (message.action === 'save_to_notion') {
    var botId = message.workspaceBotId || null;
    var targetType = message.targetType || 'page';
    var sourceTabId = (sender && sender.tab && sender.tab.id) ? sender.tab.id : null;
    saveToNotion(message.data, message.targetPage, botId, targetType, sourceTabId).then(sendResponse).catch(function(err) {
      console.error('[NotionSnap] Unhandled error in saveToNotion:', err);
      sendResponse({ success: false, error: err.message || '保存失败' });
    });
    return true;
  }

  if (message.action === 'get_settings') {
    sendResponse({});
    return true;
  }

  if (message.action === 'save_settings') {
    chrome.storage.local.set(message.data, function() {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'start_oauth_login') {
    sendResponse({ sessionId: startOAuthLogin() });
    return true;
  }

  if (message.action === 'fetch_pages') {
    getValidToken().then(function(token) {
      if (!token) {
        sendResponse({ success: false, error: '未登录，请先连接到 Notion', pages: [], databases: [] });
        return;
      }
      fetchNotionPages(token, message.query).then(sendResponse).catch(function(err) {
        console.error('[NotionSnap] fetch_pages error:', err);
        sendResponse({ success: false, error: err.message || '获取失败', pages: [], databases: [] });
      });
    });
    return true;
  }

  // 渐进式加载：单次 /v1/search 请求，立即返回
  if (message.action === 'fetch_pages_chunk') {
    getValidToken().then(function(token) {
      if (!token) {
        sendResponse({ success: false, error: '未登录', pages: [], databases: [] });
        return;
      }
      var q = message.query || '';
      var filterObj = message.filter ? { property: 'object', value: message.filter } : null;
      var body = { page_size: 100 };
      if (q) body.query = q;
      if (filterObj) body.filter = filterObj;
      if (message.sort) body.sort = { direction: message.sort, timestamp: 'last_edited_time' };

      notionFetch('/v1/search', token, { method: 'POST', body: JSON.stringify(body) })
        .then(function(response) {
          var data = parseSearchResponse(response);
          sendResponse({ success: true, pages: data.pages, databases: data.databases });
        })
        .catch(function(err) {
          sendResponse({ success: false, error: err.message, pages: [], databases: [] });
        });
    });
    return true;
  }
});

// ============================================================
// Token 管理（多空间）
// ============================================================

function getValidToken() {
  return new Promise(function(resolve) {
    chrome.storage.local.get([
      STORE.WORKSPACES,
      STORE.CURRENT_BOT,
    ], function(result) {
      var workspaces = result[STORE.WORKSPACES] || [];
      var currentBotId = result[STORE.CURRENT_BOT];

      if (!currentBotId || workspaces.length === 0) {
        resolve(null);
        return;
      }

      var ws = workspaces.find(function(w) { return w.bot_id === currentBotId; });
      if (!ws) {
        resolve(null);
        return;
      }

      var expiresAt = ws.expires_at || 0;
      if (expiresAt > 0 && Date.now() > expiresAt - 60000) {
        if (ws.refresh_token) {
          refreshToken(ws.refresh_token).then(function(newTokens) {
            // 更新该 workspace 的 token
            ws.access_token = newTokens.access_token;
            ws.refresh_token = newTokens.refresh_token;
            ws.expires_at = newTokens.expires_at;
            chrome.storage.local.set({
              [STORE.WORKSPACES]: workspaces,
              [STORE.TOKEN_FAILED]: false,
            });
            resolve(ws.access_token);
          }).catch(function(err) {
            console.error('[NotionSnap] Token refresh failed:', err && err.message ? err.message : err);
            chrome.storage.local.set({ [STORE.TOKEN_FAILED]: true });
            try {
              chrome.notifications.create('token-refresh-failed', {
                type: 'basic',
                iconUrl: chrome.runtime.getURL('public/icons/icon-48.png'),
                title: 'NotionSnap — 认证已过期',
                message: '请点击扩展图标重新登录',
              });
            } catch (e) { /* notifications may not be available */ }
            resolve(null);
          });
        } else {
          resolve(ws.access_token);
        }
      } else {
        resolve(ws.access_token);
      }
    });
  });
}

function refreshToken(refreshTokenValue) {
  return fetch(BACKEND_URL + '/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshTokenValue }),
  }).then(function(res) {
    if (!res.ok) {
      return res.text().then(function(err) { throw new Error(err); });
    }
    return res.json();
  }).then(function(tokens) {
    return tokens;
  });
}

// ============================================================
// Notion API 核心保存流程
// ============================================================
function saveToNotion(data, parentPageId, workspaceBotId, targetType, sourceTabId) {
  // 标记保存进行中，用于检测 SW 终止导致的中断 + 进度跟踪
  chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'in_progress', startedAt: Date.now(), stage: 'creating_page', blocksTotal: 0, blocksDone: 0, retryCurrent: 0 } });

  return getValidToken().then(function(token) {
    if (!token) {
      return { success: false, error: '未登录或认证已过期，请重新登录' };
    }

    // 解析目标页面后，始终尝试获取 schema：
    //   - 数据库目标 → schema 获取成功 → 按名称/类型自动匹配
    //   - 页面目标     → schema 获取失败（返回 {}）→ fieldMapping 为 null → 元信息写正文
    return getDefaultParent(token, parentPageId, workspaceBotId, targetType).then(function(parent) {
      return fetchDatabaseSchema(token, parent.id).then(function(schema) {
        var fieldMapping = autoMatchFields(schema, data);
        return createPage(token, data, parent, workspaceBotId, fieldMapping);
      });
    }).then(function(page) {
      var pageId = page.id;

      var blocks = (data.blocks || []).map(function(b) {
        var result = { object: 'block', type: b.type };
        result[b.type] = b[b.type];
        return result;
      });

      if (blocks.length === 0) {
        chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'completed', at: Date.now() } });
        chrome.action.setBadgeText({ text: '' });
        return {
          success: true,
          pageUrl: page.url,
          pageId: pageId,
          blocksCount: 0,
        };
      }

      // v0.5.3: 两阶段保存 — Phase 1 先存 external URL 图片，Phase 2 后台替换
      var imageBlockCount = 0;
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].type === 'image' && blocks[j].image && blocks[j].image.type === 'external') {
          imageBlockCount++;
        }
      }

      var chunks = [];
      for (var i = 0; i < blocks.length; i += BLOCK_LIMIT) {
        chunks.push(blocks.slice(i, i + BLOCK_LIMIT));
      }

      chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'in_progress', startedAt: Date.now(), stage: 'appending_blocks', blocksTotal: blocks.length, blocksDone: 0 } });
      showBadge('0/' + chunks.length, '#888888');

      return appendAllBlocks(token, pageId, chunks, 0, blocks.length).then(function() {
        chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'completed', at: Date.now() } });
        chrome.action.setBadgeText({ text: '' });

        // Phase 2: 后台替换图片
        if (imageBlockCount > 0) {
          startBackgroundImageReplacement(token, pageId, workspaceBotId, blocks, data.url, sourceTabId);
        }

        return {
          success: true,
          pageUrl: page.url,
          pageId: pageId,
          blocksCount: blocks.length,
        };
      });
    });
  }).catch(function(err) {
    console.error('[NotionSnap] Save failed:', err);
    chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'failed', error: err.message || '保存失败', at: Date.now() } });
    chrome.action.setBadgeText({ text: '' });
    try {
      chrome.notifications.create('save-failed', {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('public/icons/icon-48.png'),
        title: 'NotionSnap — 保存失败',
        message: err.message || '保存过程中断，请重试',
      });
    } catch (e) { /* notifications may not be available */ }
    return { success: false, error: err.message || '保存失败' };
  });
}

function appendAllBlocks(token, pageId, chunks, index, totalBlocks) {
  if (index >= chunks.length) {
    return Promise.resolve();
  }
  return appendBlocksWithRetry(token, pageId, chunks[index], 3).then(function() {
    var done = Math.min((index + 1) * BLOCK_LIMIT, totalBlocks);
    chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'in_progress', stage: 'appending_blocks', blocksTotal: totalBlocks, blocksDone: done, retryCurrent: 0 } });
    showBadge((index + 1) + '/' + chunks.length, '#888888');
    if (index < chunks.length - 1) {
      return delay(RATE_LIMIT_DELAY).then(function() {
        return appendAllBlocks(token, pageId, chunks, index + 1, totalBlocks);
      });
    }
    return Promise.resolve();
  });
}

function appendBlocksWithRetry(token, pageId, blocks, maxRetries) {
  return appendBlocks(token, pageId, blocks).catch(function(err) {
    if (maxRetries > 0 && err.message && err.message.indexOf('fetch') >= 0) {
      var retryNum = 3 - maxRetries + 1;
      console.log('[NotionSnap] Append blocks failed, retrying... (' + retryNum + '/3)');
      chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'in_progress', stage: 'appending_blocks', retryCurrent: retryNum } });
      showBadge('R' + retryNum, '#e67e22');
      return delay(2000).then(function() {
        return appendBlocksWithRetry(token, pageId, blocks, maxRetries - 1);
      });
    }
    throw err;
  });
}

// ============================================================
// 字段映射 — 将元信息映射到 Notion 数据库 properties（v0.5.0）
// ============================================================
// 字段定义：key → { type, extract }  Notion 属性类型 + 从 data 取值方式
var METADATA_FIELDS = {
  url:          { notionType: 'url',         valueType: 'string' },
  description:  { notionType: 'rich_text',    valueType: 'string' },
  coverImage:   { notionType: 'url',          valueType: 'string' },
  author:       { notionType: 'rich_text',    valueType: 'string' },
  siteName:     { notionType: 'rich_text',    valueType: 'string' },
  publishTime:  { notionType: 'date',         valueType: 'date' },
  language:     { notionType: 'rich_text',    valueType: 'string' },
  keywords:     { notionType: 'multi_select', valueType: 'keywords' },
  wordCount:    { notionType: 'number',       valueType: 'number' },
};

// 每个字段的候选属性名（中英文），大小写不敏感匹配
var FIELD_ALIASES = {
  url:          ['URL', 'url', '链接', '链接地址', '网址', '网站', '网站地址', '网页链接', '原文链接', '来源链接', 'source url', 'link'],
  description:  ['摘要', 'Description', 'description', '描述', '简介', 'Summary', 'summary'],
  coverImage:   ['封面图', 'Cover', 'cover', '封面', 'Cover Image', 'cover image', 'coverImage', 'image', '图片'],
  author:       ['作者', 'Author', 'author', '发布者', 'writer'],
  siteName:     ['网站名称', 'Site', 'site', '来源', '来源网站', 'siteName', 'site name', 'source'],
  publishTime:  ['发布时间', 'Date', 'date', '发布日期', 'publishTime', 'published', '创建时间', '时间'],
  language:     ['语言', 'Language', 'language', 'lang', 'locale'],
  keywords:     ['关键词', 'Keywords', 'keywords', '标签', 'Tags', 'tags'],
  wordCount:    ['字数', 'Word Count', 'wordCount', 'words', '字数统计', 'word count', 'WordCount'],
};

// 获取数据库 schema（属性名 + 类型列表）
function fetchDatabaseSchema(token, databaseId) {
  var url = '/v1/databases/' + databaseId.replace(/-/g, '');
  return notionFetch(url, token, { method: 'GET' }).then(function(response) {
    var props = response.properties || {};
    var schema = {};
    var propNames = Object.keys(props);
    for (var i = 0; i < propNames.length; i++) {
      var name = propNames[i];
      var prop = props[name];
      schema[name] = {
        type: prop.type,
        id: prop.id,
      };
    }
    return schema;
  }).catch(function(err) {
    // schema 获取失败不阻塞保存，降级为无匹配
    var msg = err && err.message ? err.message : '';
    if (msg.indexOf('is a page, not a database') >= 0) {
      console.info('[NotionSnap] Target is a page (not database), metadata written to body');
    } else {
      console.error('[NotionSnap] fetchDatabaseSchema error:', err);
    }
    return {};
  });
}

// 自动匹配：遍历 METADATA_FIELDS，按属性名 + 类型匹配数据库 schema
// 返回 { fieldKey: propertyName } 映射，供 buildProperties/buildMetadataBlocks 使用
function autoMatchFields(schema, data) {
  var mapping = {};
  var fieldKeys = Object.keys(METADATA_FIELDS);
  var schemaNames = Object.keys(schema);

  for (var i = 0; i < fieldKeys.length; i++) {
    var key = fieldKeys[i];
    var value = data[key];
    // 无数据则跳过
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;

    var def = METADATA_FIELDS[key];
    var expectType = def.notionType;
    var aliases = FIELD_ALIASES[key] || [key];

    // 在 schema 中查找匹配的属性：名称匹配 + 类型兼容
    for (var j = 0; j < schemaNames.length; j++) {
      var propName = schemaNames[j];
      var propInfo = schema[propName];
      var propType = propInfo.type;

      // 名称匹配（大小写不敏感）
      var nameMatch = false;
      for (var k = 0; k < aliases.length; k++) {
        if (propName.toLowerCase() === aliases[k].toLowerCase()) {
          nameMatch = true;
          break;
        }
      }
      if (!nameMatch) continue;

      // 类型兼容：rich_text 可匹配 text/rich_text/title，url 匹配 url，date 匹配 date，等等
      if (isTypeCompatible(expectType, propType)) {
        mapping[key] = propName;
        break; // 每个字段只匹配第一个兼容属性
      }
    }
  }

  return Object.keys(mapping).length > 0 ? mapping : null;
}

function isTypeCompatible(expectType, actualType) {
  if (expectType === actualType) return true;
  // rich_text 兼容 title 和 text 类型
  if (expectType === 'rich_text' && (actualType === 'title' || actualType === 'text')) return true;
  return false;
}

function buildProperties(data, fieldMapping) {
  var properties = {
    title: {
      title: [{ type: 'text', text: { content: data.title || 'Untitled' } }],
    },
  };

  if (!fieldMapping) return properties;

  var fieldKeys = Object.keys(METADATA_FIELDS);
  for (var i = 0; i < fieldKeys.length; i++) {
    var key = fieldKeys[i];
    var propName = fieldMapping[key];
    if (!propName) continue; // 用户未配置此字段的属性名

    var value = data[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;

    var def = METADATA_FIELDS[key];
    if (def.notionType === 'url' && typeof value === 'string') {
      properties[propName] = { type: 'url', url: value };
    } else if (def.notionType === 'rich_text' && typeof value === 'string') {
      properties[propName] = {
        type: 'rich_text',
        rich_text: [{ type: 'text', text: { content: value } }],
      };
    } else if (def.notionType === 'date' && typeof value === 'string') {
      var parsedDate = parseDateForNotion(value);
      if (parsedDate) {
        properties[propName] = { type: 'date', date: { start: parsedDate } };
      }
    } else if (def.notionType === 'multi_select' && Array.isArray(value)) {
      var options = [];
      for (var j = 0; j < value.length; j++) {
        options.push({ name: value[j] });
      }
      properties[propName] = { type: 'multi_select', multi_select: options };
    } else if (def.notionType === 'number' && typeof value === 'number') {
      properties[propName] = { type: 'number', number: value };
    }
  }

  return properties;
}

function buildMetadataBlocks(data, fieldMapping) {
  var children = [];

  function isMapped(key) {
    return fieldMapping && fieldMapping[key];
  }

  // URL 块（未映射时写入正文）
  if (!isMapped('url') && data.url) {
    var urlText;
    if (data.url.indexOf('http') === 0) {
      var cleanUrl = data.url.split('#')[0];
      urlText = { type: 'text', text: { content: cleanUrl, link: { url: cleanUrl } }, annotations: { color: 'gray' } };
    } else {
      urlText = { type: 'text', text: { content: data.url }, annotations: { color: 'gray' } };
    }
    children.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [urlText] } });
  }

  // 收集未映射的文本元信息
  var metaParts = [];
  function pushMeta(key, label) {
    if (!isMapped(key) && data[key]) metaParts.push(label + data[key]);
  }
  pushMeta('author', '作者：');
  pushMeta('publishTime', '发布于：');
  pushMeta('siteName', '来源：');
  pushMeta('language', '语言：');
  if (!isMapped('wordCount') && typeof data.wordCount === 'number' && data.wordCount > 0) {
    metaParts.push('字数：' + data.wordCount);
  }

  // 摘要（未映射时写入正文）
  if (!isMapped('description') && data.description) {
    metaParts.push(data.description);
  }

  // 关键词（未映射时写入正文）
  if (!isMapped('keywords') && data.keywords && data.keywords.length > 0) {
    metaParts.push('关键词：' + data.keywords.join('、'));
  }

  if (metaParts.length > 0) {
    children.push({ object: 'block', type: 'divider', divider: {} });
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: metaParts.join(' · ') } }] },
    });
  }

  return children;
}

function parseDateForNotion(dateStr) {
  if (!dateStr) return null;
  // 尝试解析 ISO 格式：2024-01-15T10:30:00+08:00
  var isoMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  // 尝试解析中文格式：2024年1月15日
  var cnMatch = dateStr.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cnMatch) {
    var month = cnMatch[2].length === 1 ? '0' + cnMatch[2] : cnMatch[2];
    var day = cnMatch[3].length === 1 ? '0' + cnMatch[3] : cnMatch[3];
    return cnMatch[1] + '-' + month + '-' + day;
  }
  // 尝试解析 Date 对象
  try {
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      var m = d.getMonth() + 1;
      var day2 = d.getDate();
      return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day2 < 10 ? '0' + day2 : day2);
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ============================================================
// 创建页面
// ============================================================
function createPage(token, data, parent, botId, fieldMapping) {
  var properties = buildProperties(data, fieldMapping);
  var children = buildMetadataBlocks(data, fieldMapping);

  var isDatabase = parent.type === 'database';
  var parentField = isDatabase ? { database_id: parent.id } : { page_id: parent.id };

  // 数据库父页面必须有 properties（至少 title），普通页面不需要
  var body = {
    parent: parentField,
    properties: properties,
    children: children,
  };

  return notionFetch('/v1/pages', token, {
    method: 'POST',
    body: JSON.stringify(body),
  }).catch(function(err) {
    // 兜底：type 标记为 page 但实际是 database 的情况
    if (!isDatabase && err.message &&
        (err.message.indexOf('Could not find page') >= 0 ||
         err.message.indexOf('parent') >= 0 ||
         err.message.indexOf('Parent') >= 0)) {
      var dbBody = {
        parent: { database_id: parent.id },
        properties: properties,
        children: children,
      };
      return notionFetch('/v1/pages', token, {
        method: 'POST',
        body: JSON.stringify(dbBody),
      });
    }
    throw err;
  });
}

// ============================================================
// 追加 blocks 到页面
// ============================================================
function appendBlocks(token, pageId, blocks) {
  var url = '/v1/blocks/' + pageId.replace(/-/g, '') + '/children';
  return notionFetch(url, token, {
    method: 'PATCH',
    body: JSON.stringify({ children: blocks }),
  });
}

// ============================================================
// File Upload 图片上传 — Notion API（v0.4.0）
// ============================================================
function requestFileUpload(token, filename, contentType, contentLength) {
  return fetch(NOTION_API + '/v1/file_uploads', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename: filename,
      content_type: contentType,
      content_length: contentLength,
    }),
  }).then(function(response) {
    if (!response.ok) {
      return response.json().catch(function() { return {}; }).then(function(body) {
        throw new Error('File upload request failed: ' + (body.message || 'HTTP ' + response.status));
      });
    }
    return response.json();
  }).then(function(data) {
    return { id: data.id, upload_url: data.upload_url || data.url || data.signed_url, status: data.status };
  });
}

function uploadBinaryToSignedUrl(uploadUrl, blob, contentType, token) {
  var method = 'PUT';
  var body = blob;
  var headers = { 'Content-Type': contentType };
  // Notion API gateway URL（非 S3），用 FormData POST + Authorization + Notion-Version
  if (uploadUrl.indexOf('https://api.notion.com/') === 0 && token) {
    method = 'POST';
    var formData = new FormData();
    formData.append('file', blob, 'image.png');
    body = formData;
    // FormData 自动设 Content-Type（含 boundary），不要手动覆盖
    headers = {};
    headers['Authorization'] = 'Bearer ' + token;
    headers['Notion-Version'] = '2022-06-28';
  }
  return fetch(uploadUrl, {
    method: method,
    headers: headers,
    body: body,
  }).then(function(response) {
    if (!response.ok) {
      return response.text().catch(function() { return ''; }).then(function(body) {
        console.log('[NotionSnap] Upload failed —', response.status, body.substring(0, 200));
        throw new Error('File upload failed: HTTP ' + response.status);
      });
    }
  });
}

function downloadAllImages(urls) {
  var downloads = urls.map(function(url) {
    return fetch(url).then(function(response) {
      if (!response.ok) {
        return { url: url, blob: null, error: 'http_' + response.status };
      }
      return response.blob().then(function(blob) {
        if (blob.size > MAX_IMAGE_SIZE_BYTES || blob.size === 0) {
          return { url: url, blob: null, error: 'invalid_size' };
        }
        var ct = response.headers.get('Content-Type') || '';
        var originalCt = ct;
        if (!ct || ct.indexOf('image/') !== 0) {
          ct = getContentTypeFromUrl(url);
        }
        console.log('[NotionSnap] Downloaded image:', url.substring(0, 80), '| size:', blob.size,
          '| response-CT:', originalCt, '| derived-CT:', ct, '| blob.type:', blob.type);
        return { url: url, blob: blob, contentType: ct };
      });
    }).catch(function(err) {
      return { url: url, blob: null, error: 'fetch_failed' };
    });
  });
  return Promise.all(downloads).then(function(results) {
    var map = {};
    for (var i = 0; i < results.length; i++) {
      map[results[i].url] = results[i];
    }
    return map;
  });
}

function uploadImageBatch(token, urls, index, blobMap, uploadMap) {
  if (index >= urls.length) {
    return Promise.resolve(uploadMap);
  }

  var url = urls[index];
  var blobInfo = blobMap[url];
  var total = urls.length;

  function nextImage(result) {
    uploadMap[url] = result;
    var done = index + 1;
    chrome.storage.local.set({
      [STORE.SAVE_STATE]: {
        status: 'in_progress',
        stage: 'uploading_images',
        imagesTotal: total,
        imagesDone: done,
      }
    });
    showBadge(done + '/' + total + ' img', '#888888');

    if (index + 1 < urls.length) {
      return delay(FILE_UPLOAD_RATE_LIMIT_DELAY).then(function() {
        return uploadImageBatch(token, urls, index + 1, blobMap, uploadMap);
      });
    }
    return uploadMap;
  }

  if (!blobInfo || !blobInfo.blob) {
    console.log('[NotionSnap] Image download failed for ' + url +
      ': ' + (blobInfo ? blobInfo.error : 'no_blob'));
    return nextImage({ success: false, reason: blobInfo ? blobInfo.error : 'no_blob' });
  }

  var filename = getFilenameFromUrl(url, blobInfo.contentType);

  return requestFileUpload(token, filename, blobInfo.contentType, blobInfo.blob.size)
    .then(function(uploadInfo) {
      console.log('[NotionSnap] Got upload URL for', filename, '| id:', uploadInfo.id,
        '| url:', uploadInfo.upload_url ? uploadInfo.upload_url.substring(0, 150) : 'NONE');
      return uploadBinaryToSignedUrl(uploadInfo.upload_url, blobInfo.blob, blobInfo.contentType, token)
        .then(function() {
          return nextImage({ success: true, id: uploadInfo.id });
        });
    })
    .catch(function(err) {
      console.log('[NotionSnap] Image upload skipped for ' + url +
        ': ' + (err && err.message ? err.message : ''));
      return nextImage({ success: false, reason: 'upload_failed' });
    });
}

function uploadImages(token, blocks) {
  var imageUrls = [];
  var blockImageInfo = [];

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.type === 'image' && b.image && b.image.type === 'external') {
      var url = b.image.external.url;
      var caption = (b.image.caption && b.image.caption.length > 0) ? b.image.caption : [];
      if (imageUrls.indexOf(url) === -1) {
        imageUrls.push(url);
      }
      blockImageInfo.push({ blockIndex: i, url: url, caption: caption });
    }
  }

  if (imageUrls.length === 0) {
    return Promise.resolve(blocks);
  }

  chrome.storage.local.set({
    [STORE.SAVE_STATE]: {
      status: 'in_progress',
      stage: 'uploading_images',
      imagesTotal: imageUrls.length,
      imagesDone: 0,
    }
  });
  showBadge('0/' + imageUrls.length + ' img', '#888888');

  // 并行下载所有图片，再串行上传到 Notion
  return downloadAllImages(imageUrls).then(function(blobMap) {
    return uploadImageBatch(token, imageUrls, 0, blobMap, {}).then(function(uploadMap) {
      for (var j = 0; j < blockImageInfo.length; j++) {
        var info = blockImageInfo[j];
        var uploadResult = uploadMap[info.url];
        if (uploadResult && uploadResult.success) {
          blocks[info.blockIndex] = {
            object: 'block',
            type: 'image',
            image: {
              type: 'file_upload',
              file_upload: { id: uploadResult.id },
              caption: info.caption,
            },
          };
        }
      }
      return blocks;
    });
  });
}

// ============================================================
// Phase 2: 后台图片替换（先存后传）
// ============================================================

function startBackgroundImageReplacement(token, pageId, botId, blocks, pageUrl, sourceTabId) {
  // 提取页面 origin 作为图片请求的 Referer（CDN 防盗链用）
  var referer = '';
  try {
    var pu = new URL(pageUrl || '');
    referer = pu.origin;
  } catch (e) { /* ignore */ }

  var imageList = [];
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    if (b.type === 'image' && b.image && b.image.type === 'external' && b.image.external && b.image.external.url) {
      imageList.push({
        blockIndex: i,
        externalUrl: b.image.external.url,
        filename: getFilenameFromUrl(b.image.external.url, 'image/png'),
        caption: b.image.caption || [],
        status: 'pending',
        fileUploadId: null,
        notionFileId: null,
        blockId: null,
        childIndex: null,
        referer: referer
      });
    }
  }

  if (imageList.length === 0) return;

  console.log('[NotionSnap] Phase 2 started: ' + imageList.length + ' images to replace for page ' + pageId);

  // 拉取页面 children 获取 block ID
  fetchPageChildren(token, pageId, null, []).then(function(allChildren) {
    // 收集所有 image children
    var imageChildren = [];
    for (var k = 0; k < allChildren.length; k++) {
      var child = allChildren[k];
      if (child.type === 'image' && child.image && child.image.type === 'external' && child.image.external) {
        imageChildren.push({ id: child.id, url: child.image.external.url, idx: k });
      }
    }

    // Pass 1: 精确 URL 匹配
    for (var ci = 0; ci < imageChildren.length; ci++) {
      for (var m = 0; m < imageList.length; m++) {
        if (imageList[m].blockId) continue;
        if (imageList[m].externalUrl === imageChildren[ci].url) {
          imageList[m].blockId = imageChildren[ci].id;
          imageList[m].childIndex = imageChildren[ci].idx;
          break;
        }
      }
    }

    // Pass 2: URL 解码后比较（处理编码差异）
    for (var ci2 = 0; ci2 < imageChildren.length; ci2++) {
      for (var m2 = 0; m2 < imageList.length; m2++) {
        if (imageList[m2].blockId) continue;
        try {
          if (decodeURIComponent(imageList[m2].externalUrl) === decodeURIComponent(imageChildren[ci2].url)) {
            imageList[m2].blockId = imageChildren[ci2].id;
            imageList[m2].childIndex = imageChildren[ci2].idx;
            break;
          }
        } catch (e) { /* skip malformed URLs */ }
      }
    }

    // Pass 3: 按位置回退匹配（第 n 个未匹配 image = 第 n 个未匹配 child）
    var unmatchedImgs = [];
    var unmatchedCh = [];
    for (var mi = 0; mi < imageList.length; mi++) {
      if (!imageList[mi].blockId) unmatchedImgs.push(mi);
    }
    for (var ci3 = 0; ci3 < imageChildren.length; ci3++) {
      var used = false;
      for (var m3 = 0; m3 < imageList.length; m3++) {
        if (imageList[m3].blockId === imageChildren[ci3].id) { used = true; break; }
      }
      if (!used) unmatchedCh.push(ci3);
    }
    var posCount = Math.min(unmatchedImgs.length, unmatchedCh.length);
    for (var p = 0; p < posCount; p++) {
      imageList[unmatchedImgs[p]].blockId = imageChildren[unmatchedCh[p]].id;
      imageList[unmatchedImgs[p]].childIndex = imageChildren[unmatchedCh[p]].idx;
    }

    var matchedCount = imageList.length - unmatchedImgs.length + posCount;
    if (matchedCount < imageList.length) {
      console.warn('[NotionSnap] Phase 2: matched ' + matchedCount + '/' + imageList.length + ' block IDs');
    }

    // 从下往上处理，避免删除导致位置偏移
    imageList.sort(function(a, b) { return (b.childIndex || 0) - (a.childIndex || 0); });

    var task = {
      pageId: pageId,
      botId: botId,
      totalImages: imageList.length,
      completedImages: 0,
      failedImages: 0,
      imageList: imageList,
      currentIndex: 0,
      allChildren: allChildren,
      startedAt: Date.now(),
      lastUpdatedAt: Date.now(),
      sourceTabId: sourceTabId || null
    };
    saveImageTaskState(task);

    enqueueImageTask(token, task);
  }).catch(function(err) {
    console.error('[NotionSnap] fetchPageChildren failed for image replacement:', err && err.message ? err.message : err);
  });
}

function fetchPageChildren(token, pageId, startCursor, accumulator) {
  var url = '/v1/blocks/' + pageId.replace(/-/g, '') + '/children?page_size=100';
  if (startCursor) url += '&start_cursor=' + startCursor;

  return notionFetch(url, token, { method: 'GET' }).then(function(response) {
    var results = accumulator.concat(response.results || []);
    if (response.has_more && response.next_cursor) {
      return delay(RATE_LIMIT_DELAY).then(function() {
        return fetchPageChildren(token, pageId, response.next_cursor, results);
      });
    }
    return results;
  });
}

function processImageReplacementBatch(token, task) {
  var idx = task.currentIndex;
  if (idx >= task.totalImages) {
    cleanupImageTask(task.pageId);
    return;
  }

  var imageInfo = task.imageList[idx];
  if (imageInfo.status === 'done' || imageInfo.status === 'failed') {
    task.currentIndex = idx + 1;
    task.lastUpdatedAt = Date.now();
    saveImageTaskState(task);
    return processImageReplacementBatch(token, task);
  }

  imageInfo.status = 'importing';
  task.lastUpdatedAt = Date.now();
  saveImageTaskState(task);

  var shortUrl = imageInfo.externalUrl.substring(0, 80);
  console.log('[NotionSnap] Phase 2 [' + (idx + 1) + '/' + task.totalImages + '] ' + shortUrl);

  // 恢复时如果上次已拿到 notionFileId，跳过上传直接替换
  var uploadPromise;
  if (imageInfo.notionFileId) {
    uploadPromise = Promise.resolve();
  } else {
    uploadPromise = importImageViaExternalUrl(token, imageInfo.externalUrl, imageInfo.filename)
      .then(function(fileUploadId) {
        imageInfo.fileUploadId = fileUploadId;
        saveImageTaskState(task);
        return pollFileUploadStatus(token, fileUploadId, 10);
      })
      .then(function(fileUploadObj) {
        if (fileUploadObj.status === 'uploaded') {
          imageInfo.notionFileId = fileUploadObj.id;
          saveImageTaskState(task);
          return;
        }
        throw new Error('File upload status: ' + (fileUploadObj.status || 'unknown'));
      });
  }

  uploadPromise
    .then(function() {
      return replaceImageBlock(token, task, idx);
    })
    .then(function() {
      imageInfo.status = 'done';
      task.completedImages++;
      console.log('[NotionSnap] Phase 2 [' + (idx + 1) + '/' + task.totalImages + '] done (external_url)');
      return advance();
    })
    .catch(function(err) {
      // 上传或替换失败 → 尝试二进制回退
      console.warn('[NotionSnap] Phase 2 [' + (idx + 1) + '/' + task.totalImages + '] retrying via binary: ' + (err && err.message ? err.message : err));
      imageInfo.notionFileId = null;
      imageInfo.fileUploadId = null;
      imageInfo.blockDeleted = false;
      return downloadAndUploadFallback(token, task, idx).then(function() {
        return advance();
      });
    });

  function advance() {
    task.currentIndex = idx + 1;
    task.lastUpdatedAt = Date.now();
    saveImageTaskState(task);
    if (task.currentIndex < task.totalImages) {
      return delay(FILE_UPLOAD_RATE_LIMIT_DELAY).then(function() {
        return processImageReplacementBatch(token, task);
      });
    }
    var elapsed = ((Date.now() - task.startedAt) / 1000).toFixed(1);
    console.log('[NotionSnap] Phase 2 complete: ' + task.completedImages + ' done, ' + task.failedImages + ' failed, ' + elapsed + 's');
    cleanupImageTask(task.pageId);
    return Promise.resolve();
  }
}

function downloadAndUploadFallback(token, task, idx) {
  var imageInfo = task.imageList[idx];

  // 优先通过源页面标签页下载图片（页面上下文中 Referer 天然正确，解决 CDN 防盗链 403）
  var downloadPromise;
  if (task.sourceTabId) {
    downloadPromise = downloadImageViaTab(task.sourceTabId, imageInfo.externalUrl);
  } else {
    downloadPromise = downloadImageViaSW(imageInfo.externalUrl);
  }

  return downloadPromise.then(function(blob) {
    if (!blob || blob.size === 0) throw new Error('Empty blob');
    if (blob.size > MAX_IMAGE_SIZE_BYTES) throw new Error('Image too large');
    var contentType = blob.type || 'image/png';

    return requestFileUpload(token, imageInfo.filename, contentType, blob.size).then(function(uploadInfo) {
      return uploadBinaryToSignedUrl(uploadInfo.upload_url, blob, contentType, token).then(function() {
        imageInfo.notionFileId = uploadInfo.id;
        return replaceImageBlock(token, task, idx);
      });
    });
  }).then(function() {
    imageInfo.status = 'done';
    task.completedImages++;
    console.log('[NotionSnap] Phase 2 [' + (idx + 1) + '/' + task.totalImages + '] done (binary fallback)');
    return Promise.resolve();
  }).catch(function(err) {
    console.error('[NotionSnap] Phase 2 [' + (idx + 1) + '/' + task.totalImages + '] FAILED:', err && err.message ? err.message : err);
    imageInfo.status = 'failed';
    task.failedImages++;
    return Promise.resolve();
  });
}

// 通过页面标签页下载（页面上下文，Referer 正确）
function downloadImageViaTab(tabId, url) {
  return new Promise(function(resolve, reject) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: 'MAIN',
      func: function(imageUrl) {
        // 先尝试 fetch（有 credentials + referrer）
        return fetch(imageUrl, { credentials: 'include', referrerPolicy: 'no-referrer-when-downgrade' }).then(function(r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.arrayBuffer();
        }).then(function(buf) {
          return Array.from(new Uint8Array(buf));
        }).catch(function(fetchErr) {
          // fetch 失败（通常是 CDN 检查 Sec-Fetch-Mode），回退到图片加载+canvas
          // <img> 标签加载使用 no-cors 模式，浏览器原生机制绕过 CDN 检查
          return new Promise(function(resolve, reject) {
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() {
              try {
                var canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // 尝试 toBlob（Chrome 支持），否则用 toDataURL
                if (canvas.toBlob) {
                  canvas.toBlob(function(blob) {
                    if (blob && blob.size > 0) {
                      blob.arrayBuffer().then(function(buf) {
                        resolve(Array.from(new Uint8Array(buf)));
                      }).catch(function(e) {
                        reject(new Error('Blob read failed: ' + e.message));
                      });
                    } else {
                      reject(new Error('Empty canvas blob'));
                    }
                  }, 'image/png');
                } else {
                  // Safari 等不支持 toBlob 时用 toDataURL
                  var dataUrl = canvas.toDataURL('image/png');
                  var parts = dataUrl.split(',');
                  if (parts.length === 2) {
                    var binaryStr = atob(parts[1]);
                    var bytes = new Uint8Array(binaryStr.length);
                    for (var bi = 0; bi < binaryStr.length; bi++) {
                      bytes[bi] = binaryStr.charCodeAt(bi);
                    }
                    resolve(Array.from(bytes));
                  } else {
                    reject(new Error('Invalid data URL'));
                  }
                }
              } catch(e) {
                reject(new Error('Canvas error: ' + e.message));
              }
            };
            img.onerror = function() {
              reject(new Error(fetchErr.message));
            };
            img.src = imageUrl;
          });
        }).catch(function(e) {
          return 'ERROR:' + e.message;
        });
      },
      args: [url]
    }, function(results) {
      if (chrome.runtime.lastError) {
        // 标签页关闭或注入失败 → 回退到 SW 下载
        console.warn('[NotionSnap] Tab download unavailable: ' + chrome.runtime.lastError.message);
        downloadImageViaSW(url).then(resolve).catch(reject);
        return;
      }
      var result = results && results[0] ? results[0].result : null;
      if (Array.isArray(result)) {
        var blob = new Blob([new Uint8Array(result)]);
        resolve(blob);
      } else if (typeof result === 'string' && result.indexOf('ERROR:') === 0) {
        // 页面内下载也失败了，回退到 SW 下载
        console.warn('[NotionSnap] Tab download failed: ' + result.substring(6) + ', trying SW download');
        downloadImageViaSW(url).then(resolve).catch(reject);
      } else {
        downloadImageViaSW(url).then(resolve).catch(reject);
      }
    });
  });
}

// Service Worker 直接下载（可能因 CDN 防盗链而 403）
function downloadImageViaSW(url) {
  return fetch(url).then(function(response) {
    if (!response.ok) throw new Error('Download failed: HTTP ' + response.status);
    return response.blob();
  });
}

function importImageViaExternalUrl(token, externalUrl, filename) {
  return fetch(NOTION_API + '/v1/file_uploads', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Notion-Version': '2026-03-11',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: 'external_url',
      external_url: externalUrl,
      filename: filename,
    }),
  }).then(function(response) {
    if (!response.ok) {
      return response.json().catch(function() { return {}; }).then(function(body) {
        throw new Error('external_url import failed: ' + (body.message || 'HTTP ' + response.status));
      });
    }
    return response.json();
  }).then(function(data) {
    return data.id;
  });
}

function pollFileUploadStatus(token, fileUploadId, remainingAttempts) {
  if (remainingAttempts <= 0) {
    return Promise.reject(new Error('File upload polling timed out'));
  }
  return delay(3000).then(function() {
    return fetch(NOTION_API + '/v1/file_uploads/' + fileUploadId, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2026-03-11',
      },
    }).then(function(response) {
      if (!response.ok) throw new Error('Poll failed: HTTP ' + response.status);
      return response.json();
    }).then(function(data) {
      if (data.status === 'uploaded' || data.status === 'failed') return data;
      var nextDelay = Math.min((10 - remainingAttempts + 1) * 2000, 10000);
      return delay(nextDelay).then(function() {
        return pollFileUploadStatus(token, fileUploadId, remainingAttempts - 1);
      });
    });
  });
}

function replaceImageBlock(token, task, idx) {
  var imageInfo = task.imageList[idx];
  var allChildren = task.allChildren;
  var childIndex = imageInfo.childIndex;

  if (!imageInfo.blockId || !imageInfo.notionFileId) return Promise.resolve();

  // 找到前一个 block 用于 after 定位
  var afterBlockId = null;
  if (childIndex > 0) {
    for (var i = childIndex - 1; i >= 0; i--) {
      var prevBlock = allChildren[i];
      if (prevBlock.id !== imageInfo.blockId) {
        afterBlockId = prevBlock.id;
        break;
      }
    }
  }

  // 如果已标记 blockDeleted，跳过 delete（SW 恢复时 block 可能已在上一轮被删除）
  var deletePromise = imageInfo.blockDeleted
    ? Promise.resolve()
    : deleteBlock(token, imageInfo.blockId).then(function() {
        imageInfo.blockDeleted = true;
        task.lastUpdatedAt = Date.now();
        return saveImageTaskState(task);
      });

  return deletePromise.then(function() {
    return delay(RATE_LIMIT_DELAY).then(function() {
      var newBlock = {
        object: 'block',
        type: 'image',
        image: {
          type: 'file_upload',
          file_upload: { id: imageInfo.notionFileId },
          caption: imageInfo.caption,
        },
      };
      var bodyObj = { children: [newBlock] };
      if (afterBlockId) bodyObj.after = afterBlockId;

      return appendSingleBlock(token, task.pageId, bodyObj).then(function(response) {
        if (response && response.results && response.results[0]) {
          allChildren[childIndex] = response.results[0];
          task.allChildren = allChildren;
        }
      });
    });
  });
}

function deleteBlock(token, blockId) {
  return notionFetch('/v1/blocks/' + blockId.replace(/-/g, ''), token, {
    method: 'DELETE',
  }).catch(function(err) {
    var msg = err.message || '';
    if (msg.indexOf('not find') >= 0 || msg.indexOf('archived') >= 0) return;
    throw err;
  });
}

function appendSingleBlock(token, pageId, bodyObj) {
  var url = '/v1/blocks/' + pageId.replace(/-/g, '') + '/children';
  return notionFetch(url, token, {
    method: 'PATCH',
    body: JSON.stringify(bodyObj),
  });
}

function saveImageTaskState(task) {
  var kv = {};
  kv[STORE.IMAGE_TASK_PREFIX + task.pageId] = task;
  chrome.storage.local.set(kv);
}

function cleanupImageTask(pageId) {
  chrome.storage.local.remove(STORE.IMAGE_TASK_PREFIX + pageId, function() {
    dequeueAndProcessNext();
  });
}

// 任务队列：相同 name 只跑一个
function enqueueImageTask(token, task) {
  chrome.storage.local.get([STORE.IMAGE_TASK_QUEUE], function(result) {
    var queue = result[STORE.IMAGE_TASK_QUEUE] || [];
    // 去重：同 pageId 只保留最新的
    queue = queue.filter(function(e) { return e.pageId !== task.pageId; });
    queue.push({ pageId: task.pageId, startedAt: task.startedAt });
    var isFirst = queue.length === 1;

    var kv = {};
    kv[STORE.IMAGE_TASK_QUEUE] = queue;
    chrome.storage.local.set(kv, function() {
      if (isFirst) {
        acquireAndProcess(token, task);
      } else {
        console.log('[NotionSnap] Phase 2 queued for page ' + task.pageId + ' (waiting, ' + queue.length + ' jobs)');
      }
    });
  });
}

function acquireAndProcess(token, task) {
  processImageReplacementBatch(token, task);
}

function dequeueAndProcessNext() {
  chrome.storage.local.get([STORE.IMAGE_TASK_QUEUE], function(result) {
    var queue = result[STORE.IMAGE_TASK_QUEUE] || [];
    if (queue.length > 0) queue.shift(); // 移除当前已完成的任务

    // 找到下一个有有效存储的任务
    function tryNext() {
      if (queue.length === 0) {
        // 清理残留的已完成任务
        chrome.storage.local.get(null, function(all) {
          var keys = Object.keys(all);
          for (var i = 0; i < keys.length; i++) {
            if (keys[i].indexOf(STORE.IMAGE_TASK_PREFIX) === 0) {
              var t = all[keys[i]];
              if (!t || t.currentIndex >= t.totalImages) {
                chrome.storage.local.remove(keys[i]);
              }
            }
          }
          chrome.storage.local.remove(STORE.IMAGE_TASK_QUEUE);
        });
        return;
      }
      var next = queue[0];
      var taskKey = STORE.IMAGE_TASK_PREFIX + next.pageId;
      chrome.storage.local.get([taskKey], function(r) {
        var pendingTask = r[taskKey];
        if (!pendingTask || pendingTask.currentIndex >= pendingTask.totalImages) {
          chrome.storage.local.remove(taskKey);
          queue.shift();
          var kv2 = {};
          kv2[STORE.IMAGE_TASK_QUEUE] = queue;
          chrome.storage.local.set(kv2, function() { tryNext(); });
          return;
        }
        if (Date.now() - pendingTask.startedAt > 3600000) {
          chrome.storage.local.remove(taskKey);
          queue.shift();
          var kv3 = {};
          kv3[STORE.IMAGE_TASK_QUEUE] = queue;
          chrome.storage.local.set(kv3, function() { tryNext(); });
          return;
        }
        var kv4 = {};
        kv4[STORE.IMAGE_TASK_QUEUE] = queue;
        chrome.storage.local.set(kv4, function() {
          getValidToken().then(function(token) {
            if (!token) {
              chrome.storage.local.remove([STORE.IMAGE_TASK_QUEUE, taskKey]);
              return;
            }
            processImageReplacementBatch(token, pendingTask);
          });
        });
      });
    }
    tryNext();
  });
}

function loadAndResumePendingImageTasks() {
  chrome.storage.local.get(null, function(all) {
    var keys = Object.keys(all);
    var pendingTasks = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.indexOf(STORE.IMAGE_TASK_PREFIX) === 0) {
        var t = all[key];
        if (!t || !t.pageId || t.currentIndex >= t.totalImages) {
          chrome.storage.local.remove(key);
          continue;
        }
        if (Date.now() - t.startedAt > 3600000) {
          chrome.storage.local.remove(key);
          continue;
        }
        pendingTasks.push(t);
      }
    }
    // 清理残留的 queue（SW 终止时可能不一致）
    chrome.storage.local.remove(STORE.IMAGE_TASK_QUEUE);

    if (pendingTasks.length === 0) return;

    // 按 startedAt 排序，最早的在最前面
    pendingTasks.sort(function(a, b) { return a.startedAt - b.startedAt; });

    // 重建队列
    var queue = [];
    for (var j = 0; j < pendingTasks.length; j++) {
      queue.push({ pageId: pendingTasks[j].pageId, startedAt: pendingTasks[j].startedAt });
    }
    var kv = {};
    kv[STORE.IMAGE_TASK_QUEUE] = queue;
    chrome.storage.local.set(kv, function() {
      console.log('[NotionSnap] Resuming ' + pendingTasks.length + ' pending image task(s): ' + pendingTasks[0].completedImages + '/' + pendingTasks[0].totalImages + ' done');
      getValidToken().then(function(token) {
        if (!token) return;
        processImageReplacementBatch(token, pendingTasks[0]);
      });
    });
  });
}

// ============================================================
// 获取默认父页面
// ============================================================
function getDefaultParent(token, explicitParentId, botId, targetType) {
  if (explicitParentId) {
    return Promise.resolve({ id: explicitParentId, type: targetType || 'page' });
  }

  // 未选择目标页面时，fallback 到最近保存的页面
  var rpKey = recentPagesKey(botId);
  return new Promise(function(resolve) {
    chrome.storage.local.get([rpKey], function(result) {
      var recentPages = result[rpKey] || [];
      if (recentPages.length > 0) {
        resolve({ id: recentPages[0].id, type: recentPages[0].type || 'page' });
      } else {
        // 没有最近保存记录，fallback 到 Notion 搜索
        resolve(fallbackToDefaultPage(token).then(function(id) {
          return { id: id, type: 'page' };
        }));
      }
    });
  });
}

function fallbackToDefaultPage(token) {
  return notionFetch('/v1/search', token, {
    method: 'POST',
    body: JSON.stringify({
      query: '',
      filter: { property: 'object', value: 'page' },
      page_size: 1,
    }),
  }).then(function(response) {
    if (response.results && response.results.length > 0) {
      return response.results[0].id;
    }
    throw new Error('Integration 没有访问任何页面，请先在 Notion 中创建页面并授权给 Connection');
  }).catch(function(err) {
    if (err.message && err.message.indexOf('没有访问任何页面') >= 0) {
      throw err;
    }
    throw new Error('无法获取 Notion 页面列表: ' + (err.message || '未知错误'));
  });
}

// ============================================================
// 解析 /v1/search 响应，提取 pages 和 databases
// ============================================================
function parseSearchResponse(response) {
  var results = response.results || [];
  var pages = [];
  var databases = [];

  for (var i = 0; i < results.length; i++) {
    var item = results[i];
    if (item.object === 'database') {
      databases.push({
        id: item.id,
        title: (item.title && item.title.length > 0) ? item.title.map(function(t) { return t.plain_text; }).join('') : 'Untitled',
        url: item.url || '',
      });
    } else if (item.object === 'page') {
      var parentType = (item.parent && item.parent.type) ? item.parent.type : null;
      pages.push({
        id: item.id,
        title: getPageTitle(item),
        url: item.url || '',
        parentType: parentType,
      });
    }
  }

  // 按标题去重
  var seenTitles = {};
  var dedupedPages = [];
  for (var j = 0; j < pages.length; j++) {
    var key = pages[j].title.toLowerCase();
    if (!seenTitles[key]) {
      seenTitles[key] = true;
      dedupedPages.push(pages[j]);
    }
  }

  return { pages: dedupedPages, databases: databases };
}

// ============================================================
// 获取用户可访问的页面列表
// ============================================================
function fetchNotionPages(token, query) {
  var q = (query && query.trim()) ? query.trim() : '';

  function searchOne(filterObj, sortDir) {
    var body = { page_size: 100 };
    if (sortDir) {
      body.sort = { direction: sortDir, timestamp: 'last_edited_time' };
    }
    if (q) body.query = q;
    if (filterObj) body.filter = filterObj;

    return notionFetch('/v1/search', token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // 搜索时 query 不为空，Notion API 按相关性排序（sort 参数被忽略）
  // 此处分两个请求查 database + page，避免一种类型挤掉另一种
  if (q) {
    return Promise.all([
      searchOne({ property: 'object', value: 'database' }),
      searchOne({ property: 'object', value: 'page' }),
    ]).then(function(results) {
      var dbResult = parseSearchResponse(results[0]);
      var pageResult = parseSearchResponse(results[1]);

      console.log('[NotionSnap SW] API search ("' + q + '") — databases:', dbResult.databases.length,
                  '| pages:', pageResult.pages.length);
      return { success: true, pages: pageResult.pages, databases: dbResult.databases };
    }).catch(function(err) {
      console.error('[NotionSnap] Fetch pages failed:', err);
      return { success: false, error: err.message, pages: [], databases: [] };
    });
  }

  // 无搜索词：数据库 + 3 种页面排序（desc/asc/默认），去重后最大化覆盖
  return Promise.all([
    searchOne({ property: 'object', value: 'database' }),
    searchOne({ property: 'object', value: 'page' }, 'descending'),
    searchOne({ property: 'object', value: 'page' }, 'ascending'),
    searchOne({ property: 'object', value: 'page' }), // 无 sort，API 默认顺序
  ]).then(function(results) {
    var dbResult = parseSearchResponse(results[0]);
    var descPages = parseSearchResponse(results[1]);
    var ascPages = parseSearchResponse(results[2]);
    var defaultPages = parseSearchResponse(results[3]);

    // 合并三种排序结果，按标题去重
    var seenTitles = {};
    var mergedPages = [];
    var allPageResults = descPages.pages.concat(ascPages.pages).concat(defaultPages.pages);
    for (var j = 0; j < allPageResults.length; j++) {
      var key = allPageResults[j].title.toLowerCase();
      if (!seenTitles[key]) {
        seenTitles[key] = true;
        mergedPages.push(allPageResults[j]);
      }
    }

    console.log('[NotionSnap SW] API search (no query) — databases:', dbResult.databases.length,
                '| desc pages:', descPages.pages.length,
                '| asc pages:', ascPages.pages.length,
                '| default pages:', defaultPages.pages.length,
                '| merged unique pages:', mergedPages.length);
    return { success: true, pages: mergedPages, databases: dbResult.databases };
  }).catch(function(err) {
    console.error('[NotionSnap] Fetch pages failed:', err);
    return { success: false, error: err.message, pages: [], databases: [] };
  });
}

function getPageTitle(page) {
  var props = page.properties || {};

  if (props.title) {
    var items = props.title.title || [];
    var text = items.map(function(t) { return t.plain_text; }).join('');
    if (text) return text;
  }

  if (props.Name) {
    var items = props.Name.title || [];
    var text = items.map(function(t) { return t.plain_text; }).join('');
    if (text) return text;
  }

  var keys = Object.keys(props);
  for (var i = 0; i < keys.length; i++) {
    var val = props[keys[i]];
    if (val && val.title && val.title.length > 0) {
      var text = val.title.map(function(t) { return t.plain_text; }).join('');
      if (text) return text;
    }
  }

  if (page.url) {
    var parts = page.url.split('-').slice(-2);
    return parts.join('-').substring(0, 30);
  }

  return 'Untitled Page';
}

// ============================================================
// Notion API 请求封装（含重试）
// ============================================================
function notionFetch(path, token, options, apiVersion) {
  var version = apiVersion || '2022-06-28';
  var maxRetries = 3;
  var attempt = 0;

  function doFetch() {
    attempt++;
    return fetch(NOTION_API + path, {
      method: options.method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': version,
        'Content-Type': 'application/json',
      },
      body: options.body || null,
    }).then(function(response) {
      if (response.ok) {
        return response.json();
      }

      return response.json().catch(function() { return {}; }).then(function(errorBody) {
        var errorMsg = errorBody.message || 'HTTP ' + response.status;

        if (response.status === 429) {
          var retryAfter = parseInt(response.headers.get('Retry-After') || '5');
          return delay(retryAfter * 1000).then(function() {
            return doFetch();
          });
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error('认证失败: ' + errorMsg);
        }

        throw new Error(errorMsg);
      });
    }).catch(function(err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch' && attempt < maxRetries) {
        return delay(1000 * attempt).then(doFetch);
      }
      throw err;
    });
  }

  return doFetch();
}

// ============================================================
// 工具函数
// ============================================================
function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// ============================================================
// File Upload 图片上传工具函数（v0.4.0）
// ============================================================
function getContentTypeFromUrl(url) {
  var lower = url.toLowerCase();
  if (lower.indexOf('.png') >= 0) return 'image/png';
  if (lower.indexOf('.jpg') >= 0 || lower.indexOf('.jpeg') >= 0) return 'image/jpeg';
  if (lower.indexOf('.gif') >= 0) return 'image/gif';
  if (lower.indexOf('.webp') >= 0) return 'image/webp';
  if (lower.indexOf('.svg') >= 0) return 'image/svg+xml';
  if (lower.indexOf('.bmp') >= 0) return 'image/bmp';
  if (lower.indexOf('.ico') >= 0) return 'image/x-icon';
  return 'image/png';
}

function getFilenameFromUrl(url, contentType) {
  try {
    var urlObj = new URL(url);
    var parts = urlObj.pathname.split('/');
    var lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.indexOf('.') >= 0 && lastPart.length > 1) {
      return lastPart.split('?')[0];
    }
  } catch (e) { /* fall through */ }
  var ext = contentType.split('/')[1] || 'png';
  if (ext === 'svg+xml') ext = 'svg';
  if (ext === 'x-icon') ext = 'ico';
  return 'image.' + ext;
}

// ============================================================
// 右键菜单 + 快捷键保存（v0.3.7）
// ============================================================

function recentPagesKey(botId) {
  return STORE.RECENT_PAGES_PREFIX + (botId || 'default');
}

function saveHistoryKey(botId) {
  return STORE.SAVE_HISTORY_PREFIX + (botId || 'default');
}

function savedTargetsKey(botId) {
  return STORE.SAVED_TARGETS_PREFIX + (botId || 'default');
}

function addToSavedTargets(botId, id, title, type) {
  if (!id || !title || !botId) return;
  var key = savedTargetsKey(botId);
  chrome.storage.local.get([key], function(result) {
    var list = result[key] || [];
    list = list.filter(function(t) { return t.id !== id; });
    list.unshift({ id: id, title: title, type: type || 'page', parentType: null });
    if (list.length > 200) list = list.slice(0, 200);
    chrome.storage.local.set({ [key]: list });
  });
}

function recordHistory(data, saveResult, targetPageName, botId) {
  if (!botId) return;
  var key = saveHistoryKey(botId);
  // 获取目标页面名（从 popup 传过来的，这里先跳过获取，直接存空）
  chrome.storage.local.get([key], function(result) {
    var history = result[key] || [];
    var entry = {
      id: 'h_' + Date.now(),
      sourceTitle: data.title || '',
      sourceUrl: data.url || '',
      savedPageTitle: data.title || '',
      notionUrl: saveResult.success ? (saveResult.pageUrl || '') : '',
      targetPageName: targetPageName || '',
      timestamp: Date.now(),
      status: saveResult.success ? 'success' : 'failed',
      error: saveResult.error || '',
      blocksCount: saveResult.blocksCount || 0,
      extractedData: null,
    };
    history.unshift(entry);
    if (history.length > 50) history = history.slice(0, 50);

    var kv = {};
    kv[key] = history;
    chrome.storage.local.set(kv);
  });
}

function extractFromTab(tab) {
  return new Promise(function(resolve) {
    chrome.tabs.sendMessage(tab.id, { action: 'extract' }, function(response) {
      if (chrome.runtime.lastError) {
        // Content script 未连接（扩展刚更新、页面未刷新），尝试注入
        var manifest = chrome.runtime.getManifest();
        var csFiles = (manifest.content_scripts && manifest.content_scripts[0] && manifest.content_scripts[0].js) ? manifest.content_scripts[0].js : [];
        if (csFiles.length === 0) {
          resolve({ error: '无法连接到页面，请刷新页面后重试', title: '' });
          return;
        }
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: csFiles,
        }, function() {
          if (chrome.runtime.lastError) {
            resolve({ error: '无法连接到页面，请刷新页面后重试', title: '' });
            return;
          }
          chrome.tabs.sendMessage(tab.id, { action: 'extract' }, function(retryResponse) {
            if (chrome.runtime.lastError) {
              resolve({ error: '无法连接到页面，请刷新页面后重试', title: '' });
              return;
            }
            resolve(retryResponse || { error: '提取失败', title: '' });
          });
        });
        return;
      }
      resolve(response || { error: '提取失败', title: '' });
    });
  });
}

function showSaveNotification(title, message, pageUrl) {
  var notifId = 'save-' + Date.now();
  var options = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('public/icons/icon-48.png'),
    title: 'NotionSnap — ' + title,
    message: message,
  };
  chrome.notifications.create(notifId, options, function(createdId) {
    if (chrome.runtime.lastError) {
      console.error('[NotionSnap] Notification failed:', chrome.runtime.lastError.message);
    }
  });
  if (pageUrl) {
    var kv = {};
    kv[STORE.NOTIF_URL_PREFIX + notifId] = pageUrl;
    chrome.storage.local.set(kv);
  }
}

// 扩展图标 badge 降级提示（系统通知不可用时仍能看到反馈）
function showBadge(text, bgColor) {
  chrome.action.setBadgeBackgroundColor({ color: bgColor });
  chrome.action.setBadgeText({ text: text });
}

function clearBadgeAfter(ms) {
  setTimeout(function() {
    chrome.action.setBadgeText({ text: '' });
  }, ms);
}

// 在页面上弹出 toast（比系统通知更可靠，macOS 不会屏蔽）
function showPageToast(tabId, type, message, pageUrl) {
  var bgColor = type === 'success' ? '#10b981' : '#ef4444';
  var icon = type === 'success' ? '✓' : '✕';
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: function(bg, ic, msg, url) {
      var styleEl = document.createElement('style');
      styleEl.textContent = '@keyframes ns-fade-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(styleEl);
      var toast = document.createElement('div');
      toast.id = 'notion-saver-toast';
      toast.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:' + bg + ';color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.25);display:flex;align-items:center;gap:6px;animation:ns-fade-in 0.3s ease;opacity:1;transition:opacity 0.5s ease';
      var inner = ic + ' ' + msg;
      if (url) {
        inner += ' <a href="' + url + '" target="_blank" style="color:#fff;text-decoration:underline;margin-left:4px">在 Notion 中打开</a>';
      }
      toast.innerHTML = inner;
      document.body.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 500);
      }, 5000);
    },
    args: [bgColor, icon, message, pageUrl],
  }).catch(function(err) {
    console.error('[NotionSnap] Page toast failed:', err && err.message ? err.message : err);
  });
}

function saveCurrentPage(tab) {
  var saveParams = null; // 闭包变量，供后续 .then 使用
  showBadge('...', '#888888');
  extractFromTab(tab).then(function(data) {
    if (!data || data.error) {
      showBadge('!', '#ef4444');
      clearBadgeAfter(5000);
      showPageToast(tab.id, 'error', data ? data.error : '无法获取页面内容');
      showSaveNotification('提取失败', data ? data.error : '无法获取页面内容');
      return Promise.reject(new Error('extraction failed'));
    }

    return new Promise(function(resolve) {
      chrome.storage.local.get([STORE.WORKSPACES, STORE.CURRENT_BOT], function(result) {
        var workspaces = result[STORE.WORKSPACES] || [];
        var botId = result[STORE.CURRENT_BOT];

        if (!botId || workspaces.length === 0) {
          showBadge('!', '#ef4444');
          clearBadgeAfter(5000);
          showPageToast(tab.id, 'error', '请先点击扩展图标登录 Notion');
          showSaveNotification('未登录', '请先点击扩展图标登录 Notion');
          resolve(null);
          return;
        }

        var rpKey = recentPagesKey(botId);
        chrome.storage.local.get([rpKey], function(rpResult) {
          var recentPages = rpResult[rpKey] || [];
          var targetInfo = recentPages.length > 0 ? recentPages[0] : null;
          saveParams = { botId: botId, targetInfo: targetInfo, extractedData: data };
          resolve(saveParams);
        });
      });
    });
  }).then(function(params) {
    if (!params) return;
    return saveToNotion(params.extractedData, params.targetInfo ? params.targetInfo.id : null, params.botId);
  }).then(function(result) {
    if (!result) return;
    if (result.success) {
      showBadge('OK', '#10b981');
      clearBadgeAfter(5000);
      showPageToast(tab.id, 'success', result.blocksCount + ' 个 blocks 已同步到 Notion', result.pageUrl);
      showSaveNotification('保存成功', result.blocksCount + ' 个 blocks 已同步到 Notion', result.pageUrl);
      if (saveParams) {
        recordHistory(saveParams.extractedData, result, '', saveParams.botId);
        if (saveParams.targetInfo) {
          addToSavedTargets(saveParams.botId, saveParams.targetInfo.id, saveParams.targetInfo.title, saveParams.targetInfo.type);
        }
      }
    } else {
      showBadge('!', '#ef4444');
      clearBadgeAfter(5000);
      showPageToast(tab.id, 'error', result.error || '保存失败');
      showSaveNotification('保存失败', result.error || '未知错误');
      if (saveParams) recordHistory(saveParams.extractedData, result, '', saveParams.botId);
    }
  }).catch(function(err) {
    showBadge('!', '#ef4444');
    clearBadgeAfter(5000);
    console.error('[NotionSnap] saveCurrentPage error:', err && err.message ? err.message : err);
  });
}

// 右键菜单点击
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === 'save-to-notion' && tab && tab.id) {
    saveCurrentPage(tab);
  }
});

// 快捷键
chrome.commands.onCommand.addListener(function(command) {
  if (command === 'save-to-notion') {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs && tabs[0] && tabs[0].id) {
        saveCurrentPage(tabs[0]);
      }
    });
  }
});

// 通知点击 → 打开 Notion 页面
chrome.notifications.onClicked.addListener(function(notifId) {
  var key = STORE.NOTIF_URL_PREFIX + notifId;
  chrome.storage.local.get([key], function(result) {
    if (result[key]) {
      chrome.tabs.create({ url: result[key] });
      chrome.storage.local.remove(key);
    }
  });
  chrome.notifications.clear(notifId);
});
