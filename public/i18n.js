// Переводы интерфейса: черногорский (латиница, по умолчанию), английский и русский.
export const LANGS = [
  { code: 'me', label: 'ME', html: 'cnr' },
  { code: 'en', label: 'EN', html: 'en' },
  { code: 'ru', label: 'RU', html: 'ru' },
];
const DEFAULT = 'me';

const D = {
  'app.title': ['Crtamo zajedno', 'Draw Together', 'Рисуем вместе'],
  'app.tagline': ['Zajednička platna za crtanje sa prijateljima.', 'Shared canvases to draw on with your friends.', 'Общие полотна, на которых можно рисовать с друзьями.'],
  'login.failed': ['Prijava nije uspjela, pokušaj ponovo.', "Couldn't sign in, please try again.", 'Не получилось войти, попробуй ещё раз.'],
  'login.inviteAsk': ['Unesi pozivni kod od prijatelja:', 'Enter the invite code from your friends:', 'Введи код приглашения от друзей:'],
  'login.invitePlaceholder': ['Pozivni kod', 'Invite code', 'Код приглашения'],
  'login.next': ['Dalje', 'Next', 'Дальше'],
  'login.google': ['Prijavi se preko Google-a', 'Sign in with Google', 'Войти через Google'],
  'login.who': ['Ko si ti?', 'Who are you?', 'Кто ты?'],
  'login.empty': ['Ovdje još nema nikoga. Budi prvi!', 'Nobody here yet. Be the first!', 'Пока здесь никого нет. Будь первым!'],
  'login.new': ['✨ Ovdje sam prvi put', "✨ I'm new here", '✨ Я здесь впервые'],
  'login.tapPics': ['Dodirni svoje 3 slike redom', 'Tap your 3 pictures in order', 'Нажми свои 3 картинки по порядку'],
  'login.notMe': ['← To nisam ja', "← That's not me", '← Это не я'],
  'pics.erase': ['⌫ Obriši', '⌫ Erase', '⌫ Стереть'],
  'me.profile': ['Profil', 'Profile', 'Профиль'],
  'me.logout': ['Odjavi se', 'Log out', 'Выйти'],
  'lobby.title': ['Platna', 'Canvases', 'Полотна'],
  'lobby.nobody': ['Još nikoga', 'Nobody yet', 'Пока никого'],
  'type.free.label': ['Slobodno', 'Free drawing', 'Свободное'],
  'type.free.text': ['Svi crtaju zajedno u bilo kom trenutku.', 'Everyone draws together at any time.', 'Рисуйте все вместе в любой момент.'],
  'type.rounds.label': ['Po rundama', 'Rounds', 'По раундам'],
  'type.rounds.text': ['Igrači crtaju redom na zajedničku temu, svako ima svoj potez.', 'Players take turns drawing on a shared theme.', 'Игроки рисуют по очереди на общую тему, у каждого свой ход.'],
  'type.assisted.label': ['Sa pomoćnikom', 'With a helper', 'С помощником'],
  'type.assisted.text': ['Lekcije korak po korak: zajedno precrtavajte vodiče, kao u ArtLoop-u.', 'Step-by-step lessons: trace the guides together, like in ArtLoop.', 'Пошаговые уроки: обводите подсказки вместе, как в ArtLoop.'],
  'profile.hello': ['Zdravo! Kako da te zovemo?', 'Hi! What should we call you?', 'Привет! Как тебя называть?'],
  'profile.nick': ['Nadimak', 'Nickname', 'Никнейм'],
  'profile.avatar': ['Avatar', 'Avatar', 'Аватар'],
  'profile.googlePhoto': ['Fotografija sa Google-a', 'Google photo', 'Фото из Google'],
  'profile.upload': ['Učitaj sliku', 'Upload a picture', 'Загрузить картинку'],
  'profile.build': ['Ili napravi svoj: izaberi ikonicu i boju pozadine.', 'Or make your own: pick an icon and a background color.', 'Или собери свой: выбери значок и цвет фона.'],
  'profile.picTitle': ['Lozinka od slika', 'Picture password', 'Картиночный пароль'],
  'profile.picHas': ['Lozinka već postoji. Da je promijeniš, dodirni 3 nove slike.', 'You already have one. To change it, tap 3 new pictures.', 'Пароль уже есть. Чтобы поменять, нажми 3 новые картинки.'],
  'profile.picNew': ['Izaberi 3 slike redom. Njih ćeš dodirnuti da se ponovo prijaviš.', "Pick 3 pictures in order. You'll tap them to sign in again.", 'Выбери 3 картинки по порядку. Их нужно будет нажать, чтобы войти снова.'],
  'profile.picRemember': ['Zapamti ove 3 slike! Pa dodirni „Sačuvaj“.', 'Remember these 3 pictures! Then tap "Save".', 'Запомни эти 3 картинки! Нажми «Сохранить».'],
  'profile.save': ['Sačuvaj', 'Save', 'Сохранить'],
  'profile.cancel': ['Otkaži', 'Cancel', 'Отмена'],
  'profile.saved': ['Profil je sačuvan', 'Profile saved', 'Профиль сохранён'],
  'room.notFound': ['Platno nije pronađeno.', 'Canvas not found.', 'Полотно не найдено.'],
  'room.back': ['← Platna', '← Canvases', '← Полотна'],
  'room.toList': ['Nazad na listu', 'Back to list', 'К списку'],
  'room.here': ['Sada ovdje: {n}', 'Here now: {n}', 'Сейчас здесь: {n}'],
  'room.player': ['igrač', 'player', 'игрок'],
  'tool.pen': ['✏️ Četkica', '✏️ Brush', '✏️ Кисть'],
  'tool.eraser': ['🧽 Gumica', '🧽 Eraser', '🧽 Ластик'],
  'tool.size': ['Debljina', 'Size', 'Толщина'],
  'tool.undo': ['↩️ Poništi', '↩️ Undo', '↩️ Отменить'],
  'tool.clear': ['🗑️ Očisti', '🗑️ Clear', '🗑️ Очистить'],
  'tool.clearConfirm': ['Očistiti platno za sve?', 'Clear the canvas for everyone?', 'Очистить полотно для всех?'],
  'tool.png': ['💾 Sačuvaj PNG', '💾 Save PNG', '💾 Сохранить PNG'],
  'rounds.title': ['Runde', 'Rounds', 'Раунды'],
  'rounds.lobby': ['Pridruži se i počni igru. Svako redom crta na zajedničku temu, a potez je vremenski ograničen.', 'Join and start the game. Everyone takes a timed turn drawing on a shared theme.', 'Присоединяйтесь и начните игру. Каждый по очереди рисует на общую тему; ход длится ограниченное время.'],
  'rounds.finished': ['Kraj igre! Tema je bila: „{p}“', 'Game over! The theme was: "{p}"', 'Игра окончена! Тема была: «{p}»'],
  'rounds.theme': ['Tema', 'Theme', 'Тема'],
  'rounds.yourTurn': ['Tvoj potez! Crtaj', 'Your turn! Draw', 'Твой ход! Рисуй'],
  'rounds.drawing': ['Crta: ', 'Drawing: ', 'Рисует: '],
  'rounds.turnOf': ['Potez {a} od {b}', 'Turn {a} of {b}', 'Ход {a} из {b}'],
  'rounds.players': ['Igrači ({n}):', 'Players ({n}):', 'Игроки ({n}):'],
  'rounds.join': ['Učestvuj', 'Join', 'Участвовать'],
  'rounds.start': ['Počni', 'Start', 'Начать'],
  'rounds.newGame': ['Nova igra', 'New game', 'Новая игра'],
  'rounds.pass': ['Gotovo, predaj potez', 'Done, pass the turn', 'Готово, передать ход'],
  'rounds.leave': ['Izađi iz igre', 'Leave the game', 'Выйти из игры'],
  'rounds.sec': ['{n} s', '{n} s', '{n} с'],
  'rounds.toastTurn': ['Tvoj potez!', 'Your turn!', 'Твой ход!'],
  'lesson.title': ['Pomoćnik', 'Helper', 'Помощник'],
  'lesson.lesson': ['Lekcija:', 'Lesson:', 'Урок:'],
  'lesson.step': ['Korak {a} od {b}', 'Step {a} of {b}', 'Шаг {a} из {b}'],
  'lesson.back': ['← Nazad', '← Back', '← Назад'],
  'lesson.next': ['Dalje →', 'Next →', 'Дальше →'],
  'lesson.showGuide': ['Prikaži vodič', 'Show the guide', 'Показывать подсказку'],
  'lesson.note': ['Precrtaj isprekidanu liniju. Koraci su zajednički za sve na platnu.', 'Trace the dashed line. Steps are shared by everyone on the canvas.', 'Обведите пунктир. Шаги общие для всех, кто на полотне.'],
  'toast.cleared': ['{who} je očistio/la platno', '{who} cleared the canvas', '{who} очистил(а) полотно'],
  'err.generic': ['Greška', 'Something went wrong', 'Ошибка'],
  'err.bad_code': ['Pogrešan kod.', 'Wrong code.', 'Неверный код.'],
  'err.too_many': ['Previše pokušaja, sačekaj minut.', 'Too many tries, wait a minute.', 'Слишком много попыток, подожди минуту.'],
  'err.need_invite': ['Potreban je pozivni kod.', 'An invite code is needed.', 'Нужен код приглашения.'],
  'err.wrong_pics': ['Pogrešne slike, pokušaj ponovo.', 'Wrong pictures, try again.', 'Не те картинки, попробуй ещё раз.'],
  'err.nick_len': ['Nadimak: od 2 do 24 znaka.', 'Nickname: 2 to 24 characters.', 'Никнейм: от 2 до 24 символов.'],
  'err.bad_avatar': ['Ovaj avatar se ne može koristiti.', "This avatar can't be used.", 'Неподходящий аватар.'],
  'err.need_pics': ['Izaberi 3 slike za lozinku.', 'Pick 3 pictures for your password.', 'Выбери 3 картинки для пароля.'],
  'err.invite_off': ['Prijava kodom je isključena.', 'Code sign-in is turned off.', 'Вход по коду выключен.'],
};

