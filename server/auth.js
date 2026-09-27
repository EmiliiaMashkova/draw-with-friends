// Вход через Google (OAuth 2.0 / OpenID Connect, authorization code flow) без сторонних библиотек.
const crypto = require('crypto');
const express = require('express');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

function authRouter(store) {
  const router = express.Router();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const devLogin = process.env.DEV_LOGIN === 'true';
  const inviteCode = process.env.INVITE_CODE || '';

  router.get('/auth/config', (req, res) => {
    res.json({ google: Boolean(clientId && clientSecret), invite: Boolean(inviteCode), dev: devLogin });
  });

  // Вход по коду приглашения: код знают только друзья, аккаунт живёт в cookie этого браузера.
  const attempts = new Map(); // ip -> {n, until}
  router.post('/auth/invite', express.json(), async (req, res) => {
    if (!inviteCode) return res.status(404).json({ error: 'Вход по коду выключен.' });
    const now = Date.now();
    const a = attempts.get(req.ip) || { n: 0, until: 0 };
    if (a.until > now) return res.status(429).json({ error: 'Слишком много попыток, подождите минуту.' });
    const given = Buffer.from(String(req.body.code || '').trim().toLowerCase());
    const expected = Buffer.from(inviteCode.trim().toLowerCase());
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      a.n += 1;
      if (a.n >= 5) { a.n = 0; a.until = now + 60_000; }
      attempts.set(req.ip, a);
      return res.status(403).json({ error: 'Неверный код.' });
    }
    attempts.delete(req.ip);
    if (req.session.uid && (await store.getUser(req.session.uid))) return res.json({ ok: true });
    const user = await store.upsertGoogleUser({
      id: `invite:${crypto.randomUUID()}`, email: null, googleName: null, googlePicture: null,
    });
    req.session.uid = user.id;
    res.json({ ok: true });
  });

  router.get('/auth/google', (req, res) => {
    if (!clientId || !clientSecret) return res.status(503).send('Вход через Google ещё не настроен.');
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${baseUrl(req)}/auth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  router.get('/auth/google/callback', async (req, res) => {
    const { code, state } = req.query;
    const expected = req.session.oauthState;
    req.session.oauthState = undefined;
    if (!code || !state || state !== expected) return res.redirect('/?error=auth');
    try {
      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${baseUrl(req)}/auth/google/callback`,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) throw new Error(`token exchange failed: ${tokenRes.status}`);
      const { access_token: accessToken } = await tokenRes.json();
      const infoRes = await fetch(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!infoRes.ok) throw new Error(`userinfo failed: ${infoRes.status}`);
      const info = await infoRes.json();
      const user = await store.upsertGoogleUser({
        id: `google:${info.sub}`,
        email: info.email || null,
        googleName: info.given_name || info.name || null,
        googlePicture: info.picture || null,
      });
      req.session.uid = user.id;
      res.redirect(user.nickname ? '/' : '/#/profile');
    } catch (err) {
      console.error('google auth error', err);
      res.redirect('/?error=auth');
    }
  });

  // Только для локальной разработки и тестов: вход по имени без Google.
  if (devLogin) {
    router.get('/auth/dev', async (req, res) => {
      const name = String(req.query.name || 'Гость').slice(0, 24);
      const user = await store.upsertGoogleUser({ id: `dev:${name}`, email: null, googleName: name, googlePicture: null });
      req.session.uid = user.id;
      res.redirect(user.nickname ? '/' : '/#/profile');
    });
  }

  router.post('/auth/logout', (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  return router;
}

module.exports = { authRouter };
