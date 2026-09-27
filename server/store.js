// Хранилище: PostgreSQL, если задан DATABASE_URL, иначе память процесса (для локальной разработки).
const { Pool } = require('pg');

const DEFAULT_CANVASES = [
  { name: 'Свободная стена', type: 'free' },
  { name: 'Каракули', type: 'free' },
  { name: 'Эстафета', type: 'rounds' },
  { name: 'Тема дня', type: 'rounds' },
  { name: 'Рисуем с помощником', type: 'assisted' },
  { name: 'Угадайка', type: 'guess' },
];
const GALLERY_LIMIT = 60;

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.canvases = [];
    this.strokes = new Map(); // canvasId -> [{id, userId, data}]
    this.seq = 1;
    this.gallery = []; // {id, userId, title, image(Buffer), createdAt, likes:Set}
  }
  async init() {
    DEFAULT_CANVASES.forEach((c, i) => this.canvases.push({ id: i + 1, ...c }));
  }
  async upsertGoogleUser(u) {
    const existing = this.users.get(u.id);
    if (existing) {
      Object.assign(existing, { email: u.email, googleName: u.googleName, googlePicture: u.googlePicture });
      return existing;
    }
    const user = { ...u, nickname: null, avatar: null };
    this.users.set(u.id, user);
    return user;
  }
  async getUser(id) { return this.users.get(id) || null; }
  async setPicHash(id, hash) { const u = this.users.get(id); if (u) u.picHash = hash; }
  async listPicUsers() {
    return [...this.users.values()].filter((u) => u.picHash && u.nickname)
      .map((u) => ({ id: u.id, nickname: u.nickname, avatar: u.avatar }));
  }
  async updateProfile(id, { nickname, avatar }) {
    const u = this.users.get(id);
    if (!u) return null;
    u.nickname = nickname;
    u.avatar = avatar;
    return u;
  }
  async listCanvases() { return this.canvases.map((c) => ({ ...c })); }
  async touchActivity(userId, day) {
    if (!this.activity) this.activity = new Map(); // day -> Set(userId)
    if (!this.activity.has(day)) this.activity.set(day, new Set());
    this.activity.get(day).add(userId);
  }
  async activityStats(days) {
    const a = this.activity || new Map();
    const week = new Set();
    for (const d of days) for (const u of a.get(d) || []) week.add(u);
    return { today: (a.get(days[0]) || new Set()).size, week: week.size, users: this.users.size };
  }
  async getCanvas(id) { return this.canvases.find((c) => c.id === id) || null; }
  async listStrokes(canvasId) { return (this.strokes.get(canvasId) || []).map((s) => ({ ...s })); }
  async addStroke(canvasId, userId, data) {
    const s = { id: this.seq++, userId, data };
    if (!this.strokes.has(canvasId)) this.strokes.set(canvasId, []);
    this.strokes.get(canvasId).push(s);
    return s;
  }
  async deleteStroke(canvasId, strokeId, userId) {
    const list = this.strokes.get(canvasId) || [];
    const i = list.findIndex((s) => s.id === strokeId && s.userId === userId);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }
  async clearStrokes(canvasId) { this.strokes.set(canvasId, []); }
  async addPicture(userId, title, image) {
    const p = { id: this.seq++, userId, title, image, createdAt: new Date().toISOString(), likes: new Set() };
    this.gallery.push(p);
    return p.id;
  }
  async listPictures(viewerId, sort) {
    const list = [...this.gallery].reverse();
    if (sort === 'top') list.sort((a, b) => b.likes.size - a.likes.size || b.id - a.id);
    return list.slice(0, GALLERY_LIMIT).map((p) => {
      const u = this.users.get(p.userId) || {};
      return {
        id: p.id, title: p.title, createdAt: p.createdAt, likes: p.likes.size, liked: p.likes.has(viewerId),
        mine: p.userId === viewerId, author: { id: p.userId, nickname: u.nickname, googleName: u.googleName, avatar: u.avatar, googlePicture: u.googlePicture },
      };
    });
  }
  async getPictureImage(id) { return this.gallery.find((p) => p.id === id)?.image || null; }
  async toggleLike(id, userId) {
    const p = this.gallery.find((x) => x.id === id);
    if (!p) return null;
    if (p.likes.has(userId)) p.likes.delete(userId); else p.likes.add(userId);
    return { likes: p.likes.size, liked: p.likes.has(userId) };
  }
  async deletePicture(id, userId) {
    const i = this.gallery.findIndex((p) => p.id === id && p.userId === userId);
    if (i < 0) return false;
    this.gallery.splice(i, 1);
    return true;
  }
}

