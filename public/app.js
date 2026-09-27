import { Board } from './board.js';
import { LANGS, lang, setLang, applyDocumentLang, t, tErr, tCanvas, tPrompt, tText } from './i18n.js';

const app = document.getElementById('app');
const meBox = document.getElementById('me');
const fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
const typeLabel = (type) => t(`type.${type}.label`);
const typeText = (type) => t(`type.${type}.text`);
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
  if (!res.ok) throw new Error(tErr(data.error));
  return data;
}

function renderMe() {
  const langSelect = h('select', { class: 'lang', 'aria-label': 'Language', onchange: () => { setLang(langSelect.value); rerender(); } },
    LANGS.map((l) => h('option', { value: l.code, selected: l.code === lang }, l.label)));
  document.getElementById('brand').textContent = t('app.title');
  meBox.replaceChildren(langSelect);
  if (!me) return;
  meBox.append(
    h('a', { href: '#/profile', title: t('me.profile') }, avatarEl(me, 32), h('span', { class: 'nick' }, me.nickname)),
    h('button', { onclick: async () => { await fetch('/auth/logout', { method: 'POST' }); location.href = '/'; } }, t('me.logout')),
  );
}

async function postJson(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  if (r.ok) return null;
  return tErr((await r.json().catch(() => ({}))).error || 'generic');
}

// Панель из 12 картинок: нажимаешь 3 по порядку, onDone получает индексы.
function picturePad(pictures, onDone, onClear) {
  let picked = [];
  const slots = h('div', { class: 'pic-slots' });
  const drawSlots = () => slots.replaceChildren(...[0, 1, 2].map((i) => h('span', { class: 'pic-slot' }, picked[i] != null ? pictures[picked[i]] : '')));
  const pad = h('div', { class: 'pic-pad' }, pictures.map((p, i) => h('button', { type: 'button', onclick: () => {
    if (picked.length >= 3) return;
    picked.push(i);
    drawSlots();
    if (picked.length === 3) onDone([...picked]);
  } }, p)));
  const reset = () => { picked = []; drawSlots(); };
  const back = h('button', { type: 'button', class: 'pic-back', onclick: () => { const wasFull = picked.length === 3; picked.pop(); drawSlots(); if (wasFull) onClear?.(); } }, t('pics.erase'));
  drawSlots();
  return { el: h('div', { class: 'pic-box' }, slots, pad, back), reset };
}

async function renderLogin() {
  if (leaveRoom) leaveRoom();
  renderMe();
  const cfg = await fetch('/auth/config').then((r) => r.json());
  const err = new URLSearchParams(location.search).get('error');
  const box = h('div', { class: 'login' }, h('h1', {}, `🎨 ${t('app.title')}`));
  app.replaceChildren(box);
  if (err) box.append(h('p', { class: 'error' }, t('login.failed')));

  if (!cfg.invited) {
    box.append(h('p', {}, t('app.tagline')));
    if (cfg.invite) {
      const code = h('input', { type: 'text', placeholder: t('login.invitePlaceholder'), autocomplete: 'off', value: cfg.inviteHint || '' });
      if (cfg.inviteHint) box.append(h('div', { class: 'invite-hint' }, h('span', {}, t('login.hint')), h('b', {}, cfg.inviteHint)));
      const msg = h('p', { class: 'error' });
      box.append(h('form', { onsubmit: async (e) => {
        e.preventDefault();
        msg.textContent = (await postJson('/auth/invite', { code: code.value })) || '';
        if (!msg.textContent) renderLogin();
      } },
      h('p', {}, t('login.inviteAsk')),
      h('div', { class: 'row', style: 'justify-content:center' }, code, h('button', { class: 'primary', type: 'submit' }, t('login.next'))),
      msg));
    }
    if (cfg.google) box.append(h('p', {}, h('a', { href: '/auth/google' }, h('button', { class: 'google-btn' }, t('login.google')))));
  } else {
    const { pictures, people } = await fetch('/auth/people').then((r) => r.json());
    const msg = h('p', { class: 'error' });
    const pickPerson = (person) => {
      const pad = picturePad(pictures, async (pics) => {
        const e = await postJson('/auth/pic', { userId: person.id, pics });
        if (!e) { location.href = '/'; return; }
        msg.textContent = e;
        box.classList.add('shake');
        setTimeout(() => { box.classList.remove('shake'); pad.reset(); }, 500);
      });
      box.replaceChildren(
        h('h1', {}, `🎨 ${t('app.title')}`),
        h('div', { class: 'preview', style: 'justify-content:center' }, avatarEl(person, 64), h('b', { style: 'font-size:22px' }, person.nickname)),
        h('p', {}, t('login.tapPics')),
        pad.el, msg,
        h('button', { type: 'button', onclick: renderLogin }, t('login.notMe')));
    };
    box.append(
      h('h2', {}, t('login.who')),
      people.length ? h('div', { class: 'people-grid' }, people.map((p) => h('button', { type: 'button', class: 'person-btn', onclick: () => pickPerson(p) }, avatarEl(p, 56), h('span', {}, p.nickname))))
        : h('p', { class: 'muted' }, t('login.empty')),
      h('p', { style: 'margin-top:20px' }, h('button', { class: 'primary', type: 'button', onclick: async () => {
        const e = await postJson('/auth/new');
        if (!e) location.href = '/#/profile';
      } }, t('login.new'))),
      cfg.google ? h('p', {}, h('a', { href: '/auth/google' }, t('login.google'))) : null,
    );
  }

  if (cfg.dev) {
    const input = h('input', { type: 'text', placeholder: 'Имя для теста', value: 'Тест' });
    box.append(h('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, input,
      h('button', { onclick: () => { location.href = `/auth/dev?name=${encodeURIComponent(input.value)}`; } }, 'Тестовый вход')));
  }
}

