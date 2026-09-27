const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const { Server } = require('socket.io');
const { createStore } = require('./store');
const { authRouter, cleanPics, hashPics, PICTURES } = require('./auth');
const { setupRooms, publicUser } = require('./rooms');
const { LESSONS } = require('./lessons');
const { createActivity, log } = require('./activity');

const PORT = Number(process.env.PORT || 8080);
const AVATAR_RE = /^(google|emoji:[^:]{1,8}:#[0-9a-fA-F]{6}|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/;
const MAX_AVATAR_LEN = 200_000;
const MAX_PICTURE_BYTES = 600_000;

async function main() {
  const store = createStore();
  await store.init();
  const activity = createActivity(store);

  let secret = process.env.SESSION_SECRET;
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    console.warn('SESSION_SECRET не задан: сессии сбросятся при перезапуске.');
  }

  const app = express();
  app.set('trust proxy', 1);
  const session = cookieSession({
    name: 'dwf',
    keys: [secret],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });

  app.get('/healthz', (req, res) => res.send('ok'));
  app.get('/readyz', (req, res) => res.send('ok'));

  app.use(session);
  const requireUser = async (req, res, next) => {
    const user = req.session.uid && (await store.getUser(req.session.uid));
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    activity.touch(user.id);
    next();
  };

  // Галерея: картинка приходит как JPEG в data URL, поэтому у этого маршрута свой лимит размера.
  const lastSave = new Map(); // userId -> время последнего сохранения
  app.post('/api/gallery', express.json({ limit: '1mb' }), requireUser, async (req, res) => {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body.image || ''));
    const image = m && Buffer.from(m[1], 'base64');
    if (!image || image.length > MAX_PICTURE_BYTES || image[0] !== 0xff || image[1] !== 0xd8) return res.status(400).json({ error: 'bad_picture' });
    if (Date.now() - (lastSave.get(req.user.id) || 0) < 10_000) return res.status(429).json({ error: 'too_fast' });
    lastSave.set(req.user.id, Date.now());
    const title = String(req.body.title || '').replace(/\s+/g, ' ').trim().slice(0, 40) || '…';
    const id = await store.addPicture(req.user.id, title, image);
    log('gallery-add', { who: req.user.nickname, id });
    res.json({ id });
  });

  app.use(express.json({ limit: '300kb' }));
  app.use(authRouter(store));

  app.get('/api/me', requireUser, (req, res) => {
    res.json({ ...publicUser(req.user), rawAvatar: req.user.avatar || 'google', googlePicture: req.user.googlePicture, needsProfile: !req.user.nickname, hasPicPassword: Boolean(req.user.picHash), pictures: PICTURES });
  });

  app.put('/api/me', requireUser, async (req, res) => {
    const nickname = String(req.body.nickname || '').trim().replace(/\s+/g, ' ');
    const avatar = String(req.body.avatar || 'google');
    if (nickname.length < 2 || nickname.length > 24) return res.status(400).json({ error: 'nick_len' });
    if (avatar.length > MAX_AVATAR_LEN || !AVATAR_RE.test(avatar)) return res.status(400).json({ error: 'bad_avatar' });
    const user = await store.updateProfile(req.user.id, { nickname, avatar });
    res.json(publicUser(user));
  });

  app.put('/api/me/pic-password', requireUser, async (req, res) => {
    const pics = cleanPics(req.body.pics);
    if (!pics) return res.status(400).json({ error: 'need_pics' });
    await store.setPicHash(req.user.id, hashPics(req.user.id, pics));
    res.json({ ok: true });
  });

  let rooms;
  app.get('/api/canvases', requireUser, async (req, res) => {
    const list = await store.listCanvases();
    res.json(list.map((c) => ({ ...c, online: rooms.presenceList(c.id) })));
  });

  app.get('/api/stats', requireUser, async (req, res) => {
    res.json(await activity.stats(rooms.onlineCount()));
  });

  app.get('/api/gallery', requireUser, async (req, res) => {
    const list = await store.listPictures(req.user.id, req.query.sort === 'top' ? 'top' : 'new');
    res.json(list.map((p) => ({ ...p, author: publicUser(p.author) })));
  });
  app.get('/api/gallery/:id.jpg', requireUser, async (req, res) => {
    const image = await store.getPictureImage(Number(req.params.id));
    if (!image) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=86400').type('jpeg').send(image);
  });
  app.post('/api/gallery/:id/like', requireUser, async (req, res) => {
    const r = await store.toggleLike(Number(req.params.id), req.user.id);
    if (!r) return res.status(404).json({ error: 'not_found' });
    res.json(r);
  });
  app.delete('/api/gallery/:id', requireUser, async (req, res) => {
    if (!(await store.deletePicture(Number(req.params.id), req.user.id))) return res.status(404).json({ error: 'not_found' });
    log('gallery-delete', { who: req.user.nickname, id: req.params.id });
    res.json({ ok: true });
  });

  app.get('/api/lessons', requireUser, (req, res) => res.json(LESSONS));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 1e6 });
  io.engine.use(session);
  rooms = setupRooms(io, store, activity);

  // Раз в 10 минут короткая сводка в лог: онлайн, за день, за неделю, штрихов с прошлой сводки.
  setInterval(async () => {
    try {
      const st = await activity.stats(rooms.onlineCount());
      log('stats', { online: st.online, today: st.today, week: st.week, users: st.users, strokes: rooms.takeStrokeCount() });
    } catch (err) { console.error('stats error', err.message); }
  }, 10 * 60 * 1000).unref();

  server.listen(PORT, () => console.log(`draw-with-friends слушает порт ${PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
