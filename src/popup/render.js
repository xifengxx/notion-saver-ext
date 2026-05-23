// Rendering functions for NotionSnap popup
// All DOM container references are passed as parameters

import { escapeHtml } from './lib.js';

export function renderPageList(databases, pages, recent, pageListEl, onSelect) {
  var html = '';
  recent = recent || [];

  // 最近保存
  if (recent.length > 0) {
    html += '<div class="page-list-section"><div class="page-list-label">最近保存</div>';
    for (var i = 0; i < recent.length; i++) {
      html += '<div class="page-list-item page-list-item-recent" data-id="' + recent[i].id + '">' +
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

  // 页面
  if (pages.length > 0) {
    html += '<div class="page-list-section"><div class="page-list-label">页面</div>';
    var displayCount = pages.length > 10 ? 10 : pages.length;
    for (var i = 0; i < displayCount; i++) {
      html += '<div class="page-list-item" data-id="' + pages[i].id + '">' +
        '<span class="page-icon"></span>' +
        '<span class="page-title">' + escapeHtml(pages[i].title) + '</span></div>';
    }
    if (pages.length > 10) {
      html += '<div class="page-list-more">还有更多页面，请输入关键词搜索</div>';
    }
    html += '</div>';
  }

  if (recent.length === 0 && databases.length === 0 && pages.length === 0) {
    html = '<div class="page-list-empty">未找到匹配的页面或数据库</div>';
  }

  pageListEl.innerHTML = html;

  pageListEl.querySelectorAll('.page-list-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var id = this.getAttribute('data-id');
      var title = this.querySelector('.page-title').textContent;
      if (onSelect) onSelect(id, title);
    });
  });
}

var wsColors = ['#e040fb', '#ff5252', '#4285f4', '#10b981', '#f59e0b'];

export function renderSettingsWorkspaceList(workspaces, currentBotId, containerEl, onRemove, onAdd) {
  if (!containerEl) return;
  var html = '';
  for (var i = 0; i < workspaces.length; i++) {
    var ws = workspaces[i];
    var isActive = ws.bot_id === currentBotId;
    var initial = (ws.workspace_name || 'N').charAt(0).toUpperCase();
    var color = wsColors[i % wsColors.length];
    var borderColor = isActive ? color : color + '44';
    var avatarHtml;
    if (ws.workspace_icon) {
      avatarHtml = '<img class="workspace-icon-img" src="' + escapeHtml(ws.workspace_icon) + '" alt="" />';
    } else {
      avatarHtml = '<span class="workspace-avatar" style="background:' + color + '">' + escapeHtml(initial) + '</span>';
    }
    html += '<div class="workspace-item' + (isActive ? ' active' : '') + '" style="border-color:' + borderColor + '">' +
      '<div class="workspace-info">' +
      avatarHtml +
      '<span class="workspace-name">' + escapeHtml(ws.workspace_name || 'Notion') + '</span>' +
      '</div>' +
      '<div class="workspace-actions">' +
      '<button class="remove-ws-btn" data-bot-id="' + ws.bot_id + '" title="解绑空间">×</button>' +
      '</div></div>';
  }
  if (workspaces.length === 0) {
    html = '<div class="settings-empty">' +
      '<p class="settings-empty-text">尚未连接任何空间</p>' +
      '<button class="settings-empty-btn">连接到 Notion</button>' +
      '</div>';
  }
  containerEl.innerHTML = html;

  containerEl.querySelectorAll('.remove-ws-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (onRemove) onRemove(this.getAttribute('data-bot-id'));
    });
  });

  var emptyBtn = containerEl.querySelector('.settings-empty-btn');
  if (emptyBtn) {
    emptyBtn.addEventListener('click', function() {
      if (onAdd) onAdd();
    });
  }
}

// ============================================================
// 预设 Pills 渲染（v0.4.0）
// ============================================================
export function renderPresetsRow(presets, activePresetId, containerEl, onSelect, onCreate) {
  var html = '';
  for (var i = 0; i < presets.length; i++) {
    var p = presets[i];
    var isActive = p.id === activePresetId;
    html += '<span class="preset-pill' + (isActive ? ' active' : '') + '" data-preset-id="' + p.id + '">' +
      escapeHtml(p.name) + '</span>';
  }
  html += '<span class="preset-pill preset-pill-add" id="preset-add-btn">+</span>';
  containerEl.innerHTML = html;

  containerEl.querySelectorAll('.preset-pill[data-preset-id]').forEach(function(pill) {
    pill.addEventListener('click', function() {
      var presetId = this.getAttribute('data-preset-id');
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].id === presetId) {
          if (onSelect) onSelect(presets[i]);
          return;
        }
      }
    });
  });

  var addBtn = containerEl.querySelector('#preset-add-btn');
  if (addBtn) {
    addBtn.addEventListener('click', function() {
      if (onCreate) onCreate();
    });
  }
}

