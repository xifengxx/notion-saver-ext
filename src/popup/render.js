// Rendering functions for NotionSnap popup
// All DOM container references are passed as parameters

import { escapeHtml } from './lib.js';

// 页面层级权重：workspace(0 一级) > page_id/block_id(1 二级) > 其他(2) > database_id(3 三级文章)
function parentTypeWeight(pt) {
  if (pt === 'workspace') return 0;
  if (pt === 'page_id' || pt === 'block_id') return 1;
  if (pt === 'database_id') return 3;
  return 2;
}

// 预设 pill 5 个基础色（背景色、文字色）
var PILL_BASE_COLORS = [
  { bg: '#3B82F6', text: '#FFFFFF' },
  { bg: '#10B981', text: '#FFFFFF' },
  { bg: '#8B5CF6', text: '#FFFFFF' },
  { bg: '#F59E0B', text: '#1F2937' },
  { bg: '#EC4899', text: '#FFFFFF' }
];

function hslFromHex(hex) {
  var r = parseInt(hex.slice(1,3), 16) / 255;
  var g = parseInt(hex.slice(3,5), 16) / 255;
  var b = parseInt(hex.slice(5,7), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h, s: s, l: l };
}

function hexFromHsl(h, s, l) {
  var r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return '#' + [r, g, b].map(function(x) {
    var hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function getPillColor(index) {
  var base = PILL_BASE_COLORS[index % 5];
  if (index < 5) return base;
  var cycle = Math.floor(index / 5);
  var hsl = hslFromHex(base.bg);
  // 奇数轮变淡，偶数轮变深
  var adjust = cycle % 2 === 1 ? 0.08 : -0.08;
  var newL = Math.max(0.1, Math.min(0.9, hsl.l + adjust * (cycle + 1) / 2));
  var newBg = hexFromHsl(hsl.h, hsl.s, newL);
  // 背景亮度决定文字颜色
  var textColor = newL > 0.55 ? '#1F2937' : '#FFFFFF';
  return { bg: newBg, text: textColor };
}

export function renderPageList(databases, pages, recent, pageListEl, onSelect, isSearch, visibleCount) {
  var html = '';
  recent = recent || [];

  function buildCombinedItem(item) {
    var tag = '';
    if (item.isDb) {
      tag = '<span class="page-type-tag">数据库</span>';
    } else if (item.parentType === 'workspace') {
      // 顶层页面不加标签
    } else if (item.parentType === 'page_id' || item.parentType === 'block_id') {
      tag = '<span class="page-type-tag page-tag-sub">子页面</span>';
    }
    var displayTitle = item.title || 'Untitled';
    var itemClass = 'page-list-item' + (item.isDb ? ' page-list-item-db' : '');
    return '<div class="' + itemClass + '" data-id="' + item.id + '"' + (item.isDb ? ' data-is-db="1"' : '') + '>' +
      '<span class="page-icon"></span>' +
      '<span class="page-title">' + escapeHtml(displayTitle) + '</span>' +
      tag + '</div>';
  }

  // === 搜索模式：数据库 + 页面混合，保持传入顺序（按精准度），最多 30 条 ===
  // 调用方负责排序：数据库优先 → workspace 页面 → 其余页面
  if (isSearch) {
    var MAX_SEARCH = 30;
    var shown = 0;

    // 数据库优先（带类型标签）
    for (var i = 0; i < databases.length && shown < MAX_SEARCH; i++) {
      html += '<div class="page-list-item page-list-item-db" data-id="' + databases[i].id + '" data-is-db="1">' +
        '<span class="page-icon"></span>' +
        '<span class="page-title">' + escapeHtml(databases[i].title) + '</span>' +
        '<span class="page-type-tag">数据库</span></div>';
      shown++;
    }
    // 页面保持传入顺序（精准度），只对 workspace 页面加标签
    // page_id/block_id/database_id 不加标签—子页面和数据库文章无法通过 parentType 区分
    for (var i = 0; i < pages.length && shown < MAX_SEARCH; i++) {
      var tag = '';
      if (pages[i].parentType === 'workspace') {
        tag = '<span class="page-type-tag page-tag-workspace">页面</span>';
      }
      html += '<div class="page-list-item" data-id="' + pages[i].id + '">' +
        '<span class="page-icon"></span>' +
        '<span class="page-title">' + escapeHtml(pages[i].title) + '</span>' +
        tag + '</div>';
      shown++;
    }

    if (databases.length === 0 && pages.length === 0) {
      html = '<div class="page-list-empty">未找到匹配的页面或数据库</div>';
    }

    pageListEl.innerHTML = html;
    bindPageItemClicks(pageListEl, onSelect);
    return;
  }

  // === 非搜索模式：两类展示 ===
  // 第一类：最近保存（最多 5 个）
  // 第二类：数据库 + 页面合并，滚动加载（初始 20 条，滚动到底加载更多）

  // 收集最近保存的 id 用于去重
  var recentIds = {};
  for (var i = 0; i < recent.length; i++) {
    recentIds[recent[i].id] = true;
  }

  // 最近保存
  if (recent.length > 0) {
    html += '<div class="page-list-section"><div class="page-list-label">最近保存</div>';
    for (var i = 0; i < recent.length && i < 5; i++) {
      var rIsDb = recent[i].type === 'database';
      html += '<div class="page-list-item page-list-item-recent" data-id="' + recent[i].id + '"' + (rIsDb ? ' data-is-db="1"' : '') + '>' +
        '<span class="page-icon"></span>' +
        '<span class="page-title">' + escapeHtml(recent[i].title) + '</span></div>';
    }
    html += '</div>';
  }

  // 合并数据库和页面，排除已在最近保存中的
  // 顺序：数据库优先 → 页面按层级（workspace → page_id/block_id → 其他 → database_id 文章）
  var combined = [];
  // 数据库排前面
  for (var i = 0; i < databases.length; i++) {
    if (!recentIds[databases[i].id]) {
      combined.push({ id: databases[i].id, title: databases[i].title, isDb: true, parentType: null });
    }
  }
  // 页面按层级排序
  var sortedPages = pages.slice().sort(function(a, b) {
    return parentTypeWeight(a.parentType) - parentTypeWeight(b.parentType);
  });
  for (var i = 0; i < sortedPages.length; i++) {
    if (!recentIds[sortedPages[i].id]) {
      combined.push({ id: sortedPages[i].id, title: sortedPages[i].title, isDb: false, parentType: sortedPages[i].parentType });
    }
  }

  if (combined.length > 0) {
    var showCount = Math.min(visibleCount || 20, 30);
    html += '<div class="page-list-section"><div class="page-list-label">所有页面</div>';

    for (var i = 0; i < combined.length && i < showCount; i++) {
      html += buildCombinedItem(combined[i]);
    }

    if (combined.length > showCount && showCount < 30) {
      html += '<div class="page-list-sentinel" style="height:1px"></div>';
    }

    html += '</div>';
  }

  if (recent.length === 0 && combined.length === 0) {
    html = '<div class="page-list-empty">未找到匹配的页面或数据库</div>';
  }

  pageListEl.innerHTML = html;

  bindPageItemClicks(pageListEl, onSelect);
}

function bindPageItemClicks(pageListEl, onSelect) {
  pageListEl.querySelectorAll('.page-list-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var id = this.getAttribute('data-id');
      var title = this.querySelector('.page-title').textContent;
      var isDb = this.getAttribute('data-is-db') === '1';
      if (onSelect) onSelect(id, title, isDb);
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
export function renderPresetsRow(presets, activePresetId, containerEl, maxCount, onSelect, onCreate) {
  var html = '';
  for (var i = 0; i < presets.length; i++) {
    var p = presets[i];
    var isActive = p.id === activePresetId;
    var color = getPillColor(i);
    var style = 'background:' + color.bg + ';color:' + color.text + ';border-color:' + color.bg;
    html += '<span class="preset-pill' + (isActive ? ' active' : '') + '" data-preset-id="' + p.id + '" style="' + style + '">' +
      escapeHtml(p.name) + '</span>';
  }
  if (presets.length < maxCount) {
    html += '<span class="preset-pill preset-pill-add" id="preset-add-btn">+</span>';
  }
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
