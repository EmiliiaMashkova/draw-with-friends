import { Board } from './board.js';

const app = document.getElementById('app');
const meBox = document.getElementById('me');
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const TYPE_INFO = {
  free: { label: 'Свободное', text: 'Рисуйте все вместе в любой момент.' },
  rounds: { label: 'По раундам', text: 'Игроки рисуют по очереди на общую тему, у каждого свой ход.' },
  assisted: { label: 'С помощником', text: 'Пошаговые уроки: обводите подсказки вместе, как в ArtLoop.' },
};
const EMOJIS = ['🐱', '🐶', '🦊', '🐼', '🐸', '🦄', '🐙', '🐝', '🌸', '🌈', '⭐', '🍓', '🎨', '🚀', '👾', '🍩'];
const COLORS = ['#ff6b5b', '#f2a93b', '#ffd23f', '#3fb68b', '#3aa6d8', '#6c7cff', '#b26cff', '#ff7eb6', '#2b2530', '#8d6e63'];

let me = null;
let socket = null;
let leaveRoom = null;

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};

export function avatarEl(user, size = 32) {
  const el = h('span', { class: 'avatar', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px`, title: user?.nickname || '' });
  const a = user?.avatar;
  if (a && a.startsWith('emoji:')) {
    const [, emoji, color] = a.split(':');
    el.style.background = color;
    el.textContent = emoji;
  } else if (a) {
    el.append(h('img', { src: a, alt: '', referrerpolicy: 'no-referrer' }));
  } else {
    el.style.background = '#b9aec4';
    el.textContent = (user?.nickname || '?').slice(0, 1).toUpperCase();
  }
  return el;
}

function toast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (res.status === 401) { me = null; renderLogin(); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

function renderMe() {
  meBox.replaceChildren();
  if (!me) return;
  meBox.append(
    h('a', { href: '#/profile', title: 'Профиль' }, avatarEl(me, 32), h('span', {}, me.nickname)),
    h('button', { onclick: async () => { await fetch('/auth/logout', { method: 'POST' }); location.href = '/'; } }, 'Выйти'),
  );
}

async function renderLogin() {
  if (leaveRoom) leaveRoom();
  renderMe();
  const cfg = await fetch('/auth/config').then((r) => r.json());
  const err = new URLSearchParams(location.search).get('error');
  const box = h('div', { class: 'login' },
    h('h1', {}, '🎨 Рисуем вместе'),
    h('p', {}, 'Общие полотна, на которых можно рисовать с друзьями в реальном времени.'),
    err ? h('p', { class: 'error' }, 'Не получилось войти, попробуйте ещё раз.') : null,
    cfg.google
      ? h('a', { href: '/auth/google' }, h('button', { class: 'google-btn primary' }, 'Войти через Google'))
      : null,
  );
  if (cfg.invite) {
    const code = h('input', { type: 'text', placeholder: 'Код приглашения', autocomplete: 'off' });
    const msg = h('p', { class: 'error' });
    const enter = async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const r = await fetch('/auth/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: code.value }) });
      if (r.ok) { location.href = '/'; return; }
      msg.textContent = (await r.json().catch(() => ({}))).error || 'Не получилось войти.';
    };
    box.append(h('form', { onsubmit: enter, style: 'margin-top:16px' },
      h('p', {}, cfg.google ? 'Или войдите по коду приглашения:' : 'Введите код приглашения от друзей:'),
      h('div', { class: 'row', style: 'justify-content:center' }, code, h('button', { class: cfg.google ? '' : 'primary', type: 'submit' }, 'Войти')),
      msg));
  }
  if (cfg.dev) {
    const input = h('input', { type: 'text', placeholder: 'Имя для теста', value: 'Тест' });
    box.append(h('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, input,
      h('button', { onclick: () => { location.href = `/auth/dev?name=${encodeURIComponent(input.value)}`; } }, 'Тестовый вход')));
  }
  app.replaceChildren(box);
}

async function renderLobby() {
  const list = await api('/api/canvases');
  const cards = list.map((c) => {
    const faces = h('div', { class: 'faces', 'data-canvas': c.id });
    fillFaces(faces, c.online);
    return h('a', { class: 'card', href: `#/c/${c.id}` },
      h('span', { class: `badge ${c.type}` }, TYPE_INFO[c.type].label),
      h('h3', {}, c.name),
      h('p', {}, TYPE_INFO[c.type].text),
      faces);
  });
  app.replaceChildren(h('h2', {}, 'Полотна'), h('div', { class: 'grid' }, cards));
}