class PgStore {
  constructor(url) {
    const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: false } : undefined;
    this.pool = new Pool({ connectionString: url, ssl, max: 5 });
  }
  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT,
        google_name TEXT,
        google_picture TEXT,
        nickname TEXT,
        avatar TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS canvases (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS strokes (
        id BIGSERIAL PRIMARY KEY,
        canvas_id INT NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS strokes_canvas_idx ON strokes (canvas_id, id);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pic_hash TEXT;
      CREATE TABLE IF NOT EXISTS activity (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day DATE NOT NULL,
        PRIMARY KEY (user_id, day)
      );
      ALTER TABLE canvases DROP CONSTRAINT IF EXISTS canvases_type_check;
      CREATE TABLE IF NOT EXISTS gallery (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        image BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS gallery_likes (
        picture_id INT NOT NULL REFERENCES gallery(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (picture_id, user_id)
      );
    `);
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM canvases');
    if (rows[0].n === 0) {
      for (const c of DEFAULT_CANVASES) {
        await this.pool.query('INSERT INTO canvases (name, type) VALUES ($1, $2)', [c.name, c.type]);
      }
    }
    // Новые типы полотен добавляем и в уже заполненную базу, по одному полотну на тип.
    for (const c of DEFAULT_CANVASES) {
      await this.pool.query(
        'INSERT INTO canvases (name, type) SELECT $1, $2 WHERE NOT EXISTS (SELECT 1 FROM canvases WHERE type = $2)',
        [c.name, c.type],
      );
    }
  }
  static rowToUser(r) {
    return r && {
      id: r.id, email: r.email, googleName: r.google_name, googlePicture: r.google_picture,
      nickname: r.nickname, avatar: r.avatar, picHash: r.pic_hash,
    };
  }
  async upsertGoogleUser(u) {
    const { rows } = await this.pool.query(
      `INSERT INTO users (id, email, google_name, google_picture) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = $2, google_name = $3, google_picture = $4
       RETURNING *`,
      [u.id, u.email, u.googleName, u.googlePicture],
    );
    return PgStore.rowToUser(rows[0]);
  }
  async getUser(id) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return PgStore.rowToUser(rows[0]) || null;
  }
  async setPicHash(id, hash) {
    await this.pool.query('UPDATE users SET pic_hash = $2 WHERE id = $1', [id, hash]);
  }
  async listPicUsers() {
    const { rows } = await this.pool.query(
      'SELECT id, nickname, avatar FROM users WHERE pic_hash IS NOT NULL AND nickname IS NOT NULL ORDER BY lower(nickname)',
    );
    return rows;
  }
  async updateProfile(id, { nickname, avatar }) {
    const { rows } = await this.pool.query(
      'UPDATE users SET nickname = $2, avatar = $3 WHERE id = $1 RETURNING *',
      [id, nickname, avatar],
    );
    return PgStore.rowToUser(rows[0]) || null;
  }
  async touchActivity(userId, day) {
    await this.pool.query('INSERT INTO activity (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, day]);
  }
  async activityStats(days) {
    const { rows } = await this.pool.query(
      `SELECT count(DISTINCT user_id) FILTER (WHERE day = $1)::int AS today,
              count(DISTINCT user_id) FILTER (WHERE day = ANY($2::date[]))::int AS week,
              (SELECT count(*)::int FROM users) AS users
         FROM activity WHERE day = ANY($2::date[])`,
      [days[0], days],
    );
    return rows[0];
  }
  async listCanvases() {
    const { rows } = await this.pool.query('SELECT id, name, type FROM canvases ORDER BY id');
    return rows;
  }
  async getCanvas(id) {
    const { rows } = await this.pool.query('SELECT id, name, type FROM canvases WHERE id = $1', [id]);
    return rows[0] || null;
  }
  async listStrokes(canvasId) {
    const { rows } = await this.pool.query(
      'SELECT id, user_id, data FROM strokes WHERE canvas_id = $1 ORDER BY id',
      [canvasId],
    );
    return rows.map((r) => ({ id: Number(r.id), userId: r.user_id, data: r.data }));
  }
  async addStroke(canvasId, userId, data) {
    const { rows } = await this.pool.query(
      'INSERT INTO strokes (canvas_id, user_id, data) VALUES ($1, $2, $3) RETURNING id',
      [canvasId, userId, data],
    );
    return { id: Number(rows[0].id), userId, data };
  }
  async deleteStroke(canvasId, strokeId, userId) {
    const { rowCount } = await this.pool.query(
      'DELETE FROM strokes WHERE canvas_id = $1 AND id = $2 AND user_id = $3',
      [canvasId, strokeId, userId],
    );
    return rowCount > 0;
  }
  async clearStrokes(canvasId) {
    await this.pool.query('DELETE FROM strokes WHERE canvas_id = $1', [canvasId]);
  }
  async addPicture(userId, title, image) {
    const { rows } = await this.pool.query(
      'INSERT INTO gallery (user_id, title, image) VALUES ($1, $2, $3) RETURNING id',
      [userId, title, image],
    );
    return rows[0].id;
  }
  async listPictures(viewerId, sort) {
    const order = sort === 'top' ? 'likes DESC, g.id DESC' : 'g.id DESC';
    const { rows } = await this.pool.query(
      `SELECT g.id, g.title, g.created_at, g.user_id,
              u.nickname, u.google_name, u.avatar, u.google_picture,
              (SELECT count(*)::int FROM gallery_likes l WHERE l.picture_id = g.id) AS likes,
              EXISTS (SELECT 1 FROM gallery_likes l WHERE l.picture_id = g.id AND l.user_id = $1) AS liked
         FROM gallery g JOIN users u ON u.id = g.user_id
        ORDER BY ${order} LIMIT ${GALLERY_LIMIT}`,
      [viewerId],
    );
    return rows.map((r) => ({
      id: r.id, title: r.title, createdAt: r.created_at, likes: r.likes, liked: r.liked, mine: r.user_id === viewerId,
      author: { id: r.user_id, nickname: r.nickname, googleName: r.google_name, avatar: r.avatar, googlePicture: r.google_picture },
    }));
  }
  async getPictureImage(id) {
    const { rows } = await this.pool.query('SELECT image FROM gallery WHERE id = $1', [id]);
    return rows[0]?.image || null;
  }
  async toggleLike(id, userId) {
    const { rowCount: exists } = await this.pool.query('SELECT 1 FROM gallery WHERE id = $1', [id]);
    if (!exists) return null;
    const { rowCount } = await this.pool.query('DELETE FROM gallery_likes WHERE picture_id = $1 AND user_id = $2', [id, userId]);
    if (!rowCount) await this.pool.query('INSERT INTO gallery_likes (picture_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, userId]);
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM gallery_likes WHERE picture_id = $1', [id]);
    return { likes: rows[0].n, liked: !rowCount };
  }
  async deletePicture(id, userId) {
    const { rowCount } = await this.pool.query('DELETE FROM gallery WHERE id = $1 AND user_id = $2', [id, userId]);
    return rowCount > 0;
  }
}

function createStore() {
  return process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new MemoryStore();
}

module.exports = { createStore, DEFAULT_CANVASES };
