// Хранилище: PostgreSQL, если задан DATABASE_URL, иначе память процесса (для локальной разработки).
const { Pool } = require('pg');

const DEFAULT_CANVASES = [
  { name: 'Свободная стена', type: 'free' },
  { name: 'Каракули', type: 'free' },
  { name: 'Эстафета', type: 'rounds' },
  { name: 'Тема дня', type: 'rounds' },
  { name: 'Рисуем с помощником', type: 'assisted' },
];

class MemoryStore {
  constructor() {
    this.users = new Map();
    this.canvases = [];
    this.strokes = new Map(); // canvasId -> [{id, userId, data}]
    this.seq = 1;
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
        type TEXT NOT NULL CHECK (type IN ('free', 'rounds', 'assisted')),
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
    `);
    const { rows } = await this.pool.query('SELECT count(*)::int AS n FROM canvases');
    if (rows[0].n === 0) {
      for (const c of DEFAULT_CANVASES) {
        await this.pool.query('INSERT INTO canvases (name, type) VALUES ($1, $2)', [c.name, c.type]);
      }
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
}

function createStore() {
  return process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new MemoryStore();
}

module.exports = { createStore, DEFAULT_CANVASES };
