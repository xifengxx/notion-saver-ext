// Background Service Worker — Notion API 集成 (OAuth 多空间版本)
// Blocks 由 content script 通过 DOM 遍历转换，保持原始顺序

var NOTION_API = 'https://api.notion.com';
var BACKEND_URL = 'https://notion-saver-ext-production.up.railway.app';
var RATE_LIMIT_DELAY = 400;
var BLOCK_LIMIT = 100;

var STORE = {
  WORKSPACES: 'notion_workspaces',
  CURRENT_BOT: 'notion_current_workspace_bot_id',
  TOKEN_FAILED: 'notion_token_refresh_failed',
  OAUTH_SESSION: 'oauth_session_id',
  SAVE_STATE: 'notion_save_state',
  RECENT_PAGES_PREFIX: 'recent_pages_',
  NOTIF_URL_PREFIX: 'notif_url_',
};

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
    saveToNotion(message.data, message.targetPage, botId).then(sendResponse).catch(function(err) {
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
function saveToNotion(data, parentPageId, workspaceBotId) {
  // 标记保存进行中，用于检测 SW 终止导致的中断 + 进度跟踪
  chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'in_progress', startedAt: Date.now(), stage: 'creating_page', blocksTotal: 0, blocksDone: 0, retryCurrent: 0 } });

  return getValidToken().then(function(token) {
    if (!token) {
      return { success: false, error: '未登录或认证已过期，请重新登录' };
    }

    return createPage(token, data, parentPageId).then(function(page) {
      var pageId = page.id;

      var blocks = (data.blocks || []).map(function(b) {
        var result = { object: 'block', type: b.type };
        result[b.type] = b[b.type];
        return result;
      });

      if (blocks.length === 0) {
        chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'completed', at: Date.now() } });
        return {
          success: true,
          pageUrl: page.url,
          pageId: pageId,
          blocksCount: 0,
        };
      }

      var chunks = [];
      for (var i = 0; i < blocks.length; i += BLOCK_LIMIT) {
        chunks.push(blocks.slice(i, i + BLOCK_LIMIT));
      }

      // 写入总 blocks 数
      chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'in_progress', startedAt: Date.now(), stage: 'appending_blocks', blocksTotal: blocks.length, blocksDone: 0 } });
      showBadge('0/' + chunks.length, '#888888');

      return appendAllBlocks(token, pageId, chunks, 0, blocks.length).then(function() {
        chrome.storage.local.set({ [STORE.SAVE_STATE]: { status: 'completed', at: Date.now() } });
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
// 创建页面
// ============================================================
function createPage(token, data, parentPageId) {
  return getDefaultParent(token, parentPageId).then(function(parent) {
    var properties = {
      title: {
        title: [{ type: 'text', text: { content: data.title || 'Untitled' } }],
      },
    };

    var urlText;
    if (data.url && data.url.indexOf('http') === 0) {
      var cleanUrl = data.url.split('#')[0];
      urlText = {
        type: 'text',
        text: { content: cleanUrl, link: { url: cleanUrl } },
        annotations: { color: 'gray' },
      };
    } else {
      urlText = {
        type: 'text',
        text: { content: data.url || '' },
        annotations: { color: 'gray' },
      };
    }

    var children = [
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [urlText],
        },
      },
      {
        object: 'block',
        type: 'divider',
        divider: {},
      },
    ];

    if (data.author || data.publishTime) {
      var metaText = [data.author, data.publishTime].filter(Boolean).join(' · ');
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: metaText } }],
        },
      });
      children.push({
        object: 'block',
        type: 'divider',
        divider: {},
      });
    }

    var body = {
      parent: { page_id: parent.id },
      properties: properties,
      children: children,
    };

    return notionFetch('/v1/pages', token, {
      method: 'POST',
      body: JSON.stringify(body),
    }).catch(function(err) {
      if (parent.type === 'page' && err.message &&
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
// 获取默认父页面
// ============================================================
function getDefaultParent(token, explicitParentId) {
  if (explicitParentId) {
    return Promise.resolve({ id: explicitParentId, type: 'page' });
  }

  return fallbackToDefaultPage(token).then(function(id) {
    return { id: id, type: 'page' };
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
// 获取用户可访问的页面列表
// ============================================================
function fetchNotionPages(token, query) {
  var searchBody = {
    page_size: 50,
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  };

  if (query && query.trim()) {
    searchBody.query = query.trim();
  }

  return notionFetch('/v1/search', token, {
    method: 'POST',
    body: JSON.stringify(searchBody),
  }).then(function(response) {
    var results = response.results || [];
    var pages = [];
    var databases = [];

    for (var i = 0; i < results.length; i++) {
      var item = results[i];
      if (item.object === 'database') {
        databases.push({
          id: item.id,
          title: item.title ? item.title.map(function(t) { return t.plain_text; }).join('') : 'Untitled',
          url: item.url || '',
        });
      } else if (item.object === 'page') {
        pages.push({
          id: item.id,
          title: getPageTitle(item),
          url: item.url || '',
        });
      }
    }

    return { success: true, pages: pages, databases: databases };
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
function notionFetch(path, token, options) {
  var maxRetries = 3;
  var attempt = 0;

  function doFetch() {
    attempt++;
    return fetch(NOTION_API + path, {
      method: options.method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
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
// 右键菜单 + 快捷键保存（v0.3.7）
// ============================================================

function recentPagesKey(botId) {
  return STORE.RECENT_PAGES_PREFIX + (botId || 'default');
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
          var parentId = recentPages.length > 0 ? recentPages[0].id : null;
          resolve({ botId: botId, parentId: parentId, extractedData: data });
        });
      });
    });
  }).then(function(params) {
    if (!params) return;
    return saveToNotion(params.extractedData, params.parentId, params.botId);
  }).then(function(result) {
    if (!result) return;
    if (result.success) {
      showBadge('OK', '#10b981');
      clearBadgeAfter(5000);
      showPageToast(tab.id, 'success', result.blocksCount + ' 个 blocks 已同步到 Notion', result.pageUrl);
      showSaveNotification('保存成功', result.blocksCount + ' 个 blocks 已同步到 Notion', result.pageUrl);
    } else {
      showBadge('!', '#ef4444');
      clearBadgeAfter(5000);
      showPageToast(tab.id, 'error', result.error || '保存失败');
      showSaveNotification('保存失败', result.error || '未知错误');
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