// ============================================================
// 历史列表渲染（v0.4.0）
// ============================================================
export function renderHistoryList(entries, containerEl, onOpen, onCopy, onRetry) {
  if (!entries || entries.length === 0) {
    renderHistoryEmpty(containerEl);
    return;
  }

  var groups = groupByDate(entries);
  var html = '';

  for (var g = 0; g < groups.length; g++) {
    var group = groups[g];
    html += '<div class="history-date-group">' +
      '<div class="history-date-label">' + escapeHtml(group.label) + '</div>';

    for (var i = 0; i < group.items.length; i++) {
      var entry = group.items[i];
      var isSuccess = entry.status === 'success';
      var icon = isSuccess ? '✓' : '✕';
      var iconClass = isSuccess ? 'success' : 'failed';

      html += '<div class="history-item" data-entry-id="' + entry.id + '" data-notion-url="' + escapeHtml(entry.notionUrl || '') + '">' +
        '<span class="history-status-icon ' + iconClass + '">' + icon + '</span>' +
        '<div class="history-item-body">' +
        '<div class="history-item-title">' + escapeHtml(entry.sourceTitle || entry.savedPageTitle || '无标题') + '</div>' +
        '<div class="history-item-meta">' +
        '<span>' + escapeHtml(entry.targetPageName || 'Notion') + '</span>' +
        '<span>' + formatRelativeTime(entry.timestamp) + '</span>' +
        (isSuccess ? '<span>' + (entry.blocksCount || 0) + ' blocks</span>' : '') +
        '</div></div>' +
        '<div class="history-item-actions">';

      if (isSuccess) {
        html += '<button class="history-action-btn copy-btn" title="复制链接">📋</button>' +
          '<button class="history-action-btn open-btn" title="在 Notion 中打开">↗</button>';
      } else {
        html += '<button class="history-action-btn retry-btn" title="重试">↻</button>';
      }

      html += '</div></div>';
    }
    html += '</div>';
  }

  containerEl.innerHTML = html;

  // 绑定事件
  containerEl.querySelectorAll('.open-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var item = this.closest('.history-item');
      var url = item.getAttribute('data-notion-url');
      if (url && onOpen) onOpen(url);
    });
  });

  containerEl.querySelectorAll('.copy-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var item = this.closest('.history-item');
      var url = item.getAttribute('data-notion-url');
      if (url && onCopy) onCopy(url, this);
    });
  });

  containerEl.querySelectorAll('.retry-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var item = this.closest('.history-item');
      var entryId = item.getAttribute('data-entry-id');
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === entryId) {
          if (onRetry) onRetry(entries[i], this);
          return;
        }
      }
    });
  });

  // 整行点击打开
  containerEl.querySelectorAll('.history-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var url = this.getAttribute('data-notion-url');
      if (url && onOpen) onOpen(url);
    });
  });
}

export function renderHistoryEmpty(containerEl) {
  containerEl.innerHTML = '<div class="history-empty">暂无保存记录</div>';
}

// ============================================================
// 历史列表工具函数
// ============================================================
function formatRelativeTime(timestamp) {
  var diff = Date.now() - timestamp;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 172800000) return '昨天';
  return Math.floor(diff / 86400000) + '天前';
}

function groupByDate(entries) {
  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  var yesterdayStart = todayStart - 86400000;

  var groups = [];
  var todayItems = [];
  var yesterdayItems = [];
  var earlierItems = [];

  for (var i = 0; i < entries.length; i++) {
    var ts = entries[i].timestamp || 0;
    if (ts >= todayStart) {
      todayItems.push(entries[i]);
    } else if (ts >= yesterdayStart) {
      yesterdayItems.push(entries[i]);
    } else {
      earlierItems.push(entries[i]);
    }
  }

  if (todayItems.length > 0) groups.push({ label: '今天', items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ label: '昨天', items: yesterdayItems });
  if (earlierItems.length > 0) groups.push({ label: '更早', items: earlierItems });

  return groups;
}
