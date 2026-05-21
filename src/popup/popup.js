// Popup UI 逻辑 — OAuth 多空间版本
document.addEventListener('DOMContentLoaded', () => {

  // 主界面元素
  const loginScreen = document.getElementById('login-screen');
  const mainContent = document.getElementById('main-content');
  const loginBtn = document.getElementById('login-btn');
  const contentPreview = document.getElementById('content-preview');
  const saveBtn = document.getElementById('save-btn');
  const targetPage = document.getElementById('target-page');
  const statusEl = document.getElementById('status');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const backFromSettings = document.getElementById('back-from-settings');
  const closeSettings = document.getElementById('close-settings');
  const saveSettings = document.getElementById('save-settings');
  const settingsWorkspaceList = document.getElementById('settings-workspace-list');
  const workspaceSelect = document.getElementById('workspace-select');
  const themeBtn = document.getElementById('theme-btn');
  const pageSearch = document.getElementById('page-search');
  const pageList = document.getElementById('page-list');
  const pagePickerTrigger = document.getElementById('page-picker-trigger');
  const pagePickerDropdown = document.getElementById('page-picker-dropdown');
  const openInNotion = document.getElementById('open-in-notion');

  var themes = ['raycast', 'vercel'];
  var themeLabels = ['Raycast', 'Vercel'];
  var currentTheme = 'raycast';
  var extractedData = null;
  var allPages = [];
  var allDatabases = [];
  var searchTimeout = null;
  var dropdownOpen = false;
  var savedPageUrl = null;
  var workspaces = [];
  var currentWorkspaceBotId = null;

  // 监听 storage 变化
  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.notion_workspaces || changes.notion_current_workspace_bot_id) {
      var ws = changes.notion_workspaces ? changes.notion_workspaces.newValue : workspaces;
      var botId = changes.notion_current_workspace_bot_id
        ? changes.notion_current_workspace_bot_id.newValue
        : currentWorkspaceBotId;
      if (ws) workspaces = ws;
      if (botId !== undefined) currentWorkspaceBotId = botId;
      refreshWorkspaceUI();
      loadPageData();
    }
  });

  // 打开时检查登录状态
  checkLogin();

  // 主题切换
  themeBtn.addEventListener('click', () => {
    var idx = themes.indexOf(currentTheme);
    currentTheme = themes[(idx + 1) % themes.length];
    applyTheme(currentTheme);
    chrome.storage.local.set({ popup_theme: currentTheme });
  });

  // 登录按钮
  loginBtn.addEventListener('click', () => {
    startOAuthLogin();
  });

  // 保存按钮
  saveBtn.addEventListener('click', () => {
    if (!extractedData) return;
    saveToNotion(extractedData);
  });

  // 设置面板
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    closeDropdown();
    renderSettingsWorkspaceList();
  });

  backFromSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  closeSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  saveSettings.addEventListener('click', () => {
    const imageMode = document.getElementById('image-mode').value;
    chrome.runtime.sendMessage({
      action: 'save_settings',
      data: { image_mode: imageMode },
    }, () => {
      if (chrome.runtime.lastError) {
        showSettingsStatus('设置保存失败: Service Worker 未运行', 'error');
        return;
      }
      showSettingsStatus('设置已保存', 'success');
    });
  });

  // 页面选择器
  pagePickerTrigger.addEventListener('click', () => {
    if (dropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  // 搜索输入实时过滤
  pageSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterPages(pageSearch.value.trim());
    }, 300);
  });

  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    if (dropdownOpen && !pagePickerDropdown.contains(e.target) && e.target !== pagePickerTrigger && !pagePickerTrigger.contains(e.target)) {
      closeDropdown();
    }
  });

  // "在 Notion 中打开" 链接
  openInNotion.addEventListener('click', () => {
    if (savedPageUrl) {
      chrome.tabs.create({ url: savedPageUrl });
      openInNotion.classList.add('hidden');
      savedPageUrl = null;
    }
  });

  // Workspace 切换
  workspaceSelect.addEventListener('change', () => {
    var botId = workspaceSelect.value;
    if (!botId) return;
    chrome.storage.local.set({ notion_current_workspace_bot_id: botId }, () => {
      currentWorkspaceBotId = botId;
      allPages = [];
      allDatabases = [];
      targetPage.value = '';
      pageSearch.value = '';
      pageSearch.placeholder = '选择或搜索目标页面...';
      pageSearch.classList.remove('has-value');
      pageList.innerHTML = '<div class="page-list-loading">加载中...</div>';
      loadPageData();
    });
  });

  // ============================================================
  // 登录与 OAuth
  // ============================================================

  function checkLogin() {
    chrome.storage.local.get([
      'notion_workspaces',
      'notion_current_workspace_bot_id',
      'popup_theme',
    ], (result) => {
      workspaces = result.notion_workspaces || [];
      currentWorkspaceBotId = result.notion_current_workspace_bot_id || null;

      if (workspaces.length > 0 && currentWorkspaceBotId) {
        loginScreen.classList.add('hidden');
        mainContent.classList.remove('hidden');
        loadTheme();
        loadSettings();
        refreshWorkspaceUI();
        extractCurrentPage();
        loadPageData();
      } else if (workspaces.length > 0 && !currentWorkspaceBotId) {
        currentWorkspaceBotId = workspaces[0].bot_id;
        chrome.storage.local.set({ notion_current_workspace_bot_id: currentWorkspaceBotId }, () => {
          loginScreen.classList.add('hidden');
          mainContent.classList.remove('hidden');
          loadTheme();
          loadSettings();
          refreshWorkspaceUI();
          extractCurrentPage();
          loadPageData();
        });
      } else {
        loginScreen.classList.remove('hidden');
        mainContent.classList.add('hidden');
        loadTheme();
      }
    });
  }

  function startOAuthLogin() {
    chrome.runtime.sendMessage({ action: 'start_oauth_login' }, function(response) {
      if (chrome.runtime.lastError) {
        showSettingsStatus('后台服务未启动，请重启扩展', 'error');
        return;
      }
      showSettingsStatus('正在等待授权...', 'loading-status');
    });
  }

  // ============================================================
  // Workspace 管理
  // ============================================================

  function refreshWorkspaceUI() {
    workspaceSelect.innerHTML = '';
    for (var i = 0; i < workspaces.length; i++) {
      var ws = workspaces[i];
      var opt = document.createElement('option');
      opt.value = ws.bot_id;
      opt.textContent = ws.workspace_name || 'Notion';
      if (ws.bot_id === currentWorkspaceBotId) opt.selected = true;
      workspaceSelect.appendChild(opt);
    }
    renderSettingsWorkspaceList();
  }

  function removeWorkspace(botId) {
    var wsName = '';
    for (var i = 0; i < workspaces.length; i++) {
      if (workspaces[i].bot_id === botId) {
        wsName = workspaces[i].workspace_name || 'Notion';
        break;
      }
    }

    var msg = '确认解绑「' + wsName + '」吗？';
    if (botId === currentWorkspaceBotId) {
      msg += '\n解绑后会自动切换到其他可用空间。';
    }

    if (!confirm(msg)) return;

    workspaces = workspaces.filter(function(ws) { return ws.bot_id !== botId; });
    if (botId === currentWorkspaceBotId) {
      currentWorkspaceBotId = workspaces.length > 0 ? workspaces[0].bot_id : null;
    }
    chrome.storage.local.set({
      notion_workspaces: workspaces,
      notion_current_workspace_bot_id: currentWorkspaceBotId,
    }, () => {
      refreshWorkspaceUI();
      if (workspaces.length === 0) {
        settingsPanel.classList.add('hidden');
        checkLogin();
      } else {
        loadPageData();
      }
    });
  }

  function renderSettingsWorkspaceList() {
    if (!settingsWorkspaceList) return;
    var html = '';
    for (var i = 0; i < workspaces.length; i++) {
      var ws = workspaces[i];
      var isActive = ws.bot_id === currentWorkspaceBotId;
      html += '<div class="workspace-item' + (isActive ? ' active' : '') + '">' +
        '<span class="workspace-name">' + escapeHtml(ws.workspace_name || 'Notion') + '</span>' +
        '<div class="workspace-actions">' +
        '<button class="remove-ws-btn" data-bot-id="' + ws.bot_id + '" title="解绑空间">×</button>' +
        '</div></div>';
    }
    if (workspaces.length === 0) {
      html = '<div class="page-list-empty">尚未连接任何空间</div>';
    }
    settingsWorkspaceList.innerHTML = html;

    settingsWorkspaceList.querySelectorAll('.remove-ws-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        removeWorkspace(this.getAttribute('data-bot-id'));
      });
    });
  }

  // ============================================================
  // 内容提取与保存
  // ============================================================

  function extractCurrentPage() {
    openInNotion.classList.add('hidden');
    savedPageUrl = null;
    setTimeout(function() {
      chrome.runtime.sendMessage({ action: 'extract_content' }, function(response) {
        if (chrome.runtime.lastError) {
          contentPreview.innerHTML = '<p style="color:#d44">扩展后台服务未启动，请重启扩展</p>';
          return;
        }
        if (response && !response.error) {
          extractedData = response;
          var typeLabel = response.type === 'wechat' ? '公众号' : '网页';
          var metaHtml = '';
          if (response.author || response.publishTime) {
            var parts = [];
            if (response.author) parts.push(escapeHtml(response.author));
            if (response.publishTime) parts.push(escapeHtml(response.publishTime));
            metaHtml = '<p class="meta-info">' + parts.join(' &middot; ') + '</p>';
          }
          contentPreview.innerHTML =
            '<div class="type-label">' + typeLabel + '</div>' +
            '<div class="title-row">' +
            '<div id="editable-title" class="editable-title" contenteditable="true">' + escapeHtml(response.title) + '</div>' +
            '<span class="edit-icon" title="点击编辑标题">✏</span>' +
            '</div>' +
            metaHtml;
          saveBtn.disabled = false;
        } else {
          contentPreview.innerHTML = '<p style="color:#d44">' + escapeHtml(response ? response.error : '提取失败') + '</p>';
        }
      });
    }, 500);
  }

  function loadSettings() {
    chrome.runtime.sendMessage({ action: 'get_settings' }, (settings) => {
      if (settings && settings.image_mode) {
        document.getElementById('image-mode').value = settings.image_mode;
      }
    });
  }

  function loadTheme() {
    chrome.storage.local.get(['popup_theme'], (result) => {
      if (result && result.popup_theme && themes.indexOf(result.popup_theme) >= 0) {
        currentTheme = result.popup_theme;
      }
      applyTheme(currentTheme);
    });
  }

  function applyTheme(theme) {
    var popup = document.querySelector('.popup');
    for (var i = 0; i < themes.length; i++) {
      popup.classList.remove('theme-' + themes[i]);
    }
    popup.classList.add('theme-' + theme);
    var idx = themes.indexOf(theme);
    themeBtn.textContent = themeLabels[idx];

    var bodyColors = {
      raycast: { bg: '#1e1e2e', color: '#f5f5f5' },
      vercel: { bg: '#ffffff', color: '#000000' },
    };
    var c = bodyColors[theme];
    document.documentElement.style.background = c.bg;
    document.documentElement.style.color = c.color;
    document.body.style.background = c.bg;
    document.body.style.color = c.color;

    var btnHasGradient = theme === 'raycast';
    if (btnHasGradient) {
      saveBtn.classList.add('has-gradient');
      loginBtn.classList.add('has-gradient');
    } else {
      saveBtn.classList.remove('has-gradient');
      loginBtn.classList.remove('has-gradient');
    }
  }

  // ============================================================
  // 页面加载与选择
  // ============================================================

  function loadPageData() {
    pageList.innerHTML = '<div class="page-list-loading">加载中...</div>';
    chrome.runtime.sendMessage({ action: 'fetch_pages', query: '' }, (result) => {
      if (chrome.runtime.lastError) {
        pageList.innerHTML = '<div class="page-list-empty">连接失败</div>';
        return;
      }
      if (result && result.success) {
        allDatabases = result.databases || [];
        allPages = result.pages || [];
        targetPage.value = '';
        pageSearch.value = '';
        pageSearch.placeholder = '选择或搜索目标页面...';
        pageSearch.classList.remove('has-value');
        renderPageList(allDatabases, allPages);
      } else {
        pageList.innerHTML = '<div class="page-list-empty">' + escapeHtml(result ? result.error : '加载失败') + '</div>';
      }
    });
  }

  function openDropdown() {
    dropdownOpen = true;
    pagePickerDropdown.classList.remove('hidden');
    document.querySelector('.popup').classList.add('dropdown-active');
    var selectedTitle = targetPage.value ? pageSearch.value : '';
    pageSearch.value = '';
    pageSearch.placeholder = selectedTitle || '选择或搜索目标页面...';
    pageSearch.focus();
    filterPages('');
  }

  function closeDropdown() {
    dropdownOpen = false;
    pagePickerDropdown.classList.add('hidden');
    document.querySelector('.popup').classList.remove('dropdown-active');
    if (targetPage.value && pageSearch.value === '') {
      var selectedTitle = pageSearch.placeholder;
      if (selectedTitle && selectedTitle !== '选择或搜索目标页面...') {
        pageSearch.value = selectedTitle;
        pageSearch.classList.add('has-value');
      }
    } else if (!targetPage.value) {
      pageSearch.value = '';
      pageSearch.placeholder = '选择或搜索目标页面...';
      pageSearch.classList.remove('has-value');
    }
  }

  function filterPages(query) {
    if (!query) {
      renderPageList(allDatabases, allPages, [], 10);
      return;
    }

    var q = query.toLowerCase();
    var filteredDb = allDatabases.filter(function(d) { return d.title.toLowerCase().indexOf(q) >= 0; });
    var filteredPages = allPages.filter(function(p) { return p.title.toLowerCase().indexOf(q) >= 0; });

    if (query.length >= 2) {
      chrome.runtime.sendMessage({ action: 'fetch_pages', query: query }, (result) => {
        if (result && result.success) {
          var mergedDb = mergeById(filteredDb, result.databases || []);
          var mergedPages = mergeById(filteredPages, result.pages || []);
          renderPageList(mergedDb, mergedPages, [], 0);
        }
      });
    } else {
      renderPageList(filteredDb, filteredPages, [], 10);
    }
  }

  function mergeById(existing, newItems) {
    var map = {};
    for (var i = 0; i < existing.length; i++) {
      map[existing[i].id] = existing[i];
    }
    for (var i = 0; i < newItems.length; i++) {
      if (!map[newItems[i].id]) {
        map[newItems[i].id] = newItems[i];
      }
    }
    var result = [];
    for (var key in map) {
      result.push(map[key]);
    }
    return result;
  }

  function renderPageList(databases, pages, recent, pageLimit) {
    pageLimit = pageLimit || 0;
    var html = '';
    recent = recent || [];
    var displayPages = pageLimit > 0 ? pages.slice(0, pageLimit) : pages;

    if (databases.length > 0) {
      html += '<div class="page-list-section"><div class="page-list-label">数据库</div>';
      for (var i = 0; i < databases.length; i++) {
        html += '<div class="page-list-item" data-id="' + databases[i].id + '">' +
          '<span class="page-icon"></span>' +
          '<span class="page-title">' + escapeHtml(databases[i].title) + '</span></div>';
      }
      html += '</div>';
    }

    if (displayPages.length > 0) {
      html += '<div class="page-list-section"><div class="page-list-label">页面</div>';
      for (var i = 0; i < displayPages.length; i++) {
        html += '<div class="page-list-item" data-id="' + displayPages[i].id + '">' +
          '<span class="page-icon"></span>' +
          '<span class="page-title">' + escapeHtml(displayPages[i].title) + '</span></div>';
      }
      if (pageLimit > 0 && pages.length > pageLimit) {
        html += '<div class="page-list-more">还有更多页面，请输入关键词搜索</div>';
      }
      html += '</div>';
    }

    if (databases.length === 0 && pages.length === 0) {
      html = '<div class="page-list-empty">未找到匹配的页面或数据库</div>';
    }

    pageList.innerHTML = html;

    pageList.querySelectorAll('.page-list-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var title = this.querySelector('.page-title').textContent;
        targetPage.value = id;
        pageSearch.value = title;
        pageSearch.classList.add('has-value');
        closeDropdown();
      });
    });
  }

  // ============================================================
  // 保存到 Notion
  // ============================================================

  function saveToNotion(data) {
    var titleEl = document.getElementById('editable-title');
    if (titleEl) {
      data.title = titleEl.textContent.trim();
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    showStatus('正在同步到 Notion...', 'loading');

    chrome.runtime.sendMessage({
      action: 'save_to_notion',
      data: data,
      targetPage: targetPage.value,
      workspaceBotId: currentWorkspaceBotId,
    }, (result) => {
      if (chrome.runtime.lastError) {
        showStatus('保存失败: 扩展后台服务未运行', 'error');
        saveBtn.textContent = '保存到 Notion';
        saveBtn.disabled = false;
        return;
      }
      if (result && result.success) {
        showStatus('保存成功！' + result.blocksCount + ' 个 blocks', 'success');
        saveBtn.textContent = '保存到 Notion';
        saveBtn.disabled = false;

        if (result.pageUrl) {
          savedPageUrl = result.pageUrl;
          openInNotion.classList.remove('hidden');
        }

        setTimeout(() => {
          statusEl.className = 'status hidden';
        }, 3000);
      } else {
        if (result && result.error && result.error.indexOf('认证失败') >= 0) {
          showStatus('认证已过期，请退出后重新登录', 'error');
        } else {
          showStatus('保存失败: ' + (result ? result.error : '未知错误'), 'error');
        }
        saveBtn.textContent = '保存到 Notion';
        saveBtn.disabled = false;
      }
    });
  }

  function showStatus(message, type) {
    statusEl.className = 'status ' + (type === 'loading' ? 'loading-status' : type);
    statusEl.querySelector('.status-text').textContent = message;
  }

  function showSettingsStatus(message, type) {
    var el = document.getElementById('settings-status');
    el.className = 'status ' + (type === 'loading' ? 'loading-status' : type);
    el.querySelector('.status-text').textContent = message;
    if (type === 'success') {
      setTimeout(function() {
        el.className = 'status hidden';
      }, 2000);
    }
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
});
