// Popup UI 逻辑 — OAuth 多空间版本
import { STORE, recentPagesKey, escapeHtml, presetsKey, saveHistoryKey } from './lib.js';
import { renderPageList, renderSettingsWorkspaceList, renderPresetsRow, renderHistoryList, renderHistoryEmpty } from './render.js';

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
      updateSaveProgress(changes[STORE.SAVE_STATE].newValue);
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
    if (presets.length > 0) {
      presetsSection.classList.remove('hidden');
      renderPresetsRow(presets, activePresetId, presetsRow, onPresetSelect, showPresetCreateForm);
    } else {
      presetsSection.classList.add('hidden');
      presetsRow.innerHTML = '';
      activePresetId = null;
    }
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
      createdAt: Date.now(),
    };
    presets.unshift(preset);
    if (presets.length > 20) presets = presets.slice(0, 20);
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
      html += '<div class="preset-manage-item">' +
        '<div class="preset-manage-info">' +
        '<div class="preset-manage-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="preset-manage-target">→ ' + escapeHtml(p.targetPageTitle) + '</div>' +
        '</div>' +
        '<button class="preset-manage-delete" data-preset-id="' + p.id + '" title="删除预设">×</button>' +
        '</div>';
    }
    settingsPresetsList.innerHTML = html;

    settingsPresetsList.querySelectorAll('.preset-manage-delete').forEach(function(btn) {
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
      }, function(result) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存到 Notion';
        if (result && result.success) {
          showStatus('重试成功！' + result.blocksCount + ' 个 blocks', 'success');
          saveRecentPage(targetPage.value, targetPage.value);
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
