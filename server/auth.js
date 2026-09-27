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

// Личный ключ входа: «слово-слово-число», чтобы вернуться в свой профиль с любого устройства.
const KEY_WORDS = [
  'лиса', 'кот', 'панда', 'сова', 'ёжик', 'кит', 'енот', 'пчела', 'жираф', 'заяц', 'волк', 'тигр', 'коала', 'пингвин',
  'дельфин', 'белка', 'олень', 'бобр', 'лама', 'выдра', 'облако', 'радуга', 'звезда', 'луна', 'солнце', 'ракета',
  'комета', 'гора', 'река', 'море', 'ветер', 'снег', 'дождь', 'цветок', 'клён', 'кактус', 'гриб', 'ягода', 'арбуз',
  'пончик', 'вафля', 'кекс', 'карандаш', 'кисть', 'краска', 'мелок', 'зефир', 'фонарь', 'замок', 'маяк',
];
function newLoginKey() {
  const w = () => KEY_WORDS[crypto.randomInt(KEY_WORDS.length)];
  return `${w()}-${w()}-${crypto.randomInt(100, 1000)}`;
}
function normalizeKey(key) {
  return String(key || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/[\s_]+/g, '-');
}
function hashKey(key) {
  return crypto.createHash('sha256').update(normalizeKey(key)).digest('hex');
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

  // Вход по коду приглашения: код знают только друзья; вернуться в свой профиль можно личным ключом.
  const attempts = new Map(); // ip -> {n, until}
  const throttled = (req) => (attempts.get(req.ip)?.until || 0) > Date.now();
  const failed = (req) => {
    const a = attempts.get(req.ip) || { n: 0, until: 0 };
    a.n += 1;
    if (a.n >= 5) { a.n = 0; a.until = Date.now() + 60_000; }
    attempts.set(req.ip, a);
  };
  const TOO_MANY = { error: 'Слишком много попыток, подождите минуту.' };

  router.post('/auth/key', express.json(), async (req, res) => {
    if (throttled(req)) return res.status(429).json(TOO_MANY);
    const user = normalizeKey(req.body.key).length >= 5 ? await store.findUserByKeyHash(hashKey(req.body.key)) : null;
    if (!user) { failed(req); return res.status(403).json({ error: 'Такой ключ не найден.' }); }
    attempts.delete(req.ip);
    req.session.uid = user.id;
    res.json({ ok: true });
  });

  router.post('/auth/invite', express.json(), async (req, res) => {
    if (!inviteCode) return res.status(404).json({ error: 'Вход по коду выключен.' });
    if (throttled(req)) return res.status(429).json(TOO_MANY);
    const given = Buffer.from(String(req.body.code || '').trim().toLowerCase());
    const expected = Buffer.from(inviteCode.trim().toLowerCase());
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      failed(req);
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

module.exports = { authRouter, newLoginKey, hashKey, normalizeKey };
