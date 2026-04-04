const express = require('express');
const router = express.Router();
const msal = require('@azure/msal-node');

console.log('\n📋 Azure Credential Check:');
console.log('  CLIENT_ID:    ', process.env.CLIENT_ID ? `✅ ${process.env.CLIENT_ID}` : '❌ MISSING');
console.log('  TENANT_ID:    ', process.env.TENANT_ID ? `✅ ${process.env.TENANT_ID}` : '❌ MISSING');
if (!process.env.CLIENT_SECRET) {
  console.log('  CLIENT_SECRET: ❌ MISSING');
} else if (process.env.CLIENT_SECRET.includes('-') && process.env.CLIENT_SECRET.length === 36) {
  console.log('  CLIENT_SECRET: ⚠️  Looks like a Secret ID — copy the VALUE column instead!');
} else {
  console.log('  CLIENT_SECRET:', `✅ ${process.env.CLIENT_SECRET.substring(0, 6)}... (${process.env.CLIENT_SECRET.length} chars)`);
}
console.log('');

function getMsalConfig() {
  return {
    auth: {
      clientId: process.env.CLIENT_ID,
      authority: 'https://login.microsoftonline.com/common',
      clientSecret: process.env.CLIENT_SECRET,
    },
    system: {
      loggerOptions: {
        loggerCallback(loglevel, message) {
          if (loglevel <= 1) console.log(`  [MSAL]`, message);
        },
        piiLoggingEnabled: false,
        logLevel: 1
      }
    }
  };
}

const SCOPES = [
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Calendars.Read',
  'https://graph.microsoft.com/OnlineMeetings.Read',
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Chat.Read'
];

function getMsalClient() {
  return new msal.ConfidentialClientApplication(getMsalConfig());
}

router.get('/login', async (req, res) => {
  console.log('\n🔐 Login attempt');
  console.log('  CLIENT_ID:', process.env.CLIENT_ID);
  try {
    const client = getMsalClient();
    const authUrl = await client.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback',
    });
    console.log('  ✅ Redirecting to Microsoft...');
    res.redirect(authUrl);
  } catch (err) {
    console.error('  ❌ Error:', err.message);
    res.status(500).send(`<h2>Auth Error</h2><p>${err.message}</p><a href="/">Back</a>`);
  }
});

router.get('/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  console.log('\n📬 OAuth Callback received');
  if (error) {
    console.error('  ❌ Error:', error, error_description);
    return res.redirect(`/?error=${encodeURIComponent(error + ': ' + error_description)}`);
  }
  console.log('  ✅ Code received, exchanging for token...');
  try {
    const client = getMsalClient();
    const tokenResponse = await client.acquireTokenByCode({
      code,
      scopes: SCOPES,
      redirectUri: process.env.REDIRECT_URI || 'http://localhost:3000/auth/callback',
    });
    console.log('  ✅ Token acquired for:', tokenResponse.account?.username);
    req.session.accessToken = tokenResponse.accessToken;
    req.session.account = {
      name: tokenResponse.account?.name || 'User',
      email: tokenResponse.account?.username || ''
    };
    res.redirect('/');
  } catch (err) {
    console.error('  ❌ Token failed:', err.message);
    if (err.errorCode) console.error('  Code:', err.errorCode);
    res.redirect(`/?error=${encodeURIComponent('Token failed: ' + err.message)}`);
  }
});

router.get('/status', (req, res) => {
  res.json({ authenticated: !!req.session.accessToken, account: req.session.account || null });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

module.exports = router;
