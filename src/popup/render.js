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
