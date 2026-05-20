// Background Service Worker — Notion API 集成
// Blocks 由 content script 通过 DOM 遍历转换，保持原始顺序

var NOTION_API = 'https://api.notion.com';
var RATE_LIMIT_DELAY = 400;
var BLOCK_LIMIT = 100;

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
    saveToNotion(message.data, message.targetPage, message.workspaceId).then(sendResponse).catch(function(err) {
      console.error('[Notion Saver] Unhandled error in saveToNotion:', err);
      sendResponse({ success: false, error: err.message || '保存失败' });
    });
    return true;
  }

  if (message.action === 'get_settings') {
    chrome.storage.local.get(['notion_token', 'default_page', 'image_mode', 'notion_workspaces', 'notion_current_workspace'], function(result) {
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

  if (message.action === 'test_connection') {
    testNotionConnection(message.token).then(sendResponse).catch(function(err) {
      sendResponse({ success: false, error: err.message || '测试失败' });
    });
    return true;
  }

  if (message.action === 'fetch_pages') {
    var fetchToken = message.token;
    if (!fetchToken && message.workspaceId) {
      getWorkspaceToken(message.workspaceId).then(function(token) {
        fetchNotionPages(token, message.query).then(sendResponse).catch(function(err) {
          sendResponse({ success: false, error: err.message || '获取失败', pages: [], databases: [] });
        });
      });
    } else if (fetchToken) {
      fetchNotionPages(fetchToken, message.query).then(sendResponse).catch(function(err) {
        sendResponse({ success: false, error: err.message || '获取失败', pages: [], databases: [] });
      });
    } else {
      sendResponse({ success: false, error: '未配置 Notion Integration Token', pages: [], databases: [] });
    }
    return true;
  }

  if (message.action === 'list_workspaces') {
    chrome.storage.local.get(['notion_workspaces', 'notion_current_workspace'], function(result) {
      sendResponse({
        workspaces: result.notion_workspaces || [],
        currentId: result.notion_current_workspace || null,
      });
    });
    return true;
  }

  if (message.action === 'add_workspace') {
    addWorkspace(message.token, message.name).then(sendResponse).catch(function(err) {
      sendResponse({ success: false, error: err.message || '添加失败' });
    });
    return true;
  }

  if (message.action === 'remove_workspace') {
    removeWorkspace(message.id).then(sendResponse).catch(function(err) {
      sendResponse({ success: false, error: err.message || '删除失败' });
    });
    return true;
  }

  if (message.action === 'switch_workspace') {
    chrome.storage.local.set({ notion_current_workspace: message.id }, function() {
      sendResponse({ success: true });
    });
    return true;
  }
});

// ============================================================
// Notion API 核心保存流程
// ============================================================
function saveToNotion(data, parentPageId, workspaceId) {
  return getWorkspaceToken(workspaceId).then(function(token) {
    if (!token) {
      return { success: false, error: '未配置 Notion Integration Token' };
    }

    return createPage(token, data, parentPageId).then(function(page) {
      var pageId = page.id;

      // 转换 blocks
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

      // 分批写入 blocks
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

// 递归追加 blocks，避免 Service Worker 休眠
function appendAllBlocks(token, pageId, chunks, index) {
  if (index >= chunks.length) {
    return Promise.resolve();
  }
  return appendBlocks(token, pageId, chunks[index]).then(function() {
    if (index < chunks.length - 1) {
      return delay(RATE_LIMIT_DELAY).then(function() {
        return appendAllBlocks(token, pageId, chunks, index + 1);
      });
    }
    return Promise.resolve();
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

    // 构建 URL 链接文本（验证并清理 URL）
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
      // page_id 失败时尝试 database_id（用户可能选的是数据库而非页面）
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
  return getSetting('default_page').then(function(saved) {
    if (saved) return saved;

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
      throw new Error('Integration 没有访问任何页面，请先在 Notion 中创建页面并授权给 Integration');
    }).catch(function(err) {
      if (err.message && err.message.indexOf('没有访问任何页面') >= 0) {
        throw err;
      }
      throw new Error('无法获取 Notion 页面列表: ' + (err.message || '未知错误'));
    });
  });
}

// ============================================================
// 测试 Notion 连接
// ============================================================
function testNotionConnection(token) {
  return notionFetch('/v1/users/me', token, { method: 'GET' }).then(function() {
    return { success: true };
  }).catch(function(err) {
    return { success: false, error: err.message };
  });
}

// ============================================================
// 获取用户可访问的页面列表（支持搜索和分类）
// ============================================================
function fetchNotionPages(token, query) {
  var searchBody = {
    page_size: 50,
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  };

  if (query && query.trim()) {
    searchBody.query = query.trim();
  } else {
    // 无搜索词时，默认只返回数据库
    searchBody.filter = { property: 'object', value: 'database' };
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

    console.log('[Notion Saver] Found ' + databases.length + ' databases, ' + pages.length + ' pages');
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
      // TypeError (网络失败) 尝试重试
      if (err instanceof TypeError && attempt < maxRetries) {
        console.log('[Notion Saver] Network error, retrying (' + attempt + '/' + maxRetries + '): ' + err.message);
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
function getSetting(key) {
  return new Promise(function(resolve) {
    chrome.storage.local.get(key, function(result) {
      resolve(result[key] || null);
    });
  });
}

function delay(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

// ============================================================
// Workspace 管理
// ============================================================
function getWorkspaceToken(workspaceId) {
  if (!workspaceId) {
    // 无指定 workspace，回退到旧版单个 token
    return getSetting('notion_token');
  }
  return new Promise(function(resolve) {
    chrome.storage.local.get(['notion_workspaces'], function(result) {
      var workspaces = result.notion_workspaces || [];
      for (var i = 0; i < workspaces.length; i++) {
        if (workspaces[i].id === workspaceId) {
          resolve(workspaces[i].token);
          return;
        }
      }
      resolve(null);
    });
  });
}

function addWorkspace(token, customName) {
  return notionFetch('/v1/users/me', token, { method: 'GET' }).then(function(user) {
    var workspaceName = customName || (user.bot && user.bot.workspace_name ? user.bot.workspace_name : 'Notion Workspace');
    var workspaceId = 'ws_' + Date.now();

    return new Promise(function(resolve) {
      chrome.storage.local.get(['notion_workspaces', 'notion_current_workspace'], function(result) {
        var workspaces = result.notion_workspaces || [];
        workspaces.push({
          id: workspaceId,
          name: workspaceName,
          token: token,
        });
        var currentId = result.notion_current_workspace || workspaceId;
        chrome.storage.local.set({
          notion_workspaces: workspaces,
          notion_current_workspace: currentId,
        }, function() {
          resolve({ success: true, id: workspaceId, name: workspaceName });
        });
      });
    });
  });
}

function removeWorkspace(id) {
  return new Promise(function(resolve) {
    chrome.storage.local.get(['notion_workspaces', 'notion_current_workspace'], function(result) {
      var workspaces = (result.notion_workspaces || []).filter(function(w) { return w.id !== id; });
      var currentId = result.notion_current_workspace;
      if (currentId === id && workspaces.length > 0) {
        currentId = workspaces[0].id;
      } else if (currentId === id) {
        currentId = null;
      }
      chrome.storage.local.set({
        notion_workspaces: workspaces,
        notion_current_workspace: currentId,
      }, function() {
        resolve({ success: true });
      });
    });
  });
}
