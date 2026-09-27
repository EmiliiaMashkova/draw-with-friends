// Активность: кто заходил сегодня и за неделю (по времени Черногории) и короткие строки в лог.
const TZ = 'Europe/Podgorica';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

function dayString(date = new Date()) {
  return fmt.format(date); // YYYY-MM-DD
}

// Последние n дней, начиная с сегодняшнего.
function lastDays(n, now = new Date()) {
  return Array.from({ length: n }, (_, i) => dayString(new Date(now.getTime() - i * 86_400_000)));
}

function log(event, fields = {}) {
  const parts = Object.entries(fields).map(([k, v]) => `${k}=${String(v).replace(/\s+/g, '_')}`);
  console.log(`[${event}] ${parts.join(' ')}`.trim());
}

function createActivity(store) {
  const touched = new Map(); // userId -> day, чтобы не писать в базу на каждый запрос
  return {
    async touch(userId) {
      const day = dayString();
      if (touched.get(userId) === day) return;
      touched.set(userId, day);
      try { await store.touchActivity(userId, day); } catch (err) { console.error('activity error', err.message); }
    },
    async stats(onlineCount) {
      const s = await store.activityStats(lastDays(7));
      return { online: onlineCount, today: s.today, week: s.week, users: s.users };
    },
  };
}

module.exports = { createActivity, dayString, lastDays, log };
