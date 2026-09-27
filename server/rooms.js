// Логика полотен в реальном времени: присутствие, штрихи, раунды и уроки с помощником.
const { LESSONS } = require('./lessons');
const { log } = require('./activity');
const { WORDS, isCorrect, mask } = require('./words');

const TURN_SECONDS = Number(process.env.TURN_SECONDS || 45);
const GUESS_SECONDS = Number(process.env.GUESS_SECONDS || 75);
const REACTIONS = ['❤️', '😂', '😮', '👏', '🔥', '⭐', '🎉', '👍'];
const STAMP_RE = /^[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]{1,8}$/u;
const isGame = (c) => c.type === 'rounds' || c.type === 'guess';
const LAPS = 2; // сколько раз каждый игрок рисует за игру
// Порядок важен: клиент переводит тему по индексу promptId (public/i18n.js).
const PROMPTS = [
  'Подводный мир', 'Город будущего', 'Пикник в парке', 'Космическое путешествие', 'Сказочный лес',
  'Зоопарк', 'Зимний вечер', 'Пиратский корабль', 'Кафе на углу', 'Ферма', 'Замок дракона',
  'Пляж', 'Ярмарка', 'Джунгли', 'День рождения',
];
const MAX_POINTS = 4000;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function publicUser(u) {
  const avatar = !u.avatar || u.avatar === 'google' ? u.googlePicture || null : u.avatar;
  return { id: u.id, nickname: u.nickname || u.googleName || 'Без имени', avatar };
}

function cleanStroke(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const tool = ['eraser', 'fill', 'stamp'].includes(raw.tool) ? raw.tool : 'pen';
  const color = COLOR_RE.test(raw.color) ? raw.color : '#000000';
  const size = Math.min(80, Math.max(1, Number(raw.size) || 4));
  if (!Array.isArray(raw.points) || raw.points.length === 0 || raw.points.length > MAX_POINTS) return null;
  const points = [];
  for (const p of raw.points) {
    if (!Array.isArray(p) || p.length < 2) return null;
    const x = Number(p[0]);
    const y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }
  // Заливка и штамп ставятся одним нажатием в одну точку.
  if ((tool === 'fill' || tool === 'stamp') && points.length !== 1) return null;
  if (tool !== 'stamp') return { tool, color, size, points };
  if (typeof raw.stamp !== 'string' || !STAMP_RE.test(raw.stamp)) return null;
  return { tool, color, size, points, stamp: raw.stamp };
}

// Состояние «Угадайки» для конкретного игрока: слово видит только тот, кто рисует.
function publicState(st, userId) {
  if (!st || st.kind !== 'guess') return st;
  const { wordId, used, ...rest } = st;
  const word = wordId != null ? WORDS[wordId] : null;
  return {
    ...rest,
    word: word && userId === st.drawer ? { me: word.me, en: word.en, ru: word.ru } : null,
    mask: word ? mask(word) : null,
  };
}