function fillFaces(el, users) {
  el.replaceChildren(...(users.length ? users.slice(0, 6).map((u) => avatarEl(u, 26)) : [h('span', {}, 'Пока никого')]));
  if (users.length > 6) el.append(h('span', {}, `+${users.length - 6}`));
}

function renderProfile() {
  let avatar = me.rawAvatar || 'google';
  let emoji = '🐱';
  let color = COLORS[0];
  if (avatar.startsWith('emoji:')) [, emoji, color] = avatar.split(':');
  const nick = h('input', { type: 'text', maxlength: 24, value: me.needsProfile ? '' : me.nickname, placeholder: me.nickname });
  const preview = h('div', { class: 'preview' });
  const err = h('p', { class: 'error' });

  const resolved = () => (avatar === 'google' ? me.googlePicture : avatar);
  const updatePreview = () => preview.replaceChildren(avatarEl({ avatar: resolved(), nickname: nick.value || me.nickname }, 72), h('b', {}, nick.value || me.nickname));
  nick.addEventListener('input', updatePreview);

  const emojiGrid = h('div', { class: 'emoji-grid' }, EMOJIS.map((e) => h('button', { type: 'button', onclick: () => { emoji = e; avatar = `emoji:${emoji}:${color}`; updatePreview(); } }, e)));
  const swatches = h('div', { class: 'swatches' }, COLORS.map((c) => h('button', { type: 'button', class: 'swatch', style: `background:${c}`, title: c, onclick: () => { color = c; avatar = `emoji:${emoji}:${color}`; updatePreview(); } })));
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
    if (!file.files[0]) return;
    avatar = await resizeImage(file.files[0], 160);
    updatePreview();
  } });

  const save = async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await api('/api/me', { method: 'PUT', body: JSON.stringify({ nickname: nick.value.trim() || me.nickname, avatar }) });
      me = await api('/api/me');
      if (socket) { socket.disconnect(); socket = null; } // новое соединение подхватит обновлённый профиль
      renderMe();
      toast('Профиль сохранён');
      location.hash = '#/';
    } catch (ex) { err.textContent = ex.message; }
  };

  app.replaceChildren(h('form', { class: 'profile', onsubmit: save },
    h('h2', { style: 'margin-top:0' }, me.needsProfile ? 'Привет! Как вас называть?' : 'Профиль'),
    preview,
    h('label', {}, 'Никнейм'), nick,
    h('label', {}, 'Аватар'),
    h('div', { class: 'row' },
      me.googlePicture ? h('button', { type: 'button', onclick: () => { avatar = 'google'; updatePreview(); } }, 'Фото из Google') : null,
      h('button', { type: 'button', onclick: () => file.click() }, 'Загрузить картинку'), file),
    h('p', { class: 'muted' }, 'Или соберите свой: выберите значок и цвет фона.'),
    emojiGrid, h('div', { style: 'height:10px' }), swatches,
    err,
    h('div', { class: 'row', style: 'margin-top:20px' }, h('button', { class: 'primary', type: 'submit' }, 'Сохранить'),
      me.needsProfile ? null : h('a', { href: '#/' }, h('button', { type: 'button' }, 'Отмена')))));
  updatePreview();
}

function resizeImage(fileObj, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(fileObj);
  });
}

function ensureSocket() {
  if (socket) return socket;
  socket = io();
  socket.on('auth:required', () => { socket = null; renderLogin(); });
  socket.on('lobby:presence', ({ canvasId, users }) => {
    const el = document.querySelector(`.faces[data-canvas="${canvasId}"]`);
    if (el) fillFaces(el, users);
  });
  return socket;
}

