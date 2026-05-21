// Background Service Worker — Notion API 集成 (OAuth 版本)
// Blocks 由 content script 通过 DOM 遍历转换，保持原始顺序

var NOTION_API = 'https://api.notion.com';
var BACKEND_URL = 'https://notion-saver-ext-production.up.railway.app';
var RATE_LIMIT_DELAY = 400;
var BLOCK_LIMIT = 100;

// ============================================================
// OAuth 登录轮询（在 background 运行，不受 popup 关闭影响）
// ============================================================
var oauthPollTimers = {};

// 启动 OAuth 登录流程
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
  chrome.storage.local.set({ oauth_session_id: sessionId });

  chrome.tabs.create({ url: BACKEND_URL + '/auth?session=' + sessionId, active: true });

  // 在 background 轮询，不受 popup 关闭影响
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

          // 保存 token，storage.onChanged 会通知 popup 刷新
          chrome.storage.local.set({
            oauth_access_token: data.access_token,
            oauth_refresh_token: data.refresh_token,
            oauth_expires_at: data.expires_at,
            oauth_workspace_name: data.workspace_name,
            oauth_workspace_icon: data.workspace_icon,
            oauth_bot_id: data.bot_id,
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
    saveToNotion(message.data, message.targetPage).then(sendResponse).catch(function(err) {
      console.error('[Notion Saver] Unhandled error in saveToNotion:', err);
      sendResponse({ success: false, error: err.message || '保存失败' });
    });
    return true;
  }

  if (message.action === 'get_settings') {
    chrome.storage.local.get(['image_mode'], function(result) {
      sendResponse(result);
    });
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
        console.error('[Notion Saver] fetch_pages error:', err);
        sendResponse({ success: false, error: err.message || '获取失败', pages: [], databases: [] });
      });
    });
    return true;
  }
});

// ============================================================
// Token 管理
// ============================================================

function getValidToken() {
  return new Promise(function(resolve) {
    chrome.storage.local.get([
      'oauth_access_token',
      'oauth_refresh_token',
      'oauth_expires_at',
    ], function(result) {
      if (!result.oauth_access_token) {
        resolve(null);
        return;
      }

      var expiresAt = result.oauth_expires_at || 0;
      if (expiresAt > 0 && Date.now() > expiresAt - 60000) {
        if (result.oauth_refresh_token) {
          refreshToken(result.oauth_refresh_token).then(function(newTokens) {
            resolve(newTokens.access_token);
          }).catch(function() {
            resolve(null);
          });
        } else {
          resolve(result.oauth_access_token);
        }
      } else {
        resolve(result.oauth_access_token);
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
    return new Promise(function(resolve) {
      chrome.storage.local.set({
        oauth_access_token: tokens.access_token,
        oauth_refresh_token: tokens.refresh_token,
        oauth_expires_at: tokens.expires_at,
      }, function() {
        resolve(tokens);
      });
    });
  });
}

// ============================================================
// Notion API 核心保存流程
// ============================================================
function saveToNotion(data, parentPageId) {
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

      return appendAllBlocks(token, pageId, chunks, 0).then(function() {
        return {
          success: true,
          pageUrl: page.url,
          pageId: pageId,
          blocksCount: blocks.length,
        };
      });
    });
  }).catch(function(err) {
    console.error('[Notion Saver] Save failed:', err);
    return { success: false, error: err.message || '保存失败' };
  });
}

// 递归追加 blocks，含重试机制
function appendAllBlocks(token, pageId, chunks, index) {
  if (index >= chunks.length) {
    return Promise.resolve();
  }
  return appendBlocksWithRetry(token, pageId, chunks[index], 3).then(function() {
    if (index < chunks.length - 1) {
      return delay(RATE_LIMIT_DELAY).then(function() {
        return appendAllBlocks(token, pageId, chunks, index + 1);
      });
    }
    return Promise.resolve();
  });
}

// 追加单个 block 批次，带重试
function appendBlocksWithRetry(token, pageId, blocks, maxRetries) {
  return appendBlocks(token, pageId, blocks).catch(function(err) {
    // 网络错误（Service Worker 休眠后）重试
    if (maxRetries > 0 && err.message && err.message.indexOf('fetch') >= 0) {
      console.log('[Notion Saver] Append blocks failed, retrying... (' + (3 - maxRetries + 1) + '/3)');
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
  // 不再限制只返回数据库，默认返回所有页面和数据库

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
    console.error('[Notion Saver] Fetch pages failed:', err);
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
      // Only retry on actual network failures (request never reached server).
      // Do NOT retry on response.json() failures — the request was already sent,
      // so retrying would duplicate the operation (e.g., duplicate blocks).
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