let statsTimer = null;
async function renderStats() {
  const box = h('div', { class: 'stats' });
  app.replaceChildren(h('div', { class: 'room-head' }, h('a', { href: '#/' }, t('room.back')), h('h2', {}, t('stats.title'))), box);
  const load = async () => {
    if (location.hash !== '#/stats') { clearInterval(statsTimer); return; }
    const st = await api('/api/stats');
    const tile = (n, label, cls) => h('div', { class: `stat ${cls}` }, h('b', {}, String(n)), h('span', {}, label));
    box.replaceChildren(
      tile(st.online, t('stats.online'), 'online'),
      tile(st.today, t('stats.today'), ''),
      tile(st.week, t('stats.week'), ''),
      tile(st.users, t('stats.users'), ''));
  };
  clearInterval(statsTimer);
  statsTimer = setInterval(load, 15000);
  await load();
}

async function renderLobby() {
  const list = await api('/api/canvases');
  const cards = list.map((c) => {
    const faces = h('div', { class: 'faces', 'data-canvas': c.id });
    fillFaces(faces, c.online);
    return h('a', { class: 'card', href: `#/c/${c.id}` },
      h('span', { class: `badge ${c.type}` }, typeLabel(c.type)),
      h('h3', {}, tCanvas(c.name)),
      h('p', {}, typeText(c.type)),
      faces);
  });
  app.replaceChildren(
    h('div', { class: 'room-head' }, h('h2', {}, t('lobby.title')), h('a', { href: '#/stats', class: 'stats-link' }, t('stats.link'))),
    h('div', { class: 'grid' }, cards));
}

