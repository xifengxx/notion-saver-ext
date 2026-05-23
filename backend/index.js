const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI;

const TOKEN_STORE = path.join(__dirname, 'token-store.json');
const SESSION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

// Request logging
app.use(express.json());
app.use(function logRequest(req, res, next) {
  var now = new Date().toISOString();
  console.log('[' + now + '] ' + req.method + ' ' + req.path);
  next();
});

// Startup check
if (!NOTION_CLIENT_ID || !NOTION_CLIENT_SECRET || !NOTION_REDIRECT_URI) {
  console.error('[Notion Saver] ERROR: Missing environment variables. Check NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI.');
  process.exit(1);
}
console.log('[Notion Saver] Starting with redirect URI: ' + NOTION_REDIRECT_URI);

// Token store helpers
function readTokens() {
  try {
    if (!fs.existsSync(TOKEN_STORE)) return {};
    return JSON.parse(fs.readFileSync(TOKEN_STORE, 'utf8'));
  } catch (e) {
    console.error('[Notion Saver] Failed to read token store, resetting: ' + e.message);
    return {};
  }
}

function writeTokens(store) {
  try {
    fs.writeFileSync(TOKEN_STORE, JSON.stringify(store));
  } catch (e) {
    console.error('[Notion Saver] Failed to write token store: ' + e.message);
  }
}

// Clean up expired sessions
function cleanupExpiredSessions() {
  var store = readTokens();
  var keys = Object.keys(store);
  var removed = 0;
  var now = Date.now();
  for (var i = 0; i < keys.length; i++) {
    var session = store[keys[i]];
    // Sessions without expires_at are cleaned after SESSION_MAX_AGE_MS
    if (session.created_at && (now - session.created_at > SESSION_MAX_AGE_MS)) {
      delete store[keys[i]];
      removed++;
    }
  }
  if (removed > 0) {
    writeTokens(store);
    console.log('[Notion Saver] Cleaned up ' + removed + ' expired sessions');
  }
}
cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);

// Health check
app.get('/', function(req, res) {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// 1. OAuth redirect to Notion
app.get('/auth', function(req, res) {
  var session = req.query.session;
  if (!session) {
    console.error('[Notion Saver] /auth: Missing session');
    return res.status(400).send('Missing session');
  }

  if (!NOTION_CLIENT_ID) {
    console.error('[Notion Saver] /auth: NOTION_CLIENT_ID not set');
    return res.status(500).send('Server configuration error: NOTION_CLIENT_ID');
  }

  var authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', NOTION_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', session);
  authUrl.searchParams.set('owner', 'user');

  console.log('[Notion Saver] Redirecting session ' + session + ' to Notion OAuth');
  res.redirect(authUrl.toString());
});

// 2. OAuth callback from Notion
app.get('/callback', function(req, res) {
  var code = req.query.code;
  var session = req.query.state;
  if (!code || !session) {
    console.error('[Notion Saver] /callback: Missing code or session');
    return res.status(400).send('Missing code or session');
  }

  if (!NOTION_CLIENT_SECRET) {
    console.error('[Notion Saver] /callback: NOTION_CLIENT_SECRET not set');
    return res.status(500).send('Server configuration error');
  }

  var credentials = Buffer.from(NOTION_CLIENT_ID + ':' + NOTION_CLIENT_SECRET).toString('base64');

  fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + credentials,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: NOTION_REDIRECT_URI,
    }),
  }).then(function(tokenRes) {
    if (!tokenRes.ok) {
      return tokenRes.text().then(function(err) {
        console.error('[Notion Saver] Token exchange failed for session ' + session + ': HTTP ' + tokenRes.status + ' — ' + err);
        throw new Error('Token exchange failed: HTTP ' + tokenRes.status);
      });
    }
    return tokenRes.json();
  }).then(function(tokens) {
    var expiresIn = (tokens.expires_in && tokens.expires_in > 0) ? tokens.expires_in : 86400;
    var store = readTokens();
    store[session] = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + expiresIn * 1000,
      workspace_name: tokens.workspace_name || 'Notion Workspace',
      workspace_icon: tokens.workspace_icon || '',
      bot_id: tokens.bot_id || '',
      created_at: Date.now(),
    };
    writeTokens(store);
    console.log('[Notion Saver] Token stored for session ' + session + ', workspace: ' + (tokens.workspace_name || 'unknown'));

    res.send('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:80px 20px;">' +
      '<h2>登录成功</h2>' +
      '<p>可以关闭此页面，返回扩展继续使用。</p>' +
      '<script>setTimeout(function() { window.close(); }, 2000);</script>' +
      '</body></html>');
  }).catch(function(err) {
    console.error('[Notion Saver] /callback error: ' + err.message);
    res.status(500).send('<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:80px 20px;">' +
      '<h2>授权失败</h2>' +
      '<p>' + err.message + '</p><p>请关闭此页面，回到扩展重试。</p>' +
      '</body></html>');
  });
});

// 3. Extension polls this to retrieve tokens
app.get('/token', function(req, res) {
  var session = req.query.session;
  if (!session) return res.status(400).json({ error: 'Missing session' });

  var store = readTokens();
  var tokens = store[session];
  if (!tokens) return res.json({ ready: false });

  // Return tokens and remove from store
  delete store[session];
  writeTokens(store);
  console.log('[Notion Saver] Token delivered for session ' + session);

  res.json({
    ready: true,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    workspace_name: tokens.workspace_name,
    workspace_icon: tokens.workspace_icon,
    bot_id: tokens.bot_id,
  });
});

// 4. Refresh token
app.post('/refresh', function(req, res) {
  var refreshToken = req.body.refresh_token;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refresh_token' });

  var credentials = Buffer.from(NOTION_CLIENT_ID + ':' + NOTION_CLIENT_SECRET).toString('base64');

  fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + credentials,
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      redirect_uri: NOTION_REDIRECT_URI,
    }),
  }).then(function(tokenRes) {
    if (!tokenRes.ok) {
      return tokenRes.text().then(function(err) {
        console.error('[Notion Saver] Token refresh failed: HTTP ' + tokenRes.status + ' — ' + err);
        throw new Error('Token refresh failed');
      });
    }
    return tokenRes.json();
  }).then(function(tokens) {
    console.log('[Notion Saver] Token refreshed successfully');
    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    });
  }).catch(function(e) {
    console.error('[Notion Saver] /refresh error: ' + e.message);
    res.status(401).json({ error: e.message });
  });
});

app.listen(PORT, function() {
  console.log('[Notion Saver] OAuth proxy running on port ' + PORT);
});
