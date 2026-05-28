// Popup UI 逻辑 — OAuth 多空间版本
import { STORE, recentPagesKey, escapeHtml, presetsKey, saveHistoryKey, pageCacheKey, savedTargetsKey } from './lib.js';
import { renderPageList, renderSettingsWorkspaceList, renderPresetsRow, renderHistoryList, renderHistoryEmpty, getPillColor } from './render.js';

document.addEventListener('DOMContentLoaded', () => {

  // 主界面元素
  var loginScreen = document.getElementById('login-screen');
  var mainContent = document.getElementById('main-content');
  var loginBtn = document.getElementById('login-btn');
  var contentPreview = document.getElementById('content-preview');
  var metadataExtra = document.getElementById('metadata-extra');
  var saveBtn = document.getElementById('save-btn');
  var targetPage = document.getElementById('target-page');
  var statusEl = document.getElementById('status');
  var settingsBtn = document.getElementById('settings-btn');
  var settingsPanel = document.getElementById('settings-panel');
  var backFromSettings = document.getElementById('back-from-settings');
  var closeSettings = document.getElementById('close-settings');
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
  var historyBtn = document.getElementById('history-btn');
  var historyPanel = document.getElementById('history-panel');
  var backFromHistory = document.getElementById('back-from-history');
  var closeHistory = document.getElementById('close-history');
  var historyList = document.getElementById('history-list');
  var presetsSection = document.getElementById('presets-section');
  var presetsRow = document.getElementById('presets-row');
  var presetCreateForm = document.getElementById('preset-create-form');
  var presetNameInput = document.getElementById('preset-name-input');
  var presetCreateSave = document.getElementById('preset-create-save');
  var presetCreateCancel = document.getElementById('preset-create-cancel');
  var settingsPresetsList = document.getElementById('settings-presets-list');

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
  var presets = [];
  var activePresetId = null;
  var saveHistory = [];
  var selectedTargetType = 'page';
  var savedTargets = [];
  var pageDataReady = false;
  var pageVisibleCount = 20;
  var scrollLoadHandler = null;
  var dropdownSelectionMade = false;

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
      loadPresets();
      loadSaveHistory();
    }
    if (changes[STORE.SAVE_STATE]) {
      var newState = changes[STORE.SAVE_STATE].newValue;
      updateSaveProgress(newState);
      checkSaveState(newState, true);
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
    if (!extractedData || saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveToNotion(extractedData);
  });

  // 设置面板
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
    mainContent.classList.add('hidden');
    document.querySelector('header').classList.add('hidden');
    closeDropdown();
    renderSettingsWorkspaceList(workspaces, currentWorkspaceBotId, settingsWorkspaceList, showUnbindConfirm, startOAuthLogin);
  });

  function closeSettingsPanel() {
    settingsPanel.classList.add('hidden');
    mainContent.classList.remove('hidden');
    document.querySelector('header').classList.remove('hidden');
  }

  backFromSettings.addEventListener('click', closeSettingsPanel);

  closeSettings.addEventListener('click', () => {
    closeSettingsPanel();
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

  var unbindDivider = document.getElementById('unbind-divider');

  function hideUnbindConfirm() {
    unbindConfirm.classList.add('hidden');
    unbindDivider.classList.add('hidden');
  }

  function showUnbindConfirm(botId) {
    var wsName = '';
    for (var i = 0; i < workspaces.length; i++) {
      if (workspaces[i].bot_id === botId) {
        wsName = workspaces[i].workspace_name || 'Notion';
        break;
      }
    }
    unbindConfirmText.innerHTML = '确认解绑「<span style="color:#ef4444;font-weight:600">' + escapeHtml(wsName) + '</span>」吗？';
    unbindDivider.classList.remove('hidden');
    unbindConfirm.classList.remove('hidden');
    pendingUnbindBotId = botId;
  }

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
    if (!dropdownOpen) {
      dropdownOpen = true;
      pagePickerDropdown.classList.remove('hidden');
      document.querySelector('.popup').classList.add('dropdown-active');
    }
    clearTimeout(searchTimeout);
    // 输入变化时立即滚回顶部
    pagePickerDropdown.scrollTop = 0;
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

  // 快捷键提示（从 Chrome API 读取实际快捷键）
  var shortcutKeyEl = document.getElementById('shortcut-key');
  var shortcutKeyDefaultEl = document.getElementById('shortcut-key-default');
  var shortcutHintEl = document.getElementById('shortcut-hint');
  var shortcutConfigBtn = document.getElementById('shortcut-config-btn');

  var SHORTCUT_DEFAULT = 'Ctrl+Shift+S';

  function updateShortcutDisplay() {
    shortcutKeyDefaultEl.textContent = SHORTCUT_DEFAULT;

    if (chrome.commands && chrome.commands.getAll) {
      chrome.commands.getAll(function(commands) {
        for (var i = 0; i < commands.length; i++) {
          if (commands[i].name === 'save-to-notion') {
            var shortcut = commands[i].shortcut || '';
            if (shortcut) {
              shortcutKeyEl.textContent = shortcut;
              shortcutKeyEl.classList.remove('unset');
              shortcutHintEl.textContent = '右键菜单或快捷键可直接保存，无需打开面板';
            } else {
              shortcutKeyEl.textContent = '未设置';
              shortcutKeyEl.classList.add('unset');
              shortcutHintEl.textContent = '请重新设置快捷键';
            }
            return;
          }
        }
      });
    }
  }
  updateShortcutDisplay();

  shortcutConfigBtn.addEventListener('click', function() {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
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
        preloadRecentPage();
        extractCurrentPage();
        loadPageData();
        loadPresets();
        loadSaveHistory();
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
          refreshWorkspaceUI();
          preloadRecentPage();
          extractCurrentPage();
          loadPageData();
          loadPresets();
          loadSaveHistory();
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

  function checkSaveState(state, isLive) {
    if (!state) return;
    if (state.status === 'in_progress' && Date.now() - state.startedAt > 30000) {
      showStatus('上次保存可能因后台中断未完成，请检查 Notion 并重试', 'error');
      chrome.storage.local.remove(STORE.SAVE_STATE);
    } else if (state.status === 'failed') {
      // 仅实时事件（isLive=true）显示错误；初始化时发现旧失败直接清除
      if (isLive) {
        showStatus('保存失败: ' + (state.error || '未知错误'), 'error');
      }
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
    renderSettingsWorkspaceList(workspaces, currentWorkspaceBotId, settingsWorkspaceList, showUnbindConfirm, startOAuthLogin);
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
        closeSettingsPanel();
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
            metaHtml +
            '<span class="metadata-toggle" id="metadata-toggle">更多 ▾</span>';
          saveBtn.disabled = false;

          // 渲染可编辑的元信息字段（初始隐藏）
          renderMetadataFields(response);

          // 绑定"更多"展开/收起
          var toggleEl = document.getElementById('metadata-toggle');
          if (toggleEl) {
            toggleEl.addEventListener('click', function() {
              var extra = document.getElementById('metadata-extra');
              if (extra) {
                var isHidden = extra.classList.contains('hidden');
                if (isHidden) {
                  extra.classList.remove('hidden');
                  toggleEl.textContent = '收起 ▴';
                } else {
                  extra.classList.add('hidden');
                  toggleEl.textContent = '更多 ▾';
                }
              }
            });
          }
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
    // 清除上一次保存的状态提示（成功/失败/中断），开始新的页面上下文
    statusEl.className = 'status hidden';

    var cacheKey = pageCacheKey(currentWorkspaceBotId);

    loadSavedTargets();

    // 1. 先从缓存读取，立即可用
    chrome.storage.local.get([cacheKey], function(result) {
      var cache = result[cacheKey];
      if (cache && cache.databases && cache.pages) {
        allDatabases = cache.databases;
        allPages = cache.pages;
        pageDataReady = true;
        loadRecentPages();

        // 2. 缓存超过 5 分钟则后台静默刷新（不阻塞 UI）
        var CACHE_TTL = 5 * 60 * 1000;
        if (!cache.timestamp || (Date.now() - cache.timestamp) > CACHE_TTL) {
          fetchAndCachePages(cacheKey, true);
        }
      } else {
        // 3. 无缓存，首次加载需等待 API
        pageList.innerHTML = '<div class="page-list-loading">加载中...</div>';
        fetchAndCachePages(cacheKey, false);
      }
    });
  }

  function fetchAndCachePages(cacheKey, silent) {
    var chunksDone = 0;
    var totalChunks = 4;
    var mergedDb = [];
    var mergedPg = [];
    var seenDb = {};
    var seenPg = {};

    function handleChunk(result) {
      chunksDone++;

      if (result && result.success) {
        var dbs = result.databases || [];
        for (var i = 0; i < dbs.length; i++) {
          if (!seenDb[dbs[i].id]) {
            seenDb[dbs[i].id] = true;
            mergedDb.push(dbs[i]);
          }
        }
        var pgs = result.pages || [];
        for (var j = 0; j < pgs.length; j++) {
          if (!seenPg[pgs[j].id]) {
            seenPg[pgs[j].id] = true;
            mergedPg.push(pgs[j]);
          }
        }

        allDatabases = mergedDb.slice();
        allPages = mergedPg.slice();
        allDatabases.sort(function(a, b) { return a.title.localeCompare(b.title); });
        allPages.sort(function(a, b) { return a.title.localeCompare(b.title); });
        pageDataReady = true;

        if (!silent) {
          pageVisibleCount = 20;
          loadRecentPages();
        }
      }

      if (chunksDone >= totalChunks) {
        if (pageDataReady) {
          var kv = {};
          kv[cacheKey] = { databases: allDatabases, pages: allPages, timestamp: Date.now() };
          chrome.storage.local.set(kv);
        } else if (!silent) {
          pageList.innerHTML = '<div class="page-list-empty">连接失败</div>';
        }
      }
    }

    chrome.runtime.sendMessage({ action: 'fetch_pages_chunk', query: '', filter: 'database' }, handleChunk);
    chrome.runtime.sendMessage({ action: 'fetch_pages_chunk', query: '', filter: 'page', sort: 'descending' }, handleChunk);
    chrome.runtime.sendMessage({ action: 'fetch_pages_chunk', query: '', filter: 'page', sort: 'ascending' }, handleChunk);
    chrome.runtime.sendMessage({ action: 'fetch_pages_chunk', query: '', filter: 'page' }, handleChunk);
  }

  // 渲染"更多"元信息字段
  function renderMetadataFields(data) {
    if (!metadataExtra) return;
    var fields = [
      { key: 'url', label: '链接', readonly: false },
      { key: 'author', label: '作者', readonly: false },
      { key: 'publishTime', label: '发布时间', readonly: false },
      { key: 'description', label: '摘要', readonly: false },
      { key: 'keywords', label: '关键词', readonly: false },
      { key: 'siteName', label: '网站', readonly: false },
      { key: 'coverImage', label: '封面图', readonly: false },
      { key: 'wordCount', label: '字数', readonly: true },
      { key: 'language', label: '语言', readonly: true },
    ];

    var html = '';
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var value = '';
      if (f.key === 'keywords' && Array.isArray(data[f.key])) {
        value = data[f.key].join('、');
      } else if (data[f.key] !== undefined && data[f.key] !== null) {
        value = String(data[f.key]);
      }
      var readonlyClass = f.readonly ? ' readonly' : '';
      var readonlyAttr = f.readonly ? ' readonly' : '';
      html += '<div class="metadata-field-row">' +
        '<span class="metadata-field-label">' + f.label + '</span>' +
        '<input class="metadata-field-input' + readonlyClass + '" data-meta-key="' + f.key + '" value="' + escapeHtml(value) + '" placeholder="无"' + readonlyAttr + '>' +
        '</div>';
    }
    metadataExtra.innerHTML = html;
    metadataExtra.classList.add('hidden');
  }

  // 收集用户在元信息编辑区修改的值
  function collectMetadataFromDOM() {
    if (!metadataExtra || metadataExtra.classList.contains('hidden')) return null;
    var result = {};
    metadataExtra.querySelectorAll('.metadata-field-input').forEach(function(input) {
      var key = input.getAttribute('data-meta-key');
      var value = input.value.trim();
      if (key && value) {
        if (key === 'keywords') {
          result[key] = value.split(/[,，、]/).map(function(s) { return s.trim(); }).filter(Boolean);
        } else if (key === 'wordCount') {
          result[key] = parseInt(value, 10) || 0;
        } else {
          result[key] = value;
        }
      }
    });
    return result;
  }

  // 加载最近保存的位置（当前 workspace 作用域）
  // 立即从 storage 预加载最近页面，不等网络请求
  function preloadRecentPage() {
    var key = recentPagesKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      var pages = result[key] || [];
      recentPages = pages;
      if (pages.length > 0 && !targetPage.value) {
        var last = pages[0];
        targetPage.value = last.id;
        pageSearch.value = last.title;
        pageSearch.classList.add('has-value');
        selectedTargetType = last.type || 'page';
      }
    });
  }

  function loadRecentPages() {
    var key = recentPagesKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      recentPages = result[key] || [];
      renderPageList(allDatabases, allPages, recentPages, pageList, onPageSelect, false, pageVisibleCount);

      // 自动选中上次保存的页面/数据库作为默认目标
      if (recentPages.length > 0 && !targetPage.value) {
        var last = recentPages[0];
        targetPage.value = last.id;
        pageSearch.value = last.title;
        pageSearch.classList.add('has-value');
        selectedTargetType = last.type || 'page';
      }

      setupScrollLoading();
    });
  }

  // 保存一个位置到最近列表
  function setupScrollLoading() {
    // 先移除旧 listener，防止 innerHTML 替换触发递归 scroll 事件
    if (scrollLoadHandler) {
      pagePickerDropdown.removeEventListener('scroll', scrollLoadHandler);
      scrollLoadHandler = null;
    }

    var sentinel = pageList.querySelector('.page-list-sentinel');
    if (!sentinel) return;

    var loadingMore = false;

    scrollLoadHandler = function() {
      // 搜索模式下不触发，防止重入
      if (pageSearch.value.trim() || loadingMore) return;

      var dd = pagePickerDropdown;
      if (dd.scrollTop + dd.clientHeight >= dd.scrollHeight - 50) {
        loadingMore = true;
        // 先移除监听器，再渲染（渲染可能触发 scroll 事件）
        pagePickerDropdown.removeEventListener('scroll', scrollLoadHandler);
        scrollLoadHandler = null;

        pageVisibleCount = Math.min(pageVisibleCount + 20, 30);
        renderPageList(allDatabases, allPages, recentPages, pageList, onPageSelect, false, pageVisibleCount);
        loadingMore = false;
        setupScrollLoading();
      }
    };

    pagePickerDropdown.addEventListener('scroll', scrollLoadHandler);
  }

  function saveRecentPage(id, title, type) {
    if (!id || !currentWorkspaceBotId) return;
    var key = recentPagesKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      var list = result[key] || [];
      // 移除已存在的相同 id
      list = list.filter(function(p) { return p.id !== id; });
      // 加到最前面
      list.unshift({ id: id, title: title, type: type || 'page' });
      // 最多保留 5 个
      if (list.length > 5) list = list.slice(0, 5);
      chrome.storage.local.set({ [key]: list });
      recentPages = list;
    });
  }

  function loadSavedTargets() {
    if (!currentWorkspaceBotId) return;
    var key = savedTargetsKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      savedTargets = result[key] || [];
    });
  }

  function addSavedTarget(id, title, type, parentType) {
    if (!id || !title || !currentWorkspaceBotId) return;
    var key = savedTargetsKey(currentWorkspaceBotId);
    // 去重
    savedTargets = savedTargets.filter(function(t) { return t.id !== id; });
    savedTargets.unshift({ id: id, title: title, type: type || 'page', parentType: parentType || null });
    // 最多保留 200 个
    if (savedTargets.length > 200) savedTargets = savedTargets.slice(0, 200);
    chrome.storage.local.set({ [key]: savedTargets });
  }

  function openDropdown() {
    dropdownOpen = true;
    dropdownSelectionMade = false;
    pageVisibleCount = 20;
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
    if (scrollLoadHandler) {
      pagePickerDropdown.removeEventListener('scroll', scrollLoadHandler);
      scrollLoadHandler = null;
    }
    pagePickerDropdown.classList.add('hidden');
    document.querySelector('.popup').classList.remove('dropdown-active');

    if (targetPage.value) {
      if (!dropdownSelectionMade) {
        // 用户没选任何项目 — 清除搜索关键词，恢复之前保存的目标标题
        var savedTitle = pageSearch.placeholder;
        if (savedTitle && savedTitle !== '选择或搜索目标页面...') {
          pageSearch.value = savedTitle;
        } else {
          pageSearch.value = '';
        }
      }
      // 如果选中了项目，pageSearch.value 已在 onPageSelect 中设置为新标题，保留即可
      pageSearch.classList.add('has-value');
    } else {
      pageSearch.value = '';
      pageSearch.placeholder = '选择或搜索目标页面...';
      pageSearch.classList.remove('has-value');
    }
  }

  function filterPages(query) {
    if (!query) {
      // 默认视图：数据未就绪时显示加载中，避免先渲染部分数据再变化的闪烁
      if (!pageDataReady) {
        pageList.innerHTML = '<div class="page-list-loading">加载中...</div>';
        return;
      }
      pageVisibleCount = 20;
      renderPageList(allDatabases, allPages, recentPages, pageList, onPageSelect, false, pageVisibleCount);
      setupScrollLoading();
      return;
    }

    var q = query.toLowerCase();
    var filteredDb = allDatabases.filter(function(d) { return d.title.toLowerCase().indexOf(q) >= 0; });
    var allFilteredPages = allPages.filter(function(p) { return p.title.toLowerCase().indexOf(q) >= 0; });

    // 搜索永久保存目标（用户保存过的页面，不受 API 100 条限制影响）
    var savedDb = [];
    var savedPgTop = [];
    var savedPgRest = [];
    for (var i = 0; i < savedTargets.length; i++) {
      var t = savedTargets[i];
      if (t.title.toLowerCase().indexOf(q) >= 0) {
        if (t.type === 'database') {
          savedDb.push({ id: t.id, title: t.title });
        } else if (t.parentType === 'workspace') {
          savedPgTop.push({ id: t.id, title: t.title, parentType: 'workspace' });
        } else {
          savedPgRest.push({ id: t.id, title: t.title, parentType: t.parentType || null });
        }
      }
    }

    // 去重合并：永久目标优先 → 缓存补充
    var seenDb = {};
    var mergedDb = [];
    for (var i = 0; i < savedDb.length; i++) {
      if (!seenDb[savedDb[i].id]) { seenDb[savedDb[i].id] = true; mergedDb.push(savedDb[i]); }
    }
    for (var i = 0; i < filteredDb.length; i++) {
      if (!seenDb[filteredDb[i].id]) { seenDb[filteredDb[i].id] = true; mergedDb.push(filteredDb[i]); }
    }

    var seenPg = {};
    var topPages = [];
    var restPages = [];
    // 永久目标 workspace 页面最优先
    for (var i = 0; i < savedPgTop.length; i++) {
      if (!seenPg[savedPgTop[i].id]) { seenPg[savedPgTop[i].id] = true; topPages.push(savedPgTop[i]); }
    }
    // 缓存中 workspace 页面
    for (var i = 0; i < allFilteredPages.length; i++) {
      if (!seenPg[allFilteredPages[i].id] && allFilteredPages[i].parentType === 'workspace') {
        seenPg[allFilteredPages[i].id] = true;
        topPages.push(allFilteredPages[i]);
      }
    }
    // 永久目标其他页面
    for (var i = 0; i < savedPgRest.length; i++) {
      if (!seenPg[savedPgRest[i].id]) { seenPg[savedPgRest[i].id] = true; restPages.push(savedPgRest[i]); }
    }
    // 缓存中其他页面
    for (var i = 0; i < allFilteredPages.length; i++) {
      if (!seenPg[allFilteredPages[i].id] && allFilteredPages[i].parentType !== 'workspace') {
        seenPg[allFilteredPages[i].id] = true;
        restPages.push(allFilteredPages[i]);
      }
    }
    var filteredPages = topPages.concat(restPages);

    // 立即渲染本地匹配结果，不等 API 返回
    renderPageList(mergedDb, filteredPages, [], pageList, onPageSelect, true);

    if (query.length >= 2) {
      chrome.runtime.sendMessage({ action: 'fetch_pages', query: query }, (result) => {
        if (result && result.success) {
          mergeSearchResults(q, mergedDb, filteredPages, result.databases || [], result.pages || []);
        }
      });
    }

    function mergeSearchResults(q, localDb, localPages, apiDb, apiPages) {
      var seenIds = {};
      var mergedDb = [];
      var mergedPagesTop = [];
      var mergedPagesRest = [];

      // 数据库：本地 indexOf 优先（中文子串匹配比 API 精准度可靠），API 补充
      for (var i = 0; i < localDb.length; i++) {
        if (!seenIds[localDb[i].id]) {
          seenIds[localDb[i].id] = true;
          mergedDb.push(localDb[i]);
        }
      }
      for (var i = 0; i < apiDb.length; i++) {
        if (!seenIds[apiDb[i].id]) {
          seenIds[apiDb[i].id] = true;
          mergedDb.push(apiDb[i]);
        }
      }

      // 页面：workspace 一级页面优先（本地 → API），其余靠后
      for (var i = 0; i < localPages.length; i++) {
        if (!seenIds[localPages[i].id]) {
          seenIds[localPages[i].id] = true;
          if (localPages[i].parentType === 'workspace') {
            mergedPagesTop.push(localPages[i]);
          } else {
            mergedPagesRest.push(localPages[i]);
          }
        }
      }
      for (var i = 0; i < apiPages.length; i++) {
        if (!seenIds[apiPages[i].id]) {
          seenIds[apiPages[i].id] = true;
          if (apiPages[i].parentType === 'workspace') {
            mergedPagesTop.push(apiPages[i]);
          } else {
            mergedPagesRest.push(apiPages[i]);
          }
        }
      }

      var mergedPages = mergedPagesTop.concat(mergedPagesRest);
      renderPageList(mergedDb, mergedPages, [], pageList, onPageSelect, true);
    }
  }

  function onPageSelect(id, title, isDatabase) {
    targetPage.value = id;
    pageSearch.value = title;
    pageSearch.classList.add('has-value');
    selectedTargetType = isDatabase ? 'database' : 'page';
    dropdownSelectionMade = true;
    // 手动选不同页面时取消预设选中
    if (activePresetId) {
      var preset = null;
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].id === activePresetId) {
          preset = presets[i];
          break;
        }
      }
      if (!preset || preset.targetPageId !== id) {
        activePresetId = null;
        renderPresetsUI();
      }
    }
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

    // 合并用户在"更多"面板中编辑过的元信息
    var editedMeta = collectMetadataFromDOM();
    if (editedMeta) {
      var metaKeys = Object.keys(editedMeta);
      for (var mi = 0; mi < metaKeys.length; mi++) {
        var mk = metaKeys[mi];
        data[mk] = editedMeta[mk];
      }
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '保存中...';
    showStatus('正在同步到 Notion...', 'loading');

    chrome.runtime.sendMessage({
      action: 'save_to_notion',
      data: data,
      targetPage: targetPage.value,
      workspaceBotId: currentWorkspaceBotId,
      targetType: selectedTargetType,
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
          saveRecentPage(targetPage.value, pageTitle, selectedTargetType);

          // 永久保存目标（下次搜索一定能找到）
          var targetParentType = null;
          for (var pi = 0; pi < allPages.length; pi++) {
            if (allPages[pi].id === targetPage.value) {
              targetParentType = allPages[pi].parentType;
              break;
            }
          }
          addSavedTarget(targetPage.value, pageTitle, selectedTargetType, targetParentType);
        }

        if (result.pageUrl) {
          savedPageUrl = result.pageUrl;
          openInNotion.classList.remove('hidden');
          // 10秒后自动隐藏
          setTimeout(function() {
            openInNotion.classList.add('hidden');
            savedPageUrl = null;
          }, 10000);
        }

        // 记录保存历史
        recordSaveHistory(
          data.title, data.url, data.title,
          result.pageUrl || '', targetPage.value ? (pageSearch.value || targetPage.value) : '',
          'success', '', result.blocksCount, null
        );

        setTimeout(function() {
          statusEl.className = 'status hidden';
        }, 3000);
      } else {
        if (result && result.error && result.error.indexOf('认证失败') >= 0) {
          showStatus('认证已过期，请切换空间或添加新空间重新授权', 'error');
        } else {
          showStatus('保存失败: ' + (result ? result.error : '未知错误'), 'error');
        }
        // 记录失败历史（保留 extractedData 供重试）
        recordSaveHistory(
          data.title, data.url, data.title,
          '', targetPage.value ? (pageSearch.value || targetPage.value) : '',
          'failed', result ? result.error : '未知错误', 0, data
        );
        saveBtn.textContent = '保存到 Notion';
        saveBtn.disabled = false;
      }
    });
  }

  function showStatus(message, type) {
    statusEl.className = 'status ' + (type === 'loading' ? 'loading-status' : type);
    statusEl.querySelector('.status-text').textContent = message;
  }

  function updateSaveProgress(state) {
    if (!state || !saveBtn.disabled) return;
    if (state.status !== 'in_progress') return;

    var msg = '';
    if (state.stage === 'creating_page') {
      msg = '正在创建 Notion 页面...';
    } else if (state.stage === 'uploading_images') {
      if (state.imagesTotal > 0) {
        msg = '正在上传图片 ' + state.imagesDone + '/' + state.imagesTotal + '...';
      } else {
        msg = '正在上传图片...';
      }
    } else if (state.stage === 'appending_blocks') {
      if (state.retryCurrent > 0) {
        msg = '网络不稳定，正在重试 (' + state.retryCurrent + '/3)...';
      } else if (state.blocksTotal > 0) {
        var pct = Math.round(state.blocksDone / state.blocksTotal * 100);
        msg = '正在保存 ' + state.blocksDone + '/' + state.blocksTotal + ' blocks (' + pct + '%)...';
      } else {
        msg = '正在同步到 Notion...';
      }
    }
    if (msg) {
      statusEl.className = 'status loading-status';
      statusEl.querySelector('.status-text').textContent = msg;
    }
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

  // ============================================================
  // 预设功能（v0.4.0）
  // ============================================================

  function loadPresets() {
    var key = presetsKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      presets = result[key] || [];
      renderPresetsUI();
      renderSettingsPresets();
    });
  }

  function renderPresetsUI() {
    presetsSection.classList.remove('hidden');
    renderPresetsRow(presets, activePresetId, presetsRow, 15, onPresetSelect, showPresetCreateForm);
  }

  function onPresetSelect(preset) {
    activePresetId = preset.id;
    targetPage.value = preset.targetPageId;
    pageSearch.value = preset.targetPageTitle;
    pageSearch.classList.add('has-value');
    closeDropdown();
    renderPresetsUI();
  }

  function showPresetCreateForm() {
    if (!targetPage.value) {
      showStatus('请先在"保存到"下拉框中选择目标页面', 'loading');
      setTimeout(function() { statusEl.className = 'status hidden'; }, 2000);
      return;
    }
    presetCreateForm.classList.remove('hidden');
    presetNameInput.value = '';
    presetNameInput.focus();
  }

  function hidePresetCreateForm() {
    presetCreateForm.classList.add('hidden');
  }

  function savePresetFromForm() {
    var name = presetNameInput.value.trim();
    if (!name) return;
    if (!targetPage.value) return;
    savePresetToStorage(name, targetPage.value, pageSearch.value || targetPage.value);
    hidePresetCreateForm();
  }

  function savePresetToStorage(name, pageId, pageTitle) {
    var preset = {
      id: 'p_' + Date.now(),
      name: name,
      targetPageId: pageId,
      targetPageTitle: pageTitle,
      targetType: selectedTargetType,
      createdAt: Date.now(),
    };
    presets.unshift(preset);
    if (presets.length > 15) presets = presets.slice(0, 15);
    activePresetId = preset.id;

    var kv = {};
    kv[presetsKey(currentWorkspaceBotId)] = presets;
    chrome.storage.local.set(kv, function() {
      renderPresetsUI();
      renderSettingsPresets();
    });
  }

  function onDeletePreset(presetId) {
    presets = presets.filter(function(p) { return p.id !== presetId; });
    if (activePresetId === presetId) {
      activePresetId = null;
    }
    var kv = {};
    kv[presetsKey(currentWorkspaceBotId)] = presets;
    chrome.storage.local.set(kv, function() {
      renderPresetsUI();
      renderSettingsPresets();
    });
  }

  function renderSettingsPresets() {
    if (!settingsPresetsList) return;
    if (presets.length === 0) {
      settingsPresetsList.innerHTML = '<p class="hint" style="margin:8px 0">暂无预设，在 popup 中选择目标页面后点击 + 创建</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < presets.length; i++) {
      var p = presets[i];
      var color = getPillColor(i);
      var style = 'background:' + color.bg + ';color:' + color.text + ';border-color:' + color.bg;
      html += '<span class="preset-pill preset-pill-settings" style="' + style + '">' +
        '<span class="preset-pill-settings-name">' + escapeHtml(p.name) + '</span>' +
        '<button class="preset-pill-settings-del" data-preset-id="' + p.id + '" title="删除「' + escapeHtml(p.name) + '」">×</button>' +
        '</span>';
    }
    settingsPresetsList.innerHTML = html;

    settingsPresetsList.querySelectorAll('.preset-pill-settings-del').forEach(function(btn) {
      btn.addEventListener('click', function() {
        onDeletePreset(this.getAttribute('data-preset-id'));
      });
    });
  }

  presetCreateSave.addEventListener('click', savePresetFromForm);
  presetCreateCancel.addEventListener('click', hidePresetCreateForm);
  presetNameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') savePresetFromForm();
    if (e.key === 'Escape') hidePresetCreateForm();
  });

  // ============================================================
  // 保存历史功能（v0.4.0）
  // ============================================================

  function recordSaveHistory(sourceTitle, sourceUrl, savedPageTitle, notionUrl, targetPageName, status, error, blocksCount, extractedData) {
    var key = saveHistoryKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      var history = result[key] || [];
      var entry = {
        id: 'h_' + Date.now(),
        sourceTitle: sourceTitle || '',
        sourceUrl: sourceUrl || '',
        savedPageTitle: savedPageTitle || '',
        notionUrl: notionUrl || '',
        targetPageName: targetPageName || '',
        timestamp: Date.now(),
        status: status,
        error: error || '',
        blocksCount: blocksCount || 0,
        extractedData: extractedData || null,
      };
      history.unshift(entry);

      // 裁剪全量数据：只保留最近 10 条的 extractedData
      var withData = 0;
      for (var i = 0; i < history.length; i++) {
        if (history[i].extractedData) {
          withData++;
          if (withData > 10) {
            history[i].extractedData = null;
          }
        }
      }

      // 最多 50 条
      if (history.length > 50) history = history.slice(0, 50);

      saveHistory = history;
      var kv = {};
      kv[key] = history;
      chrome.storage.local.set(kv);
    });
  }

  function loadSaveHistory() {
    var key = saveHistoryKey(currentWorkspaceBotId);
    chrome.storage.local.get([key], function(result) {
      saveHistory = result[key] || [];
      if (historyPanel && !historyPanel.classList.contains('hidden')) {
        renderHistory();
      }
    });
  }

  function renderHistory() {
    renderHistoryList(saveHistory, historyList, onHistoryOpen, onHistoryCopy, onHistoryRetry);
  }

  function openHistoryPanel() {
    historyPanel.classList.remove('hidden');
    mainContent.classList.add('hidden');
    document.querySelector('header').classList.add('hidden');
    settingsPanel.classList.add('hidden');
    hidePresetCreateForm();
    loadSaveHistory();
  }

  function closeHistoryPanel() {
    historyPanel.classList.add('hidden');
    mainContent.classList.remove('hidden');
    document.querySelector('header').classList.remove('hidden');
  }

  function onHistoryOpen(url) {
    if (url) chrome.tabs.create({ url: url });
  }

  function onHistoryCopy(url, btnEl) {
    if (!url) return;
    try {
      navigator.clipboard.writeText(url).then(function() {
        if (btnEl) {
          var origText = btnEl.textContent;
          btnEl.textContent = '✓';
          setTimeout(function() { btnEl.textContent = origText; }, 1000);
        }
      });
    } catch (e) {
      // fallback
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function onHistoryRetry(entry, btnEl) {
    if (!entry) return;
    if (btnEl) {
      btnEl.textContent = '...';
      btnEl.disabled = true;
    }

    var doSave = function(data) {
      if (!data) {
        if (btnEl) {
          btnEl.textContent = '↻';
          btnEl.disabled = false;
        }
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = '重试中...';
      showStatus('正在重新保存...', 'loading');

      chrome.runtime.sendMessage({
        action: 'save_to_notion',
        data: data,
        targetPage: targetPage.value,
        workspaceBotId: currentWorkspaceBotId,
        targetType: selectedTargetType,
      }, function(result) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存到 Notion';
        if (result && result.success) {
          showStatus('重试成功！' + result.blocksCount + ' 个 blocks', 'success');
          saveRecentPage(targetPage.value, targetPage.value, selectedTargetType);
          if (result.pageUrl) {
            savedPageUrl = result.pageUrl;
            openInNotion.classList.remove('hidden');
            setTimeout(function() {
              openInNotion.classList.add('hidden');
              savedPageUrl = null;
            }, 10000);
          }
          recordSaveHistory(entry.sourceTitle, entry.sourceUrl, entry.savedPageTitle, result.pageUrl, entry.targetPageName, 'success', '', result.blocksCount, null);
        } else {
          showStatus('重试失败: ' + (result ? result.error : '未知错误'), 'error');
          recordSaveHistory(entry.sourceTitle, entry.sourceUrl, entry.savedPageTitle, '', entry.targetPageName, 'failed', result ? result.error : '未知错误', 0, entry.extractedData);
        }
        loadSaveHistory();
        setTimeout(function() { statusEl.className = 'status hidden'; }, 3000);
      });
    };

    if (entry.extractedData) {
      doSave(entry.extractedData);
    } else {
      // 无全量数据，从当前 tab 重新提取
      setTimeout(function() {
        chrome.runtime.sendMessage({ action: 'extract_content' }, function(response) {
          if (chrome.runtime.lastError || !response || response.error) {
            if (btnEl) {
              btnEl.textContent = '↻';
              btnEl.disabled = false;
            }
            showStatus('请打开要保存的页面后重试', 'error');
            setTimeout(function() { statusEl.className = 'status hidden'; }, 2000);
            return;
          }
          doSave(response);
        });
      }, 300);
    }
  }

  // 历史面板按钮
  historyBtn.addEventListener('click', openHistoryPanel);
  backFromHistory.addEventListener('click', closeHistoryPanel);
  closeHistory.addEventListener('click', closeHistoryPanel);

});
