// Popup UI 逻辑 — OAuth 多空间版本
import { STORE, recentPagesKey, escapeHtml } from './lib.js';
import { renderPageList, renderSettingsWorkspaceList } from './render.js';

document.addEventListener('DOMContentLoaded', () => {

  // 主界面元素
  var loginScreen = document.getElementById('login-screen');
  var mainContent = document.getElementById('main-content');
  var loginBtn = document.getElementById('login-btn');
  var contentPreview = document.getElementById('content-preview');
  var saveBtn = document.getElementById('save-btn');
  var targetPage = document.getElementById('target-page');
  var statusEl = document.getElementById('status');
  var settingsBtn = document.getElementById('settings-btn');
  var settingsPanel = document.getElementById('settings-panel');
  var backFromSettings = document.getElementById('back-from-settings');
  var closeSettings = document.getElementById('close-settings');
  var saveSettings = document.getElementById('save-settings');
  var settingsWorkspaceList = document.getElementById('settings-workspace-list');
  var unbindConfirm = document.getElementById('unbind-confirm');
  var unbindConfirmText = document.getElementById('unbind-confirm-text');
  var unbindConfirmCancel = document.getElementById('unbind-confirm-cancel');
  var unbindConfirmOk = document.getElementById('unbind-confirm-ok');
  var workspaceSelect = document.getElementById('workspace-select');
  var themeBtn = document.getElementById('theme-btn');
  var pageSearch = document.getElementById('page-search');
  var pageList = document.getElementById('page-list');
  var pagePickerTrigger = document.getElementById('page-picker-trigger');
  var pagePickerDropdown = document.getElementById('page-picker-dropdown');
  var openInNotion = document.getElementById('open-in-notion');

  var themes = ['raycast', 'vercel'];
  var themeLabels = ['Raycast', 'Vercel'];
  var currentTheme = 'raycast';
  var extractedData = null;
  var allPages = [];
  var allDatabases = [];
  var recentPages = [];
  var searchTimeout = null;
  var dropdownOpen = false;
  var savedPageUrl = null;
  var workspaces = [];
  var currentWorkspaceBotId = null;
  var pendingUnbindBotId = null;

  // 监听 storage 变化
  chrome.storage.onChanged.addListener(function(changes) {
    if (changes[STORE.WORKSPACES] || changes[STORE.CURRENT_BOT]) {
      var ws = changes[STORE.WORKSPACES] ? changes[STORE.WORKSPACES].newValue : workspaces;
      var botId = changes[STORE.CURRENT_BOT]
        ? changes[STORE.CURRENT_BOT].newValue
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
    chrome.storage.local.set({ [STORE.POPUP_THEME]: currentTheme });
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
    renderSettingsWorkspaceList(workspaces, currentWorkspaceBotId, settingsWorkspaceList, showUnbindConfirm);
  });

  backFromSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  closeSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
    hideUnbindConfirm();
  });

  // 解绑确认
  unbindConfirmCancel.addEventListener('click', () => {
    hideUnbindConfirm();
    pendingUnbindBotId = null;
  });

  unbindConfirmOk.addEventListener('click', () => {
    if (pendingUnbindBotId) {
      executeUnbind(pendingUnbindBotId);
    }
  });

  function hideUnbindConfirm() {
    unbindConfirm.classList.add('hidden');
  }

  function showUnbindConfirm(botId) {
    var wsName = '';
    for (var i = 0; i < workspaces.length; i++) {
      if (workspaces[i].bot_id === botId) {
        wsName = workspaces[i].workspace_name || 'Notion';
        break;
      }
    }
    unbindConfirmText.textContent = '确认解绑「' + wsName + '」吗？';
    unbindConfirm.classList.remove('hidden');
    pendingUnbindBotId = botId;
  }

  saveSettings.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
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

  // 点击外部关闭下拉（popup 销毁时监听器自动释放，无需手动 removeEventListener）
  function handleOutsideClick(e) {
    if (dropdownOpen && !pagePickerDropdown.contains(e.target) && e.target !== pagePickerTrigger && !pagePickerTrigger.contains(e.target)) {
      closeDropdown();
    }
  }
  document.addEventListener('click', handleOutsideClick);

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
    // 切换空间时清除"在 Notion 中打开"
    openInNotion.classList.add('hidden');
    savedPageUrl = null;

    chrome.storage.local.set({ [STORE.CURRENT_BOT]: botId }, () => {
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

  // 两个 + 按钮都绑定添加空间
  document.querySelectorAll('.add-ws-btn-main, .settings-add-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      startOAuthLogin();
    });
  });

  // ============================================================
  // 登录与 OAuth
  // ============================================================

  function checkLogin() {
    chrome.storage.local.get([
      STORE.WORKSPACES,
      STORE.CURRENT_BOT,
      STORE.TOKEN_FAILED,
      STORE.SAVE_STATE,
      STORE.POPUP_THEME,
    ], (result) => {
      workspaces = result[STORE.WORKSPACES] || [];
      currentWorkspaceBotId = result[STORE.CURRENT_BOT] || null;

      if (workspaces.length > 0 && currentWorkspaceBotId) {
        loginScreen.classList.add('hidden');
        mainContent.classList.remove('hidden');
        loadTheme();
        refreshWorkspaceUI();
        extractCurrentPage();
        loadPageData();
        if (result[STORE.TOKEN_FAILED]) {
          showStatus('登录认证已过期，请更换空间或重新登录', 'error');
          chrome.storage.local.set({ [STORE.TOKEN_FAILED]: false });
        }
        checkSaveState(result[STORE.SAVE_STATE]);
      } else if (workspaces.length > 0 && !currentWorkspaceBotId) {
        currentWorkspaceBotId = workspaces[0].bot_id;
        chrome.storage.local.set({ [STORE.CURRENT_BOT]: currentWorkspaceBotId }, () => {
          loginScreen.classList.add('hidden');
          mainContent.classList.remove('hidden');
          loadTheme();
          loadSettings();
          refreshWorkspaceUI();
          extractCurrentPage();
          loadPageData();
          if (result[STORE.TOKEN_FAILED]) {
            showStatus('登录认证已过期，请更换空间或重新登录', 'error');
            chrome.storage.local.set({ [STORE.TOKEN_FAILED]: false });
          }
          checkSaveState(result[STORE.SAVE_STATE]);
        });
      } else {
        loginScreen.classList.remove('hidden');
        mainContent.classList.add('hidden');
        loadTheme();
      }
    });
  }

  function checkSaveState(state) {
    if (!state) return;
    if (state.status === 'in_progress' && Date.now() - state.startedAt > 30000) {
      showStatus('上次保存可能因后台中断未完成，请检查 Notion 并重试', 'error');
      chrome.storage.local.remove(STORE.SAVE_STATE);
    } else if (state.status === 'failed') {
      showStatus('上次保存失败: ' + (state.error || '未知错误'), 'error');
      chrome.storage.local.remove(STORE.SAVE_STATE);
    }
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
    renderSettingsWorkspaceList(workspaces, currentWorkspaceBotId, settingsWorkspaceList, showUnbindConfirm);
  }

  function executeUnbind(botId) {
    hideUnbindConfirm();
    pendingUnbindBotId = null;

    workspaces = workspaces.filter(function(ws) { return ws.bot_id !== botId; });
    if (botId === currentWorkspaceBotId) {
      currentWorkspaceBotId = workspaces.length > 0 ? workspaces[0].bot_id : null;
    }
    chrome.storage.local.set({
      [STORE.WORKSPACES]: workspaces,
      [STORE.CURRENT_BOT]: currentWorkspaceBotId,
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

  function loadTheme() {
    chrome.storage.local.get([STORE.POPUP_THEME], (result) => {
      if (result && result[STORE.POPUP_THEME] && themes.indexOf(result[STORE.POPUP_THEME]) >= 0) {
        currentTheme = result[STORE.POPUP_THEME];
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
        // 按标题排序
        allDatabases.sort(function(a, b) { return a.title.localeCompare(b.title); });
        allPages.sort(function(a, b) { return a.title.localeCompare(b.title); });
        targetPage.value = '';
        pageSearch.value = '';
        pageSearch.placeholder = '选择或搜索目标页面...';
        pageSearch.classList.remove('has-value');
        // 由 loadRecentPages 统一渲染，避免 race condition
        loadRecentPages();
      } else {
        pageList.innerHTML = '<div class="page-list-empty">' + escapeHtml(result ? result.error : '加载失败') + '</div>';
      }
    });
  }

  // 加载最近保存的位置（当前 workspace 作用域）
  function loadRecentPages() {
    var key = recentPagesKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      recentPages = result[key] || [];
      renderPageList(allDatabases, allPages, recentPages, pageList, onPageSelect);
    });
  }

  // 保存一个位置到最近列表
  function saveRecentPage(id, title) {
    if (!id || !currentWorkspaceBotId) return;
    var key = recentPagesKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      var list = result[key] || [];
      // 移除已存在的相同 id
      list = list.filter(function(p) { return p.id !== id; });
      // 加到最前面
      list.unshift({ id: id, title: title });
      // 最多保留 5 个
      if (list.length > 5) list = list.slice(0, 5);
      chrome.storage.local.set({ [key]: list });
      recentPages = list;
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
      renderPageList(allDatabases, allPages, recentPages, pageList, onPageSelect);
      return;
    }

    // 立即渲染搜索中状态，覆盖旧结果
    pageList.innerHTML = '<div class="page-list-loading">搜索中...</div>';

    var q = query.toLowerCase();
    var filteredDb = allDatabases.filter(function(d) { return d.title.toLowerCase().indexOf(q) >= 0; });
    var filteredPages = allPages.filter(function(p) { return p.title.toLowerCase().indexOf(q) >= 0; });

    if (query.length >= 2) {
      chrome.runtime.sendMessage({ action: 'fetch_pages', query: query }, (result) => {
        if (result && result.success) {
          // 直接使用 API 结果，不合并旧数据
          renderPageList(result.databases || [], result.pages || [], [], pageList, onPageSelect);
        } else {
          // API 失败时回退到本地过滤结果
          renderPageList(filteredDb, filteredPages, [], pageList, onPageSelect);
        }
      });
    } else {
      renderPageList(filteredDb, filteredPages, [], pageList, onPageSelect);
    }
  }

  function onPageSelect(id, title) {
    targetPage.value = id;
    pageSearch.value = title;
    pageSearch.classList.add('has-value');
    closeDropdown();
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

        // 保存到最近位置
        if (targetPage.value) {
          var pageTitle = pageSearch.value || targetPage.value;
          saveRecentPage(targetPage.value, pageTitle);
        }

        if (result.pageUrl) {
          savedPageUrl = result.pageUrl;
          openInNotion.classList.remove('hidden');
          // 10秒后自动隐藏
          setTimeout(() => {
            openInNotion.classList.add('hidden');
            savedPageUrl = null;
          }, 10000);
        }

        setTimeout(() => {
          statusEl.className = 'status hidden';
        }, 3000);
      } else {
        if (result && result.error && result.error.indexOf('认证失败') >= 0) {
          showStatus('认证已过期，请切换空间或添加新空间重新授权', 'error');
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

});