function fillFaces(el, users) {
  el.replaceChildren(...(users.length ? users.slice(0, 6).map((u) => avatarEl(u, 26)) : [h('span', {}, t('lobby.nobody'))]));
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

  // Картиночный пароль нужен тем, кто вошёл по коду приглашения: им они возвращаются в свой профиль.
  const needsPics = me.id.startsWith('invite:');
  let newPics = null;
  const picMsg = h('p', { class: 'muted' });
  const picPad = picturePad(me.pictures, (pics) => { newPics = pics; picMsg.textContent = t('profile.picRemember'); },
    () => { newPics = null; picMsg.textContent = ''; });
  const picBox = h('div', { class: 'keybox' },
    h('label', {}, t('profile.picTitle')),
    h('p', { class: 'muted' }, me.hasPicPassword
      ? t('profile.picHas')
      : t('profile.picNew')),
    picPad.el, picMsg);

  const save = async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      if (needsPics && !me.hasPicPassword && !newPics) throw new Error(tErr('need_pics'));
      await api('/api/me', { method: 'PUT', body: JSON.stringify({ nickname: nick.value.trim() || me.nickname, avatar }) });
      if (newPics) await api('/api/me/pic-password', { method: 'PUT', body: JSON.stringify({ pics: newPics }) });
      me = await api('/api/me');
      if (socket) { socket.disconnect(); socket = null; } // новое соединение подхватит обновлённый профиль
      renderMe();
      toast(t('profile.saved'));
      location.hash = '#/';
    } catch (ex) { err.textContent = ex.message; }
  };

  app.replaceChildren(h('form', { class: 'profile', onsubmit: save },
    h('h2', { style: 'margin-top:0' }, me.needsProfile ? t('profile.hello') : t('me.profile')),
    preview,
    h('label', {}, t('profile.nick')), nick,
    h('label', {}, t('profile.avatar')),
    h('div', { class: 'row' },
      me.googlePicture ? h('button', { type: 'button', onclick: () => { avatar = 'google'; updatePreview(); } }, t('profile.googlePhoto')) : null,
      h('button', { type: 'button', onclick: () => file.click() }, t('profile.upload')), file),
    h('p', { class: 'muted' }, t('profile.build')),
    emojiGrid, h('div', { style: 'height:10px' }), swatches,
    needsPics ? picBox : null,
    err,
    h('div', { class: 'row', style: 'margin-top:20px' }, h('button', { class: 'primary', type: 'submit' }, t('profile.save')),
      me.needsProfile ? null : h('a', { href: '#/' }, h('button', { type: 'button' }, t('profile.cancel'))))));
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
  if (res.error) { app.replaceChildren(h('p', {}, t('room.notFound'), ' '), h('a', { href: '#/' }, t('room.toList'))); return; }
  const { canvas } = res;
  let state = res.state;
  let people = res.presence;
  const nameOf = (id) => people.find((p) => p.id === id)?.nickname || t('room.player');

  const stage = h('div', { class: 'stage' });
  const board = new Board(stage, {
    onLive: (msg) => s.emit('stroke:live', msg),
    onEnd: (stroke, done) => s.emit('stroke:end', stroke, (r) => done(r?.id)),
  });
  board.setStrokes(res.strokes);

  const sizeInput = h('input', { type: 'range', min: 2, max: 60, value: 6, oninput: () => { board.size = Number(sizeInput.value); } });
  const penBtn = h('button', { class: 'active', onclick: () => pickTool('pen') }, t('tool.pen'));
  const eraserBtn = h('button', { onclick: () => pickTool('eraser') }, t('tool.eraser'));
  const pickTool = (t) => { board.tool = t; penBtn.classList.toggle('active', t === 'pen'); eraserBtn.classList.toggle('active', t === 'eraser'); };
  const swatchBtns = COLORS.map((c) => h('button', { class: 'swatch', style: `background:${c}`, title: c, onclick: () => pickColor(c) }));
  const custom = h('input', { type: 'color', value: '#2b2530', oninput: () => pickColor(custom.value) });
  const pickColor = (c) => { board.color = c; pickTool('pen'); swatchBtns.forEach((b) => b.classList.toggle('active', b.title === c)); };
  pickColor('#2b2530');

  const toolbar = h('div', { class: 'toolbar' },
    penBtn, eraserBtn, ...swatchBtns, custom, h('span', { class: 'muted' }, t('tool.size')), sizeInput,
    h('button', { onclick: () => { const id = board.lastOwnStrokeId(); if (id) s.emit('stroke:undo', { id }); } }, t('tool.undo')),
    canvas.type !== 'rounds' ? h('button', { onclick: () => { if (confirm(t('tool.clearConfirm'))) s.emit('canvas:clear'); } }, t('tool.clear')) : null,
    h('button', { onclick: () => board.download(`${canvas.name}.png`) }, t('tool.png')));

  const peoplePanel = h('div', { class: 'panel' });
  const modePanel = h('div', { class: 'panel' });
  const side = h('div', { class: 'side' }, canvas.type === 'free' ? null : modePanel, peoplePanel);

  app.replaceChildren(
    h('div', { class: 'room-head' }, h('a', { href: '#/' }, t('room.back')), h('h2', {}, tCanvas(canvas.name)), h('span', { class: `badge ${canvas.type}` }, typeLabel(canvas.type))),
    h('div', { class: 'room' }, h('div', {}, stage, toolbar), side),
  );
  board.resize();

  function renderPeople() {
    peoplePanel.replaceChildren(h('h4', {}, t('room.here', { n: people.length })), h('div', { class: 'people' },
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
    const upd = () => { timer.textContent = state.turnEndsAt ? t('rounds.sec', { n: Math.max(0, Math.ceil((state.turnEndsAt - Date.now()) / 1000)) }) : ''; };
    upd();
    if (state.status === 'playing') tick = setInterval(upd, 250);
    const players = h('div', { class: 'people' }, state.players.map((id) => {
      const p = people.find((x) => x.id === id) || { id, nickname: nameOf(id) };
      return h('div', { class: 'person' }, avatarEl(p, 24), p.nickname);
    }));
    fill(modePanel, 
      h('h4', {}, t('rounds.title')),
      state.status === 'lobby' ? h('p', { class: 'muted' }, t('rounds.lobby')) : null,
      state.status === 'finished' ? h('p', { class: 'hint' }, t('rounds.finished', { p: tPrompt(state) })) : null,
      state.status === 'playing' ? h('div', {},
        h('p', { class: 'muted' }, t('rounds.theme')), h('p', { class: 'hint' }, tPrompt(state)),
        myTurn ? h('div', { class: 'banner' }, t('rounds.yourTurn')) : h('p', {}, t('rounds.drawing'), h('b', {}, nameOf(state.drawer))),
        timer,
        h('p', { class: 'muted' }, t('rounds.turnOf', { a: state.turn, b: state.order.length }))) : null,
      h('p', { class: 'muted' }, t('rounds.players', { n: state.players.length })), players,
      h('div', { class: 'row', style: 'margin-top:12px' },
        state.status !== 'playing' && !joined ? h('button', { class: 'primary', onclick: () => s.emit('rounds:join') }, t('rounds.join')) : null,
        joined && state.status !== 'playing' ? h('button', { class: 'primary', onclick: () => s.emit('rounds:start') }, state.status === 'finished' ? t('rounds.newGame') : t('rounds.start')) : null,
        myTurn ? h('button', { onclick: () => s.emit('rounds:pass') }, t('rounds.pass')) : null,
        joined ? h('button', { onclick: () => s.emit('rounds:leave') }, t('rounds.leave')) : null));
  }

  function renderLesson() {
    const lesson = lessons.find((l) => l.id === state.lessonId) || lessons[0];
    board.setGuide(lesson.steps.map((st) => st.path), state.step);
    const select = h('select', { onchange: () => s.emit('lesson:set', { lessonId: select.value }) },
      lessons.map((l) => h('option', { value: l.id, selected: l.id === lesson.id }, tText(l.title))));
    const showGuide = h('input', { type: 'checkbox', checked: board.showGuide, onchange: () => { board.showGuide = showGuide.checked; board.drawGuide(); } });
    fill(modePanel, 
      h('h4', {}, t('lesson.title')),
      h('div', { class: 'row' }, h('span', { class: 'muted' }, t('lesson.lesson')), select),
      h('div', { class: 'steps' }, lesson.steps.map((_, i) => h('span', { class: i <= state.step ? 'done' : '' }))),
      h('p', { class: 'muted' }, t('lesson.step', { a: state.step + 1, b: lesson.steps.length })),
      h('p', { class: 'hint' }, tText(lesson.steps[state.step].hint)),
      h('div', { class: 'row' },
        h('button', { disabled: state.step === 0, onclick: () => s.emit('lesson:step', { delta: -1 }) }, t('lesson.back')),
        h('button', { class: 'primary', disabled: state.step === lesson.steps.length - 1, onclick: () => s.emit('lesson:step', { delta: 1 }) }, t('lesson.next'))),
      h('label', { class: 'row muted', style: 'margin-top:12px' }, showGuide, t('lesson.showGuide')),
      h('p', { class: 'muted' }, t('lesson.note')));
  }

  renderMode();

  const handlers = {
    'stroke:live': (m) => board.remoteLive(m),
    'stroke:add': (m) => board.remoteAdd(m),
    'stroke:remove': ({ id }) => board.remove(id),
    'canvas:cleared': (m) => { board.clear(); if (m?.by) toast(t('toast.cleared', { who: m.by })); },
    state: (st) => {
      const prevDrawer = state.drawer;
      state = st;
      renderMode();
      if (canvas.type === 'rounds' && st.drawer === me.id && prevDrawer !== me.id) toast(t('rounds.toastTurn'));
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
  const needsPics = me.id.startsWith('invite:') && !me.hasPicPassword;
  if ((me.needsProfile || needsPics) && hash !== '#/profile') { location.hash = '#/profile'; return; }
  const m = hash.match(/^#\/c\/(\d+)/);
  if (hash === '#/profile') renderProfile();
  else if (hash === '#/stats') await renderStats();
  else if (m) await renderRoom(Number(m[1]));
  else { ensureSocket(); await renderLobby(); }
}

// Смена языка: перерисовываем текущий экран.
function rerender() {
  renderMe();
  if (me) route(); else renderLogin();
}

applyDocumentLang();
renderMe();
window.addEventListener('hashchange', route);
route();
