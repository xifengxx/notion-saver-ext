// Shared constants and utility functions for Notion Saver popup

export var STORE = {
  WORKSPACES: 'notion_workspaces',
  CURRENT_BOT: 'notion_current_workspace_bot_id',
  TOKEN_FAILED: 'notion_token_refresh_failed',
  SAVE_STATE: 'notion_save_state',
  OAUTH_SESSION: 'oauth_session_id',
  POPUP_THEME: 'popup_theme',
};

export function recentPagesKey(botId) {
  return 'recent_pages_' + (botId || 'default');
}

export function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
