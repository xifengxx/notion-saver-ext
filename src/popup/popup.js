// Popup UI 逻辑
document.addEventListener('DOMContentLoaded', () => {
  const contentPreview = document.getElementById('content-preview');
  const saveBtn = document.getElementById('save-btn');
  const targetPage = document.getElementById('target-page');
  const statusEl = document.getElementById('status');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const backFromSettings = document.getElementById('back-from-settings');
  const closeSettings = document.getElementById('close-settings');
  const saveSettings = document.getElementById('save-settings');
  const workspaceSelect = document.getElementById('workspace-select');
  const addWorkspaceBtn = document.getElementById('add-workspace-btn');
  const pageSearch = document.getElementById('page-search');
  const pageList = document.getElementById('page-list');
  const pagePickerTrigger = document.getElementById('page-picker-trigger');
  const pagePickerDropdown = document.getElementById('page-picker-dropdown');
  const pagePickerLabel = document.getElementById('page-picker-label');

  const themeBtn = document.getElementById('theme-btn');

  // 主题系统
  var themes = ['raycast', 'vercel'];
  var themeLabels = ['Raycast', 'Vercel'];
  var currentTheme = 'raycast';
  var extractedData = null;
  let currentWorkspace = null;
  let workspaces = [];
  let allPages = [];
  let allDatabases = [];
  let recentPages = [];
  let searchTimeout = null;
  let dropdownOpen = false;

  // 打开时自动提取当前页面内容
  extractCurrentPage();

  // 加载 workspace 列表
  loadWorkspaces();

  // 加载设置
  loadSettings();

  // 加载主题
  loadTheme();

  // 主题切换
  themeBtn.addEventListener('click', () => {
    var idx = themes.indexOf(currentTheme);
    currentTheme = themes[(idx + 1) % themes.length];
    applyTheme(currentTheme);
    chrome.storage.local.set({ popup_theme: currentTheme });
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
    renderWorkspaceList();
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

  // Workspace 切换
  workspaceSelect.addEventListener('change', () => {
    const wsId = workspaceSelect.value;
    if (!wsId) return;
    chrome.runtime.sendMessage({ action: 'switch_workspace', id: wsId }, (result) => {
      if (chrome.runtime.lastError) return;
      currentWorkspace = wsId;
      loadPageData(wsId);
    });
  });

  // 管理 workspace
  addWorkspaceBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    closeDropdown();
    renderWorkspaceList();
    document.getElementById('new-token').focus();
  });

  // 页面选择器下拉
  pagePickerTrigger.addEventListener('click', () => {
    if (dropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    if (dropdownOpen && !pagePickerDropdown.contains(e.target) && e.target !== pagePickerTrigger && !pagePickerTrigger.contains(e.target)) {
      closeDropdown();
    }
  });

  // 页面搜索
  pageSearch.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      filterPages(pageSearch.value.trim());
    }, 300);
  });

  // 设置面板：添加 workspace
  document.getElementById('add-workspace-save').addEventListener('click', () => {
    const token = document.getElementById('new-token').value.trim();
    const name = document.getElementById('new-workspace-name').value.trim();
    if (!token) {
      showSettingsStatus('请输入 Integration Token', 'error');
      return;
    }
    showSettingsStatus('正在验证...', 'loading-status');
    chrome.runtime.sendMessage({ action: 'test_connection', token }, (result) => {
      if (chrome.runtime.lastError || !result || !result.success) {
        showSettingsStatus('连接失败: ' + (result ? result.error : '未知错误'), 'error');
        return;
      }
      chrome.runtime.sendMessage({ action: 'add_workspace', token: token, name: name }, (result) => {
        if (chrome.runtime.lastError || !result || !result.success) {
          showSettingsStatus('添加失败: ' + (result ? result.error : '未知错误'), 'error');
          return;
        }
        document.getElementById('new-token').value = '';
        document.getElementById('new-workspace-name').value = '';
        showSettingsStatus('已添加: ' + result.name, 'success');
        loadWorkspaces();
      });
    });
  });

  // ============================================================
  // 内部函数
  // ============================================================

  function extractCurrentPage() {
    console.log('[Popup] Starting extraction...');
    chrome.runtime.sendMessage({ action: 'extract_content' }, (response) => {
      console.log('[Popup] Response:', response, 'lastError:', chrome.runtime.lastError);
      if (chrome.runtime.lastError) {
        console.error('[Popup] Service worker error:', chrome.runtime.lastError);
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

    // 同步主题色到 html/body，消除 Chrome popup 白边
    var bodyColors = {
      raycast: { bg: '#1e1e2e', color: '#f5f5f5' },
      vercel: { bg: '#ffffff', color: '#000000' },
    };
    var c = bodyColors[theme];
    document.documentElement.style.background = c.bg;
    document.documentElement.style.color = c.color;
    document.body.style.background = c.bg;
    document.body.style.color = c.color;

    // 按钮渐变标记
    var btnHasGradient = theme === 'raycast' || theme === 'superhuman';
    if (btnHasGradient) {
      saveBtn.classList.add('has-gradient');
    } else {
      saveBtn.classList.remove('has-gradient');
    }
  }

  function loadWorkspaces() {
    chrome.runtime.sendMessage({ action: 'list_workspaces' }, (result) => {
      if (chrome.runtime.lastError || !result) return;
      workspaces = result.workspaces || [];
      currentWorkspace = result.currentId;

      // 兼容旧版
      if (workspaces.length === 0 && result.legacyToken) {
        workspaces = [{ id: 'default', name: '默认空间', token: result.legacyToken }];
        currentWorkspace = 'default';
      }

      renderWorkspaceSelect();
      renderWorkspaceList();
      if (currentWorkspace && workspaces.length > 0) {
        loadPageData(currentWorkspace);
      }
    });
  }

  function loadRecentPages() {
    chrome.storage.local.get(['recent_pages'], (result) => {
      recentPages = result.recent_pages || [];
    });
  }

  function renderWorkspaceSelect() {
    workspaceSelect.innerHTML = '';
    if (workspaces.length === 0) {
      workspaceSelect.innerHTML = '<option value="">未配置</option>';
      return;
    }
    for (var i = 0; i < workspaces.length; i++) {
      var opt = document.createElement('option');
      opt.value = workspaces[i].id;
      opt.textContent = workspaces[i].name;
      if (workspaces[i].id === currentWorkspace) {
        opt.selected = true;
      }
      workspaceSelect.appendChild(opt);
    }
  }

  function renderWorkspaceList() {
    var listEl = document.getElementById('workspace-list');
    if (workspaces.length === 0) {
      listEl.innerHTML = '<p class="hint">暂无空间，请在下方添加</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < workspaces.length; i++) {
      var ws = workspaces[i];
      var isCurrent = ws.id === currentWorkspace;
      html += '<div class="workspace-item' + (isCurrent ? ' active' : '') + '">' +
        '<span class="workspace-name">' + escapeHtml(ws.name) + '</span>' +
        '<div class="workspace-actions">' +
        '<button class="remove-ws-btn" data-id="' + ws.id + '">解绑</button>' +
        '</div></div>';
    }
    listEl.innerHTML = html;
  }

  // 事件委托：workspace-list 上的点击，避免 confirm() 导致 popup 失焦
  document.getElementById('workspace-list').addEventListener('click', function(e) {
    var btn = e.target.closest('.remove-ws-btn');
    if (!btn) return;
    e.stopPropagation();
    var id = btn.getAttribute('data-id');

    // 已经是确认状态，执行删除
    if (btn.classList.contains('confirming')) {
      chrome.runtime.sendMessage({ action: 'remove_workspace', id: id }, function() {
        if (chrome.runtime.lastError) return;
        loadWorkspaces();
      });
      return;
    }

    // 第一次点击：显示确认
    btn.textContent = '确认';
    btn.classList.add('confirming');

    // 3 秒后自动恢复
    setTimeout(function() {
      var currentBtn = document.querySelector('.remove-ws-btn[data-id="' + id + '"]');
      if (currentBtn) {
        currentBtn.textContent = '解绑';
        currentBtn.classList.remove('confirming');
      }
    }, 3000);
  });

  function loadPageData(workspaceId) {
    pageList.innerHTML = '<div class="page-list-loading">加载中...</div>';
    loadRecentPages();

    chrome.runtime.sendMessage({ action: 'fetch_pages', workspaceId: workspaceId, query: '' }, (result) => {
      if (chrome.runtime.lastError) {
        pageList.innerHTML = '<div class="page-list-empty">连接失败</div>';
        return;
      }
      if (result && result.success) {
        allDatabases = result.databases || [];
        allPages = result.pages || [];
        targetPage.value = '';
        pagePickerLabel.textContent = '选择目标页面...';
        renderPageList(allDatabases, allPages);
      } else {
        pageList.innerHTML = '<div class="page-list-empty">' + escapeHtml(result ? result.error : '加载失败') + '</div>';
      }
    });
  }

  function openDropdown() {
    dropdownOpen = true;
    pagePickerDropdown.classList.remove('hidden');
    pageSearch.value = '';
    pageSearch.focus();
    filterPages('');
  }

  function closeDropdown() {
    dropdownOpen = false;
    pagePickerDropdown.classList.add('hidden');
    pageSearch.value = '';
  }

  function filterPages(query) {
    if (!query) {
      // 无搜索词：最近页面 + 数据库 + 其他页面
      var wsRecent = recentPages.filter(function(p) { return p.workspaceId === currentWorkspace; }).slice(0, 5);
      var wsDb = allDatabases.filter(function(d) {
        return !wsRecent.some(function(r) { return r.id === d.id; });
      });
      var wsPages = allPages.filter(function(p) {
        return !wsRecent.some(function(r) { return r.id === p.id; }) &&
               !wsDb.some(function(d) { return d.id === p.id; });
      });
      renderPageList(wsDb, wsPages, wsRecent);
      return;
    }

    // 有搜索词：调用 API 搜索
    var q = query.toLowerCase();
    var filteredDb = allDatabases.filter(function(d) { return d.title.toLowerCase().indexOf(q) >= 0; });
    var filteredPages = allPages.filter(function(p) { return p.title.toLowerCase().indexOf(q) >= 0; });
    var filteredRecent = recentPages.filter(function(p) { return p.title.toLowerCase().indexOf(q) >= 0; });

    if (query.length >= 2) {
      chrome.runtime.sendMessage({ action: 'fetch_pages', workspaceId: currentWorkspace, query: query }, (result) => {
        if (result && result.success) {
          var mergedDb = mergeById(mergeById(filteredDb, result.databases || []), filteredRecent);
          var mergedPages = mergeById(filteredPages, result.pages || []);
          renderPageList(mergedDb, mergedPages, []);
        }
      });
    } else {
      renderPageList(filteredDb, filteredPages, filteredRecent);
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

  function renderPageList(databases, pages, recent) {
    var html = '';
    recent = recent || [];

    // 最近保存的页面
    if (recent.length > 0) {
      html += '<div class="page-list-section"><div class="page-list-label">最近保存</div>';
      for (var i = 0; i < recent.length; i++) {
        html += '<div class="page-list-item" data-id="' + recent[i].id + '">' +
          '<span class="page-icon"></span>' +
          '<span class="page-title">' + escapeHtml(recent[i].title) + '</span></div>';
      }
      html += '</div>';
    }

    // 数据库
    if (databases.length > 0) {
      html += '<div class="page-list-section"><div class="page-list-label">数据库</div>';
      for (var i = 0; i < databases.length; i++) {
        html += '<div class="page-list-item" data-id="' + databases[i].id + '">' +
          '<span class="page-icon"></span>' +
          '<span class="page-title">' + escapeHtml(databases[i].title) + '</span></div>';
      }
      html += '</div>';
    }

    // 其他页面
    if (pages.length > 0) {
      html += '<div class="page-list-section"><div class="page-list-label">页面</div>';
      for (var i = 0; i < Math.min(pages.length, 20); i++) {
        html += '<div class="page-list-item" data-id="' + pages[i].id + '">' +
          '<span class="page-icon"></span>' +
          '<span class="page-title">' + escapeHtml(pages[i].title) + '</span></div>';
      }
      if (pages.length > 20) {
        html += '<div class="page-list-more">还有 ' + (pages.length - 20) + ' 个页面，请输入搜索关键词</div>';
      }
      html += '</div>';
    }

    if (recent.length === 0 && databases.length === 0 && pages.length === 0) {
      html = '<div class="page-list-empty">未找到匹配的页面或数据库</div>';
    }

    pageList.innerHTML = html;

    pageList.querySelectorAll('.page-list-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var id = this.getAttribute('data-id');
        var title = this.querySelector('.page-title').textContent;
        targetPage.value = id;
        pagePickerLabel.textContent = title;
        closeDropdown();
      });
    });
  }

  function saveToNotion(data) {
    // 使用编辑后的标题
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
      workspaceId: currentWorkspace,
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

        // 记录最近保存的页面
        if (targetPage.value) {
          addRecentPage(targetPage.value, pagePickerLabel.textContent);
        }

        setTimeout(() => {
          statusEl.className = 'status hidden';
        }, 3000);
      } else {
        showStatus('保存失败: ' + (result ? result.error : '未知错误'), 'error');
        saveBtn.textContent = '保存到 Notion';
        saveBtn.disabled = false;
      }
    });
  }

  function addRecentPage(id, title) {
    // 移除旧的相同记录
    recentPages = recentPages.filter(function(p) { return p.id !== id; });
    // 添加到开头
    recentPages.unshift({
      id: id,
      title: title,
      workspaceId: currentWorkspace,
      timestamp: Date.now(),
    });
    // 只保留最近 20 条
    recentPages = recentPages.slice(0, 20);
    chrome.storage.local.set({ recent_pages: recentPages });
  }

  function showStatus(message, type) {
    statusEl.className = 'status ' + (type === 'loading' ? 'loading-status' : type);
    statusEl.querySelector('.status-text').textContent = message;
  }

  function showSettingsStatus(message, type) {
    var el = document.getElementById('settings-status');
    el.className = 'status ' + (type === 'loading' ? 'loading-status' : type);
    el.querySelector('.status-text').textContent = message;
    // 成功状态 2s 后自动隐藏
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