// Названия стартовых полотен хранятся в базе по-русски; переводим их по известному имени.
const CANVAS_NAMES = {
  'Свободная стена': ['Slobodni zid', 'Free Wall'],
  'Каракули': ['Škrabotine', 'Doodles'],
  'Эстафета': ['Štafeta', 'Relay'],
  'Тема дня': ['Tema dana', 'Theme of the Day'],
  'Рисуем с помощником': ['Crtamo sa pomoćnikom', 'Drawing with a Helper'],
};

// Темы раундов по индексу (тот же порядок, что PROMPTS на сервере).
const PROMPTS = [
  ['Podvodni svijet', 'Underwater world', 'Подводный мир'],
  ['Grad budućnosti', 'City of the future', 'Город будущего'],
  ['Piknik u parku', 'Picnic in the park', 'Пикник в парке'],
  ['Putovanje kroz svemir', 'Space journey', 'Космическое путешествие'],
  ['Bajkovita šuma', 'Fairy-tale forest', 'Сказочный лес'],
  ['Zoološki vrt', 'Zoo', 'Зоопарк'],
  ['Zimsko veče', 'Winter evening', 'Зимний вечер'],
  ['Gusarski brod', 'Pirate ship', 'Пиратский корабль'],
  ['Kafić na ćošku', 'Corner café', 'Кафе на углу'],
  ['Farma', 'Farm', 'Ферма'],
  ['Zmajev dvorac', "Dragon's castle", 'Замок дракона'],
  ['Plaža', 'Beach', 'Пляж'],
  ['Vašar', 'Fair', 'Ярмарка'],
  ['Džungla', 'Jungle', 'Джунгли'],
  ['Rođendan', 'Birthday party', 'День рождения'],
];

const idx = () => LANGS.findIndex((l) => l.code === lang);

function readLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (LANGS.some((l) => l.code === saved)) return saved;
  } catch { /* хранилище недоступно */ }
  return DEFAULT;
}

export let lang = readLang();

export function setLang(code) {
  lang = LANGS.some((l) => l.code === code) ? code : DEFAULT;
  try { localStorage.setItem('lang', lang); } catch { /* ничего */ }
  applyDocumentLang();
}

export function applyDocumentLang() {
  document.documentElement.lang = LANGS[idx()].html;
  document.title = t('app.title');
}

export function t(key, vars = {}) {
  const row = D[key];
  const text = row ? row[idx()] : key;
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
}

export function tErr(code) {
  return D[`err.${code}`] ? t(`err.${code}`) : (code || t('err.generic'));
}

export function tCanvas(name) {
  const row = CANVAS_NAMES[name];
  if (!row || lang === 'ru') return name;
  return row[idx()];
}

export function tPrompt(state) {
  const row = PROMPTS[state.promptId];
  return row ? row[idx()] : state.prompt;
}

// Урок приходит с сервера с текстами на всех языках: { me, en, ru }.
export function tText(obj) {
  return typeof obj === 'string' ? obj : obj[lang] || obj.ru;
}
