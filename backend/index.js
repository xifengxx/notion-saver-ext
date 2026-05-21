const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID;
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET;
const NOTION_REDIRECT_URI = process.env.NOTION_REDIRECT_URI;

const TOKEN_STORE = path.join(__dirname, 'token-store.json');

function readTokens() {
  try { return JSON.parse(fs.readFileSync(TOKEN_STORE, 'utf8')); }
  catch { return {}; }
}

function writeTokens(store) {
  fs.writeFileSync(TOKEN_STORE, JSON.stringify(store));
}

// 1. Start OAuth: redirect to Notion authorization page
app.get('/auth', (req, res) => {
  const session = req.query.session;
  if (!session) return res.status(400).send('Missing session');

  const authUrl = new URL('https://api.notion.com/v1/oauth/authorize');
  authUrl.searchParams.set('client_id', NOTION_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', NOTION_REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', session);
  authUrl.searchParams.set('owner', 'user');

  res.redirect(authUrl.toString());
});

// 2. Callback: Notion redirects here with the code
app.get('/callback', async (req, res) => {
  const { code, state: session } = req.query;
  if (!code || !session) return res.status(400).send('Missing code or session');

  // Exchange code for tokens
  const credentials = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');
  const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: NOTION_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return res.status(500).send('Token exchange failed: ' + err);
  }

  const tokens = await tokenRes.json();

  // Store tokens
  // Notion Public Integration tokens expire in 24h (86400s). Fallback if expires_in is missing.
  const expiresIn = (tokens.expires_in && tokens.expires_in > 0) ? tokens.expires_in : 86400;
  const store = readTokens();
  store[session] = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
    workspace_name: tokens.workspace_name || 'Notion Workspace',
    workspace_icon: tokens.workspace_icon || '',
    bot_id: tokens.bot_id || '',
  };
  writeTokens(store);

  // Redirect to success page (extension can close this tab)
  res.send(`
    <!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:80px 20px;">
    <h2>Login successful</h2>
    <p>You can close this tab and return to the extension.</p>
    <script>setTimeout(() => window.close(), 2000);</script>
    </body></html>
  `);
});

// 3. Poll tokens: extension calls this with the session ID
app.get('/token', (req, res) => {
  const session = req.query.session;
  if (!session) return res.status(400).json({ error: 'Missing session' });

  const store = readTokens();
  const tokens = store[session];
  if (!tokens) return res.json({ ready: false });

  // Clean up after returning
  delete store[session];
  writeTokens(store);

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

// 4. Refresh token: exchange refresh_token for new access_token
app.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.status(400).json({ error: 'Missing refresh_token' });

  try {
    const credentials = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString('base64');
    const tokenRes = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token,
        redirect_uri: NOTION_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return res.status(401).json({ error: err });
    }

    const tokens = await tokenRes.json();
    res.json({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + tokens.expires_in * 1000,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`OAuth proxy running on port ${PORT}`));
