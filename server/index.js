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

const PORT = Number(process.env.PORT || 8080);
const AVATAR_RE = /^(google|emoji:[^:]{1,8}:#[0-9a-fA-F]{6}|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/;
const MAX_AVATAR_LEN = 200_000;

async function main() {
  const store = createStore();
  await store.init();

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
  app.use(express.json({ limit: '300kb' }));
  app.use(authRouter(store));

  const requireUser = async (req, res, next) => {
    const user = req.session.uid && (await store.getUser(req.session.uid));
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.user = user;
    next();
  };

  app.get('/api/me', requireUser, (req, res) => {
    res.json({ ...publicUser(req.user), rawAvatar: req.user.avatar || 'google', googlePicture: req.user.googlePicture, needsProfile: !req.user.nickname, hasPicPassword: Boolean(req.user.picHash), pictures: PICTURES });
  });

  app.put('/api/me', requireUser, async (req, res) => {
    const nickname = String(req.body.nickname || '').trim().replace(/\s+/g, ' ');
    const avatar = String(req.body.avatar || 'google');
    if (nickname.length < 2 || nickname.length > 24) return res.status(400).json({ error: 'Никнейм: от 2 до 24 символов.' });
    if (avatar.length > MAX_AVATAR_LEN || !AVATAR_RE.test(avatar)) return res.status(400).json({ error: 'Неподходящий аватар.' });
    const user = await store.updateProfile(req.user.id, { nickname, avatar });
    res.json(publicUser(user));
  });

  app.put('/api/me/pic-password', requireUser, async (req, res) => {
    const pics = cleanPics(req.body.pics);
    if (!pics) return res.status(400).json({ error: 'Выберите 3 картинки.' });
    await store.setPicHash(req.user.id, hashPics(req.user.id, pics));
    res.json({ ok: true });
  });

  let rooms;
  app.get('/api/canvases', requireUser, async (req, res) => {
    const list = await store.listCanvases();
    res.json(list.map((c) => ({ ...c, online: rooms.presenceList(c.id) })));
  });

  app.get('/api/lessons', requireUser, (req, res) => res.json(LESSONS));

  app.use(express.static(path.join(__dirname, '..', 'public')));

  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 1e6 });
  io.engine.use(session);
  rooms = setupRooms(io, store);

  server.listen(PORT, () => console.log(`draw-with-friends слушает порт ${PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
