const test = require('node:test');
const assert = require('node:assert');
const { cleanStroke, publicUser } = require('../server/rooms');
const { LESSONS } = require('../server/lessons');

test('cleanStroke нормализует и отбрасывает мусор', () => {
  assert.deepStrictEqual(cleanStroke({ tool: 'pen', color: '#ff0000', size: 500, points: [[1.234, 2]] }), {
    tool: 'pen', color: '#ff0000', size: 80, points: [[1.2, 2]],
  });
  assert.strictEqual(cleanStroke({ points: [] }), null);
  assert.strictEqual(cleanStroke({ points: [['a', 1]] }), null);
  assert.strictEqual(cleanStroke({ color: 'red', points: [[0, 0]] }).color, '#000000');
});

test('publicUser подставляет фото Google и имя по умолчанию', () => {
  const u = publicUser({ id: 'x', nickname: null, googleName: 'Аня', avatar: null, googlePicture: 'https://p' });
  assert.deepStrictEqual(u, { id: 'x', nickname: 'Аня', avatar: 'https://p' });
});

test('у каждого урока есть шаги с подсказкой и контуром', () => {
  for (const l of LESSONS) {
    assert.ok(l.steps.length > 0);
    for (const s of l.steps) assert.ok(s.hint.me && s.hint.en && s.hint.ru && s.path.startsWith('M'));
  }
});

test('картиночный пароль: проверка и хеш с солью по пользователю', () => {
  const { cleanPics, hashPics, PICTURES } = require('../server/auth');
  assert.strictEqual(PICTURES.length, 12);
  assert.deepStrictEqual(cleanPics([0, 5, 11]), [0, 5, 11]);
  assert.strictEqual(cleanPics([0, 5]), null);
  assert.strictEqual(cleanPics([0, 5, 12]), null);
  assert.notStrictEqual(hashPics('a', [1, 2, 3]), hashPics('b', [1, 2, 3]));
  assert.notStrictEqual(hashPics('a', [1, 2, 3]), hashPics('a', [3, 2, 1]));
});

test('активность: дни по времени Черногории, 7 последних дней', () => {
  const { dayString, lastDays } = require('../server/activity');
  // 23:30 UTC 27 сентября: в Подгорице (UTC+2 летом) уже 28-е.
  assert.strictEqual(dayString(new Date('2026-09-27T23:30:00Z')), '2026-09-28');
  const days = lastDays(7, new Date('2026-09-27T12:00:00Z'));
  assert.strictEqual(days.length, 7);
  assert.strictEqual(days[0], '2026-09-27');
  assert.strictEqual(days[6], '2026-09-21');
});
