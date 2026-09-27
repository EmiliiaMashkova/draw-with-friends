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

// Картиночный пароль: 3 картинки из 12 по порядку. Храним только хеш с id пользователя в качестве соли.
const PICTURES = ['🐱', '🐶', '🦊', '🐼', '🐸', '🦄', '🌈', '⭐', '🍓', '🍩', '🚀', '🌸'];
const PIC_LEN = 3;
function cleanPics(pics) {
  if (!Array.isArray(pics) || pics.length !== PIC_LEN) return null;
  const out = pics.map(Number);
  return out.every((i) => Number.isInteger(i) && i >= 0 && i < PICTURES.length) ? out : null;
}
function hashPics(userId, pics) {
  return crypto.createHash('sha256').update(`${userId}:${pics.join(',')}`).digest('hex');
}

function authRouter(store) {
  const router = express.Router();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const devLogin = process.env.DEV_LOGIN === 'true';
  const inviteCode = process.env.INVITE_CODE || '';
  const inviteHint = process.env.INVITE_HINT === 'true';
  const invited = (req) => Boolean(req.session.invited || req.session.uid);

  router.get('/auth/config', (req, res) => {
    res.json({
      google: Boolean(clientId && clientSecret),
      invite: Boolean(inviteCode),
      // INVITE_HINT=true показывает код прямо на странице входа (сайт открыт всем, у кого есть ссылка).
      inviteHint: inviteHint && inviteCode ? inviteCode : null,
      invited: invited(req),
      dev: devLogin,
    });
  });

  // Код приглашения общий: он один раз открывает сайт на устройстве (флаг invited в cookie).
  // Дальше человек выбирает себя в списке и нажимает свои 3 картинки, или создаёт новый профиль.
  const attempts = new Map(); // ip или ip+user -> {n, until}
  const throttled = (k) => (attempts.get(k)?.until || 0) > Date.now();
  const failed = (k) => {
    const a = attempts.get(k) || { n: 0, until: 0 };
    a.n += 1;
    if (a.n >= 5) { a.n = 0; a.until = Date.now() + 60_000; }
    attempts.set(k, a);
  };
  const TOO_MANY = { error: 'too_many' };

  router.post('/auth/invite', express.json(), (req, res) => {
    if (!inviteCode) return res.status(404).json({ error: 'invite_off' });
    if (throttled(req.ip)) return res.status(429).json(TOO_MANY);
    const given = Buffer.from(String(req.body.code || '').trim().toLowerCase());
    const expected = Buffer.from(inviteCode.trim().toLowerCase());
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      failed(req.ip);
      return res.status(403).json({ error: 'bad_code' });
    }
    attempts.delete(req.ip);
    req.session.invited = true;
    res.json({ ok: true });
  });

  router.get('/auth/people', async (req, res) => {
    if (!invited(req)) return res.status(403).json({ error: 'need_invite' });
    const people = (await store.listPicUsers()).map((u) => ({ ...u, avatar: u.avatar === 'google' ? null : u.avatar }));
    res.json({ pictures: PICTURES, people });
  });

  router.post('/auth/new', async (req, res) => {
    if (!invited(req)) return res.status(403).json({ error: 'need_invite' });
    const user = await store.upsertGoogleUser({
      id: `invite:${crypto.randomUUID()}`, email: null, googleName: null, googlePicture: null,
    });
    req.session.uid = user.id;
    res.json({ ok: true });
  });

  router.post('/auth/pic', express.json(), async (req, res) => {
    if (!invited(req)) return res.status(403).json({ error: 'need_invite' });
    const userId = String(req.body.userId || '');
    const k = `${req.ip}|${userId}`;
    if (throttled(k)) return res.status(429).json(TOO_MANY);
    const pics = cleanPics(req.body.pics);
    const user = pics && (await store.getUser(userId));
    if (!user || !user.picHash || user.picHash !== hashPics(user.id, pics)) {
      failed(k);
      return res.status(403).json({ error: 'wrong_pics' });
    }
    attempts.delete(k);
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
    // Устройство остаётся «приглашённым»: после выхода можно сразу выбрать себя в списке.
    req.session = { invited: invited(req) };
    res.json({ ok: true });
  });

  return router;
}

module.exports = { authRouter, PICTURES, cleanPics, hashPics };