function setupRooms(io, store, activity) {
  const presence = new Map(); // canvasId -> Map(socketId -> publicUser)
  const states = new Map(); // canvasId -> игровое состояние (раунды / урок)
  const timers = new Map();
  const connected = new Map(); // userId -> число открытых вкладок
  let strokesSinceReport = 0;

  const room = (id) => `c:${id}`;

  function presenceList(canvasId) {
    const seen = new Map();
    for (const u of (presence.get(canvasId) || new Map()).values()) seen.set(u.id, u);
    return [...seen.values()];
  }

  function isOnline(canvasId, userId) {
    return presenceList(canvasId).some((u) => u.id === userId);
  }

  function initialState(canvas) {
    if (canvas.type === 'rounds') {
      return { kind: 'rounds', status: 'lobby', players: [], order: [], turn: 0, drawer: null, prompt: null, turnEndsAt: null };
    }
    if (canvas.type === 'guess') {
      return {
        kind: 'guess', status: 'lobby', players: [], order: [], turn: 0, drawer: null, turnEndsAt: null,
        wordId: null, used: [], guessed: [], scores: {}, names: {}, lastWord: null,
      };
    }
    if (canvas.type === 'assisted') return { lessonId: LESSONS[0].id, step: 0 };
    return {};
  }

  function getState(canvas) {
    if (!states.has(canvas.id)) states.set(canvas.id, initialState(canvas));
    return states.get(canvas.id);
  }

  function broadcastState(canvasId) {
    const st = states.get(canvasId);
    if (st.kind !== 'guess') return io.to(room(canvasId)).emit('state', st);
    for (const [sid, u] of presence.get(canvasId) || []) io.sockets.sockets.get(sid)?.emit('state', publicState(st, u.id));
  }

  // «Угадайка»: у каждого хода новое слово и чистое полотно.
  function revealWord(st) {
    if (st.wordId != null) st.lastWord = { ...WORDS[st.wordId] };
    st.wordId = null;
  }
  function pickWord(canvasId, st) {
    let free = WORDS.map((_, i) => i).filter((i) => !st.used.includes(i));
    if (!free.length) { st.used = []; free = WORDS.map((_, i) => i); }
    st.wordId = free[Math.floor(Math.random() * free.length)];
    st.used.push(st.wordId);
    st.guessed = [];
    store.clearStrokes(canvasId).catch((err) => console.error('clear error', err.message));
    io.to(room(canvasId)).emit('canvas:cleared');
  }

  function broadcastPresence(canvasId) {
    io.to(room(canvasId)).emit('presence', presenceList(canvasId));
    io.emit('lobby:presence', { canvasId, users: presenceList(canvasId) });
  }

  // --- Раунды ---
  function nextTurn(canvasId) {
    clearTimeout(timers.get(canvasId));
    const st = states.get(canvasId);
    if (!st || st.status !== 'playing') return;
    const guess = st.kind === 'guess';
    if (guess) revealWord(st);
    const seconds = guess ? GUESS_SECONDS : TURN_SECONDS;
    while (st.turn < st.order.length) {
      const drawer = st.order[st.turn];
      st.turn += 1;
      if (isOnline(canvasId, drawer) && st.players.includes(drawer)) {
        st.drawer = drawer;
        if (guess) pickWord(canvasId, st);
        st.turnEndsAt = Date.now() + seconds * 1000;
        timers.set(canvasId, setTimeout(() => nextTurn(canvasId), seconds * 1000));
        broadcastState(canvasId);
        return;
      }
    }
    st.status = 'finished';
    log('game-end', { canvas: canvasId, turns: st.order.length });
    st.drawer = null;
    st.turnEndsAt = null;
    broadcastState(canvasId);
  }

  async function startGame(canvasId) {
    const st = states.get(canvasId);
    const players = st.players.filter((id) => isOnline(canvasId, id));
    if (players.length === 0) return;
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    st.players = players;
    st.order = Array.from({ length: LAPS }, () => shuffled).flat();
    st.turn = 0;
    if (st.kind === 'guess') {
      Object.assign(st, { scores: {}, guessed: [], lastWord: null, wordId: null });
    } else {
      st.promptId = Math.floor(Math.random() * PROMPTS.length);
      st.prompt = PROMPTS[st.promptId];
    }
    st.status = 'playing';
    log('game-start', { canvas: canvasId, kind: st.kind, players: players.length });
    await store.clearStrokes(canvasId);
    io.to(room(canvasId)).emit('canvas:cleared');
    nextTurn(canvasId);
  }

  io.on('connection', async (socket) => {
    const uid = socket.request.session && socket.request.session.uid;
    const dbUser = uid ? await store.getUser(uid) : null;
    if (!dbUser) {
      socket.emit('auth:required');
      socket.disconnect(true);
      return;
    }
    const me = publicUser(dbUser);
    let canvas = null;
    connected.set(me.id, (connected.get(me.id) || 0) + 1);
    activity?.touch(me.id);

    const leave = () => {
      if (!canvas) return;
      const id = canvas.id;
      presence.get(id)?.delete(socket.id);
      socket.leave(room(id));
      broadcastPresence(id);
      const st = states.get(id);
      if (st && st.status === 'playing' && st.drawer === me.id && !isOnline(id, me.id)) nextTurn(id);
      canvas = null;
    };

    socket.on('join', async ({ canvasId } = {}, ack) => {
      leave();
      const c = await store.getCanvas(Number(canvasId));
      if (!c) return ack?.({ error: 'not_found' });
      canvas = c;
      socket.join(room(c.id));
      if (!presence.has(c.id)) presence.set(c.id, new Map());
      presence.get(c.id).set(socket.id, me);
      const strokes = await store.listStrokes(c.id);
      ack?.({ canvas: c, strokes, state: publicState(getState(c), me.id), me, presence: presenceList(c.id) });
      broadcastPresence(c.id);
    });

    socket.on('leave', leave);

    function canDraw() {
      if (!canvas) return false;
      if (!isGame(canvas)) return true;
      const st = getState(canvas);
      return st.status === 'playing' && st.drawer === me.id;
    }

    socket.on('stroke:live', (msg = {}) => {
      if (!canDraw()) return;
      const s = cleanStroke(msg);
      if (!s || typeof msg.sid !== 'string') return;
      socket.volatile.to(room(canvas.id)).emit('stroke:live', { ...s, sid: msg.sid.slice(0, 40), userId: me.id });
    });

    socket.on('stroke:end', async (msg = {}, ack) => {
      if (!canDraw()) return ack?.({ error: 'forbidden' });
      const s = cleanStroke(msg);
      if (!s) return ack?.({ error: 'invalid' });
      const canvasId = canvas.id;
      const saved = await store.addStroke(canvasId, me.id, s);
      strokesSinceReport += 1;
      const sid = typeof msg.sid === 'string' ? msg.sid.slice(0, 40) : null;
      socket.to(room(canvasId)).emit('stroke:add', { ...saved, sid });
      ack?.({ id: saved.id });
    });

    socket.on('stroke:undo', async ({ id } = {}) => {
      if (!canvas) return;
      const canvasId = canvas.id;
      if (await store.deleteStroke(canvasId, Number(id), me.id)) {
        io.to(room(canvasId)).emit('stroke:remove', { id: Number(id) });
      }
    });

    socket.on('canvas:clear', async () => {
      if (!canvas || isGame(canvas)) return;
      const canvasId = canvas.id;
      await store.clearStrokes(canvasId);
      log('canvas-clear', { canvas: canvasId, by: me.nickname });
      io.to(room(canvasId)).emit('canvas:cleared', { by: me.nickname });
    });

    // Раунды
    socket.on('rounds:join', () => {
      if (!canvas || !isGame(canvas)) return;
      const st = getState(canvas);
      if (st.status === 'playing' || st.players.includes(me.id)) return;
      st.players.push(me.id);
      if (st.names) st.names[me.id] = me.nickname;
      broadcastState(canvas.id);
    });
    socket.on('rounds:leave', () => {
      if (!canvas || !isGame(canvas)) return;
      const st = getState(canvas);
      st.players = st.players.filter((id) => id !== me.id);
      if (st.status === 'playing' && st.drawer === me.id) nextTurn(canvas.id);
      else broadcastState(canvas.id);
    });
    socket.on('rounds:start', async () => {
      if (!canvas || !isGame(canvas)) return;
      const st = getState(canvas);
      if (st.status === 'playing' || !st.players.includes(me.id)) return;
      await startGame(canvas.id);
    });
    socket.on('rounds:pass', () => {
      if (!canvas || !isGame(canvas)) return;
      const st = getState(canvas);
      if (st.status === 'playing' && st.drawer === me.id) nextTurn(canvas.id);
    });

    // «Угадайка»: догадки в чат, за верный ответ очки угадавшему и художнику.
    let lastSay = 0;
    socket.on('guess:say', ({ text } = {}) => {
      if (!canvas || canvas.type !== 'guess') return;
      const said = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const now = Date.now();
      if (!said || now - lastSay < 400) return;
      lastSay = now;
      const canvasId = canvas.id;
      const st = getState(canvas);
      const playing = st.status === 'playing' && st.wordId != null;
      if (!playing) return io.to(room(canvasId)).emit('guess:msg', { who: me.nickname, text: said });
      // Художник и уже угадавшие молчат, чтобы не подсказать слово.
      if (st.drawer === me.id || st.guessed.includes(me.id)) return;
      if (!isCorrect(WORDS[st.wordId], said)) return io.to(room(canvasId)).emit('guess:msg', { who: me.nickname, text: said });
      const points = Math.max(1, 3 - st.guessed.length);
      st.guessed.push(me.id);
      st.names[me.id] = me.nickname;
      st.scores[me.id] = (st.scores[me.id] || 0) + points;
      st.scores[st.drawer] = (st.scores[st.drawer] || 0) + 1;
      io.to(room(canvasId)).emit('guess:msg', { who: me.nickname, correct: true, points });
      const guessers = presenceList(canvasId).filter((u) => u.id !== st.drawer);
      if (guessers.every((u) => st.guessed.includes(u.id))) {
        // Все угадали: короткая пауза и следующий ход.
        clearTimeout(timers.get(canvasId));
        st.turnEndsAt = Date.now() + 2000;
        timers.set(canvasId, setTimeout(() => nextTurn(canvasId), 2000));
      }
      broadcastState(canvasId);
    });

    // Летающие эмодзи-реакции.
    let lastReact = 0;
    socket.on('react', ({ emoji } = {}) => {
      if (!canvas || !REACTIONS.includes(emoji)) return;
      const now = Date.now();
      if (now - lastReact < 250) return;
      lastReact = now;
      io.to(room(canvas.id)).emit('react', { emoji, who: me.nickname });
    });

    // Уроки с помощником
    socket.on('lesson:set', ({ lessonId } = {}) => {
      if (!canvas || canvas.type !== 'assisted') return;
      if (!LESSONS.some((l) => l.id === lessonId)) return;
      Object.assign(getState(canvas), { lessonId, step: 0 });
      broadcastState(canvas.id);
    });
    socket.on('lesson:step', ({ delta } = {}) => {
      if (!canvas || canvas.type !== 'assisted') return;
      const st = getState(canvas);
      const lesson = LESSONS.find((l) => l.id === st.lessonId);
      st.step = Math.max(0, Math.min(lesson.steps.length - 1, st.step + (delta > 0 ? 1 : -1)));
      broadcastState(canvas.id);
    });

    socket.on('disconnect', () => {
      leave();
      const n = (connected.get(me.id) || 1) - 1;
      if (n <= 0) connected.delete(me.id); else connected.set(me.id, n);
    });
  });

  return {
    presenceList,
    onlineCount: () => connected.size,
    takeStrokeCount: () => { const n = strokesSinceReport; strokesSinceReport = 0; return n; },
  };
}

module.exports = { setupRooms, publicUser, cleanStroke, publicState, REACTIONS };
