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
    for (const s of l.steps) assert.ok(s.hint && s.path.startsWith('M'));
  }
});