async function renderRoom(canvasId) {
  const s = ensureSocket();
  const lessons = await api('/api/lessons');
  const res = await new Promise((resolve) => s.emit('join', { canvasId }, resolve));
  if (res.error) { app.replaceChildren(h('p', {}, 'Полотно не найдено. '), h('a', { href: '#/' }, 'К списку')); return; }
  const { canvas } = res;
  let state = res.state;
  let people = res.presence;
  const nameOf = (id) => people.find((p) => p.id === id)?.nickname || 'игрок';

  const stage = h('div', { class: 'stage' });
  const board = new Board(stage, {
    onLive: (msg) => s.emit('stroke:live', msg),
    onEnd: (stroke, done) => s.emit('stroke:end', stroke, (r) => done(r?.id)),
  });
  board.setStrokes(res.strokes);

  const sizeInput = h('input', { type: 'range', min: 2, max: 60, value: 6, oninput: () => { board.size = Number(sizeInput.value); } });
  const penBtn = h('button', { class: 'active', onclick: () => pickTool('pen') }, '✏️ Кисть');
  const eraserBtn = h('button', { onclick: () => pickTool('eraser') }, '🧽 Ластик');
  const pickTool = (t) => { board.tool = t; penBtn.classList.toggle('active', t === 'pen'); eraserBtn.classList.toggle('active', t === 'eraser'); };
  const swatchBtns = COLORS.map((c) => h('button', { class: 'swatch', style: `background:${c}`, title: c, onclick: () => pickColor(c) }));
  const custom = h('input', { type: 'color', value: '#2b2530', oninput: () => pickColor(custom.value) });
  const pickColor = (c) => { board.color = c; pickTool('pen'); swatchBtns.forEach((b) => b.classList.toggle('active', b.title === c)); };
  pickColor('#2b2530');

  const toolbar = h('div', { class: 'toolbar' },
    penBtn, eraserBtn, ...swatchBtns, custom, h('span', { class: 'muted' }, 'Толщина'), sizeInput,
    h('button', { onclick: () => { const id = board.lastOwnStrokeId(); if (id) s.emit('stroke:undo', { id }); } }, '↩️ Отменить'),
    canvas.type !== 'rounds' ? h('button', { onclick: () => { if (confirm('Очистить полотно для всех?')) s.emit('canvas:clear'); } }, '🗑️ Очистить') : null,
    h('button', { onclick: () => board.download(`${canvas.name}.png`) }, '💾 Сохранить PNG'));

  const peoplePanel = h('div', { class: 'panel' });
  const modePanel = h('div', { class: 'panel' });
  const side = h('div', { class: 'side' }, canvas.type === 'free' ? null : modePanel, peoplePanel);

  app.replaceChildren(
    h('div', { class: 'room-head' }, h('a', { href: '#/' }, '← Полотна'), h('h2', {}, canvas.name), h('span', { class: `badge ${canvas.type}` }, TYPE_INFO[canvas.type].label)),
    h('div', { class: 'room' }, h('div', {}, stage, toolbar), side),
  );
  board.resize();

  function renderPeople() {
    peoplePanel.replaceChildren(h('h4', {}, `Сейчас здесь: ${people.length}`), h('div', { class: 'people' },
      people.map((p) => h('div', { class: `person ${state.drawer === p.id ? 'drawing' : ''}` }, avatarEl(p, 28), p.nickname, state.drawer === p.id ? ' ✏️' : ''))));
  }

  let tick = null;
  function renderMode() {
    clearInterval(tick);
    if (canvas.type === 'rounds') renderRounds();
    if (canvas.type === 'assisted') renderLesson();
    renderPeople();
  }

  function renderRounds() {
    const joined = state.players.includes(me.id);
    const myTurn = state.status === 'playing' && state.drawer === me.id;
    board.locked = !myTurn;
    stage.classList.toggle('locked', !myTurn);
    const timer = h('div', { class: 'timer' });
    const upd = () => { timer.textContent = state.turnEndsAt ? `${Math.max(0, Math.ceil((state.turnEndsAt - Date.now()) / 1000))} с` : ''; };
    upd();
    if (state.status === 'playing') tick = setInterval(upd, 250);
    const players = h('div', { class: 'people' }, state.players.map((id) => {
      const p = people.find((x) => x.id === id) || { id, nickname: nameOf(id) };
      return h('div', { class: 'person' }, avatarEl(p, 24), p.nickname);
    }));
    fill(modePanel, 
      h('h4', {}, 'Раунды'),
      state.status === 'lobby' ? h('p', { class: 'muted' }, 'Присоединяйтесь и начните игру. Каждый по очереди рисует на общую тему; ход длится ограниченное время.') : null,
      state.status === 'finished' ? h('p', { class: 'hint' }, `Игра окончена! Тема была: «${state.prompt}»`) : null,
      state.status === 'playing' ? h('div', {},
        h('p', { class: 'muted' }, 'Тема'), h('p', { class: 'hint' }, state.prompt),
        myTurn ? h('div', { class: 'banner' }, 'Ваш ход! Рисуйте') : h('p', {}, `Рисует: `, h('b', {}, nameOf(state.drawer))),
        timer,
        h('p', { class: 'muted' }, `Ход ${state.turn} из ${state.order.length}`)) : null,
      h('p', { class: 'muted' }, `Игроки (${state.players.length}):`), players,
      h('div', { class: 'row', style: 'margin-top:12px' },
        state.status !== 'playing' && !joined ? h('button', { class: 'primary', onclick: () => s.emit('rounds:join') }, 'Участвовать') : null,
        joined && state.status !== 'playing' ? h('button', { class: 'primary', onclick: () => s.emit('rounds:start') }, state.status === 'finished' ? 'Новая игра' : 'Начать') : null,
        myTurn ? h('button', { onclick: () => s.emit('rounds:pass') }, 'Готово, передать ход') : null,
        joined ? h('button', { onclick: () => s.emit('rounds:leave') }, 'Выйти из игры') : null));
  }

  function renderLesson() {
    const lesson = lessons.find((l) => l.id === state.lessonId) || lessons[0];
    board.setGuide(lesson.steps.map((st) => st.path), state.step);
    const select = h('select', { onchange: () => s.emit('lesson:set', { lessonId: select.value }) },
      lessons.map((l) => h('option', { value: l.id, selected: l.id === lesson.id }, l.title)));
    const showGuide = h('input', { type: 'checkbox', checked: board.showGuide, onchange: () => { board.showGuide = showGuide.checked; board.drawGuide(); } });
    fill(modePanel, 
      h('h4', {}, 'Помощник'),
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Урок:'), select),
      h('div', { class: 'steps' }, lesson.steps.map((_, i) => h('span', { class: i <= state.step ? 'done' : '' }))),
      h('p', { class: 'muted' }, `Шаг ${state.step + 1} из ${lesson.steps.length}`),
      h('p', { class: 'hint' }, lesson.steps[state.step].hint),
      h('div', { class: 'row' },
        h('button', { disabled: state.step === 0, onclick: () => s.emit('lesson:step', { delta: -1 }) }, '← Назад'),
        h('button', { class: 'primary', disabled: state.step === lesson.steps.length - 1, onclick: () => s.emit('lesson:step', { delta: 1 }) }, 'Дальше →')),
      h('label', { class: 'row muted', style: 'margin-top:12px' }, showGuide, 'Показывать подсказку'),
      h('p', { class: 'muted' }, 'Обведите пунктир. Шаги общие для всех, кто на полотне.'));
  }

  renderMode();

  const handlers = {
    'stroke:live': (m) => board.remoteLive(m),
    'stroke:add': (m) => board.remoteAdd(m),
    'stroke:remove': ({ id }) => board.remove(id),
    'canvas:cleared': (m) => { board.clear(); if (m?.by) toast(`${m.by} очистил(а) полотно`); },
    state: (st) => {
      const prevDrawer = state.drawer;
      state = st;
      renderMode();
      if (canvas.type === 'rounds' && st.drawer === me.id && prevDrawer !== me.id) toast('Ваш ход!');
    },
    presence: (p) => { people = p; renderPeople(); if (canvas.type === 'rounds') renderRounds(); },
  };
  for (const [ev, fn] of Object.entries(handlers)) s.on(ev, fn);
  const onResize = () => board.resize();
  window.addEventListener('resize', onResize);
  const onReconnect = () => s.emit('join', { canvasId }, (r) => { if (!r.error) { board.setStrokes(r.strokes); state = r.state; people = r.presence; renderMode(); } });
  s.io.on('reconnect', onReconnect);

  leaveRoom = () => {
    for (const [ev, fn] of Object.entries(handlers)) s.off(ev, fn);
    s.io.off('reconnect', onReconnect);
    window.removeEventListener('resize', onResize);
    clearInterval(tick);
    s.emit('leave');
    leaveRoom = null;
  };
}

async function route() {
  if (leaveRoom) leaveRoom();
  if (!me) {
    try { me = await api('/api/me'); } catch { return; }
    renderMe();
  }
  const hash = location.hash || '#/';
  if (me.needsProfile && hash !== '#/profile') { location.hash = '#/profile'; return; }
  const m = hash.match(/^#\/c\/(\d+)/);
  if (hash === '#/profile') renderProfile();
  else if (m) await renderRoom(Number(m[1]));
  else { ensureSocket(); await renderLobby(); }
}

window.addEventListener('hashchange', route);
route();
